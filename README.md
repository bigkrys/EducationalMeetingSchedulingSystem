# 教育调度系统设计说明

> 注：我之所以选择该项目进行实践，是我本科毕业设计项目做的“选课系统的设计与实践”，两者在设计思想上有可复用的环节，下面先详细说明本系统的功能设计。
> 


# 一、 业务功能说明

> 该系统是给学校使用的平台。学生在平台选择老师和预约该老师的辅导，老师在平台设置自己的可预约时间段并对学生预约进行审批；系统根据不同的“服务级别”自动/人工批准，限制每月次数，并避免冲突。
> 

## 1.1 角色与权限

- **学生（student）**：查询老师及其可用时段、发起预约、查看/取消预约、接收通知。
- **教师（teacher）**：配置可用时段、设置阻塞时间、审批/拒绝预约、查看自己的日程。
- **管理员（admin）**：管理服务级别策略、配额、阈值、科目、全局运营报表、审计日志。

## 1.2 服务级别逻辑

- **Level1**：每月 2 次自动批准，额外需审批。
- **Level2**：所有会议均需审批。
- **Premium**：全部自动批准，且有优先权。
- **科目限制**：学生仅能预约教授其**已注册科目**的教师。
- **月度重置**：每月 1 日配额计数清零（以系统时区为准）

## 1.3 功能清单与说明

| 角色 | 功能 | 说明 | 关键规则 |
| --- | --- | --- | --- |
| 学生 | 搜索教师可用槽位 | 根据教师与日期返回可预约开始时间列表 | 遵守 availability、blocked、appointments、buffer，不超 maxDailyMeetings |
| 学生 | 创建预约 | 学生选择槽位创建预约 | 科目匹配、服务级别路由、槽位占用检查、幂等 |
| 学生 | 取消预约 | 在允许的时限内取消（例如会议开始前≥2h，可配置） | 已完成/已过期不可取消；写审计 |
| 学生 | 预约改期 | 取决于是否支持“移动”预约；默认实现为“取消+新建” | 改期需重过冲突与配额校验 |
| 学生 | 查看我的预约 | 按状态/时间范围分页查询 | 默认升序 |
| 教师 | 维护每周可用性 | 设置/更新 dayOfWeek + start/end | 同一天可多个区间 |
| 教师 | 维护阻塞时间 | 记录一段不可预约时间（上课/开会等） | 与预约冲突时提示风险 |
| 教师 | 审批/拒绝预约 | 对所有pending 执行 approve/cancel | 记录原因、时间；通知 |
| 管理 | 服务级别策略 | 配额阈值、超时阈值、提醒策略等参数化 | 可后续抽象为策略表 |
| 系统 | 48h 待审批过期 | 定时扫描 pending 超时→expired | 发送过期通知 |
| 系统 | 月初配额重置 | 每月1日重置 Level1/2 配额计数 | 更新时间戳 |
| 系统 | 提醒通知 | T-24h / T-1h 提醒学生&教师 | 队列/定时触发 |
| 系统 | 候补队列 | 若热门时段被占，可加入候补；释放时自动顶替 | 顶替后通知双方 |

# 二、系统整体设计与架构

## 2.1 整体架构

```mermaid
graph TD
  Client[Web/Mobile Client] -->|HTTPS/REST| API[Next.js API Routes]
  API --> Auth[Auth Service]
  API --> Scheduler[Scheduler Service]
  API --> Teacher[Teacher Service]
  API --> Admin[Admin Service]
  API --> Queue[Message Queue]
  Queue --> Mailer[Notification Service]
  API --> DB[(PostgreSQL)]
  API --> Cache[(Redis)]
```

**说明：**

- **Auth Service**：负责用户注册、登录、JWT 校验、邀请码注册。
- **Scheduler Service**：负责预约逻辑（可用槽位计算、冲突校验、配额追踪、审批工作流）。
- **Teacher Service**：教师可用性、阻塞时间、审批。
- **Admin Service**：策略管理、用户管理、审计查询。
- **Notification Service**：提醒通知、过期通知。
- **Database**：PostgreSQL，包含认证表、业务表、审计表。
- **Cache**：Redis，缓存热门槽位和查询结果。
- **Message Queue**：Kafka/RabbitMQ，处理通知、批量任务。

# 三、模块设计

## **3.1 用户注册与登录模块**

### 3.1.1 学生注册/登录

**注册步骤**

- 自助注册：仅允许创建 `role=student`。
- 表单：email、password、（可选）姓名、年级、`enrolledSubjects` 初始化。
- 校验：邮箱唯一+密码强度；写入 `users(status=pending)` 与 `students` 扩展表；发验证邮件。
- 激活：点击邮件魔法链接 → `users.status=active`。

**登录步骤**

- 输入 email/password → 校验 `users.status in ('active')` → 返回 `accessToken(15min)` 与 `refreshToken(30d)`
- 记录 `last_login_at`，写审计日志（action=login）。

### 3.1.2 教师注册/登录

**注册步骤**

- 推荐“受邀注册”：管理员或超级管理员预创建“教师邀请”（见 3.1.3），教师通过邀请邮件完成注册与激活。
- 也可开放“自助注册”但需添加“人工审核通过后生效”的开关（机构可配置），以防伪冒教师。

