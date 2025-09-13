# edu-scheduler 生产落地设计方案

本文档给出从 MVP 加固到Production-Ready的不走

## 总览

- 目标环境：开发 → 预发（Staging/Preview） → 生产（Production）
- 平台：GitHub Actions + Vercel+ Neon（Postgres
- 可观测性：Sentry（错误、性能、业务指标）、结构化日志、健康检查
- 安全与稳定：输入校验、统一响应、权限与速率限制、CORS 白名单与安全响应头、作业授权、DB 迁移、备份
- 安全发布：门禁（仅 main/develop 部署）、PR 检查、生产手动迁移、灰度策略与快速回滚

---

## MVP 加固

- 输入全覆盖校验：
  - 环境变量校验：`src/lib/env.ts:1` 使用 Zod 定义 schema，非生产下给出警告，生产下失败即抛错，阻止应用以无效配置启动。
  - API 入参校验：`src/lib/api/validation.ts:1` 定义全局 Zod schema；部分路由直接使用 schema（如预约创建/更新）。配合 `withValidation` 中间件（`src/lib/api/middleware.ts:120`）可在需要时对 JSON body 进行统一验证。

- 统一 API 响应：
  - `ok()/fail()`：`src/lib/api/response.ts:1` 强制 `{ ok: true|false, error, message, details }` 统一格式，避免“满屏报红”。
  - 错误集中处理：路由统一 try/catch，错误通过 `fail()` 返回；严重异常通过 Sentry 上报（见可观测性）。

- 预约一致性（同一老师同一时间不可被抢占）：
  - 唯一约束：`prisma/schema.prisma:104` 的 `@@unique([teacherId, scheduledTime])`；幂等键 `idempotencyKey @unique`（`schema.prisma:101`）。
  - 事务：创建预约时使用事务与重读校验，内含冲突检查与配额判断（`src/app/api/appointments/route.ts:292` 起）。
  - 幂等：提交 `idempotencyKey`，已存在则直接返回现有预约（`src/app/api/appointments/route.ts:44`）。

- Cron Job 加固（事务 + 幂等/唯一 + 授权）：
  - 路由鉴权：`src/lib/api/job-auth.ts:1` 支持 `JOB_TRIGGER_SECRET`、可选 HMAC、生产来源 IP 白名单与专用 Header 校验。
  - 任务示例：过期清理 `src/app/api/jobs/expire-pending/route.ts:1`，提醒 `src/app/api/jobs/remind/route.ts`，候补提升 `src/app/api/waitlist/promote/route.ts`，均按批量/并发控制与审计日志记录。

- CORS/安全响应头/请求标识：
  - 运行时中间件：`src/middleware.ts:1` 根据 `ALLOWED_ORIGINS` 与 `NEXT_PUBLIC_APP_URL` 计算 CORS，附加安全响应头（类似 Helmet），并贯穿 `x-request-id`，便于日志关联。

- 速率限制：
  - 轻量限流中间件：`withRateLimit()` 于 `src/lib/api/middleware.ts:71`（生产生效）。已在关键路由开启（如登录、预约、可用时段等）。

- 健康检查：
  - `/api/healthz`：`src/app/api/healthz/route.ts:1` 检查 DB、缓存（Redis 或内存）、邮件连接（可开关），统一返回。

- 工具链与代码质量：
  - TypeScript 严格模式：`tsconfig.json:9` 已开启 `"strict": true`。
  - Lint/Prettier：`eslint.config.mjs`、`.prettierrc`，并通过 Husky pre-commit 执行（`.husky/pre-commit`）。

---

## 构建门禁系统（CI/CD）

- 目标：
  - PR 只跑检查（类型/构建/测试），不部署（vercel会发生一个Skipped Deployment的邮件）
  - develop → Staging（Preview），并自动迁移 Staging DB （其他分支合入develop后会自动部署到vercel Preview 环境）
  - main → Production，生产迁移需手动触发（workflow_dispatch）（设置了管理员同意后才会执行后续的action，部署到 vercel Production 环境）

- 检查门禁：
  - `ci.yml` 中 `checks` 任务在 PR 与 `main/develop` 推送时运行类型检查/ESLint/测试（`.github/workflows/ci.yml:1`）。

- 触发矩阵：
  - PR（任意 → develop/main）：跑 CI 检查（无部署）
  - Push 到 develop：迁移 Staging DB → 部署到 Preview（Staging）→ 输出预览 URL
  - 发布到 Production：合并 develop → main → 手动点“Release to Production”工作流迁移生产 DB → Vercel 监听 main 自动构建生产

