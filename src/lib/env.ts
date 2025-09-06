import { z } from 'zod'

// Define shape for all environment variables we care about
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // App base URLs for CORS/links
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated

  // Database
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL' }),

  // JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  ACCESS_TOKEN_TTL_MIN: z.string().regex(/^\d+$/).optional(),

  // Jobs
  JOB_TRIGGER_SECRET: z.string().min(10, 'JOB_TRIGGER_SECRET must be set in production').optional(),
  JOB_REQUIRE_HMAC: z.string().optional(),
  JOB_HMAC_WINDOW_SECONDS: z.string().optional(),
  JOB_ALLOWED_IPS: z.string().optional(),
  JOB_SCHEDULER_HEADER_NAME: z.string().optional(),
  JOB_SCHEDULER_HEADER_VALUE: z.string().optional(),
  JOB_EXPIRE_HOURS: z.string().optional(),

  // Cache
  REDIS_URL: z.string().url().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Health checks
  HEALTHZ_CHECK_EMAIL: z.string().optional(), // 'true' to verify SMTP
  DEBUG_AVAILABILITY_LOGS: z.string().optional(), // 'true' to enable verbose availability logs
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Fail fast with clear message in non-dev
  const isProd = process.env.NODE_ENV === 'production'
  const issues = parsed.error.flatten().fieldErrors
  const missing = Object.entries(issues)
    .map(([k, v]) => `${k}: ${v?.join(', ')}`)
    .join('; ')
  const msg = `Environment validation failed: ${missing}`
  if (isProd) {
    throw new Error(msg)
  } else {
    console.warn(msg)
  }
}

export const env = {
  ...parsed.data!,
  // sensible fallbacks for dev only
  JWT_SECRET: parsed.data?.JWT_SECRET || 'dev-jwt-secret-please-change-1234',
  JWT_REFRESH_SECRET: parsed.data?.JWT_REFRESH_SECRET || 'dev-refresh-secret-please-change-1234',
}

export function allowedOrigins(): string[] {
  const list =
    env.ALLOWED_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) || []
  if (env.NEXT_PUBLIC_APP_URL) list.push(env.NEXT_PUBLIC_APP_URL)
  // de-duplicate
  return Array.from(new Set(list))
}