**登录步骤**

- 同学生；激活后可登录，完善 `subjects/maxDailyMeetings/bufferMinutes` 等。

```mermaid
sequenceDiagram
participant U as User(学生/教师)
participant W as WebApp
participant API as API Gateway
participant AUTH as AuthService
participant DB as DB
participant MAIL as MailService

U->>W: 填写邮箱+密码提交注册
W->>API: POST /api/auth/register
API->>AUTH: 校验唯一性/强度
AUTH->>DB: 新建 users(status=pending)
AUTH->>MAIL: 发送激活邮件(一次性token)
U->>MAIL: 点击激活链接
MAIL->>AUTH: 验证token
AUTH->>DB: users.status=active
AUTH-->>W: 注册完成(可登录)

U->>W: 输入邮箱/密码登录
W->>API: POST /api/auth/login
API->>AUTH: 校验凭据/状态=active
AUTH->>DB: 记录last_login_at/写刷新令牌
AUTH-->>W: Set-Cookie(HttpOnly) Access(短) + Refresh(长)

```

### 3.1.3 管理员登录（含超级管理员引导）

**初始化超级管理员（一次性）**

- 首次部署时，通过“引导口令（env）+受控入口”完成超级管理员（`role=admin,is_super=true`）创建。
- 创建成功后**自动失效**引导口令，避免重放。

**管理员创建与权限**

- 管理员账号仅能由**超级管理员**创建（或发出“管理员邀请”）；普通管理员不可自助注册。
- 管理员拥有后台管理入口，可管理策略/用户与审计，但不能越权提权。
- 普通管理员：可登录与修改自己密码；**不能**创建新管理员。

```mermaid
sequenceDiagram
participant OP as DevOps
participant API as API Gateway
participant AUTH as AuthService
participant DB as DB
participant MAIL as MailService
participant SA as SuperAdmin
participant ADM as Admin(被邀请者)

OP->>API: POST /api/admin/bootstrap {bootstrapSecret}
API->>AUTH: 校验引导口令(仅一次)
AUTH->>DB: 创建 users(role=admin,is_super=true,active)
AUTH-->>OP: 初始化完成(口令失效)

SA->>API: POST /api/admin/users(invite admin)
API->>AUTH: 生成admin_invite_token
AUTH->>DB: 写入邀请
AUTH->>MAIL: 发邀请邮件

ADM->>MAIL: 点击邀请链接
MAIL->>AUTH: 验证token
AUTH->>DB: 创建 users(role=admin,active)
AUTH-->>ADM: 设置密码并登录后台

```

### 3.1.4 登录/刷新/登出

```mermaid
sequenceDiagram
participant U as User
participant W as WebApp
participant API as API Gateway
participant AUTH as AuthService
participant DB as DB

U->>W: 输入邮箱/密码
W->>API: POST /api/auth/login
API->>AUTH: 校验凭据/状态
AUTH->>DB: 记录last_login/写refresh_token
AUTH-->>W: Set-Cookie Access(15m)+Refresh(30d)

Note over W: Access过期后静默刷新
W->>API: POST /api/auth/refresh (带Refresh Cookie)
API->>AUTH: 验证并轮换refresh_token
AUTH->>DB: 旧refresh_token.revoked=true，写新token
AUTH-->>W: 新Access + 新Refresh(Set-Cookie)

U->>W: 点击退出
W->>API: POST /api/auth/logout
API->>AUTH: 当前refresh_token.revoked=true
AUTH-->>W: 204 No Content

```

## 3.2 学生｜搜索教师可用槽位

**目标**：根据教师与日期返回可预约开始时间列表。

**关键规则**：遵守 `availability`、`blocked_times`、`appointments`、`buffer`，不超 `maxDailyMeetings`。

**步骤**：

1. 前端收集 `teacherId/date/duration` 调用 API。
2. 服务器先查缓存；未命中则：
    - 读教师当日 `availability`；
    - 读当日 `appointments(status in [pending,approved])`；
    - 读 `blocked_times`；
    - 读取 `bufferMinutes/maxDailyMeetings`；
    - 逐槽位切片并做**区间重叠 + 缓冲**检测；
    - 可按 `maxDailyMeetings` 截断；
    - 写入短期缓存返回。
3. 响应 `slots[]`（UTC），前端按用户时区渲染。

```mermaid
sequenceDiagram
participant U as Student
participant W as Web
participant A as API (Slots)
participant C as Cache
participant D as DB
U->>W: 选择 teacherId + date (+ duration)
W->>A: GET /api/slots?teacherId&date&duration
A->>C: GET slots:{tid}:{date}:{duration}
alt 缓存命中
C-->>A: 返回 slots[]
else 未命中
A->>D: 读 availability/appointments/blocked_times/teacher
A->>A: 切片 duration + buffer 冲突检测 + 当日上限
A->>C: SET slots 键 (TTL 1-5m)
end
A-->>W: slots[] (ISO8601 UTC)
```

## 3.3 学生｜创建预约

**目标**：学生选择槽位创建预约。

