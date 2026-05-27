# Oura Display — Ray-Ban Display glasses webapp

A glanceable, transparent HUD dashboard for your Oura Ring metrics, designed for **Meta Ray-Ban Display glasses**. Shows today's Readiness, Sleep, Activity, and Heart-rate score as four circular tiles with 7-day sparklines. Tap any circle to drill into a detail overlay with the full trend and sub-metrics.

Black pixels render transparent on the additive waveguide display, so the world shows through everywhere except the outlines, numbers, icons, and sparklines.

## What's in this folder

```
index.html      Main glasses app (loads on the glasses)
setup.html      Companion page (open on your phone/desktop to pair)
styles.css      Shared styles for both pages
app.js          Glasses app logic — API calls, sparklines, D-pad nav
setup.js        Setup logic — PAT verification + QR pairing
worker.js       Cloudflare Worker (DO NOT push to GitHub — pasted into Cloudflare)
PRIVACY.md      Privacy policy
TERMS.md        Terms of use
README.md       This file
```

## Architecture

```
+-------------------+         +-------------------------+         +------------------+
|  Ray-Ban Display  |         |    GitHub Pages site    |         | Cloudflare       |
|  glasses          | <-----> |  index.html / app.js    | <-----> | Worker proxy     |
|  (loads index.html)         |  setup.html / setup.js  |         | (worker.js)      |
+-------------------+         +-------------------------+         +--------+---------+
                                                                           |
                                                                           v
                                                                 +-------------------+
                                                                 |  Oura API V2      |
                                                                 |  api.ouraring.com |
                                                                 +-------------------+
```

The Worker exists for one reason: Oura's API doesn't send `Access-Control-Allow-Origin` headers, so browsers block direct cross-origin calls. The Worker re-issues each request from a server context and adds the CORS headers on the way back. It only proxies a hard-coded whitelist of GET endpoints, so it isn't an open relay.

## How the auth flow works

Glasses have no keyboard, so credentials can't be typed in on the glasses themselves. Instead:

1. On your phone or desktop, open `setup.html` and paste your Oura Personal Access Token (PAT).
2. The setup page calls the verify endpoint through your Worker. If the PAT works, it generates a **pairing URL** like `https://your-app/index.html#token=YOUR_PAT` plus a QR code.
3. You add that URL to your glasses via the Meta AI app.
4. On first load the glasses extract the token from the URL fragment, save it to the glasses' `localStorage`, strip the fragment, and start fetching metrics through the Worker.

PATs don't expire, so you pair once and forget it.

## One-time setup

### 1. Get a Personal Access Token

1. Sign in at https://cloud.ouraring.com/personal-access-tokens (note: NOT the OAuth Applications page — different page, different kind of token).
2. Click **Create New Personal Access Token**, give it a name, and copy the full token from the confirmation screen. Oura only shows it once.

### 2. Deploy the Cloudflare Worker

1. Sign up / sign in at https://dash.cloudflare.com (free).
2. **Workers & Pages** → **Create** → **Create Worker** (not Pages).
3. Choose **"Start with Hello World!"** — name your worker (e.g. `ouraworker`) → **Deploy**.
4. Click **Edit code**. Select all the existing code and delete it. Paste the entire contents of `worker.js`. Click **Save and deploy**.
5. Test it: open `https://<worker-name>.<your-subdomain>.workers.dev/` in a new tab. You should see:
   ```json
   {"ok":true,"message":"Oura CORS proxy. Use /v2/usercollection/* paths."}
   ```
6. Copy that worker URL — you'll need it in the next step.

### 3. Set PROXY_BASE in `app.js` and `setup.js`

Open both files and find the line near the top:

```js
const PROXY_BASE = 'https://YOUR-WORKER.workers.dev';
```

Replace `YOUR-WORKER.workers.dev` with **your actual worker URL** (no trailing slash). Both files must match.

### 4. Push to GitHub Pages

