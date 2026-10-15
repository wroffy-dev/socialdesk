# Meta app setup (Instagram + Facebook Pages)

SocialDesk uses only Meta's official Graph API. One Meta app covers both Facebook Pages and Instagram professional accounts (connected through Facebook Login).

## 1. Create the app

1. Go to <https://developers.facebook.com/apps> → **Create app** → use case **Other** → type **Business**.
2. Add the products **Facebook Login for Business** and **Instagram** (Instagram API with Facebook Login).
3. *App settings → Basic*: note the **App ID** and **App secret** → `META_APP_ID`, `META_APP_SECRET`. Fill in privacy policy URL (`https://your-domain/legal/privacy`), terms URL (`/legal/terms`), app icon and category.
4. *Facebook Login → Settings*:
   - **Valid OAuth Redirect URIs**: `https://your-domain/api/oauth/meta/callback` (must match `APP_URL`; or set `META_REDIRECT_URI`).
   - Enable *Client OAuth login* and *Web OAuth login*; keep *Enforce HTTPS* on.
5. *App settings → Basic → Data deletion*: **Data deletion callback URL** = `https://your-domain/api/webhooks/meta/data-deletion`.
   *Facebook Login → Settings*: **Deauthorize callback URL** = `https://your-domain/api/webhooks/meta/deauthorize`.

## 2. Permissions requested

| Permission | Used for |
|---|---|
| `pages_show_list`, `business_management` | Listing the Pages the user manages |
| `pages_manage_posts` | Publishing to Facebook Pages |
| `pages_read_engagement`, `read_insights` | Page and post insights |
| `pages_read_user_content` | Reading comments on Page posts |
| `pages_manage_engagement` | Replying to comments, posting the "first comment" |
| `instagram_basic` | Instagram account profile |
| `instagram_content_publish` | Publishing to Instagram |
| `instagram_manage_insights` | Instagram insights |
| `instagram_manage_comments` | Reading and replying to Instagram comments, posting the "first comment" |

If a user declines some permissions, the related features are shown as unavailable on the Channels page; publishing is blocked only if a publishing permission is missing.

## 3. Development vs live

| `META_MODE` | Meta app state | Who can connect |
|---|---|---|
| `mock` | none (local only) | Simulated channels; never contacts Meta. Refused in production. |
| `development` | Development mode | Only people with a role on the app (Admin, Developer, Tester). Add testers under *App roles*. |
| `live` | Live, after App Review | Anyone |

Channels record the mode they were connected under and show it as a badge (Mock / Development / Live), so test connections are never mistaken for production ones.

## 4. Requirements for accounts

- **Instagram**: must be a Professional account (Business or Creator) **linked to a Facebook Page** the user manages. Personal Instagram accounts cannot publish via the API.
- **Facebook**: Pages only (the API does not allow publishing to personal profiles). The user needs a Page role that allows creating content.
- Instagram publishing limit: 100 API-published posts per 24 hours per account (SocialDesk checks the quota before publishing and retries later if reached).
- Media must be reachable by Meta: SocialDesk serves short-lived signed URLs from `APP_URL`, so the app must be publicly reachable over HTTPS. Images are converted to JPEG for Instagram automatically.

## 5. Testing before review

1. Set `META_MODE=development`, deploy, add yourself as an app Admin.
2. Connect your Page / Instagram account from *Projects & channels* → a project's **Connect** button (each project takes one Instagram account and one Facebook Page).
3. Publish a test post with *Publish now* and confirm it appears on the platform and in the post details (with the live link).
4. Check *Insights* after the next analytics sync (every 6 hours) and *Community* (comments sync every 30 minutes, or **Sync now**).

## 6. App Review checklist

For each permission Meta asks for a description and a screencast. Prepare:

- A test user (Meta provides test credentials or use an App role) and a test Page/Instagram account.
- Screencasts showing: sign-in to SocialDesk → Projects & channels → Connect → Facebook Login → selecting the Page/Instagram account → composing a post → publishing → the published post on Facebook/Instagram; reading and replying to a comment in Community; Insights page.
- Business verification of your company (required for advanced access).
- Privacy policy covering what is stored (encrypted tokens, content you create) and deletion (data deletion callback + `/legal/data-deletion`).

After approval switch `META_MODE=live` and redeploy. Existing development-mode channels keep working if their owners have roles; ask others to reconnect.

## Known API limitations

- Instagram: feed photos, carousels, Reels (with "also share to feed" and a cover frame) and **Stories** (one image or video, up to 60 s) are published. Posts and Reels can invite up to 3 **collaborators** (they accept in the Instagram app) and **tag people** (positioned on photos; listed on Reels). Stories can't carry captions, collaborators, tags, link stickers or comments through the API.
- **First comment**: posted right after publishing on Instagram and Facebook. If it fails the post stays published and the comment can be retried from the post page.
- Facebook Stories are not published through this version.
- Direct messages (Instagram/Messenger) need additional permissions and review and are not implemented; the inbox says so instead of simulating them.
- Some insights metrics are deprecated by Meta over time; unavailable values are shown as “—”, never estimated.