**关键规则**：科目匹配、服务级别路由、槽位占用检查、幂等。

**步骤**：

1. 校验主体：学生/教师存在、`subject` 同时包含于 `student.enrolledSubjects` 与 `teacher.subjects`。
2. **槽位可用性**：可直接重跑 `generateAvailableSlots()` 并校验 `scheduledTime` 在返回集内（规避并发）。
3. **服务级别路由**：
    - Level1：若 `monthlyMeetingsUsed < 2` → `approved`，并在事务内 +1；否则 `pending`；
    - Level2：`pending`；
    - Premium：`approved`（可选：抢占低优先级 `pending`）。
4. **幂等**：使用 `idempotencyKey` 唯一键；重复提交返回已创建记录。
5. **缓存失效**：删除相关 `slots:{tid}:{date}:{duration}`。
6. **通知**：根据结果发送邮件（已批核/等待审批）。

```mermaid
sequenceDiagram
participant U as Student
participant W as Web
participant A as API (Appointments)
participant D as DB
participant C as Cache
participant E as Email
U->>W: 选择槽位并提交
W->>A: POST /api/appointments {studentId,teacherId,subject,scheduledTime,duration,idempotencyKey}
A->>D: 校验学生/教师/科目匹配
A->>A: 服务级别决策 approved|pending（Level1/2/Premium）
A->>D: 事务: 写入预约(+必要时递增配额)
A->>C: 失效 slots 缓存键
A->>E: 发送确认/待审批通知(异步)
A-->>W: 201 {status, approvalRequired}
```

## 3.4 学生｜取消预约

**目标**：允许在会议开始前≥2h（可配置）取消。

**关键规则**：`completed/expired` 不可取消；写审计。

**步骤**：

1. 校验请求者为该预约的学生；
2. 校验 `now <= scheduledTime - cancelWindow(2h)`；
3. 状态允许：`pending|approved`；
4. 更新为 `cancelled`，写审计与可选的取消原因；
5. 失效槽位缓存；通知相关教师。

```mermaid
sequenceDiagram
participant U as Student
participant W as Web
participant A as API (Appointments)
participant D as DB
participant C as Cache
participant E as Email
U->>W: 点击取消
W->>A: PATCH /api/appointments/{id} {action: cancel}
A->>D: 读取预约并校验权限/时间窗口
A->>D: 更新为 cancelled, 记录原因
A->>C: 失效 slots 缓存(所在日期/教师)
A->>E: 通知教师
A-->>W: 200 OK
```

## 3.5 学生｜预约改期

**目标**：默认以“取消+新建”实现。

**关键规则**：新建需重新通过**冲突与配额**校验。

**步骤**：

1. 先按 **取消**规则处理旧预约；
2. 使用新槽位按 **创建**流程重建；
3. （可选）提供单事务“移动预约”接口，需要更复杂的区间锁与冲突处理。

```mermaid
sequenceDiagram
participant U as Student
participant W as Web
participant A as API
participant D as DB
U->>W: 选择新的槽位
W->>A: PATCH /api/appointments/{id} {action: cancel}
A->>D: 取消旧预约 (校验时间窗口)
W->>A: POST /api/appointments {newSlot,...}
A->>D: 走创建流程(科目/服务级别/幂等/冲突)
A-->>W: 返回新预约
```

## 3.6 学生｜查看我的预约

**目标**：按状态/时间范围分页查询，默认按时间升序。

**步骤**：

1. 校验身份；
2. 组合 where 条件与时间范围；
3. 游标分页返回列表与下一页游标。

```mermaid
sequenceDiagram
participant U as Student
participant W as Web
participant A as API
participant D as DB
U->>W: 选择筛选条件
W->>A: GET /api/appointments?role=student&status&from&to
A->>D: 查询并按 scheduledTime 升序/游标分页
D-->>A: items[]
A-->>W: items[] + nextCursor
```

## 3.7 教师｜维护每周可用性

**目标**：设置/更新 `dayOfWeek + start/end`，同一天可多个区间。

**步骤**：

1. 校验教师身份与字段合法性；
2. 新增或覆盖区间（避免交叉重叠的可选校验）；
3. 失效未来若干天的 `slots` 缓存键（或标记为脏）。

```mermaid
sequenceDiagram
participant T as Teacher
participant W as Web
participant A as API (Availability)
participant D as DB
participant C as Cache
T->>W: 录入/编辑区间
W->>A: POST /api/teachers/{id}/availability
A->>D: 写入或更新 availability
A->>C: 失效 slots 缓存 (受影响日期范围)
A-->>W: 200 OK
```

## 3.8 教师｜维护阻塞时间

**目标**：记录一段不可预约时间（上课/开会/休假等）。

**关键规则**：与预约冲突时提示风险（需人工沟通）。

**步骤**：

1. 校验时间范围与最小粒度；
2. 写入 `blocked_times`；
3. 若与既有预约重叠，返回告警字段供前端提示；
4. 失效相关日期的槽位缓存。

```mermaid
sequenceDiagram
participant T as Teacher
participant W as Web
participant A as API (Blocked)
participant D as DB
participant C as Cache
T->>W: 选择起止时间与原因
W->>A: POST /api/blocked-times
A->>D: 写入 blocked_times
A->>C: 失效 slots 缓存
A-->>W: 200 OK (如与既有预约重叠→前端提示风险)
```

