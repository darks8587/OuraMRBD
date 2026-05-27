// Oura Display — Setup page
// Handles OAuth2 implicit flow + generates a pairing URL for the glasses.

(function () {
  'use strict';

  const AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
  const SCOPES = 'daily heartrate personal';
  const CLIENT_KEY = 'oura_setup_client_id';
  const STATE_KEY = 'oura_setup_state';

  // Where the glasses-facing app lives. By default same dir as setup.html,
  // resolved to /index.html. If you serve via a router, override SETUP_GLASSES_URL.
  function glassesUrl() {
    const u = new URL(window.location.href);
    u.pathname = u.pathname.replace(/setup\.html?$/i, 'index.html');
    if (!u.pathname.endsWith('index.html') && !u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/[^/]+$/, '');
    }
    u.search = '';
    u.hash = '';
    return u.toString();
  }

  function redirectUri() {
    // Self-redirect: OAuth comes back to setup.html with token in fragment
    const u = new URL(window.location.href);
    u.search = '';
    u.hash = '';
    return u.toString();
  }

  const $ = (id) => document.getElementById(id);

  function genState() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function show(id) {
    ['step-client', 'step-paired', 'step-error'].forEach(s => $(s).classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  // ------------------------------------------
  // Init: handle either initial state or OAuth return
  // ------------------------------------------
  function init() {
    // Pre-fill last-used client_id
    const saved = localStorage.getItem(CLIENT_KEY);
    if (saved) $('client-id').value = saved;

    // Check URL fragment for OAuth callback
    const hash = window.location.hash || '';
    if (hash.length > 1) {
      const params = new URLSearchParams(hash.slice(1));
      const err = params.get('error');
      const tok = params.get('access_token');
      const returnedState = params.get('state');
      const expectedState = sessionStorage.getItem(STATE_KEY);

      if (err) {
        $('error-detail').textContent = 'Error: ' + err;
        show('step-error');
        history.replaceState(null, '', window.location.pathname);
        return;
      }
      if (tok) {
        if (expectedState && returnedState !== expectedState) {
          $('error-detail').textContent = 'State mismatch (possible CSRF). Try again.';
          show('step-error');
          history.replaceState(null, '', window.location.pathname);
          return;
        }
        sessionStorage.removeItem(STATE_KEY);
        const expiresIn = params.get('expires_in') || '';
        const scope = params.get('scope') || '';
        renderPaired(tok, expiresIn, scope);
        history.replaceState(null, '', window.location.pathname);
        return;
      }
    }
    show('step-client');
  }

  function renderPaired(token, expiresIn, scope) {
    // Build the glasses pairing URL with token in fragment
    const url = glassesUrl() + '#token=' + encodeURIComponent(token)
      + (expiresIn ? '&expires_in=' + encodeURIComponent(expiresIn) : '')
      + (scope ? '&scope=' + encodeURIComponent(scope) : '');

    $('pair-url').textContent = url;

    // Encode QR via a public QR API (works on any device with internet,
    // which the user definitely has since they just did OAuth)
    const qrApi = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&qzone=1&data='
      + encodeURIComponent(url);
    $('qr-img').src = qrApi;

    // Token-validity hint
    if (expiresIn) {
      const days = Math.round(parseInt(expiresIn, 10) / 86400);
      $('paired-detail').textContent = 'Token valid for ~' + days + ' days. Scan the QR with your phone or copy the URL below.';
    }

    show('step-paired');
  }

  // ------------------------------------------
  // OAuth start
  // ------------------------------------------
  $('connect-btn').addEventListener('click', function () {
    const clientId = $('client-id').value.trim();
    if (!clientId) {
      $('client-id').focus();
      return;
    }
    localStorage.setItem(CLIENT_KEY, clientId);
    const state = genState();
    sessionStorage.setItem(STATE_KEY, state);
    const url = AUTH_URL
      + '?response_type=token'
      + '&client_id=' + encodeURIComponent(clientId)
      + '&redirect_uri=' + encodeURIComponent(redirectUri())
      + '&scope=' + encodeURIComponent(SCOPES)
      + '&state=' + encodeURIComponent(state);
    window.location.assign(url);
  });

  // Copy URL button
  $('copy-btn').addEventListener('click', async function () {
    const url = $('pair-url').textContent;
    try {
      await navigator.clipboard.writeText(url);
      $('copy-btn').textContent = 'Copied!';
      setTimeout(() => $('copy-btn').textContent = 'Copy URL', 1500);
    } catch {
      // Fallback: select the URL element
      const range = document.createRange();
      range.selectNode($('pair-url'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });

  // Reset
  $('reset-btn').addEventListener('click', function () {
    show('step-client');
  });
  $('error-reset').addEventListener('click', function () {
    show('step-client');
  });

  init();
})();
