# Oura Display — Ray-Ban Display glasses webapp

A glanceable Oura Ring dashboard for Meta Ray-Ban Display glasses. Shows today's Readiness, Sleep, Activity, and Heart Rate scores plus a 7-day sparkline for each, drillable into a detail overlay. Designed against the [meta-wearables-webapp](https://github.com/facebookincubator/meta-wearables-webapp) design system (600x600, dark background, D-pad nav, focusable elements).

## What's in this folder

```
index.html      Main glasses app (this is what loads on the glasses)
setup.html      Companion page you open on your phone/desktop to authorize and pair
styles.css      Shared styles (glasses dashboard + setup page)
app.js          Glasses app logic — API fetch, sparklines, D-pad nav, settings
setup.js        Setup flow logic — OAuth implicit flow + QR pairing URL
README.md       This file
```

## How the auth flow works

The glasses' browser has no keyboard, so OAuth can't happen on the glasses themselves. Instead:

1. **You** open `setup.html` on your phone or desktop browser.
2. You click **Connect Oura** → standard OAuth2 implicit flow → Oura redirects back to `setup.html` with an access token in the URL fragment.
3. The setup page generates a **pairing URL** like `https://your-app.example.com/index.html#token=ABC123` and shows it as a QR code.
4. You add that pairing URL to the glasses (Meta AI app → Devices → Display Glasses → App connections → Web apps → Add a web app).
5. The glasses load `index.html`, the app reads the token from the URL fragment on first load, saves it to the glasses' `localStorage`, strips the fragment, and starts fetching metrics.

The token lives only in localStorage on the glasses. No backend, no server-side anything. Tokens last ~30 days; re-pair when one expires.

## One-time Oura side setup

1. Register an OAuth app at [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications).
2. Add **your deployed `setup.html` URL** (exactly — no trailing slash differences) as a redirect URI in the Oura app.
3. Copy the Client ID — you'll paste it into the setup page each time you re-pair.
4. Make sure the app has these scopes available: `daily`, `heartrate`, `personal`.

## Deploy

The glasses require a **public HTTPS URL**. Any static host works:

- **Vercel** — drag-and-drop this folder at [vercel.com/new](https://vercel.com/new) or `npx vercel deploy`
- **Netlify** — drag-and-drop at [app.netlify.com/drop](https://app.netlify.com/drop)
- **GitHub Pages** — push to a repo, enable Pages
- **Cloudflare Pages** — connect repo

After deploying, update the redirect URI in your Oura OAuth app to match the deployed URL of `setup.html`.

## Pair your glasses

1. On phone or desktop, open `https://your-deployed-url/setup.html`.
2. Paste your Oura **Client ID** → tap **Connect Oura**.
3. Approve the scopes on Oura's page → you bounce back to setup.
4. **Scan the QR code with your phone's camera** — it copies the pairing URL.
5. Open Meta AI app → Devices → Display Glasses → App connections → Web apps → Add a web app → paste URL.

Done. The metrics screen should appear on the glasses within a few seconds.

## Test locally

You can test the glasses UI in any desktop browser at 600x600:

1. Serve the folder over HTTP (`npx serve` or `python -m http.server`).
2. Open `http://localhost:3000/index.html#token=YOUR_TOKEN` — paste a real token you generated via setup, or use a [Personal Access Token](https://cloud.ouraring.com/personal-access-tokens).
3. Resize the window to 600x600 and use arrow keys for D-pad navigation.

## Navigation cheatsheet (on glasses)

| Gesture | Action |
| --- | --- |
| D-pad up/down/left/right | Move focus between tiles / buttons |
| Tap / Enter | Open detail overlay or activate button |
| Back / Escape | Close overlay, or return to home |
| In detail overlay | Press the **Back** button to return |
| In Settings → Auto-refresh row | Left/right to step the interval |

## Settings

- **Auto-refresh** — `0` to disable, or 5/10/15/30/60 min cadence. Default 15.
- **Sign Out** — clears the stored token. Re-pair from setup.

## API endpoints used

- `GET /v2/usercollection/daily_readiness?start_date&end_date` — readiness score + contributors + RHR (7 days)
- `GET /v2/usercollection/daily_sleep?start_date&end_date` — sleep score + contributors (7 days)
- `GET /v2/usercollection/daily_activity?start_date&end_date` — activity score + steps + calories (7 days)
- `GET /v2/usercollection/heartrate?start_datetime&end_datetime` — last 6h of HR samples for latest reading

Each is called in parallel via `Promise.allSettled`, so a single endpoint failing won't break the whole dashboard. Failed tiles just show `--`.

## Known limitations

- Tokens expire after ~30 days (Oura's implicit-flow limit). Re-pair when that happens.
- Heart rate samples come from the `/heartrate` endpoint which is Gen 3+ ring only; older rings will see `--` for the latest HR but still get the 7-day RHR trend from readiness.
- The QR code is generated via the public `api.qrserver.com` service. If you'd rather avoid that, swap `setup.js`'s `qrApi` line for any local QR library.
- No backend means we trust the user's deployment to be private (don't share the deployed URL — anyone hitting `setup.html` with your client_id could initiate OAuth, though Oura will still ask them to log in to *their* Oura account).