## 3.9 教师｜审批/拒绝预约

**目标**：对 `pending` 执行 `approve|cancel`。

**关键规则**：记录原因/时间；通知。

**步骤**：

1. 校验操作者为该教师；
2. 若状态非 `pending` → `STATE_CONFLICT`；
3. 按动作更新状态并记录审计；
4. 发送结果通知。

```mermaid
sequenceDiagram
participant T as Teacher
participant W as Web
participant A as API (Appointments)
participant D as DB
participant E as Email
T->>W: 在待办点击 通过/拒绝
W->>A: PATCH /api/appointments/{id} {action}
A->>D: 校验当前状态= pending & 资源归属
alt 通过
A->>D: 更新为 approved, 写 approvedAt
else 拒绝
A->>D: 更新为 cancelled, 写 reason
end
A->>E: 通知学生
A-->>W: 200 OK
```

## 3.10 管理｜服务级别策略

**目标**：参数化配额阈值、超时阈值、提醒策略等（为后续策略表做准备）。

**步骤**：

1. 定义策略表（可含租户维度）；
2. 业务读取策略时加入缓存；
3. 更新策略时广播/刷新相关缓存键。

```mermaid
sequenceDiagram
participant M as Admin
participant W as Web(Admin)
participant A as API (Policy)
participant D as DB
M->>W: 修改策略参数
W->>A: PUT /api/policies {quota,expireHours,remindOffsets}
A->>D: Upsert 策略表
A-->>W: 200 OK
```

## 3.11 系统｜48h 待审批过期

**目标**：定时扫描 `pending` 超时→`expired` 并通知。

**步骤**：

1. Cron 定时触发；
2. 分页批处理，避免大事务；
3. 记录审计与失败重试统计；
4. 可选：将通知推入队列异步发送。

```mermaid
sequenceDiagram
participant Q as Cron
participant A as Job API
participant D as DB
participant E as Email
Q->>A: POST /api/jobs/expire-pending
A->>D: 查 pending where createdAt < now-48h
A->>D: 批量更新为 expired
A->>E: 发送过期通知（学生+教师）
```

## 3.12 系统｜月初配额重置

**目标**：每月 1 日重置 Level1/2 配额计数并更新时间戳。

**步骤**：

1. 约定触发时间（系统时区/教师时区，择一并在 UI 明示）；
2. 支持幂等多次执行；
3. 记录执行日志与指标。

```mermaid
sequenceDiagram
participant Q as Cron
participant A as Job API
participant D as DB
Q->>A: POST /api/jobs/reset-quota (每月1日 00:05)
A->>D: UPDATE students SET monthlyMeetingsUsed=0, lastQuotaReset=NOW()
D-->>A: 返回影响行数
```

## 3.13 系统｜提醒通知

**目标**：T-24h / T-1h 提醒学生与教师。

**步骤**：

1. 计算时间窗口（UTC）；
2. 防重：对同一预约同一提醒类型设置指纹去重；
3. 失败重试与退避

```mermaid
sequenceDiagram
participant Q as Cron/Queue
participant A as Job API
participant D as DB
participant E as Email
Q->>A: 触发 remind-24h / remind-1h
A->>D: 查 approved 且 scheduledTime in 窗口
A->>E: 批量发送提醒（含取消链接）
```

## 3.14 系统｜候补队列

**目标**：热门时段被占时可加入候补，释放时自动顶替。

**步骤**：

1. 候补表结构：`teacherId,date,slot,studentId,priority,status,createdAt`；
2. 槽位释放触发器：取消/拒绝/过期事件监听；
3. 选取规则：按优先级+时间先后；
4. 创建预约与通知（可设置“保留时长”，逾期自动回收给下一位）。

```mermaid
sequenceDiagram
participant U as Student
participant W as Web
participant A as API (Waitlist)
participant D as DB
participant E as Email
U->>W: 在已满槽位点击加入候补
W->>A: POST /api/waitlist {teacherId,date,slot,studentId}
A->>D: 写入候补队列 (优先级: Premium > Level1 > Level2)
Note over A,D: 监听取消/拒绝事件
A->>D: 当槽位释放→选择候补人选并创建预约(approved/pending)
A->>E: 通知候补成功/保留时长
```

# 四、数据库设计

## 4.1 users（统一身份表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK | 统一用户 ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 登录邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希（Argon2id / bcrypt≥10） |
| role | ENUM('student','teacher','admin') | NOT NULL | 默认角色（登录后授权用） |
| status | ENUM('pending','active','frozen') | NOT NULL DEFAULT 'pending' | 账户状态 |
| last_login_at | TIMESTAMPTZ |  | 最近登录时间 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |  |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |  |
|  |  |  |  |

## 4.2 students（学生扩展表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK |  |
| user_id | UUID | FK → users(id), UNIQUE, NOT NULL | 与 users 1:1 绑定 |
| service_level | ENUM('level1','level2','premium') | NOT NULL | 服务级别 |
| monthly_meetings_used | INT | DEFAULT 0 | 当月已用配额 |
| last_quota_reset | DATE | DEFAULT CURRENT_DATE | 上次配额重置日期 |
| enrolled_subjects | TEXT[] |  | 已选科目 |
| grade_level | INT |  | 年级 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |  |

