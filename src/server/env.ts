import 'server-only';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
    MEDIA_SIGNING_SECRET: z.string().min(32, 'MEDIA_SIGNING_SECRET must be at least 32 characters'),

    STORAGE_DRIVER: z.enum(['local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    MAX_IMAGE_MB: z.coerce.number().positive().default(8),
    MAX_VIDEO_MB: z.coerce.number().positive().default(200),

    MAIL_TRANSPORT: z.enum(['smtp', 'log']).default('log'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: bool,
    MAIL_FROM: z.string().default('SocialDesk <no-reply@localhost>'),

    /** mock = in-process fake adapter; development/live = real Meta Graph API. */
    META_MODE: z.enum(['mock', 'development', 'live']).default('mock'),
    META_APP_ID: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    META_GRAPH_VERSION: z.string().default('v23.0'),
    META_REDIRECT_URI: z.string().url().optional(),

    /** X (Twitter) OAuth 2.0 app. Optional: X is offered once these are set (or in mock mode). */
    X_CLIENT_ID: z.string().optional(),
    X_CLIENT_SECRET: z.string().optional(),
    /** Google OAuth client with the YouTube Data API v3 enabled. */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** LinkedIn app with "Share on LinkedIn" (+ "Community Management API" for pages). */
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    /** Monthly API version (YYYYMM). LinkedIn supports each version for about a year. */
    LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/).default('202608'),
    /** Request organization (page) permissions; needs the Community Management API product. */
    LINKEDIN_PAGES: bool,

    BILLING_ENABLED: bool,
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    PUBLISH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
    SIGNUPS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required when MAIL_TRANSPORT=smtp' });
    }
    if (env.META_MODE !== 'mock') {
      for (const key of ['META_APP_ID', 'META_APP_SECRET'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when META_MODE=${env.META_MODE}` });
      }
    }
    if (env.META_MODE === 'mock' && env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_IN_PRODUCTION !== 'true') {
      ctx.addIssue({ code: 'custom', path: ['META_MODE'], message: 'META_MODE=mock is not allowed in production' });
    }
    if (env.BILLING_ENABLED) {
      for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when BILLING_ENABLED=true` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Throws a readable error listing every invalid variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change process.env between cases. */
export function resetEnvCache() {
  cached = undefined;
}
