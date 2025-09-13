# edu-scheduler 生产落地设计方案（对齐当前实现）

本文档基于当前仓库实现与已有文档（如 `monitor.md`、`SENTRY_ENV_FIX.md`、CI 工作流与 `vercel.json`）进行梳理，给出从 MVP 加固到安全发布的落地方案与操作要点。所有建议均尽量指向现有代码与配置，保证可操作与可追踪。

## 总览

- 目标环境：开发 → 预发（Staging/Preview） → 生产（Production） （已完成）
- 平台：GitHub Actions + Vercel（Serverless + Cron）+ Neon（Postgres）+ 可选 Redis （已完成）
- 可观测性：Sentry（错误、性能、业务指标）、结构化日志、健康检查 （已完成）
- 安全与稳定：输入校验、统一响应、权限与速率限制、CORS 白名单与安全响应头、作业授权、DB 迁移、备份
- 安全发布：门禁（仅 main/develop 部署）、PR 检查、生产手动迁移、灰度策略与快速回滚

---

## MVP 加固

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

---

## 构建门禁系统（CI/CD）

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

---

## 数据库迁移策略

- 迁移目的：将 `prisma/schema.prisma` 生成的迁移版本可靠地应用至各环境（已完成）
- 一致性保障：Preview/Staging 与 Production 保持同一批迁移版本（已完成）
- 流程定位：develop 先迁移 Staging；main 合并后通过工作流迁移生产（已完成）

---

## 可观测性（监控/日志/指标）

- Sentry：服务端/客户端配置、`withSentryRoute` 封装、业务 `metrics.increment`（已完成）
- 结构化日志：`src/lib/logger.ts`（包含 `requestId` 等关键字段）（已完成）
- 健康检查与系统面板：`/api/healthz`、管理端 Dashboard（已完成）

---

## 安全性与稳定性

- 权限与认证：`withAuth/withRole(s)` + JWT，最小权限暴露（已完成）
- 速率限制：生产生效的 `withRateLimit()`（已完成）
- CORS 白名单与安全响应头：`src/middleware.ts`（已完成）
- 作业与计划任务安全：`authorizeJobRequest()` + `vercel.json` Cron（已完成）
- 漏洞扫描与依赖安全：CI 增加 CodeQL/`pnpm audit`（未落地）
- 数据备份：Neon PITR/自动备份与恢复演练（未落地）

---

## 性能优化（现状与建议）

- 查询优化：预约列表 `take + cursor`，避免大偏移（已完成）
- 缓存：内存/Redis 双通道 + 模式失效（已完成）
- Serverless 参数：`functions.maxDuration`、`regions` 指定（已完成）
- 并发与批处理：Job 分页 + 并发窗口控制（已完成）

---

## 安全发布策略（灰度与回滚）

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

## 日常协作流程（建议）

1. 从 `develop` 切 `feature/*` 开发 → 提 PR → 通过 CI “checks” 后合并至 `develop`
2. 合并到 `develop` → 自动迁移 Staging DB + 部署 Preview（输出 URL）→ 在 Staging 验证功能与指标
3. 验证通过 → 提 PR `develop → main` → 合并后在 Actions 运行生产迁移 → Vercel 生产部署
