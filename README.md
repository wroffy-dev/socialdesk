# SocialDesk

A multi-tenant social media management SaaS: plan, schedule and publish to **Instagram professional accounts** and **Facebook Pages**, with a visual calendar, posting queue, team workspaces, insights, a comments inbox, billing and a super-admin panel.

Built for a single VPS with Coolify: Next.js (web) + a separate worker process, PostgreSQL and Redis.

| | |
|---|---|
| **Web** | Next.js 15 (App Router, React Server Components), TypeScript strict, Tailwind CSS, shadcn-style components on Radix, Lucide icons, React Hook Form + Zod, TanStack Table, Recharts, FullCalendar |
| **Backend** | Next.js Route Handlers → service layer (`src/server/services`), Prisma + PostgreSQL, Auth.js (credentials, revocable JWT sessions), Zod validation |
| **Jobs** | BullMQ + Redis in a separate worker process (`src/worker`), PostgreSQL as the source of truth |
| **Infra** | Docker / Docker Compose / Coolify, local persistent media storage (S3/R2-ready interface), SMTP, Razorpay |

> AI features are intentionally **not** part of this release.

## Quick start (local development)

Requirements: Node 20.18+ (22 recommended), PostgreSQL 14+, Redis 6+.

```bash
cp .env.example .env            # then fill in the values (see comments in the file)
#   openssl rand -base64 48   → AUTH_SECRET, MEDIA_SIGNING_SECRET
#   openssl rand -base64 32   → TOKEN_ENCRYPTION_KEY
npm install
npx prisma migrate dev          # create the schema
npm run db:seed                 # plans, entitlements, legal page placeholders
npm run db:seed:demo            # optional: demo@socialdesk.local / demo-password-1 with mock channels

npm run dev                     # web app on http://localhost:3000
npm run dev:worker              # background worker (separate terminal) — needed for publishing
```

With `META_MODE=mock` (the default in `.env.example`) you can connect simulated channels and publish end to end without a Meta app. Mock channels are labelled everywhere and never contact a real platform. With `MAIL_TRANSPORT=log`, emails (verification, password reset, invitations) are printed and saved to `.data/mail/`.

Make yourself a super admin (there is no API or UI for this, by design):

```bash
npm run admin:grant -- you@example.com
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:worker` | Web app / worker in watch mode |
| `npm run build` / `npm run build:worker` | Production builds (`.next/`, `dist/worker.cjs`) |
| `npm start` / `npm run start:worker` | Run the production builds |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Vitest unit + integration tests (needs PostgreSQL and Redis; uses the `socialdesk_test` database) |
| `npm run test:e2e` | Playwright end-to-end tests (starts the app if it isn't running) |
| `npm run db:migrate` · `npm run db:deploy` | Create a migration (dev) · apply migrations (prod) |
| `npm run db:seed` · `npm run db:seed:demo` | Seed plans/content · demo data (refuses to run in production) |
| `npm run admin:grant -- <email> [--revoke]` | Grant or revoke super-admin access |

## Project layout

```
prisma/                 schema, migrations, seed
src/app/                Next.js routes
  (marketing)/          landing, features, pricing, legal pages
  (auth)/               login, signup, password reset, email verification, invitations
  w/[slug]/             the app for one workspace (home, create, compose, publish, community, insights, media, channels, settings)
  admin/                super-admin panel
  api/                  route handlers (thin: auth → validate → service)
src/server/             server-only code
  auth/                 sessions, workspace context, permission checks
  services/             business logic, every query scoped to a workspace
  adapters/             social platform adapters (Meta Graph API, mock)
  publishing/           publisher, reconciler, status rules
  queue/                BullMQ producer
  billing/              plan catalogue, Razorpay client
src/worker/             background worker entry point and maintenance tasks
src/components/         UI (ui/ = design system primitives)
src/lib/                client-safe shared code (permissions, platform rules, time zones)
tests/                  Vitest integration tests
e2e/                    Playwright tests
docs/                   deployment, Meta setup, backups, architecture, status
```

## Documentation

- [docs/deployment.md](docs/deployment.md) — deploying on a VPS with Coolify (or plain Docker Compose)
- [docs/meta-setup.md](docs/meta-setup.md) — creating the Meta app, permissions, App Review
- [docs/backup-restore.md](docs/backup-restore.md) — automated backups and restoring them
- [docs/architecture.md](docs/architecture.md) — tenancy, security model, publishing pipeline
- [docs/STATUS.md](docs/STATUS.md) — what is done, what still needs credentials or approval, known limitations
