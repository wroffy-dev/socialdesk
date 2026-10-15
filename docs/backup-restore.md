# Backups and restore

## What to back up

| Data | Where | How |
|---|---|---|
| Database (users, workspaces, posts, schedules, encrypted tokens) | `postgres` volume | Automatic daily `pg_dump` by the `backup` service → `backups` volume |
| Uploaded media | `storage` volume | Snapshot the volume (see below) |
| Secrets | Coolify environment | Keep a copy of `.env` values in a password manager. **`TOKEN_ENCRYPTION_KEY` is required to read stored channel tokens**; `AUTH_SECRET` and `MEDIA_SIGNING_SECRET` can be rotated (users sign in again / signed URLs expire). |

Redis does not need backups: PostgreSQL is the source of truth and the worker's reconciler re-queues every due post after Redis is reset.

## Automatic database backups

The `backup` service writes `socialdesk-YYYYMMDD-HHMMSS.dump` (custom format) every 24 hours and deletes dumps older than `BACKUP_RETENTION_DAYS` (default 14).

```bash
docker compose exec backup ls -lh /backups          # list
docker compose cp backup:/backups ./backups-copy    # copy off the server
```

Copy dumps off the server regularly (e.g. a nightly `rclone` to Cloudflare R2 / Backblaze B2, or Coolify's S3 backup feature for the Postgres resource). A backup that lives only on the same disk is not a backup.

Manual backup at any time:

```bash
docker compose exec backup sh -c 'pg_dump --format=custom --no-owner -f /backups/manual-$(date -u +%Y%m%d-%H%M%S).dump "$DATABASE_URL"'
```

## Media backups

```bash
# Archive the storage volume into the current directory
docker run --rm -v socialdesk_storage:/data -v "$PWD":/out alpine tar czf /out/storage-$(date +%F).tgz -C /data .
```

(The volume name is prefixed with your compose project name; check with `docker volume ls`.)

## Restore

1. Stop the app so nothing writes during the restore:
   `docker compose stop web worker`
2. Restore the database (this **replaces** the current data):
   ```bash
   docker compose cp ./socialdesk-20261015-030000.dump backup:/tmp/restore.dump
   docker compose exec backup sh -c 'pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /tmp/restore.dump'
   ```
3. Restore media if needed:
   ```bash
   docker run --rm -v socialdesk_storage:/data -v "$PWD":/in alpine sh -c 'cd /data && tar xzf /in/storage-2026-10-15.tgz'
   ```
4. Make sure `TOKEN_ENCRYPTION_KEY` is the same as when the backup was taken.
5. Start again: `docker compose up -d web worker`. The worker reconciles on start: posts whose time passed while the app was down are published immediately; posts that were mid-publish are marked *Needs check* rather than published twice.

## Test your restores

At least once before launch and then quarterly: restore the latest dump into a scratch database and run the app against it.

```bash
createdb socialdesk_restore_test
pg_restore --no-owner -d socialdesk_restore_test socialdesk-YYYYMMDD-HHMMSS.dump
DATABASE_URL=postgresql://…/socialdesk_restore_test npx prisma migrate status
```
