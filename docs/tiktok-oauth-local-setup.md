# TikTok OAuth Local Dev Setup

TikTok's Login Kit rejects `localhost` and `127.0.0.1` as redirect URIs.
Use a Cloudflare tunnel to get a public HTTPS URL that forwards to your local server.

## Recommended: use the in-app setup assistant

Open **Omicron → Settings → TikTok OAuth setup assistant**. The UI now turns the
manual flow below into copyable, guided steps:

1. Start the tunnel with the command shown in the UI.
2. Paste the generated `https://...trycloudflare.com` URL into the **Cloudflare tunnel URL** field.
3. Copy the generated **TikTok Login Kit redirect URI** into the TikTok developer console.
4. Copy the generated `.env` line for `TIKTOK_REDIRECT_URI`.
5. Choose a creator and click **Open OAuth** / **Authorize**.

TikTok still requires one console action that cannot be automated locally: add the
redirect URI under **Products → Login Kit**, ensure the scopes are enabled, add the
creator under **Sandbox settings → Target Users**, and click **Apply changes**.

Use the detailed notes below only if you need to debug the local flow manually.

## One-time setup

### 1. Install cloudflared
```bash
brew install cloudflare/cloudflare/cloudflared
```

### 2. Register the redirect URI in TikTok developer console

1. Go to [developers.tiktok.com](https://developers.tiktok.com) → your app → sandbox
2. **Products** → **Login Kit** → **Redirect URI** → add the tunnel URL (see step 4)
3. **Scopes** → confirm `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list` are added
4. **Sandbox settings** → **Target Users** → add the TikTok username you want to authorize
5. Click **Apply changes**

### 3. Add Login Kit product
The sandbox must have **Login Kit** added under Products — not just Share Kit.
Login Kit owns the OAuth redirect URI registration and the `user.info.basic` scope.

---

## Each dev session (tunnel URL changes every run)

### Step 1 — Start the tunnel
```bash
cloudflared tunnel --url http://localhost:8000
```

Note the public URL printed in the output, e.g.:
```
https://kenneth-andrews-containers-tribune.trycloudflare.com
```

### Step 2 — Update .env
```bash
# .env
TIKTOK_REDIRECT_URI=https://<your-tunnel-url>/auth/tiktok/callback
```

### Step 3 — Update TikTok redirect URI
In the sandbox console, replace the old redirect URI with:
```
https://<your-tunnel-url>/auth/tiktok/callback
```
Click **Apply changes**.

### Step 4 — Start the server (new terminal)
```bash
make serve
```

### Step 5 — Authorize the creator
Open in browser:
```
https://<your-tunnel-url>/auth/tiktok/authorize?creator_id=elpanthio
```

TikTok shows the consent screen → approve → success page:
```
✅ @elpanthio authorized
open_id: ...
scope: video.list,user.info.basic,...
expires_at: ...
```

The token is stored in Postgres (`oauth_tokens` table). The server can now call
`TikTokStatsClient.fetch_post_stats("elpanthio", "VIDEO_ID")` with real data.

---

## After authorization — start a monitoring workflow

```bash
curl -X POST http://localhost:8000/v1/workflows/pubiq \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"creator_id": "elpanthio", "post_id": "TIKTOK_VIDEO_ID", "platform": "tiktok"}'
```

The DBOS workflow wakes at T+30, T+60, T+90 min, fetches live stats, computes
z-scores vs `@elpanthio`'s rolling baseline, and fires alerts if thresholds are exceeded.

---

## Token lifecycle

| Token | Duration |
|---|---|
| `access_token` | 24 hours |
| `refresh_token` | 365 days |

The token is stored in the `oauth_tokens` Postgres table. Re-run the auth flow
(steps 1–5) when the access token expires, or implement auto-refresh via
`refresh_access_token()` in `platform/tiktok.py`.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `code_challenge` error | PKCE missing from auth URL | Already fixed — code generates S256 challenge |
| `redirect_uri` error | URI not registered or localhost | Use tunnel URL, register it in TikTok console |
| "app parameters" error | Login Kit product not added | Add Login Kit under Products in sandbox |
| "account not authorized" | Creator not in sandbox target users | Add username under Sandbox settings → Target Users |
| `Unknown or expired state` | State param expired (>5 min) | Re-run the authorize URL |