- 工作流细节：
  - Staging 迁移与部署：`migrate-staging`（`DATABASE_URL=NEON_STAGING_URL`）→ `deploy-staging` 使用 `amondnet/vercel-action` 部署并回写环境 URL（`.github/workflows/ci.yml`）。
  - 生产发布：`release-prod.yml` 手动/推送触发，先 `db:migrate:deploy`（`DATABASE_URL=NEON_PROD_URL`）后 `--prod` 部署（`.github/workflows/release-prod.yml`）。

- Vercel 门禁（仅放行 main/develop）：
  - `vercel.json` 的 `ignoreCommand` 推荐：
    ```bash
    if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "develop" ]; then
      # 放行（不忽略）→ 退出码 1 表示不要跳过构建
      exit 1
    else
      echo "Skip build for branch $VERCEL_GIT_COMMIT_REF"
      exit 0
    fi
    ```
    当前仓库为“统一跳过”占位（`vercel.json:1`）；如需在 Vercel 直接控制，替换为上述脚本。

- 平台配置要点：（已设置）
  - Vercel：
    - 生产分支设为 `main`；按环境配置变量（Preview=Staging，Production=Prod）。
    - 可在项目 Settings → Git 关闭 PR/分支 Preview 部署（双保险）。
  - GitHub 保护分支：保护 `main`、`develop`，要求 PR、对话解决、状态检查通过（选择 `checks` 任务），禁止强推/删除。
  - GitHub Secrets（Actions）：`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEON_STAGING_URL`, `NEON_PROD_URL`。

---

## 数据库迁移策略

- 迁移的目的：将 `prisma/schema.prisma` 生成的迁移版本，可靠地、可追踪地应用到各环境数据库。
- 一致性保障：Preview/Staging 与 Production 虽使用不同数据库，也需要应用同一批迁移，保持“表结构/索引/约束”的一致性。
- 流程定位：
  - develop 上先对 Staging 执行 `prisma migrate deploy`（工作流自动执行），验证无误
  - 合并 main 后，手动执行 “Release to Production” 迁移生产 DB，随后 Vercel 自动构建生产
- 版本化与回滚：Prisma 的 `_prisma_migrations` 记录已应用版本，支持审计与回滚策略；避免 `db push` 造成环境漂移。

---

## 可观测性（监控/日志/指标）

- Sentry：
  - Server 端：`src/sentry.server.config.ts:1`；Client 端：`src/sentry.client.config.ts:1`；环境识别：`src/lib/monitoring/environment.ts:1`。
  - 路由封装：`withSentryRoute`（`src/lib/monitoring/sentry.ts:15`）为 API 处理器创建 trace/span，并在异常时上报。
  - 业务指标：`Sentry.metrics.increment` 封装 `metricsIncrement()`（如预约创建/状态变更处均有计数）。
  - 关键环境变量：
    - `NEXT_PUBLIC_SENTRY_DSN`（前端 DSN），`SENTRY_DSN`（服务端 DSN）
    - `SENTRY_TRACES_SAMPLE_RATE`、`SENTRY_PROFILES_SAMPLE_RATE`（采样率）
    - 可选 `SENTRY_ENVIRONMENT`；否则根据 `VERCEL_ENV`/`NODE_ENV` 自动推断

- 结构化日志：
  - `src/lib/logger.ts:1` 输出 JSON 行，包含 `ts`、`service`、`level`、`msg`、`requestId` 等，便于收集与聚合。
  - `src/middleware.ts:22` 注入 `x-request-id`（请求头传入或生成），并回写到响应，贯穿链路。

- 健康检查与系统面板：
  - `GET /api/healthz`（`src/app/api/healthz/route.ts`）综合 DB/缓存/邮件检查，输出耗时与各子检查状态。
  - 管理端面板聚合了 DB/Cache/Queue 状态（`src/app/admin/page.tsx`、`src/app/api/admin/dashboard/route.ts`）。

---

## 安全性与稳定性

- 权限与认证：
  - JWT：`src/lib/api/jwt.ts`（签发/校验），`withAuth/withRole(s)` 进行角色鉴权（`src/lib/api/middleware.ts:1`）。
  - 路由按最小权限暴露，如预约变更仅学生/教师可操作（`src/app/api/appointments/[id]/route.ts:182` 导出末尾）。