## 4.3 teachers（教师表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK |  |
| user_id | UUID | FK → users(id), UNIQUE, NOT NULL | 与 users 1:1 绑定 |
| subjects | TEXT[] |  | 授课科目（未来可拆为字典表+关联表） |
| max_daily_meetings | INT | DEFAULT 6 | 每日上限 |
| buffer_minutes | INT | DEFAULT 15 | 会议缓冲分钟 |
| timezone | VARCHAR(64) | NOT NULL DEFAULT 'Asia/Shanghai' | 教师所在时区 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |  |

## 4.4 admins（管理员表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK |  |
| user_id | UUID | FK → users(id), UNIQUE, NOT NULL | 与 users 1:1 绑定 |
| scope | JSONB |  | 管理范围（学院/院系/年级） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |  |

## 4.5 teacher_availability（教师可用性）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK |  |
| teacher_id | UUID | FK → teachers(id), NOT NULL | 教师 |
| day_of_week | INT | 0–6 | 周日=0 |
| start_time | TIME | NOT NULL |  |
| end_time | TIME | NOT NULL |  |
| is_recurring | BOOLEAN | DEFAULT true | 是否每周重复 |

## 4.6 blocked_times（阻塞时段）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK |  |
| teacher_id | UUID | FK → teachers(id) | 教师 |
| start_time | TIMESTAMPTZ | NOT NULL |  |
| end_time | TIMESTAMPTZ | NOT NULL |  |
| reason | VARCHAR(255) |  | 原因 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |  |

## 4.7 appointments（预约表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | UUID | PK |  |
| student_id | UUID | FK → students(id) | 学生 |
| teacher_id | UUID | FK → teachers(id) | 教师 |
| subject | VARCHAR(100) | NOT NULL | 科目 |
| scheduled_time | TIMESTAMPTZ | NOT NULL | 开始时间（UTC） |
| duration_minutes | INT | DEFAULT 30 | 时长（分钟） |
| status | ENUM('pending','approved','completed','cancelled','no_show','expired') | NOT NULL | 统一状态枚举 |
| approval_required | BOOLEAN | NOT NULL | 是否需审批 |
| approved_at | TIMESTAMPTZ |  | 审批时间 |
| idempotency_key | VARCHAR(128) | UNIQUE | 幂等键 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |  |
| time_range | TSTZRANGE | 生成列：`tstzrange(scheduled_time, scheduled_time + duration_minutes * interval '1 minute')` |  |
| 约束 | EXCLUDE USING GIST (teacher_id WITH =, time_range WITH &&) | 防止时间重叠 |  |

## 4.8  服务级别策略表（service_policies）

| 字段名 | 类型 | 描述 |
| --- | --- | --- |
| policy_id | UUID | 策略 ID |
| level | Enum | 服务级别 |
| max_daily | Int | 每日最大预约数（当 `teacher.max_daily_meetings` 存在时**优先生效**） |
| expire_hours | Int | 待审批过期时长（小时） |
| reminder | Boolean | 是否开启提醒 |

## 4.9 审计日志表（audit_logs）

| 字段名 | 类型 | 描述 |
| --- | --- | --- |
| log_id | UUID | 日志 ID |
| actor_id | UUID | 操作者 ID |
| action | String | 动作名称 |
| target_id | UUID | 目标对象 ID |
| created_at | DateTime | 操作时间 |

# 五、接口设计

## 5.1  学生端接口（Student APIs）

> 鉴权：Bearer JWT（role=student）。时区：所有时间字段均为 ISO8601 UTC。
> 

### 5.1.1 查询教师可用槽位

- **GET** `/api/slots?teacherId={id}&date=YYYY-MM-DD&duration=30`
- **说明**：`date` 参数**按教师时区**解释，后端换算为 UTC 存储与计算。
- **请求参数**：
    - `teacherId` *(required)*：教师 ID
    - `date` *(required)*：日期
    - `duration` *(optional, default=30)*：会议时长（分钟）
- **响应 200**：

```json
{
  "teacherId": "t_123",
  "date": "2025-08-22",
  "duration": 30,
  "slots": ["2025-08-22T01:00:00Z", "2025-08-22T01:30:00Z"]
}
```

- **错误**：`BAD_REQUEST`、`TEACHER_NOT_FOUND`。

### 5.1.2 创建预约

- **POST** `/api/appointments`
- **说明**：根据服务级别自动路由到 `approved`/`pending`，带幂等键。
- **请求体**：

```json
{
  "studentId": "s_123",
  "teacherId": "t_123",
  "subject": "math",
  "scheduledTime": "2025-08-22T01:00:00Z",
  "durationMinutes": 30,
  "idempotencyKey": "s_123-t_123-2025-08-22T01:00:00Z"
}
```

- **响应 201**：

```json
{ 
"id": "a_456", 
"status": "approved", 
"approvalRequired": false 
}
```

