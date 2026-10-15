# X, LinkedIn and YouTube setup

Instagram and Facebook use one Meta app ([meta-setup.md](meta-setup.md)). X, LinkedIn and YouTube each need their own developer app. A platform appears as connectable once its two credentials are set; until then its slot on *Projects & channels* says "not set up on this server yet". With `META_MODE=mock`, all five platforms connect as simulated channels (local development only).

Every provider redirects back to `${APP_URL}/api/oauth/<provider>/callback`. Register these exact URLs (HTTPS in production):

| Platform | Redirect URI |
|---|---|
| X | `https://your-domain/api/oauth/x/callback` |
| LinkedIn | `https://your-domain/api/oauth/linkedin/callback` |
| YouTube (Google) | `https://your-domain/api/oauth/google/callback` |

Tokens are stored encrypted (`TOKEN_ENCRYPTION_KEY`). X and Google access tokens last 1–2 hours; SocialDesk refreshes them automatically before each publish or sync (one refresh at a time per channel, because X rotates refresh tokens). If a refresh is refused, the channel is marked *Reconnect needed*.

## X (Twitter)

1. <https://developer.x.com> → create a Project and an App.
2. *User authentication settings* → **OAuth 2.0**, type **Web App (confidential client)**, permissions **Read and write**, callback URL as above, website URL your `APP_URL`.
3. Copy the OAuth 2.0 **Client ID** and **Client Secret** → `X_CLIENT_ID`, `X_CLIENT_SECRET`.

Scopes requested: `tweet.read tweet.write users.read media.write offline.access` (PKCE is used).

Notes:
- Your X API plan limits how many posts the app can create per month; the Free tier allows a small number of posts and almost no reads. Reading the timeline (used to double-check an uncertain publish) and post metrics need a paid tier; without it those show as unavailable and uncertain publishes wait for a person to check.
- Posts: up to 280 characters as X counts them (links count 23), up to 4 images, or one GIF or one video (≤ 140 s). The link field is appended to the text.
- "First comment" on X is posted as a reply to your post.
- Reading replies in the Community inbox is not supported.

## LinkedIn

1. <https://www.linkedin.com/developers/apps> → **Create app** (it must be linked to a LinkedIn company page you administer).
2. *Products* → add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (personal profiles).
3. For company pages, also request **Community Management API** (LinkedIn reviews this) and set `LINKEDIN_PAGES=true` once approved. Without approval, leave it `false` — requesting unapproved scopes makes sign-in fail.
4. *Auth* → add the redirect URL; copy the **Client ID** and **Client Secret** → `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
5. `LINKEDIN_API_VERSION` is the monthly API version (`YYYYMM`). LinkedIn supports each version for about a year — update it at least yearly.

Scopes: `openid profile w_member_social`, plus `w_organization_social r_organization_social rw_organization_admin` with `LINKEDIN_PAGES=true`.

Notes:
- When connecting, the person picks their profile or one of the pages they administer (one per project).
- LinkedIn access tokens last 60 days. Refresh tokens are only issued to some apps; otherwise people reconnect when the channel shows *Reconnect needed*.
- Post analytics (likes, comments) are available for pages (`r_organization_social`), not for personal profiles.
- Text is sent in LinkedIn's "little text" format: special characters are escaped and `#hashtags` become LinkedIn hashtags.

## YouTube (Google)

1. <https://console.cloud.google.com> → create a project → *APIs & Services* → enable **YouTube Data API v3**.
2. *OAuth consent screen*: External, add your domain, privacy policy and terms URLs; add the scopes below. While in **Testing**, add the Google accounts that may connect as test users.
3. *Credentials* → **OAuth client ID** → Web application → add the redirect URI → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. Apply for **verification** of the consent screen (the YouTube scopes are sensitive) before opening it to everyone.

Scopes: `youtube.upload`, `youtube.readonly` (statistics), `youtube.force-ssl` (comments and first comment).

Notes:
- **Quota**: the default is 10,000 units per day per Google project, and each upload costs about 1,600 — roughly 6 uploads a day across all your users. Request more quota from Google before launch. When the quota runs out, uploads are retried automatically a few hours later.
- **Unverified API projects**: Google makes videos uploaded through apps that haven't passed its API compliance audit private. Complete the audit (YouTube API Services → "Audit and quota extension" form) to publish public videos.
- Uploads are resumable: an interrupted upload continues where it stopped, and an uncertain upload is checked against the upload session, so a video is never uploaded twice.
- A vertical or square video up to 3 minutes is published as a **Short**.
- Title (defaults to the caption's first line), visibility, the required "made for kids" answer and tags are set per post in the composer.
