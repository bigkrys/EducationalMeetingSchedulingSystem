# 教育调度系统设计说明

# 一、 业务功能说明

> 该系统是给学校使用的平台。学生在平台选择老师和预约该老师的辅导，老师在平台设置自己的可预约时间段并对学生预约进行审批；系统根据不同的“服务级别”自动/人工批准，限制每月次数，并避免冲突。

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

| 角色 | 功能             | 说明                                            | 关键规则                                                                |
| ---- | ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| 学生 | 搜索教师可用槽位 | 根据教师与日期返回可预约开始时间列表            | 遵守 availability、blocked、appointments、buffer，不超 maxDailyMeetings |
| 学生 | 创建预约         | 学生选择槽位创建预约                            | 科目匹配、服务级别路由、槽位占用检查、幂等                              |
| 学生 | 取消预约         | 在允许的时限内取消（例如会议开始前≥2h，可配置） | 已完成/已过期不可取消；写审计                                           |
| 学生 | 预约改期         | 取决于是否支持“移动”预约；默认实现为“取消+新建” | 改期需重过冲突与配额校验                                                |
| 学生 | 查看我的预约     | 按状态/时间范围分页查询                         | 默认升序                                                                |
| 教师 | 维护每周可用性   | 设置/更新 dayOfWeek + start/end                 | 同一天可多个区间                                                        |
| 教师 | 维护阻塞时间     | 记录一段不可预约时间（上课/开会等）             | 与预约冲突时提示风险                                                    |
| 教师 | 审批/拒绝预约    | 对所有pending 执行 approve/cancel               | 记录原因、时间；通知                                                    |
| 管理 | 服务级别策略     | 配额阈值、超时阈值、提醒策略等参数化            | 可后续抽象为策略表                                                      |
| 系统 | 48h 待审批过期   | 定时扫描 pending 超时→expired                   | 发送过期通知                                                            |
| 系统 | 月初配额重置     | 每月1日重置 Level1/2 配额计数                   | 更新时间戳                                                              |
| 系统 | 提醒通知         | T-24h / T-1h 提醒学生&教师                      | 队列/定时触发                                                           |
| 系统 | 候补队列         | 若热门时段被占，可加入候补；释放时自动顶替      | 顶替后通知双方                                                          |

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
- **Notification Service**：提醒通知、过期通知（当前直接由 API 调用邮件服务，无独立队列）。
- **Database**：PostgreSQL，包含认证表、业务表、审计表。
- **Cache**：内存缓存为主，支持可选 Redis（配置 `REDIS_URL` 后启用）。
- **Message Queue**：规划项，当前未落地（后续可对接 Kafka/RabbitMQ）。

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

注：上述“引导口令 / 管理员邀请”流程为规划设计，当前未实现；实际管理端接口以现有的 `/api/admin/*` 路由为准。

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

**实现说明（与代码一致）**：

- 路由：`POST /api/jobs/reset-quota`（实现文件：`src/app/api/jobs/reset-quota/route.ts`）。
- 鉴权：必须提供触发密钥，后端会检查 header `x-job-secret` 或 `Authorization: Bearer <secret>`，该密钥在部署环境中由 `JOB_TRIGGER_SECRET` 环境变量配置。未授权请求返回 401。
- 触发时机限制：默认只允许在每月第 1 日执行；对于测试或手动触发，可以使用 `?force=true` 强制运行（路由会接受该参数并跳过日期限制）。
- 行为：查找 `lastQuotaReset` 早于本月月初的学生，批量将 `monthlyMeetingsUsed` 置为 `0`，并把 `lastQuotaReset` 更新为本月月初（`new Date(year, month, 1)`）。
- 审计：会写入一条 `AuditLog`（action=`QUOTA_RESET`），包含本次被重置的学生 id、此前配额等信息。
- 幂等性：该任务按月设计为幂等——同一月重复运行不会再重置已更新的学生（查询条件为 `lastQuotaReset < 本月月初`）。

```mermaid
sequenceDiagram
participant Q as Cron
participant A as Job API
participant D as DB
Q->>A: POST /api/jobs/reset-quota (通常每月1日 00:05)
A->>D: SELECT students WHERE lastQuotaReset < 本月月初
A->>D: UPDATE 每个 student SET monthlyMeetingsUsed=0, lastQuotaReset=本月月初
D-->>A: 返回影响行数

```

### 在 Vercel 上部署与定时触发

如果你的应用部署在 Vercel，可以使用 Vercel 的 Scheduled Functions（Cron Jobs）来触发该接口：

说明：按你提供的信息，定时任务已通过 `vercel.json` 配置（参考 https://vercel.com/docs/cron-jobs），且 `JOB_TRIGGER_SECRET` 已在 Vercel 的 Environment Variables 中配置。

如果你希望把配置写入仓库（可被 Vercel 读取），示例 `vercel.json` 的 Cron 配置片段如下：

```json
{
  "crons": [{ "path": "/api/jobs/reset-quota", "schedule": "5 0 1 * *" }]
}
```

注意：不要把 `JOB_TRIGGER_SECRET` 写入仓库；该密钥应通过 Vercel Dashboard -> Project -> Settings -> Environment Variables 添加到 Production（或对应环境）。后端同时接受 `Authorization: Bearer <secret>` 或 `x-job-secret: <secret>` 两种 header 形式。