1. Push these files to a public GitHub repo. Do NOT include `worker.js` — that file lives only in Cloudflare.
2. Repo → **Settings** → **Pages** → Source = *Deploy from a branch*, Branch = `main`, Folder = `/ (root)` → **Save**.
3. After ~1 minute the page shows: *Your site is live at* `https://<username>.github.io/<repo>/`.

### 5. Pair your glasses

1. On your phone, open `https://<username>.github.io/<repo>/setup.html`.
2. Paste the PAT → **Verify & Continue**.
3. A QR code appears. Scan it with your phone's camera to copy the pairing URL.
4. Meta AI app → **Devices** → **Display Glasses** → **App connections** → **Web apps** → **Add a web app** → paste the URL.

Done. The dashboard should appear on the glasses within a few seconds.

## Navigation cheatsheet (on glasses)

| Gesture | Action |
| --- | --- |
| D-pad up/down/left/right | Move focus between circles / buttons |
| Tap / Enter | Open the detail overlay for the focused tile |
| Back / Escape | Close overlay, or return to home |
| Settings → Auto-refresh row | Left/right to step the interval (0 disables) |

## Settings

- **Auto-refresh** — `0` to disable; or 5/10/15/30/60 min. Default 15.
- **Sign Out** — clears the stored token. Re-pair from setup.

## API endpoints used (proxied through the Worker)

- `/v2/usercollection/daily_readiness?start_date&end_date` — today + 7-day trend
- `/v2/usercollection/daily_sleep?start_date&end_date`
- `/v2/usercollection/daily_activity?start_date&end_date` — score + steps + calories
- `/v2/usercollection/heartrate?start_datetime&end_datetime` — latest live sample
- `/v2/usercollection/personal_info` — used only by the setup page to verify a PAT

Each is called in parallel via `Promise.allSettled`, so one failing endpoint doesn't break the dashboard. Tiles that can't load show `--`.

## Local testing

You can preview the glasses UI in any desktop browser at 600x600:

1. Make sure `PROXY_BASE` is set to your deployed worker URL.
2. Serve the folder over HTTP — `npx serve` or `python -m http.server 8080`.
3. Open `http://localhost:8080/index.html#token=YOUR_PAT`.
4. Resize the window to 600x600. Arrow keys simulate D-pad input.

## Troubleshooting

**"Network error: Failed to fetch" on setup.html**  
The Worker isn't deployed, isn't reachable, or `PROXY_BASE` is misspelled. Open your worker URL directly in a browser; if the `{"ok":true,...}` JSON doesn't appear, fix the worker first.

**"Oura returned 400" on setup.html**  
The pasted token isn't a valid PAT. Verify on https://cloud.ouraring.com/personal-access-tokens that the token still exists; the value is only shown once at creation. If you lost it, revoke and create a new one.

**Glasses say "Not connected"**  
The pairing URL fragment didn't load on first launch. Re-add the web app in the Meta AI app, making sure to paste the full URL **including `#token=...`** at the end.

**Specific tile shows `--` but others work**  
That endpoint is unavailable for your ring generation. Heart rate samples (`/heartrate`) need a Gen 3 ring; the dashboard falls back to the 7-day resting-HR trend from readiness data so the tile still shows something useful.

**Token expires / I want to rotate it**  
Revoke the old PAT at https://cloud.ouraring.com/personal-access-tokens, create a new one, re-run `setup.html` with the new token, re-add the new pairing URL to your glasses.

## Security model

- Your PAT lives in the URL fragment (which never leaves the browser network) and in `localStorage` on the glasses. No server stores it.
- The Cloudflare Worker is a public URL but only forwards a whitelisted set of GET endpoints and only with whatever `Authorization` header the caller supplies. Without a valid Oura PAT, hitting the proxy returns the same `Unauthorized` Oura would.
- The QR generator uses `api.qrserver.com` which sees only the public pairing URL (which contains the token). Use the in-page **Copy URL** button instead if that's a concern — it skips the QR step.

## License

MIT — see `TERMS.md` for the long version.