- **错误**：`SUBJECT_MISMATCH`、`SLOT_TAKEN`、`QUOTA_EXCEEDED`、`MAX_DAILY_REACHED`、`IDEMPOTENT_CONFLICT`、`BAD_REQUEST`。

### 5.1.3 取消预约

- **PATCH** `/api/appointments/{id}`
- **请求体**：`{ "action": "cancel", "reason": "计划冲突" }`
- **响应 200**：`{ "ok": true }`
- **错误**：`STATE_CONFLICT`（如已 completed/expired）、`FORBIDDEN`（越权）。

### 5.1.4 我的预约列表

- **GET** `/api/appointments?role=student&studentId={id}&status={pending|approved|...}&from=&to=&cursor=&limit=`
- **响应 200**：

```json
{ 
"items": 
[
	{
		"id":"a_1",
		"scheduledTime":"...",
		"status":"approved"
		}
	], 
"nextCursor": "eyJpZCI6..." 
}
```

### 5.1.5 改期（默认：取消+新建）

- 先调用 **5.1.3** 取消，再调用 **5.1.2** 创建新预约；
- （可选）将来提供 `/api/appointments/{id}/reschedule` 一步到位接口。

---

## 5.2 教师端接口（Teacher APIs）

> 鉴权：Bearer JWT（role=teacher）。仅能操作自己的资源。
> 

### 5.2.1 维护每周可用性

- **GET** `/api/teachers/{id}/availability`
- **POST** `/api/teachers/{id}/availability`
- **POST 请求体**：

```json
{ 
"dayOfWeek": 1,
 "startTime": "09:00", 
 "endTime": "12:00", 
 "isRecurring": true 
 }
```

- **响应 200**：`{ "ok": true }`

### 5.2.2 维护阻塞时间

- **POST** `/api/blocked-times`
- **请求体**：

```json
{
 "teacherId": "t_123", 
 "startTime": "2025-08-22T02:00:00Z", 
 "endTime": "2025-08-22T04:00:00Z", 
 "reason": "Dept meeting" 
 }
```

- **响应 200**：`{ "ok": true }`

### 5.2.3 审批/拒绝预约

- **PATCH** `/api/appointments/{id}`
- **请求体**：`{ "action": "approve" }` 或 `{ "action": "cancel", "reason": "不合适" }`
- **响应 200**：`{ "ok": true }`
- **错误**：`STATE_CONFLICT`（当前不是 pending）。

### 5.2.4 教师视角预约列表

- **GET** `/api/appointments?role=teacher&teacherId={id}&status=&from=&to=&cursor=&limit=`

---

## 5.3 系统与管理接口（System & Admin APIs）

> 鉴权：Bearer JWT（role=admin 或后台任务令牌）。
> 

### 5.3.1 服务级别策略（可选）

- **PUT** `/api/policies`
- **请求体**：

```json
{
    "level1": {
        "monthlyAutoApprove": 2
    },
    "level2": {
        "monthlyAutoApprove": 0
    },
    "premium": {
        "priority": true
    },
    "expireHours": 48,
    "remindOffsets": [
        24,
        1
    ]
}
```

- **响应 200**：`{ "ok": true }`

### 5.3.2 48 小时待审批过期 Job

- **POST** `/api/jobs/expire-pending`
- **响应 200**：`{ "updated": 12 }`

### 5.3.3 月初配额重置 Job

- **POST** `/api/jobs/reset-quota`
- **响应 200**：`{ "updated": 245 }`

### 5.3.4 健康检查

- **GET** `/api/healthz` → `200`

```json
{
    "ok": true,
    "time": "..."
}
```

### 5.3.5 候补队列

- **POST** `/api/waitlist`
    
    请求体：
    
    ```json
    {
        "teacherId": "t_1",
        "date": "2025-08-22",
        "slot": "2025-08-22T01:00:00Z",
        "studentId": "s_1"
    }
    ```
    
- **POST** `/api/waitlist/promote` （系统内部，当槽位释放时触发）

# 六、系统安全

- **认证与会话**
    - Access Token (JWT, 15m) + Refresh Token (30d, 可轮换)，存放 HttpOnly+Secure Cookie。
    - 修改密码/重置密码时吊销全部 Refresh。
- **密码策略**
    - 最少 8 位，含字母与数字。
- **防暴力与限流**
    - 登录与重置接口：Redis 滑动窗口限速，失败 N 次锁定账户。
- **邮件安全**
    - 所有邮件 Token 仅保存哈希，单次使用，短期有效。
- **审计与RBAC**
    - 所有敏感操作写 `audit_logs`。
    - 严格基于 `role + scope` 做 API 权限校验。

---

# 七、本地开发与部署

## 7.1 本地开发环境

