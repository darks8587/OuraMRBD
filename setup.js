// Oura Display — Setup page (Personal Access Token flow)
// Verifies the PAT against the Oura API, then generates a pairing URL/QR
// that embeds the token in the fragment so the glasses webapp can pick it up.

(function () {
  'use strict';

  var VERIFY_URL = 'https://api.ouraring.com/v2/usercollection/personal_info';

  var $ = function (id) { return document.getElementById(id); };

  function show(id) {
    ['step-token', 'step-paired'].forEach(function (s) {
      $(s).classList.add('hidden');
    });
    $(id).classList.remove('hidden');
  }

  function setError(msg) {
    var el = $('verify-error');
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
    } else {
      el.classList.remove('hidden');
      el.textContent = msg;
    }
  }

  // Strip whitespace and zero-width characters (ZWSP, ZWNJ, ZWJ, BOM)
  // that sometimes sneak in when copying tokens from web pages.
  function cleanToken(raw) {
    if (!raw) return '';
    return raw
      .replace(/\s+/g, '')
      .replace(/[​‌‍﻿]/g, '');
  }

  // Build the glasses-facing URL: index.html on this same origin/path,
  // with the PAT embedded in the URL fragment.
  function glassesUrl(token) {
    var u = new URL(window.location.href);
    u.pathname = u.pathname.replace(/setup\.html?$/i, 'index.html');
    if (!u.pathname.endsWith('index.html') && !u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/[^/]+$/, '');
    }
    u.search = '';
    u.hash = 'token=' + encodeURIComponent(token);
    return u.toString();
  }

  function verifyToken(token) {
    return fetch(VERIFY_URL, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function (res) {
      return res.text().then(function (bodyText) {
        if (res.ok) {
          try { return { ok: true, info: JSON.parse(bodyText) }; }
          catch (e) { return { ok: true, info: null }; }
        }
        var detail = '';
        try {
          var body = JSON.parse(bodyText);
          detail = body.detail || body.message || body.error_description || body.error || '';
        } catch (e) {
          detail = bodyText.slice(0, 200);
        }
        console.error('Oura verify failed:', { status: res.status, body: bodyText });
        var hint = '';
        if (res.status === 400) {
          hint = ' Make sure this is a Personal Access Token from cloud.ouraring.com/personal-access-tokens — not an OAuth Client ID or Secret.';
        } else if (res.status === 401 || res.status === 403) {
          hint = ' The token may have been revoked or copied incorrectly.';
        }
        return {
          ok: false,
          reason: 'Oura returned ' + res.status + (detail ? ' — "' + detail + '"' : '') + '.' + hint,
          status: res.status,
          body: bodyText
        };
      });
    }).catch(function (e) {
      return { ok: false, reason: 'Network error: ' + (e.message || e) };
    });
  }

  function renderPaired(token) {
    var url = glassesUrl(token);
    $('pair-url').textContent = url;
    var qrApi = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&qzone=1&data=' + encodeURIComponent(url);
    $('qr-img').src = qrApi;
    show('step-paired');
  }

  // ------------------------------------------
  // Wire up UI
  // ------------------------------------------

  $('show-pat').addEventListener('change', function (e) {
    $('pat').type = e.target.checked ? 'text' : 'password';
  });

  $('verify-btn').addEventListener('click', function () {
    setError(null);
    var raw = $('pat').value;
    var token = cleanToken(raw);
    console.log('PAT length after cleaning:', token.length, '(raw was ' + raw.length + ')');

    if (!token) {
      $('pat').focus();
      setError('Paste a token first.');
      return;
    }
    if (token.length < 20) {
      setError('That does not look like a full token — Oura PATs are longer than 20 characters. (Got ' + token.length + ' chars.)');
      return;
    }

    var btn = $('verify-btn');
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    verifyToken(token).then(function (result) {
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      renderPaired(token);
    }).catch(function (e) {
      setError('Unexpected error: ' + (e.message || e));
    }).then(function () {
      btn.disabled = false;
      btn.textContent = originalText;
    });
  });

  $('pat').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('verify-btn').click();
    }
  });

  $('copy-btn').addEventListener('click', function () {
    var url = $('pair-url').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        $('copy-btn').textContent = 'Copied!';
        setTimeout(function () { $('copy-btn').textContent = 'Copy URL'; }, 1500);
      }).catch(function () {
        selectPairUrl();
      });
    } else {
      selectPairUrl();
    }
  });

  function selectPairUrl() {
    var range = document.createRange();
    range.selectNode($('pair-url'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }

  $('reset-btn').addEventListener('click', function () {
    $('pat').value = '';
    setError(null);
    show('step-token');
    $('pat').focus();
  });

  $('pat').focus();
})();
