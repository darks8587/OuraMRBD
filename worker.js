// Cloudflare Worker — Oura API CORS proxy.
//
// Why this exists:
//   Oura's API (api.ouraring.com) doesn't send Access-Control-Allow-Origin
//   headers, so browsers block direct fetches from a static GitHub Pages site.
//   This worker forwards a small whitelist of GET endpoints to Oura and
//   re-adds the missing CORS headers on the way back.
//
// Deploy:
//   1. Sign up / log in at https://dash.cloudflare.com
//   2. Workers & Pages -> Create -> Create Worker -> name it (e.g. "oura-proxy")
//   3. Paste this entire file into the editor, click "Save and Deploy"
//   4. Copy the worker URL (looks like https://oura-proxy.<your>.workers.dev)
//   5. Paste that URL into PROXY_BASE in app.js and setup.js, then push to GitHub.

const OURA = 'https://api.ouraring.com';

// Only proxy these exact paths so this isn't a general-purpose open proxy
const ALLOWED_PATHS = new Set([
  '/v2/usercollection/personal_info',
  '/v2/usercollection/daily_readiness',
  '/v2/usercollection/daily_sleep',
  '/v2/usercollection/daily_activity',
  '/v2/usercollection/heartrate',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // Friendly root response so visitors hitting the bare URL don't see "path not allowed"
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        JSON.stringify({ ok: true, message: 'Oura CORS proxy. Use /v2/usercollection/* paths.' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    if (!ALLOWED_PATHS.has(url.pathname)) {
      return new Response(
        JSON.stringify({ error: 'path not allowed', path: url.pathname }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // Only forward Authorization; drop anything else to keep the surface small
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return new Response(
        JSON.stringify({ error: 'missing Authorization header' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const target = OURA + url.pathname + url.search;
    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'GET',
        headers: { Authorization: auth },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'upstream fetch failed', message: String(e) }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const respHeaders = new Headers();
    const ct = upstream.headers.get('Content-Type');
    if (ct) respHeaders.set('Content-Type', ct);
    for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  },
};
