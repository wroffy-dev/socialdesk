# Architecture

## Processes

```
browser ──HTTPS──▶ web (Next.js)  ──▶ PostgreSQL (source of truth)
                     │   ▲                 ▲
                     │   └── /api/media/public/:id (signed URLs fetched by Meta)
                     ▼                     │
                   Redis (BullMQ) ◀──── worker ──▶ Meta Graph API
```

- **web** renders pages (React Server Components by default, client components only for interactive pieces) and serves JSON route handlers under `/api`. Route handlers are thin: authenticate → load the workspace context → validate with Zod → call a service.
- **worker** is a separate Node process. It consumes the `publish` queue, runs maintenance schedules (reconcile every minute, channel health and analytics every 6 h, comments every 30 min, weekly digest, cleanup) and exposes `:3001/healthz`.
- **PostgreSQL** holds everything durable. **Redis** holds queues, rate-limit counters and short-lived locks; losing Redis never loses a scheduled post.

## Tenancy and authorisation

- A **user** can belong to many **workspaces** through `WorkspaceMember` (role: Owner, Admin, Publisher, Analyst). Every tenant-owned table has `workspaceId`.
- A workspace holds **projects** (one per brand or client). Each project links **at most one Instagram account and one Facebook Page**, and an account can be active in only one project of a workspace. Linking happens inside a transaction that row-locks the project, so concurrent connections can't fill a slot twice. Every post belongs to a project and may only use that project's channels. A new workspace starts with one project named after it; the last project can't be deleted, and a project can only be deleted once its channels are disconnected (its posts are deleted with it).
- `src/lib/permissions.ts` is the single permission matrix. The UI uses it only to hide controls; the server enforces it in every service with `assertCan(ctx, permission)`.
- A `WorkspaceCtx` is built only from the signed-in user's membership (`loadCtx`), never from an id the browser supplies alone. Non-members get **404**, so other workspaces' existence isn't revealed.
- Every service query filters by `ctx.workspace.id`; referenced ids (channels, media, tags, posts) are re-checked to belong to the same workspace. Integration tests cover cross-tenant reads, edits, deletes and publishes; Playwright tests repeat the key checks over HTTP.
- Suspended workspaces are read-only: mutating permissions are refused and scheduled posts are cancelled.
- **Super admin** is a database flag set only by `npm run admin:grant`. It is re-read from the database on every request; `/admin` returns 404 to everyone else.

## Authentication and request security

- Auth.js credentials provider with bcrypt (cost 12) password hashes. Sessions are JWTs carrying the user's `sessionVersion`; it is compared with the database on every request, so password changes, resets, suspension and "sign out everywhere" revoke sessions immediately.
- Login is rate-limited per IP and per email and locks an account for 15 minutes after 8 failed attempts. Signup, password reset, verification, uploads, invites and other sensitive endpoints are rate-limited (Redis, with in-memory fallback).
- Email verification and password reset use single-use tokens stored as SHA-256 hashes; verification happens by POST from the page so link scanners can't consume tokens.
- Mutating API requests must come from the app's own origin (CSRF defence on top of SameSite=Lax cookies). Security headers (HSTS, frame denial, nosniff, referrer policy) are set globally.
- Social access tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and never sent to the browser. Graph API calls include `appsecret_proof`.
- Uploads are streamed to disk with a size cap, typed by magic bytes (not the filename or browser MIME type), images are decoded with sharp and videos probed, and files are stored under generated names. Private files are served only to workspace members; platforms fetch media through HMAC-signed URLs that expire.
- Sensitive actions are written to `AuditLog`, visible per workspace and globally to super admins.

## Content model

- `SocialPost` is a campaign (shared caption, shared media, tags, schedule).
- `PlatformPost` is one channel's version. A version either follows the shared content or is **customised** with its own caption/media/link. Each version is validated against its platform's rules (`src/lib/platforms.ts`) on the client for instant feedback and again on the server when scheduling and at publish time.
- The campaign's status is derived from its versions (`publishing/status.ts`), e.g. one published + one failed = *Partly published*.

## Publishing pipeline

