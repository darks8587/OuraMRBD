# Privacy Policy

**Effective date:** May 27, 2026

This Privacy Policy describes how the Oura Display web application (the "App") handles your data when you use it to view your Oura Ring metrics on Meta Ray-Ban Display glasses.

## Who runs this App

This is a personal, non-commercial open-source project. The App is hosted as static files; there is no backend server operated by the developer that processes, stores, or relays your data.

## What data the App accesses

When you authorize the App through Oura's OAuth2 flow, the App receives an access token that lets it read your Oura data on your behalf. The App requests the following Oura scopes:

- `daily` — daily summaries of readiness, sleep, and activity
- `heartrate` — time-series heart rate samples
- `personal` — basic profile info (used only to confirm the connection works)

The App reads these data each time it refreshes — by default, every 15 minutes — and renders the most recent values on screen.

## Where your data goes

- **Your data is never sent to the developer's servers.** There are no such servers.
- The OAuth access token and the most recent metric values are stored only in your browser's `localStorage`. They never leave the device they were stored on.
- All requests for Oura data go directly from your browser to `api.ouraring.com` over HTTPS.

## Cookies and tracking

The App does not set cookies, does not use analytics, and does not track you.

## Third parties

The only third-party service the App talks to is Oura (`api.ouraring.com`). The setup page optionally uses `api.qrserver.com` to render a QR code for pairing — only the public, non-secret pairing URL is sent to that service.

## Your control

- **Revoke at any time:** Sign out from the App's Settings screen to clear the stored token, or revoke the integration entirely from your Oura account at https://cloud.ouraring.com/.
- **Delete your data:** Clearing your browser's site data for the App's domain removes everything the App has stored.

## Changes

If this policy changes, the updated version will be committed to the project's GitHub repository with a new effective date.

## Contact

Open an issue on the project's GitHub repository: https://github.com/darks8587/OuraMRBD
