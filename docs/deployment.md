# Deployment (VPS + Coolify)

The stack is one Docker image used by three services, plus PostgreSQL, Redis and a backup job:

| Service | Command | Public? | Notes |
|---|---|---|---|
| `web` | `npm run start` | **Yes** (give it your domain) | Next.js on port 3000. Health: `GET /api/health` |
| `worker` | `node dist/worker.cjs` | No | Publishing, retries, reconciliation, analytics/comment sync. Health: `:3001/healthz` |
| `migrate` | `prisma migrate deploy && seed` | No | Runs once per deploy, then exits. `web`/`worker` start only if it succeeds |
| `postgres` | postgres:16 | No | Volume `postgres` |
| `redis` | redis:7 (AOF, `noeviction`) | No | Volume `redis`, password protected |
| `backup` | `scripts/backup/run.sh` | No | Daily `pg_dump`, 14-day retention, volume `backups` |

Media uploads live on the `storage` volume (mounted at `/data/storage` in `web` and `worker`).

## Minimum server

2 vCPU / 2 GB RAM handles a small beta comfortably (web ≈ 300–500 MB, worker ≈ 150–250 MB, Postgres ≈ 200 MB, Redis < 50 MB). The compose file sets `mem_limit` for web (768 MB) and worker (512 MB); adjust to your server. If memory is tight, keep `WORKER_CONCURRENCY=1` or `2` rather than adding services.

## Deploy with Coolify

1. **Create a resource** → *Docker Compose* → point it at this repository and branch. Coolify reads `docker-compose.yml`.
2. **Environment variables** (Coolify → your resource → *Environment Variables*). Required:

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://app.yourdomain.com` (no trailing slash) |
   | `POSTGRES_PASSWORD` | long random string |
   | `REDIS_PASSWORD` | long random string |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `AUTH_TRUST_HOST` | `true` |
   | `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — **back this up**; losing it means reconnecting every channel |
   | `MEDIA_SIGNING_SECRET` | `openssl rand -base64 48` |
   | `MAIL_TRANSPORT` | `smtp` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM` | from your email provider |
   | `META_MODE` | `development` until App Review is approved, then `live` |
   | `META_APP_ID`, `META_APP_SECRET` | from the Meta app (see [meta-setup.md](meta-setup.md)) |

   Optional: X, LinkedIn and YouTube credentials (`X_CLIENT_ID`/`X_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`/`LINKEDIN_API_VERSION`/`LINKEDIN_PAGES`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; see [channels-setup.md](channels-setup.md)), `META_GRAPH_VERSION` (default `v23.0`), `MAX_IMAGE_MB`, `MAX_VIDEO_MB`, `WORKER_CONCURRENCY`, `PUBLISH_MAX_ATTEMPTS`, `SIGNUPS_ENABLED`, `BACKUP_RETENTION_DAYS`, and the Razorpay variables when billing is enabled.

   The app validates every variable at startup and refuses to start with a message naming the bad one. `META_MODE=mock` is refused in production.

3. **Domain**: assign your domain to the `web` service only (port 3000). Coolify's proxy (Traefik/Caddy) terminates HTTPS. Do not expose `postgres`, `redis` or `worker`.
4. **Deploy.** Watch the `migrate` container finish, then `web` and `worker` become healthy.
5. **First admin**: open a terminal on the `web` container in Coolify and run
   `npx tsx scripts/grant-super-admin.ts you@example.com` after signing up.
6. Visit `/admin` → *Background jobs* to confirm a healthy worker heartbeat, and `/api/health`.

### Updating

Push to the branch and redeploy in Coolify. `migrate` applies new migrations before the new `web`/`worker` start. The worker has a 90 s stop grace period so in-flight publishes finish; anything interrupted is recovered by the reconciler (see [architecture.md](architecture.md)).

Never edit the production schema by hand — add a Prisma migration (`npm run db:migrate -- --name <change>`) and deploy it.

## Plain Docker Compose (without Coolify)

```bash
cp .env.example .env    # fill in values as above, plus POSTGRES_PASSWORD and REDIS_PASSWORD
docker compose up -d --build
docker compose logs -f web worker
```

Put a reverse proxy with HTTPS (Caddy, nginx, Traefik) in front of `web:3000`. The compose file publishes port 3000 on a random host port; map it explicitly (`"127.0.0.1:3000:3000"`) if your proxy runs on the host.

## Monitoring

- `GET /api/health` → `{ ok, checks: { database, redis, worker } }`. Only a database failure makes it return 503 (the web app keeps serving without Redis or the worker), so alert on `checks.worker` and `checks.redis` separately.
- Super admin → *Overview*, *Publishing failures*, *Integration health*, *Background jobs* (queue counts, worker heartbeats, failed jobs with stack traces).
- Logs: both processes log to stdout (the worker as JSON lines), which Coolify collects.
- Disk: media and backups grow over time. Check `docker system df -v` and the `storage`/`backups` volume sizes; lower `BACKUP_RETENTION_DAYS` or move media to object storage when needed.
- Users with failure notifications enabled get an email when a post fails or needs verification.

## Scaling notes

- Run more worker replicas only if publishing volume requires it; the database claim guarantees each post version is published once, and a per-channel Redis lock serialises publishes to the same account.
- Media can move to Cloudflare R2/S3 by implementing `StorageDriver` in `src/server/storage/index.ts`; nothing else reads files directly.