验证方法（可逐步执行）：

1. 在 Vercel Dashboard → Project → Functions / Cron（或 Scheduled Jobs）确认存在一条路径为 `/api/jobs/reset-quota` 的 Cron 任务并处于启用状态。
2. 在 Vercel 的 Function Logs 中查看最近的 Cron 执行记录（或手动触发一次并观察日志），确认请求的 HTTP 状态码与返回体。
3. 手动触发（测试用，使用你在 Vercel 环境变量中配置的 secret）：

```bash
BASE_URL="https://your-deployment.vercel.app"
JOB_TRIGGER_SECRET="<your-secret-from-vercel>"
curl -i -X POST "$BASE_URL/api/jobs/reset-quota?force=true" \
  -H "Authorization: Bearer $JOB_TRIGGER_SECRET"
```

4. 验证数据库审计：查询 `audit_logs` 表，确认最近有 `action='QUOTA_RESET'` 的记录，例如：

```sql
SELECT id, action, details, created_at
FROM audit_logs
WHERE action = 'QUOTA_RESET'
ORDER BY created_at DESC
LIMIT 5;
```

如果需要，我可以：

- 帮你把 `vercel.json` 中的 Cron 片段加入仓库（示例，不会包含 secret），或
- 把 README 中的该段落改为说明你已经在 `vercel.json` 中添加了 Cron（当前已完成）。



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
````

## 3.14 系统｜候补队列

**目标**：热门时段被占时可加入候补，释放时自动顶替（并通知相关人）。

**数据结构与约束（实际实现）**：
- 表 `waitlists`（Prisma 模型 `Waitlist`）：`teacherId,date,slot,studentId,status,priority,idempotencyKey,notifiedAt,promotedAt,expiresAt,createdAt,updatedAt`。
- 复合唯一约束：同一 `teacherId+slot+studentId` 只能排队一次（防重复）。
- `status`：`active | promoted | cancelled | expired`（当前主要使用 active/expired，promoted 由审计日志体现）。
- 选取规则：按 `createdAt` 先后（FIFO）。UI 中会显示基于服务级别映射的“展示优先级”，但晋升时不参与排序。

**接口与作业（节选）**：
- 学生加入/移除/查询：
  - POST `/api/waitlist`（需 body: teacherId, date, slot, studentId, subject）
  - DELETE `/api/waitlist`（body: id, studentId）
  - GET `/api/waitlist?studentId=...|teacherId=...`
  - GET `/api/waitlist/slot?teacherId=...&slot=...&studentId=...`（槽位队列详情 + 我的排位）
- 晋升：
  - 系统内部：POST `/api/waitlist/promote`（仅作业鉴权调用），或由取消预约后直接在事务中调用晋升 helper。
- 定时任务（Vercel Cron）：
  - `/api/jobs/cleanup-waitlist`（每日清理已被占用槽位上的残留候补）
  - `/api/jobs/expire-waitlist`（每 10 分钟标记已过期的 active 候补为 expired 并通知）

**工作流说明**：
- 加入候补：查重 → 写入 waitlists → 写审计（WAITLIST_ADDED）→ 返回当前排位。
- 槽位释放自动晋升：当预约被取消时触发；在数据库事务中并发安全地选择最早候补并创建/更新预约（若 Premium 或在自动批准额度内可直接批准），删除候补重复项并写审计（WAITLIST_PROMOTED），随后发送通知。
- 定期清理与过期：已被占用的槽位清理候补残留；slot 已过期的 active 候补标记为 expired 并通知学生（WAITLIST_EXPIRED）。