### 快速开始
```bash
# 克隆项目
git clone https://github.com/bigkrys/EducationalMeetingSchedulingSystem.git
cd EducationalMeetingSchedulingSystem

# 使用自动化脚本设置（推荐）
./scripts/setup-local.sh        # macOS/Linux
scripts\setup-local.bat         # Windows

# 或手动设置
pnpm install
cp env.local.example .env.local
node scripts/generate-secrets.js
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

### 环境要求
- **Node.js**: 18.x+
- **pnpm**: 8.x+
- **数据库**: SQLite (开发) 或 PostgreSQL (生产)

### 详细文档
- 📚 [本地开发指南](LOCAL_DEVELOPMENT.md) - 完整的本地环境搭建教程
- 🔑 [密钥生成脚本](scripts/generate-secrets.js) - 自动生成安全密钥
- 🚀 [部署指南](DEPLOYMENT.md) - Vercel部署详细步骤

## 7.2 生产环境部署

### Vercel部署（推荐）
```bash
# 安装Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### 环境变量配置
```bash
# 必需环境变量
DATABASE_URL="postgresql://username:password@host:port/database"
JWT_SECRET="your-super-secret-jwt-key-here-32-chars-min"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here-32-chars-min"
NEXTAUTH_SECRET="your-nextauth-secret-here-32-chars-min"
NEXTAUTH_URL="https://your-project.vercel.app"
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://your-project.vercel.app"
```

### 数据库推荐
- **开发**: SQLite (本地文件)
- **生产**: Supabase 或 Neon (PostgreSQL)

## 7.3 项目结构
```
edu-scheduler/
├── src/                    # 源代码
│   ├── app/               # Next.js App Router
│   ├── components/        # React组件
│   ├── lib/              # 工具库
│   └── types/            # TypeScript类型
├── prisma/               # 数据库配置
├── scripts/              # 工具脚本
├── docs/                 # 文档
├── LOCAL_DEVELOPMENT.md  # 本地开发指南
├── DEPLOYMENT.md         # 部署指南
└── README.md             # 项目说明
```

---

# 八、贡献指南

## 8.1 开发流程
1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 8.2 代码规范
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 编写清晰的注释和文档
- 添加适当的测试用例