```
DRAFT ──schedule/queue/publish now──▶ SCHEDULED ──claim──▶ PUBLISHING ──▶ PUBLISHED
                                         ▲   ▲                  │
                    transient error,     │   │ manual retry     ├──▶ FAILED (permanent / auth / out of attempts)
                    attempts left ───────┘   └──────────────────┤
                                                                └──▶ NEEDS_VERIFICATION (outcome unknown)
```

1. Scheduling validates every version, checks the monthly quota, saves `scheduledAt` in PostgreSQL inside a transaction, **then** enqueues a delayed BullMQ job (job id = version + time, so a reschedule creates a new job).
2. The worker **claims** a version with one conditional update (`SCHEDULED` and due → `PUBLISHING`). Only one worker can win, so duplicate jobs, retries and multiple workers can't publish twice. Edits, reschedules and cancels lock the version rows (`SELECT … FOR UPDATE`) so they serialise with the claim.
3. A per-channel Redis lock keeps one publish per account at a time (respects platform rate limits).
4. Content is re-validated and media URLs are signed. The adapter saves intermediate state (e.g. the Instagram container id, uploaded Facebook photo ids) before the final call and marks the moment the final, non-idempotent request starts.
5. Outcomes:
   - success → `PUBLISHED`, external id/link stored, usage counted, optional email;
   - **transient** (network before sending, 5xx on non-final calls, rate limits, video still processing) → back to `SCHEDULED` with backoff (1 m, 5 m, 15 m, 45 m, 2 h or the platform's retry-after), up to `PUBLISH_MAX_ATTEMPTS`;
   - **permanent** (validation, policy) → `FAILED`;
   - **auth** (expired/revoked token, missing permission) → `FAILED` and the channel is marked *Reconnect needed*;
   - **ambiguous** (timeout or server error on the final call, or a crash after it started) → `NEEDS_VERIFICATION`. It is never retried blindly.
6. The **reconciler** (every minute and at worker start) re-enqueues due versions whose job was lost, recovers versions stuck in `PUBLISHING` after a crash (back to `SCHEDULED` if the final call never started, otherwise `NEEDS_VERIFICATION`), and asks the platform whether ambiguous publishes went live (Instagram: container status; Facebook: recent Page posts). Confirmed-not-live versions are retried; confirmed-live ones are marked published. Anything still unknown waits for a person to resolve it from the post page.

## Adapters

Five platforms: Instagram and Facebook (Meta Graph API), X (API v2), LinkedIn (versioned REST API) and YouTube (Data API v3). `src/server/adapters/types.ts` defines `SocialAdapter`: capabilities (computed from granted permissions), publish, verify, health check, account/post metrics, comments and replies. Unsupported operations raise an explicit error. `adapterFor()` picks the Meta adapters or the mock adapter; channels connected in mock mode always use the mock, so they can never reach a real platform. Adding a platform means a new adapter, an OAuth provider in `src/server/integrations/` and entries in `src/lib/platforms.ts`.

X, LinkedIn and YouTube receive media as bytes (chunked or resumable uploads, read from storage in pieces); Meta fetches signed URLs. Access tokens for X and Google are short-lived: `integrations/tokens.ts` refreshes an expiring token under a row lock before any API call, so concurrent jobs refresh it once (X rotates refresh tokens); a refused refresh marks the channel *Reconnect needed* and fails the publish as an auth error. OAuth is generic per provider (`/api/oauth/{meta,x,google,linkedin}/callback`); X uses PKCE with the verifier stored encrypted next to the hashed state.

## Best time to post

`services/best-time.ts` places each published post that has synced metrics (last 6 months) into its weekday × hour in the workspace timezone. Engagement (likes + comments + shares + saves) is divided by the channel's median post, so channels of different size combine fairly; a slot's score is the average. Recommendations appear only with at least 6 posts and only for slots with at least 2 posts — otherwise the UI says there isn't enough data. Nothing is estimated or taken from industry averages.

## Plans and limits

Plans and entitlements live in the database (seeded from `src/server/billing/catalog.ts`, then edited in the admin panel). Limits are enforced server-side: projects (Free 2, Pro 5, Business 10, Agency 20 by default — channels follow from projects, one Instagram + one Facebook each), team seats (members + pending invitations), owned workspaces, posts per month (published + scheduled in that month), analytics history and CSV export. Paid plans change only when a signature-verified, de-duplicated Razorpay webhook says so; the browser checkout callback is only a hint.