```mermaid
sequenceDiagram
  autonumber
  actor Student
  participant UI as Frontend (StudentBookingCalendar)
  participant API as API Server (Next.js)
  participant DB as Prisma / DB
  participant Promo as promoteForSlotTx
  participant Email as Email Service
  participant CronCleanup as Cron: cleanup-waitlist
  participant CronExpire as Cron: expire-waitlist

  rect rgb(245,245,245)
  note over Student,API: 1) 学生加入候补
  Student->>UI: 点“加入候补”
  UI->>API: POST /api/waitlist {teacherId,date,slot,studentId,subject}
  API->>DB: waitlist.findFirst(查重)
  alt 已存在
    API-->>UI: 409 Duplicate
  else 不存在
    API->>DB: waitlist.create()
    API->>DB: auditLog.create(WAITLIST_ADDED)
    API-->>UI: 201 {id, position}
  end
  end

  rect rgb(245,245,245)
  note over UI,Email: 2) 预约取消 → 自动晋升
  UI->>API: PATCH /api/appointments/:id {action: cancel}
  API->>DB: appointment.update(status=cancelled)

  par 直接事务晋升
    API->>Promo: tx promoteForSlotTx(teacherId, slot, subject)
    alt 晋升成功
      Promo->>DB: SELECT ... FOR UPDATE SKIP LOCKED (取最早候选)
      Promo->>DB: 检查该槽位是否占用(pending/approved)
      Promo->>DB: 配额/策略校验(ServicePolicy、serviceLevel)
      Promo->>DB: create/update appointment
      Promo->>DB: delete waitlist (+ 同学该slot重复项)
      Promo->>DB: student.monthlyMeetingsUsed += 1
      Promo->>DB: auditLog.create(WAITLIST_PROMOTED)
      Promo-->>API: {promoted:1, appointmentId, status}
      API->>DB: 清理 slots 缓存
      API->>Email: 发送 pending/approved 对应通知
    else 无候选
      Promo-->>API: {promoted:0}
    end
  and HTTP 冗余触发
    API->>API: POST /api/waitlist/promote (job-auth)
  end
  end

  rect rgb(245,245,245)
  note over CronCleanup,API: 3) 定时清理占用槽位的候补
  CronCleanup->>API: POST /api/jobs/cleanup-waitlist
  API->>DB: 列出若干(teacherId,slot)对
  loop each pair
    API->>DB: 统计该slot的预约(pending/approved)
    alt 已占用
      API->>DB: waitlist.deleteMany(该slot)
    end
  end
  API-->>CronCleanup: {checked, removed}
  end

  rect rgb(245,245,245)
  note over CronExpire,Email: 4) 定时过期候补并通知
  CronExpire->>API: POST /api/jobs/expire-waitlist
  API->>DB: waitlist.findMany(status='active', slot<now)
  loop each item
    API->>DB: waitlist.update(status='expired', expiresAt=now)
    API->>DB: auditLog.create(WAITLIST_EXPIRED)
    API->>Email: 发送过期通知
  end
  API-->>CronExpire: {updated, results}
  end

  rect rgb(245,245,245)
  note over UI,API: 5) 前端查看槽位与候补详情
  UI->>API: GET /api/slots?teacherId&date
  API->>DB: 查预约 + 候补计数
  API-->>UI: {slots, bookedSlots, waitlistCount}

  UI->>API: GET /api/waitlist/slot?teacherId&slot&studentId
  API->>DB: 按createdAt升序取队列
  API-->>UI: {total, waitlist, myPosition}
  end
```

# 四、数据库设计

## 4.1 users（统一身份表）

| 字段名        | 类型            | 约束                     | 说明                               |
| ------------- | --------------- | ------------------------ | ---------------------------------- |
| id            | UUID            | PK                       | 统一用户 ID                        |
| email         | VARCHAR(255)    | UNIQUE, NOT NULL         | 登录邮箱                           |
| password_hash | VARCHAR(255)    | NOT NULL                 | 密码哈希（Argon2id / bcrypt≥10）   |
| role          | String          | NOT NULL                 | 角色：student/teacher/admin        |
| status        | String          | NOT NULL DEFAULT 'pending' | 账户状态（pending/active/...）   |
| name          | String          | NOT NULL                 | 显示名称                           |
| is_active     | Boolean         | DEFAULT true             | 是否启用                           |
| created_at    | TIMESTAMPTZ     | DEFAULT NOW()            |                                    |
| updated_at    | TIMESTAMPTZ     | DEFAULT NOW()            |                                    |

## 4.2 students（学生扩展表）

| 字段名                | 类型                              | 约束                             | 说明              |
| --------------------- | --------------------------------- | -------------------------------- | ----------------- |
| id                    | UUID                              | PK                               |                   |
| user_id               | UUID                              | FK → users(id), UNIQUE, NOT NULL | 与 users 1:1 绑定 |
| service_level         | ENUM('level1','level2','premium') | NOT NULL                         | 服务级别          |
| monthly_meetings_used | INT                               | DEFAULT 0                        | 当月已用配额      |
| last_quota_reset      | TIMESTAMPTZ                       | DEFAULT NOW()                    | 上次配额重置时间  |
| grade_level           | INT                               |                                  | 年级              |
| created_at            | TIMESTAMPTZ                       | DEFAULT NOW()                    |                   |
| updated_at            | TIMESTAMPTZ                       | DEFAULT NOW()                    |                   |

说明：学生所修科目通过关联表 `student_subjects` 维护（见 4.5）。

## 4.3 teachers（教师表）

| 字段名             | 类型        | 约束                             | 说明                                |
| ------------------ | ----------- | -------------------------------- | ----------------------------------- |
| id                 | UUID        | PK                               |                                     |
| user_id            | UUID        | FK → users(id), UNIQUE, NOT NULL | 与 users 1:1 绑定                   |
| max_daily_meetings | INT         | DEFAULT 8                        | 每日上限                            |
| buffer_minutes     | INT         | DEFAULT 15                       | 会议缓冲分钟                        |
| timezone           | VARCHAR(64) | NOT NULL DEFAULT 'Asia/Shanghai' | 教师所在时区                        |
| created_at         | TIMESTAMPTZ | DEFAULT NOW()                    |                                     |
| updated_at         | TIMESTAMPTZ | DEFAULT NOW()                    |                                     |

说明：教师可授科目通过关联表 `teacher_subjects` 维护（见 4.6）。

## 4.4 subjects（科目表）

| 字段名     | 类型          | 约束               | 说明         |
| ---------- | ------------- | ------------------ | ------------ |
| id         | UUID          | PK                 |              |
| name       | VARCHAR(100)  | UNIQUE, NOT NULL   | 科目名称     |
| code       | VARCHAR(100)  | UNIQUE, NOT NULL   | 唯一编码     |
| description| TEXT          |                    | 描述         |
| is_active  | BOOLEAN       | DEFAULT true       | 启用状态     |
| created_at | TIMESTAMPTZ   | DEFAULT NOW()      |              |
| updated_at | TIMESTAMPTZ   | DEFAULT NOW()      |              |