## 8.3 问题反馈
- 使用 [GitHub Issues](https://github.com/bigkrys/EducationalMeetingSchedulingSystem/issues) 报告问题
- 提供详细的错误信息和复现步骤
- 标注问题类型（bug/feature/enhancement）

---

# 九、许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

# 十、联系方式

- **项目地址**: [https://github.com/bigkrys/EducationalMeetingSchedulingSystem](https://github.com/bigkrys/EducationalMeetingSchedulingSystem)
- **在线演示**: [https://EducationalMeetingSchedulingSystem-git-develop-bigkrys.vercel.app](https://EducationalMeetingSchedulingSystem-git-develop-bigkrys.vercel.app)
- **问题反馈**: [GitHub Issues](https://github.com/bigkrys/EducationalMeetingSchedulingSystem/issues)

---

# 十一、当前已实现功能如下


✅ 学生登录（JWT 模拟）

✅ 查看可用时段（基于教师可用性、缓冲时间、冲突检测）

✅ 创建预约：

Level1 学生前 2 次自动批准，之后 pending

Level2 学生全部 pending

Premium 学生全部自动批准

✅ 科目限制校验（只能预约自己注册科目的教师）

✅ 月度配额检查与自动重置（懒触发逻辑）

✅ 我的预约列表（状态：pending / approved / expired / cancelled）

2. 教师端

✅ 教师登录（JWT 模拟）

✅ 管理每周可用时间窗口

✅ 新增/管理不可用时间（blocked times）

✅ 审批预约（pending → approved / rejected）

✅ 并发控制（简单版本，避免重复审批）

✅ 查看日程列表（已批准 / 已过期等）

3. 系统逻辑

✅ 自动冲突检测（预约时间 + 缓冲区 vs 已有预约/blocked）

✅ 状态机：pending → approved / cancelled / expired

✅ 48h 超时处理（批处理扫描 → 自动标记 expired）

✅ 月初配额重置（批处理逻辑）

✅ 幂等检查（防止重复提交同一预约）

4. 通知与日志

✅ 邮件通知：

预约成功（学生 + 教师）

审批通过/拒绝（通知学生）

48h 超时（通知双方）



# 十二、 关键算法实现

## 12.1 生成可用时间段算法

### 核心算法：`calculateAvailableSlots()`

**功能描述**：根据教师的可用性设置、阻塞时间和已有预约，生成指定日期的可用时间段列表。

**算法流程**：

```typescript
async function calculateAvailableSlots(teacher: any, date: string, duration: number) {
  // 1. 获取目标日期的星期几
  const dayOfWeek = getDay(targetDate) // 0 = 周日, 1 = 周一, ...
  
  // 2. 查找该日期的可用时间设置
  const dayAvailability = teacher.availability.find(avail => avail.dayOfWeek === dayOfWeek)
  
  // 3. 生成基础时间槽（按 duration 分钟切片）
  const allSlots = generateTimeSlots(dayAvailability.startTime, dayAvailability.endTime, duration)
  
  // 4. 过滤冲突时间槽
  const availableSlots = filterConflictingSlots(allSlots, teacher, targetDate, duration)
  
  return availableSlots.map(slot => slot.toISOString())
}
```

**关键步骤详解**：

1. **时间槽生成**：
   ```typescript
   // 从 startTime 到 endTime，按 duration 分钟间隔生成
   while (currentTime < slotEnd) {
     allSlots.push(new Date(currentTime))
     currentTime = addMinutes(currentTime, duration)
   }
   ```

2. **冲突检测**：
   - 阻塞时间冲突检测
   - 已有预约冲突检测（包含缓冲时间）
   - 超出结束时间的槽位过滤

3. **缓冲时间处理**：
   ```typescript
   // 检查是否与已有预约冲突（包含缓冲时间）
   const bufferStart = addMinutes(slot, -teacher.bufferMinutes)
   const bufferEnd = addMinutes(slotEndTime, teacher.bufferMinutes)
   ```

**性能优化**：
- 缓存机制：5分钟 TTL 缓存热门查询结果
- 批量查询：一次性获取所有相关数据
- 内存过滤：在应用层进行时间冲突计算

## 12.2 检查重叠的预约和阻塞时间

### 核心算法：`detectAvailabilityConflicts()`

**功能描述**：检测教师设置可用时间时与现有预约、阻塞时间的冲突情况。

**冲突类型分类**：

```typescript
interface TimeConflict {
  type: 'exact_match' | 'overlap' | 'contained' | 'contains' | 'blocked_time' | 'appointment'
  message: string
  existingSlot?: TeacherAvailability
  blockedTime?: BlockedTime
  appointment?: Appointment
  overlap?: string
}
```

**冲突检测算法**：

1. **时间重叠分析**：
   ```typescript
   function analyzeTimeOverlap(start1: string, end1: string, start2: string, end2: string) {
     const s1 = parseTime(start1), e1 = parseTime(end1)
     const s2 = parseTime(start2), e2 = parseTime(end2)
     
     if (s1 === s2 && e1 === e2) return { type: 'exact_match' }
     if (s1 < e2 && s2 < e1) return { type: 'overlap', overlap: calculateOverlap(s1, e1, s2, e2) }
     if (s1 <= s2 && e1 >= e2) return { type: 'contains' }
     if (s1 >= s2 && e1 <= e2) return { type: 'contained' }
     return { type: 'no_overlap' }
   }
   ```

2. **预约冲突检测**：
   ```typescript
   async function checkAppointmentConflicts(teacherId: string, request: AvailabilityRequest) {
     const appointments = await prisma.appointment.findMany({
       where: {
         teacherId,
         status: { in: ['pending', 'approved'] }
       }
     })
     
     // 检查每个预约的时间重叠
     return appointments.filter(appointment => {
       const overlap = analyzeTimeOverlap(
         appointment.startTime, appointment.endTime,
         request.startTime, request.endTime
       )
       return overlap.type !== 'no_overlap'
     })
   }
   ```

3. **阻塞时间冲突检测**：
   ```typescript
   async function checkBlockedTimeConflicts(teacherId: string, request: AvailabilityRequest) {
     const blockedTimes = await prisma.blockedTime.findMany({ where: { teacherId } })
     
     return blockedTimes.filter(blocked => {
       const overlap = analyzeTimeOverlap(
         blocked.startTime, blocked.endTime,
         request.startTime, request.endTime
       )
       return overlap.type !== 'no_overlap'
     })
   }
   ```

**智能冲突解决建议**：

```typescript
function generateConflictSuggestions(conflicts: TimeConflict[], request: AvailabilityRequest) {
  const suggestions = []
  
  if (conflicts.some(c => c.type === 'overlap')) {
    suggestions.push('建议调整时间段，避免与现有时间重叠')
  }
  
  if (conflicts.some(c => c.type === 'exact_match')) {
    suggestions.push('该时间段已存在，请选择其他时间')
  }
  
  if (conflicts.some(c => c.type === 'blocked_time')) {
    suggestions.push('建议先移除阻塞时间，或选择其他时间段')
  }
  
  return suggestions
}
```

## 12.3 预约冲突检测算法

### 核心算法：`checkAppointmentConflicts()`

**功能描述**：在创建新预约时，检测与现有预约的时间冲突。

**冲突检测流程**：

1. **时间范围计算**：
   ```typescript
   const scheduledTime = new Date(validatedData.scheduledTime)
   const slotEnd = addMinutes(scheduledTime, validatedData.durationMinutes)
   
   // 包含缓冲时间的完整范围
   const bufferStart = addMinutes(scheduledTime, -teacher.bufferMinutes)
   const bufferEnd = addMinutes(slotEnd, teacher.bufferMinutes)
   ```

2. **冲突查询**：
   ```typescript
   const conflictingAppointments = await prisma.appointment.findMany({
     where: {
       teacherId: validatedData.teacherId,
       scheduledTime: { lt: bufferEnd },
       status: { in: ['pending', 'approved'] }
     }
   })
   ```

3. **重叠判断**：
   ```typescript
   const hasConflict = conflictingAppointments.some(appointment => {
     const appointmentEnd = addMinutes(appointment.scheduledTime, appointment.durationMinutes)
     return bufferStart < appointmentEnd && bufferEnd > appointment.scheduledTime
   })
   ```

**边界情况处理**：
- 缓冲时间：教师设置的 `bufferMinutes` 确保预约间有足够间隔
- 状态过滤：只检查 `pending` 和 `approved` 状态的预约
- 时间精度：使用毫秒级精度进行时间比较
