# Project status

Last updated with the initial implementation (all seven phases).

## Done and verified

| Area | Verified by |
|---|---|
| Signup, login, email verification, password reset, revocable sessions, lockout, rate limits | Vitest, Playwright |
| Workspaces, switching, invitations, roles, seat limits, leave/delete | Vitest, manual UI |
| Projects inside a workspace (one Instagram + one Facebook Page each), plan limits Free 2 / Pro 5 / Business 10 / Agency 20, concurrent-safe limits and slots, project filters in composer/calendar/list/insights | Vitest, Playwright, manual UI |
| Cross-tenant isolation (posts, media, channels, members, invitations, comments, saved replies, calendar, insights) | Vitest (service level) + Playwright (HTTP level) |
| Composer with per-platform versions and validation, drafts with autosave, schedule / queue / publish now | Vitest, Playwright, manual UI |
| Instagram Stories, Reel settings (share to feed, cover frame), collaborators, tagged people; first comment on Instagram and Facebook with retry | Vitest (rules, Graph requests against a fake API, publisher), Playwright, manual UI |
| X, LinkedIn (profiles and pages) and YouTube (videos and Shorts): OAuth (PKCE for X), token refresh, chunked/resumable uploads, first comment / reply, metrics, YouTube comments | Vitest against simulated APIs, Playwright (mock connect), manual UI |
| Best time to post: weekday × hour heatmap from the workspace's own post metrics, top times in the composer, add to queue | Vitest, manual UI |
| Media library: streaming uploads, type sniffing, thumbnails, private serving, signed public URLs, JPEG conversion | Vitest, manual UI |
| Calendar (month/week/day, filters, drag to reschedule, drag drafts to schedule), list with tabs, post details, queue | Manual UI, Vitest for services |
| Publishing engine: single-claim, retries, ambiguous handling, reconciliation after crashes or Redis loss | Vitest (incl. concurrent workers), end-to-end with BullMQ + worker in mock mode |
| Meta adapters (Facebook Pages, Instagram) against a simulated Graph API: photos, carousels, videos/Reels, resume, verification, quota | Vitest with a fake Graph server |
| OAuth flow: state + cookie binding, single use, expiry, user binding, per-project account selection, one account per slot, disconnect | Vitest, Playwright (mock mode) |
| Insights (real data only, nulls shown as unavailable), CSV export with formula-injection protection | Vitest, manual UI |
| Comments inbox: sync, reply via API, notes, assignment, saved replies | Vitest with a fake Graph server |
| Billing: plans/usage UI, Razorpay checkout start, webhook signature + idempotency + plan changes | Vitest (webhooks simulated) |
| Super admin: users, workspaces, plans/limits, failures, integration health, jobs, audit, legal pages | Vitest for services, manual UI |
| Production build, pruned production install running web + worker | Built and run natively (see below) |

Totals at the time of writing: 126 Vitest tests, 8 Playwright tests, typecheck and lint clean.

## Needs credentials, approval or an environment I could not access

These are implemented but **not yet exercised against the real services**:

1. **Real X, LinkedIn and YouTube publishing.** Need each platform's developer app ([channels-setup.md](channels-setup.md)). The adapters follow the documented APIs (X API v2 with v2 media upload, LinkedIn versioned REST Posts/Images/Videos APIs, YouTube Data API v3 resumable uploads) and were tested against simulated APIs only. YouTube also needs a quota increase and Google's API audit before uploads can be public.
1. **Real Meta publishing.** Requires a Meta app (`META_APP_ID`/`META_APP_SECRET`), a public HTTPS `APP_URL` (Meta must download media), and test accounts with app roles. Follow [meta-setup.md](meta-setup.md) and publish a test post in `META_MODE=development`. The adapters follow Meta's documented endpoints and were tested against a simulated Graph API only.
2. **Meta App Review** for `live` mode (business verification, screencasts per permission).
3. **Razorpay.** Create plans in Razorpay, put their ids in *Admin → Plans*, set `BILLING_ENABLED=true` and the three Razorpay variables, and point a webhook at `https://your-domain/api/webhooks/razorpay` (events: `subscription.*`, `payment.*`, `invoice.paid`). Test in Razorpay test mode before going live.
4. **SMTP.** Set `MAIL_TRANSPORT=smtp` and the SMTP variables; send yourself a password reset to confirm delivery.
5. **Docker image build.** The sandbox used for development could not reach Debian package mirrors, so `docker build` was not run here. The same steps (clean install, build without `.env`, production prune, `next start` + worker against PostgreSQL/Redis) were run natively and passed health checks. Run `docker compose up -d --build` once on the VPS (or let Coolify build) before relying on it.

## Known limitations / next steps

- Facebook Stories and Facebook link-preview customisation are not implemented. Instagram Stories cannot carry stickers, links or music through the API.
- Direct messages are not implemented (need extra Meta permissions and review); the inbox says so.
- Queue slots are workspace-wide (the schema allows per-channel slots for a later UI).
- Approval workflows (draft → review → approve) are not in this release.
- The admin "suspend workspace" reason uses a browser prompt; a proper dialog would be nicer.
- Media lives on the server's disk; move to R2/S3 by implementing `StorageDriver` when storage grows.
- Phase 7 items not started: more platforms (Threads, LinkedIn, Bluesky, Pinterest are shown as "coming soon"), advanced/white-label reports. The AI module is intentionally absent.