## 4.5 student_subjects（学生-科目 关联表）

| 字段名     | 类型 | 约束                                   | 说明         |
| ---------- | ---- | -------------------------------------- | ------------ |
| id         | UUID | PK                                     |              |
| student_id | UUID | FK → students(id)                      | 学生         |
| subject_id | UUID | FK → subjects(id)                      | 科目         |
| UNIQUE     |      | (student_id, subject_id)               | 防重复       |

## 4.6 teacher_subjects（教师-科目 关联表）

| 字段名     | 类型 | 约束                                   | 说明         |
| ---------- | ---- | -------------------------------------- | ------------ |
| id         | UUID | PK                                     |              |
| teacher_id | UUID | FK → teachers(id)                      | 教师         |
| subject_id | UUID | FK → subjects(id)                      | 科目         |
| UNIQUE     |      | (teacher_id, subject_id)               | 防重复       |
| created_at | TIMESTAMPTZ | DEFAULT NOW()                    |                            |

## 4.5 teacher_availability（教师可用性）

| 字段名       | 类型    | 约束                        | 说明         |
| ------------ | ------- | --------------------------- | ------------ |
| id           | UUID    | PK                          |              |
| teacher_id   | UUID    | FK → teachers(id), NOT NULL | 教师         |
| day_of_week  | INT     | 0–6                         | 周日=0       |
| start_time   | TIME    | NOT NULL                    |              |
| end_time     | TIME    | NOT NULL                    |              |
| is_recurring | BOOLEAN | DEFAULT true                | 是否每周重复 |
| is_active    | BOOLEAN | DEFAULT true                | 是否启用     |

## 4.6 blocked_times（阻塞时段）

| 字段名     | 类型         | 约束              | 说明 |
| ---------- | ------------ | ----------------- | ---- |
| id         | UUID         | PK                |      |
| teacher_id | UUID         | FK → teachers(id) | 教师 |
| start_time | TIMESTAMPTZ  | NOT NULL          |      |
| end_time   | TIMESTAMPTZ  | NOT NULL          |      |
| reason     | VARCHAR(255) |                   | 原因 |
| created_at | TIMESTAMPTZ  | DEFAULT NOW()     |      |

## 4.7 appointments（预约表）

| 字段名            | 类型                                                                   | 约束                                     | 说明            |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------- | --------------- |
| id                | UUID                                                                   | PK                                       |                 |
| student_id        | UUID                                                                   | FK → students(id)                        | 学生            |
| teacher_id        | UUID                                                                   | FK → teachers(id)                        | 教师            |
| subject_id        | UUID                                                                   | FK → subjects(id)                        | 科目            |
| scheduled_time    | TIMESTAMPTZ                                                            | NOT NULL                                 | 开始时间（UTC） |
| duration_minutes  | INT                                                                    | DEFAULT 30                               | 时长（分钟）    |
| status            | ENUM('pending','approved','completed','cancelled','no_show','expired') | NOT NULL                                 | 统一状态枚举    |
| approval_required | BOOLEAN                                                                | NOT NULL                                 | 是否需审批      |
| approved_at       | TIMESTAMPTZ                                                            |                                          | 审批时间        |
| idempotency_key   | VARCHAR(128)                                                           | UNIQUE                                   | 幂等键          |
| created_at        | TIMESTAMPTZ                                                            | DEFAULT NOW()                            |                 |
| updated_at        | TIMESTAMPTZ                                                            | DEFAULT NOW()                            |                 |
| 唯一索引          |                                                                        | (teacher_id, scheduled_time)             | 防止重叠创建    |

备注：实际实现采用普通唯一索引 `(teacher_id, scheduled_time)`，未启用 `TSTZRANGE + GIST` 排他约束。

## 4.8 服务级别策略表（service_policies）

| 字段名            | 类型   | 约束/默认         | 说明                                   |
| ----------------- | ------ | ---------------- | -------------------------------------- |
| id                | UUID   | PK               |                                         |
| level             | String | UNIQUE           | 服务级别（level1/level2/premium）      |
| monthlyAutoApprove| Int    | DEFAULT 0        | 当月自动批准配额（校验与路由使用）     |
| priority          | Bool   | DEFAULT false    | 是否优先（展示用）                     |
| expireHours       | Int    | DEFAULT 48       | 待审批过期时长（小时）                 |
| reminderOffsets   | String | DEFAULT '24,1'   | 提醒偏移（逗号分隔，例如 24,1 小时）   |
| created_at        | TIMESTAMPTZ | DEFAULT NOW() |                                         |
| updated_at        | TIMESTAMPTZ | DEFAULT NOW() |                                         |

## 4.9 审计日志表（audit_logs）

| 字段名     | 类型     | 描述        |
| ---------- | -------- | ----------- |
| id         | UUID     | 日志 ID     |
| actor_id   | UUID     | 操作者 ID   |
| action     | String   | 动作名称    |
| target_id  | UUID     | 目标对象 ID |
| details    | TEXT     | 详情 JSON   |
| ip_address | TEXT     | 来源 IP     |
| user_agent | TEXT     | UA          |
| created_at | DateTime | 操作时间    |

# 五、接口设计

## 5.1 学生端接口（Student APIs）