- 速率限制：
  - `withRateLimit()` 在生产生效，默认 1 分钟 60 次；路由可自定义窗口与阈值（搜索 `withRateLimit({`）。

- CORS 白名单与安全头：
  - 白名单：`ALLOWED_ORIGINS`、`NEXT_PUBLIC_APP_URL`；统一在 `src/middleware.ts` 控制。
  - 安全响应头：`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`HSTS` 等已默认添加。

- 作业与计划任务安全：
  - 授权：`authorizeJobRequest()`（Secret + 可选 HMAC + 生产附加约束）。
  - Vercel Cron：`vercel.json:14` 已配置 `/api/jobs/reset-quota`、`/api/jobs/expire-pending` 等计划任务。

---

## 性能优化（后续执行）

- 查询优化：
  - 预约列表采用 `take + cursor` 简化分页，减少大偏移（`src/app/api/appointments/route.ts:82` 起）。
  - 事务中仅读取必要字段，避免过度包含关系；常用字段已加唯一/联合唯一保证过滤效率（`schema.prisma`）。

- 缓存：
  - 内存/Redis 双通道：`src/lib/api/cache.ts`（失败回退内存缓存）；提供 `deleteCachePattern()` 用于变更后批量失效，避免脏读。
  - 热点数据（如 `slots`）路由已使用缓存并在预约变更时主动失效。

- Serverless 运行参数：
  - `vercel.json` 原地设置 `functions.app/api/**/*.ts.maxDuration = 30` 与 `regions: ["hkg1"]`，降低冷启动与跨区时延。

- 并发与批处理：
  - Job 任务使用分页 + 并发窗口（如 10）进行邮件/审计处理，避免一次性拉满。

---

## 安全发布策略（灰度与回滚）（搭建中）

- 灰度发布：
  - 预发验证：develop 推送自动部署到 Preview（Staging）并自动迁移 DB，在 Staging 验证通过后再合并 main（已完成）。
  - 功能开关：为高风险改动引入 Feature Flag（环境变量或配置表），按用户/比例灰度开启。（搭建中）
  - 渐进放量（域名级）：可使用独立“金丝雀”域名绑定 Preview 部署，灰度人群访问 Preview 域名；监控稳定后再 Promote。（设计中）

- 一键回滚：
  - Vercel 控制台可将任一历史部署 “Promote to Production” 实现秒级回滚；也可回滚 `main` 到上一个稳定 commit 重新触发生产部署。
  - 数据库回滚：基于 Prisma migrations 历史执行 `prisma migrate resolve`/手动执行 down 脚本（需提前演练并严格评审）。

---

## 环境变量清单（关键项）

- 应用配置：
  - `NEXT_PUBLIC_APP_URL`：前端 URL（参与 CORS 与链接拼接）
  - `ALLOWED_ORIGINS`：额外 CORS 白名单，逗号分隔

- 数据库：
  - `DATABASE_URL`（各环境独立配置；GitHub Secrets：`NEON_STAGING_URL`/`NEON_PROD_URL`）

- JWT：
  - `JWT_SECRET`、`JWT_REFRESH_SECRET`（建议 >=16 字符，生产必须设置）

- 缓存：
  - `REDIS_URL`（可选；不配置则使用内存缓存）

- 任务/鉴权：
  - `JOB_TRIGGER_SECRET`、`JOB_REQUIRE_HMAC`、`JOB_HMAC_WINDOW_SECONDS`、`JOB_ALLOWED_IPS`、`JOB_SCHEDULER_HEADER_NAME`、`JOB_SCHEDULER_HEADER_VALUE`

- Sentry：
  - `NEXT_PUBLIC_SENTRY_DSN`（前端）、`SENTRY_DSN`（服务端）、`SENTRY_TRACES_SAMPLE_RATE`、`SENTRY_PROFILES_SAMPLE_RATE`、可选 `SENTRY_ENVIRONMENT`

- Vercel/GitHub（Actions Secrets）：
  - `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`

---

## 日常协作流程

1) 从 `develop` 切 `feature_*` 或  `fix_*` 开发 → 提 PR → 通过 CI “checks” 后合并至 `develop`

2) 合并到 `develop` → 自动迁移 Staging DB + 部署 Preview（输出 URL）→ 在 Staging 验证功能、观测指标/错误

3) 验证通过 → 提 PR `develop → main` → 合并后在 Actions 手点 “Release to Production” 迁移生产 DB → Vercel 自动生产构建

---