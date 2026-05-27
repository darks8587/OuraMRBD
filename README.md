# Oura Display — Ray-Ban Display glasses webapp

A glanceable, transparent HUD dashboard for your Oura Ring metrics, designed for Meta Ray-Ban Display glasses. Shows today's Readiness, Sleep, Activity, and Heart-rate score as four circular tiles with 7-day sparklines; tap any circle to drill into a detail overlay with the full trend + sub-metrics.

## Files

```
index.html      Main glasses app (this is what loads on the glasses)
setup.html      Companion page you open on your phone/desktop to pair
styles.css      Shared styles (glasses dashboard + setup page)
app.js          Glasses app logic — API fetch, sparklines, D-pad nav, settings
setup.js        Setup logic — PAT verification + QR pairing URL
PRIVACY.md      Privacy policy (for Oura's OAuth form if you ever switch to OAuth)
TERMS.md        Terms of use (same)
README.md       This file
```

## How the auth flow works

The glasses' browser has no keyboard, so credentials can't be entered on the glasses themselves. The flow is:

1. **On your phone or desktop**, open `setup.html` and paste your Oura Personal Access Token (PAT).
2. The setup page verifies the token with a single API call and generates a **pairing URL** + QR code. The URL looks like `https://your-app/index.html#token=YOUR_PAT`.
3. You add that URL to the glasses via the Meta AI app. On first load, the glasses extract the token from the URL fragment, save it to the glasses' `localStorage`, strip the fragment, and start fetching metrics.

No backend, no server-side anything. PATs don't expire (or expire after years), so you only pair once.

## Get a Personal Access Token

1. Sign in at https://cloud.ouraring.com/personal-access-tokens
2. Click "Create new personal access token"
3. Copy the token — you'll need to paste it on `setup.html`. (You won't be able to see it again after closing the tab, so save it somewhere safe too.)

That's it. **No OAuth app registration, no Privacy Policy URL, no Redirect URI** — those are only needed if you want to release the app for other Oura users to use.

## Deploy

The glasses require a **public HTTPS URL**. The easiest path is GitHub Pages:

1. Push these files to a public GitHub repo (e.g. `your-username/OuraMRBD`).
2. Repo &rarr; **Settings** &rarr; **Pages** &rarr; Source = *Deploy from a branch*, Branch = `main`, Folder = `/ (root)` &rarr; **Save**.
3. After ~1 minute the page shows: *Your site is live at `https://<your-username>.github.io/<repo-name>/`.*

Other hosts that work the same way: Vercel, Netlify, Cloudflare Pages. Drag-and-drop deploys also fine.

## Pair your glasses

1. On your phone, open `https://<your-deployed-url>/setup.html`.
2. Paste your Personal Access Token &rarr; tap **Verify & Continue**.
3. The page shows a QR code. **Scan it with your phone's camera** to copy the pairing URL.
4. Open the Meta AI app &rarr; **Devices** &rarr; **Display Glasses** &rarr; **App connections** &rarr; **Web apps** &rarr; **Add a web app** &rarr; paste URL.

The metrics screen should appear on the glasses within a few seconds.

## Test locally

You can preview the glasses UI in any desktop browser at 600&times;600:

1. Serve the folder over HTTP &mdash; e.g. `npx serve` or `python -m http.server 8080`.
2. Open `http://localhost:8080/index.html#token=YOUR_PAT`.
3. Resize the window to 600&times;600 and use the arrow keys to simulate D-pad input.

## Navigation cheatsheet (on glasses)

| Gesture | Action |
| --- | --- |
| D-pad up/down/left/right | Move focus between circles / buttons |
| Tap / Enter | Open the detail overlay for the focused tile |
| Back / Escape | Close overlay, or return to home |
| Settings &rarr; Auto-refresh row | Left/right to step the interval |

## Settings

- **Auto-refresh** &mdash; `0` to disable; or 5/10/15/30/60 min. Default 15.
- **Sign Out** &mdash; clears the stored token from glasses' localStorage. Re-pair from setup.

## API endpoints used

- `GET /v2/usercollection/daily_readiness?start_date&end_date` &mdash; today's score + 7-day trend
- `GET /v2/usercollection/daily_sleep?start_date&end_date` &mdash; same for sleep
- `GET /v2/usercollection/daily_activity?start_date&end_date` &mdash; activity score + steps + calories
- `GET /v2/usercollection/heartrate?start_datetime&end_datetime` &mdash; latest live heart-rate sample

Each is called in parallel via `Promise.allSettled`, so one endpoint failing won't break the whole dashboard. Tiles that can't load just show `--`.

## Known limitations

- The `/heartrate` endpoint requires a Gen 3 ring. On older rings the Heart tile falls back to the 7-day resting-heart-rate trend pulled from the readiness data.
- QR codes are generated via `api.qrserver.com` (only the public pairing URL is sent there). If you'd rather not depend on that service, swap the `qrApi` line in `setup.js` for any local QR library.
- The HUD relies on the additive display rendering `#000` as transparent. Against very bright real-world backgrounds the thin outlines may be harder to read &mdash; if that's an issue we can thicken them or add subtle text shadows.

## License

MIT &mdash; do whatever you want with this code, no warranty implied. See `TERMS.md` for the long version.