> 鉴权：Bearer JWT（role=student）。时区：所有时间字段均为 ISO8601 UTC。

### 5.1.1 查询教师可用槽位

- GET `/api/slots?teacherId={id}&date=YYYY-MM-DD&duration=30&excludeUserId={userId}`
- 说明：`date` 参数按教师时区解释，后端换算为 UTC；`excludeUserId` 可选，用于从“已预约统计”中排除当前用户（避免误判可用性）。
- 请求参数：
  - `teacherId` _(required)_：教师 ID
  - `date` _(required)_：日期（YYYY-MM-DD）
  - `duration` _(optional, default=30)_：会议时长（分钟）
  - `excludeUserId` _(optional)_：排除该用户的预约（通过学生 userId）
- 响应 200：

```json
{
  "teacherId": "t_123",
  "date": "2025-08-22",
  "duration": 30,
  "slots": ["2025-08-22T01:00:00Z", "2025-08-22T01:30:00Z"],
  "bookedSlots": ["2025-08-22T02:00:00Z"],
  "waitlistCount": [
    { "slot": "2025-08-22T01:00:00Z", "count": 2 }
  ]
}
```

- 错误：`BAD_REQUEST`、`TEACHER_NOT_FOUND`。

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
  "items": [
    {
      "id": "a_1",
      "scheduledTime": "...",
      "status": "approved"
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

### 5.3.1 服务级别策略

- PUT `/api/policies`
- 请求体（批量 upsert）：

```json
{
  "policies": [
    { "level": "level1", "monthlyAutoApprove": 2, "priority": false, "expireHours": 48, "reminderOffsets": "24,1" },
    { "level": "level2", "monthlyAutoApprove": 0, "priority": false, "expireHours": 48, "reminderOffsets": "24,1" },
    { "level": "premium", "monthlyAutoApprove": 10000, "priority": true, "expireHours": 48, "reminderOffsets": "24,1" }
  ]
}
```

- 响应 200：`{ "updated": 3, "policies": [...] }`

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

- 学生加入候补：
  - POST `/api/waitlist`
  - 请求体：
  ```json
  {
    "teacherId": "t_1",
    "date": "2025-08-22",
    "slot": "2025-08-22T01:00:00Z",
    "studentId": "s_1",
    "subject": "math"
  }
  ```
  - 响应（201）：`{ "id": "...", "position": 3 }`

- 学生移除候补：
  - DELETE `/api/waitlist`
  - 请求体：`{ "id": "waitlist_id", "studentId": "s_1" }`

- 查询候补：
  - GET `/api/waitlist?studentId=...` 或 `?teacherId=...`
  - GET `/api/waitlist/slot?teacherId=...&slot=...&studentId=...`（槽位详情 + 我的排位）

- 系统晋升（内部调用）：
  - POST `/api/waitlist/promote`（由预约取消或定时任务触发，需作业鉴权）

- 系统作业：
  - POST `/api/jobs/cleanup-waitlist`（清理已占用槽位的残留候补）
  - POST `/api/jobs/expire-waitlist`（标记过期候补并通知学生）

# 六、系统安全

- **认证与会话**
  - Access Token (JWT, 15m) + Refresh Token (30d, 可轮换)，存放 HttpOnly+Secure Cookie。
  - 修改密码/重置密码时吊销全部 Refresh。
- **密码策略**
  - 最少 8 位，含字母与数字。
- **防暴力与限流**
  - 生产环境采用进程内轻量限流中间件（可按需切换为 Redis 实现），防止明显滥用。
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
- **数据库**: PostgreSQL（开发/生产一致，推荐 Neon 或本地 Docker）

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

- **开发**: PostgreSQL（Neon 分支/本地 Docker）
- **生产**: Neon / Supabase (PostgreSQL)

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



# 十一、 关键算法实现

## 11.1 生成可用时间段算法

### 核心算法：`calculateAvailableSlots()`

**功能描述**：根据教师的可用性设置、阻塞时间和已有预约，生成指定日期的可用时间段列表。

**算法流程**：

```typescript
async function calculateAvailableSlots(teacher: any, date: string, duration: number) {
  // 1. 获取目标日期的星期几
  const dayOfWeek = getDay(targetDate) // 0 = 周日, 1 = 周一, ...

  // 2. 查找该日期的可用时间设置
  const dayAvailability = teacher.availability.find((avail) => avail.dayOfWeek === dayOfWeek)

  // 3. 生成基础时间槽（按 duration 分钟切片）
  const allSlots = generateTimeSlots(dayAvailability.startTime, dayAvailability.endTime, duration)

  // 4. 过滤冲突时间槽
  const availableSlots = filterConflictingSlots(allSlots, teacher, targetDate, duration)

  return availableSlots.map((slot) => slot.toISOString())
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

## 11.2 教师可用性冲突检测算法

### 核心算法：`detectAvailabilityConflicts()`

**功能描述**：检测教师设置可用时间时与现有预约、阻塞时间的冲突情况。**重要：冲突检测仅在同一个星期几内进行，不同星期几的相同时间段不会被认为是重叠的。**

**冲突类型分类**：

```typescript
interface TimeConflict {
  type:
    | 'exact_match'
    | 'overlap'
    | 'contained'
    | 'contains'
    | 'blocked_time'
    | 'appointment'
    | 'invalid_time'
  message: string
  existingSlot?: TeacherAvailability
  blockedTime?: BlockedTime
  appointment?: Appointment
  overlap?: string
}
```

**冲突检测算法**：

1. **时间重叠分析**（修正后的准确算法）：

   ```typescript
   function analyzeTimeOverlap(start1: string, end1: string, start2: string, end2: string) {
     const s1 = timeToMinutes(start1),
       e1 = timeToMinutes(end1)
     const s2 = timeToMinutes(start2),
       e2 = timeToMinutes(end2)

     // 没有重叠的情况：
     // 1. 第一个时间段完全在第二个时间段之前 (e1 <= s2)
     // 2. 第二个时间段完全在第一个时间段之前 (e2 <= s1)
     if (e1 <= s2 || e2 <= s1) {
       return { type: 'no_overlap' }
     }

     // 完全匹配
     if (s1 === s2 && e1 === e2) {
       return { type: 'exact_match' }
     }

     // 包含关系：第一个时间段包含第二个时间段
     if (s1 <= s2 && e1 >= e2) {
       return { type: 'contains' }
     }

     // 包含关系：第二个时间段包含第一个时间段
     if (s2 <= s1 && e2 >= e1) {
       return { type: 'contained' }
     }

     // 部分重叠：两个时间段有交集但不完全包含
     const overlapStart = Math.max(s1, s2)
     const overlapEnd = Math.min(e1, e2)
     const overlapMinutes = overlapEnd - overlapStart

     return {
       type: 'overlap',
       overlap: `${minutesToTime(overlapStart)}-${minutesToTime(overlapEnd)}`,
       overlapMinutes,
     }
   }
   ```

2. **星期几逻辑**（关键特性）：

   ```typescript
   // 冲突检测仅在同一个星期几内进行
   if (request.specificDate) {
     // 检查具体日期的冲突
     const targetDate = new Date(request.specificDate)
     existingSlots = await prisma.teacherAvailability.findMany({
       where: {
         teacherId,
         dayOfWeek: targetDate.getDay(), // 只查询同一天
         isActive: true,
       },
     })
   } else if (request.dayOfWeek !== undefined) {
     // 检查周循环的冲突
     existingSlots = await prisma.teacherAvailability.findMany({
       where: {
         teacherId,
         dayOfWeek: request.dayOfWeek, // 只查询同一个星期几
         isActive: true,
       },
     })
   }
   ```

3. **预约冲突检测**（设置可用性时）：

   ```typescript
   async function checkAppointmentConflicts(teacherId: string, request: AvailabilityRequest) {
     const appointments = await prisma.appointment.findMany({
       where: {
         teacherId,
         status: { in: ['pending', 'approved'] },
       },
     })

     // 只检查同一星期几的预约冲突
     for (const appointment of appointments) {
       let shouldCheck = false

       if (request.dayOfWeek !== undefined) {
         const appointmentDay = appointment.scheduledTime.getDay()
         shouldCheck = appointmentDay === request.dayOfWeek
       }

       if (shouldCheck) {
         // 使用 analyzeTimeOverlap 进行时间重叠分析
         const overlapAnalysis = analyzeTimeOverlap(
           appointmentStart,
           appointmentEnd,
           request.startTime,
           request.endTime
         )

         if (overlapAnalysis.type !== 'no_overlap') {
           // 记录冲突
         }
       }
     }
   }
   ```

4. **阻塞时间冲突检测**：

   ```typescript
   async function checkBlockedTimeConflicts(teacherId: string, request: AvailabilityRequest) {
     const blockedTimes = await prisma.blockedTime.findMany({ where: { teacherId } })

     // 检查是否与阻塞时间冲突（按星期几分组）
     for (const blocked of blockedTimes) {
       let shouldCheck = false

       if (request.dayOfWeek !== undefined) {
         const blockedDay = blocked.startTime.getDay()
         shouldCheck = blockedDay === request.dayOfWeek
       }

       if (shouldCheck) {
         const overlapAnalysis = analyzeTimeOverlap(
           blockedStart,
           blockedEnd,
           request.startTime,
           request.endTime
         )

         if (overlapAnalysis.type !== 'no_overlap') {
           // 记录冲突
         }
       }
     }
   }
   ```

**智能冲突解决**：

```typescript
function generateConflictSuggestions(conflicts: TimeConflict[], request: AvailabilityRequest) {
  const suggestions = []

  for (const conflict of conflicts) {
    if (conflict.type === 'overlap' && conflict.existingSlot) {
      // 计算合并后的时间段
      const mergedStart = minutesToTime(
        Math.min(timeToMinutes(existing.startTime), timeToMinutes(request.startTime))
      )
      const mergedEnd = minutesToTime(
        Math.max(timeToMinutes(existing.endTime), timeToMinutes(request.endTime))
      )

      suggestions.push({
        action: 'merge',
        description: `合并时间段：将您的时间与现有时间合并`,
        result: `${mergedStart}-${mergedEnd}`,
        recommendation: '推荐：这样可以最大化您的可用时间，避免时间碎片化',
      })
    } else if (conflict.type === 'exact_match') {
      suggestions.push({
        action: 'update',
        description: `更新现有时间段：修改重复时间段的设置`,
        recommendation: '您可以更新现有时间段的重复设置或其他属性',
      })
    }
  }

  return suggestions.sort((a, b) => (a.priority || 999) - (b.priority || 999))
}
```

## 11.3 学生预约冲突检测算法

### 核心算法：预约创建时的冲突检测

**功能描述**：在创建新预约时，检测与教师可用性、阻塞时间和已有预约的时间冲突。

**冲突检测流程**：

1. **教师可用性检查**：

   ```typescript
   // 检查教师在该日期是否有可用时间
   const dayOfWeek = appointmentDate.getDay()
   const dayAvailability = teacher.availability.find(
     (avail) => avail.dayOfWeek === dayOfWeek && avail.isActive
   )

   if (!dayAvailability) {
     throw new Error('教师在该日期没有可用时间')
   }

   // 检查预约时间是否在可用时间范围内
   const appointmentStart = appointment.scheduledTime.toTimeString().slice(0, 5)
   const appointmentEnd = addMinutes(appointment.scheduledTime, duration).toTimeString().slice(0, 5)

   if (appointmentStart < dayAvailability.startTime || appointmentEnd > dayAvailability.endTime) {
     throw new Error('预约时间超出教师的可用时间范围')
   }
   ```

2. **阻塞时间冲突检测**：

   ```typescript
   const blockedTimes = await prisma.blockedTime.findMany({
     where: { teacherId: teacher.id },
   })

   const hasBlockedTimeConflict = blockedTimes.some((blocked) => {
     const blockStart = blocked.startTime
     const blockEnd = blocked.endTime
     const appointmentEnd = addMinutes(appointment.scheduledTime, duration)

     // 检查时间重叠
     return appointment.scheduledTime < blockEnd && appointmentEnd > blockStart
   })
   ```

3. **已有预约冲突检测**（包含缓冲时间）：

   ```typescript
   const existingAppointments = await prisma.appointment.findMany({
     where: {
       teacherId: teacher.id,
       scheduledTime: {
         gte: startOfDay(appointmentDate),
         lt: endOfDay(appointmentDate),
       },
       status: { in: ['pending', 'approved'] },
     },
   })

   const hasConflict = existingAppointments.some((existing) => {
     const existingEnd = addMinutes(existing.scheduledTime, existing.durationMinutes)
     const appointmentEnd = addMinutes(appointment.scheduledTime, duration)

     // 包含缓冲时间的冲突检测
     const bufferStart = addMinutes(appointment.scheduledTime, -teacher.bufferMinutes)
     const bufferEnd = addMinutes(appointmentEnd, teacher.bufferMinutes)

     return bufferStart < existingEnd && bufferEnd > existing.scheduledTime
   })
   ```

**边界情况处理**：

- **缓冲时间**：教师设置的 `bufferMinutes` 确保预约间有足够间隔
- **状态过滤**：只检查 `pending` 和 `approved` 状态的预约
- **时间精度**：使用毫秒级精度进行时间比较
- **星期几逻辑**：预约时间必须与教师的可用性设置匹配

## 12.4 时间重叠检测算法总结

### 核心特性

1. **星期几隔离**：不同星期几的时间段不会被认为是重叠的
2. **精确重叠检测**：使用修正后的算法准确判断时间重叠类型
3. **缓冲时间支持**：支持教师自定义的缓冲时间设置
4. **智能冲突解决**：提供合并、分割等冲突解决建议

### 算法复杂度

- **时间复杂度**：O(n²) 其中 n 是时间段数量
- **空间复杂度**：O(n) 用于存储时间段和冲突信息
- **缓存优化**：热门查询结果缓存5分钟，显著提升性能

### 实际应用场景

1. **教师设置可用性**：检测与现有时间段的冲突
2. **学生预约**：检测与教师可用性和阻塞时间的冲突
3. **系统维护**：自动过期处理、配额重置等定时任务


# 十二、 生产落地设计方案

从 MVP 加固到安全发布的落地方案与操作要点。

## 12.1 总览

- 目标环境：开发 → 预发（Staging/Preview） → 生产（Production） （已完成）
- 平台：GitHub Actions + Vercel（Serverless + Cron）+ Neon（Postgres）+ 可选 Redis （已完成）
- 可观测性：Sentry（错误、性能、业务指标）、结构化日志、健康检查 （已完成）
- 安全与稳定：输入校验、统一响应、权限与速率限制、CORS 白名单与安全响应头、作业授权、DB 迁移、备份
- 安全发布：门禁（仅 main/develop 部署）、PR 检查、生产手动迁移、灰度策略与快速回滚 （部分完成）


## 12.2  MVP 加固

- 输入全覆盖校验：
  - 环境变量校验：`src/lib/env.ts` 使用 Zod 定义 schema，生产下失败即抛错（已完成）
  - API 入参校验：`src/lib/api/validation.ts` + 各路由 `zod.parse`/`withValidation`（已完成）

- 统一 API 响应：
  - `ok()/fail()`：`src/lib/api/response.ts` 统一 `{ ok, error, message, details }`（已完成）
  - 错误集中处理：路由 try/catch + Sentry 上报（已完成）

- 预约一致性：
  - 唯一约束：`@@unique([teacherId, scheduledTime])`、`idempotencyKey @unique`（已完成）
  - 事务：创建预约使用事务与冲突/配额校验（已完成）
  - 幂等：`idempotencyKey` 重试安全（已完成）

- Cron Job 加固（事务/幂等/授权）：
  - 作业鉴权：`authorizeJobRequest()`（Secret + 可选 HMAC + 生产附加约束）（已完成）
  - 任务示例：过期清理/提醒/候补提升，含并发窗口与审计（已完成）

- CORS/安全响应头/请求标识：
  - `src/middleware.ts` 按白名单放行、附加安全头、贯穿 `x-request-id`（已完成）

- 速率限制：
  - `withRateLimit()` 生产生效，登录/预约/查询等路由已启用（已完成）

- 健康检查：
  - `GET /api/healthz` 检查 DB/缓存/邮件连接（可开关）（已完成）

- 工具链与代码质量：
  - TypeScript 严格模式、ESLint/Prettier、Husky pre-commit（已完成）


## 12.3 构建门禁系统（CI/CD）

- 目标：
  - PR 只跑检查（类型/构建/测试），不部署（已完成）
  - develop → Staging/Preview，自动迁移 Staging DB（已完成）
  - main → Production，生产迁移经工作流执行（已完成）

- 检查门禁：
  - `ci.yml` 的 `checks` 在 PR 与 `main/develop` 推送时执行类型/ESLint/测试（已完成）

- 触发矩阵：
  - PR（任意 → develop/main）：跑 CI 检查（无部署）（已完成）
  - Push 到 develop：迁移 Staging DB → 部署 Preview（输出 URL）（已完成）
  - 发布到 Production：
    - 合并 `develop → main`（已完成）
    - 手动点工作流执行生产 DB 迁移（已完成）
    - Vercel 监控 `main` 变化自动构建生产

- 平台配置要点：
  - Vercel（项目 Settings → Git/Env）：按环境配置变量；`vercel.json` 提供门禁脚本占位
  - GitHub 保护分支：保护 `main`/`develop`、要求状态检查
  - GitHub Secrets：`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEON_STAGING_URL`, `NEON_PROD_URL`


## 12.4 数据库迁移策略

- 迁移目的：将 `prisma/schema.prisma` 生成的迁移版本可靠地应用至各环境（已完成）
- 一致性保障：Preview/Staging 与 Production 保持同一批迁移版本（已完成）
- 流程定位：develop 先迁移 Staging；main 合并后通过工作流迁移生产（已完成）


## 12.5 可观测性（监控/日志/指标）

- Sentry：服务端/客户端配置、`withSentryRoute` 封装、业务 `metrics.increment`（已完成）
- 结构化日志：`src/lib/logger.ts`（包含 `requestId` 等关键字段）（已完成）
- 健康检查与系统面板：`/api/healthz`、管理端 Dashboard（已完成）


## 12.6 安全性与稳定性

- 权限与认证：`withAuth/withRole(s)` + JWT，最小权限暴露（已完成）
- 速率限制：生产生效的 `withRateLimit()`（已完成）
- CORS 白名单与安全响应头：`src/middleware.ts`（已完成）
- 作业与计划任务安全：`authorizeJobRequest()` + `vercel.json` Cron（已完成）
- 漏洞扫描与依赖安全：CI 增加 CodeQL/`pnpm audit`（未落地）
- 数据备份：Neon PITR/自动备份与恢复演练（未落地）


## 12.7 性能优化

- 查询优化：预约列表 `take + cursor`，避免大偏移（已完成）
- 缓存：内存/Redis 双通道 + 模式失效（已完成）
- Serverless 参数：`functions.maxDuration`、`regions` 指定（已完成）
- 并发与批处理：Job 分页 + 并发窗口控制（已完成）

---

## 12.8 安全发布策略（灰度与回滚）（vercel环境已配置该功能， 需购买专业版）

- 灰度发布：Feature Flag/金丝雀域名/按比例放量（未落地--vercel 专业版带有滚动发布设置，尚未购买专业版使用， 文档地址 https://vercel.com/docs/rolling-releases#configuring-rolling-releases）
- 一键回滚：Vercel 提供Production 即时回滚功能

---

## 环境变量清单（关键项）

- 应用：`NEXT_PUBLIC_APP_URL`、`ALLOWED_ORIGINS`
- 数据库：`DATABASE_URL`（GitHub Secrets：`NEON_STAGING_URL`/`NEON_PROD_URL`）
- JWT：`JWT_SECRET`、`JWT_REFRESH_SECRET`
- 缓存：`REDIS_URL`
- 任务：`JOB_TRIGGER_SECRET`、`JOB_REQUIRE_HMAC`、`JOB_HMAC_WINDOW_SECONDS`、`JOB_ALLOWED_IPS`、`JOB_SCHEDULER_HEADER_NAME`、`JOB_SCHEDULER_HEADER_VALUE`
- Sentry：`NEXT_PUBLIC_SENTRY_DSN`、`SENTRY_DSN`、采样率相关
- Vercel/GitHub：`VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`

---

## 日常协作流程

1. 从 `develop` 切 `feature/*` 开发 → 提 PR → 通过 CI “checks” 后合并至 `develop`
2. 合并到 `develop` → 自动迁移 Staging DB + 部署 Preview（输出 URL）→ 在 Staging 验证功能与指标
3. 验证通过 → 提 PR `develop → main` → 合并后在 Actions 运行生产迁移 → Vercel 生产部署
