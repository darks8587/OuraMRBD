// Oura Display — Meta Ray-Ban Display Glasses webapp
// Reads Oura API v2 (via Cloudflare Worker proxy) using a Bearer token
// bootstrapped from the URL fragment on first load.

(function () {
  'use strict';

  // ============================================================
  //   EDIT THIS after deploying your Cloudflare Worker.
  //   Must match PROXY_BASE in setup.js (same worker URL).
  //   Format: 'https://<worker-name>.<your-subdomain>.workers.dev'
  // ============================================================
  const PROXY_BASE = 'https://ouraworker.darks8587.workers.dev';

  const API_BASE = PROXY_BASE + '/v2/usercollection';
  const TOKEN_KEY = 'oura_access_token';
  const TOKEN_META_KEY = 'oura_token_meta';
  const PREFS_KEY = 'oura_prefs';
  const CACHE_KEY = 'oura_cache_v1';
  const DEFAULT_PREFS = { refreshMins: 15 };
  const DAYS_TREND = 7;

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('home'),
    settings: $('settings'),
    error: $('error'),
  };
  const detailOverlay = $('detail-overlay');
  const statusMeta = $('status-meta');
  const errTitle = $('error-title');
  const errMsg = $('error-msg');

  let token = null;
  let prefs = { ...DEFAULT_PREFS };
  let data = null;
  let refreshTimer = null;
  let lastOpenedTile = null;

  function bootstrapToken() {
    const hash = window.location.hash || '';
    if (hash.length > 1) {
      const params = new URLSearchParams(hash.slice(1));
      const t = params.get('token') || params.get('access_token');
      if (t) {
        const expiresIn = parseInt(params.get('expires_in') || '0', 10);
        const meta = {
          expires_at: expiresIn ? Date.now() + expiresIn * 1000 : null,
          scope: params.get('scope') || null,
          saved_at: Date.now(),
        };
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem(TOKEN_META_KEY, JSON.stringify(meta));
        history.replaceState(null, '', window.location.pathname + window.location.search);
        token = t;
        return t;
      }
    }
    token = localStorage.getItem(TOKEN_KEY);
    return token;
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_META_KEY);
    localStorage.removeItem(CACHE_KEY);
    token = null;
    data = null;
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      prefs = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
    } catch { prefs = { ...DEFAULT_PREFS }; }
  }
  function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }

  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function todayStr() { return ymd(new Date()); }
  function nDaysAgoStr(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
  }
  function fmtTime(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function apiGet(path, params) {
    if (!token) throw new Error('No token');
    if (PROXY_BASE.indexOf('YOUR-WORKER') !== -1) {
      const err = new Error('Proxy not configured');
      err.status = 0;
      throw err;
    }
    const url = new URL(API_BASE + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null) url.searchParams.set(k, v);
      });
    }
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (res.status === 401) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error('API ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function fetchAll() {
    const start = nDaysAgoStr(DAYS_TREND - 1);
    const end = todayStr();
    const params = { start_date: start, end_date: end };

    const hrEnd = new Date();
    const hrStart = new Date(hrEnd.getTime() - 6 * 60 * 60 * 1000);
    const hrParams = {
      start_datetime: hrStart.toISOString(),
      end_datetime: hrEnd.toISOString(),
    };

    const results = await Promise.allSettled([
      apiGet('/daily_readiness', params),
      apiGet('/daily_sleep', params),
      apiGet('/daily_activity', params),
      apiGet('/heartrate', hrParams),
    ]);

    const allUnauth = results.every(r => r.status === 'rejected' && r.reason && r.reason.status === 401);
    if (allUnauth) {
      const err = new Error('All requests unauthorized');
      err.status = 401;
      throw err;
    }

    return {
      readiness: results[0].status === 'fulfilled' ? results[0].value : null,
      sleep:     results[1].status === 'fulfilled' ? results[1].value : null,
      activity:  results[2].status === 'fulfilled' ? results[2].value : null,
      heartrate: results[3].status === 'fulfilled' ? results[3].value : null,
      fetched_at: Date.now(),
    };
  }

  function saveCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {} }
  function loadCache() {
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  function dailySeries(collection, key) {
    key = key || 'score';
    if (!collection || !collection.data) return [];
    return collection.data
      .filter(d => d[key] != null)
      .sort((a, b) => (a.day < b.day ? -1 : 1));
  }
  function latest(arr) { return arr.length ? arr[arr.length - 1] : null; }
  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function readinessTile(d) {
    const series = dailySeries(d, 'score');
    const last = latest(series);
    return {
      score: last ? Math.round(last.score) : null,
      series: series.map(x => x.score),
      detail: last ? {
        contributors: last.contributors || {},
        temperature_deviation: last.temperature_deviation,
        day: last.day,
      } : null,
    };
  }
  function sleepTile(d) {
    const series = dailySeries(d, 'score');
    const last = latest(series);
    return {
      score: last ? Math.round(last.score) : null,
      series: series.map(x => x.score),
      detail: last ? { contributors: last.contributors || {}, day: last.day } : null,
    };
  }
  function activityTile(d) {
    const series = dailySeries(d, 'score');
    const last = latest(series);
    return {
      score: last ? Math.round(last.score) : null,
      series: series.map(x => x.score),
      detail: last ? {
        steps: last.steps,
        active_calories: last.active_calories,
        target_calories: last.target_calories,
        total_calories: last.total_calories,
        equivalent_walking_distance: last.equivalent_walking_distance,
        contributors: last.contributors || {},
        day: last.day,
      } : null,
    };
  }
  function heartTile(hrData, readinessData) {
    const samples = (hrData && hrData.data) ? hrData.data : [];
    samples.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const latestSample = samples[samples.length - 1] || null;

    const series = (readinessData && readinessData.data) ? readinessData.data : [];
    series.sort((a, b) => (a.day < b.day ? -1 : 1));
    const rhrSeries = series.map(x => x.resting_heart_rate).filter(v => v != null);

    return {
      score: latestSample ? Math.round(latestSample.bpm)
           : (rhrSeries.length ? Math.round(rhrSeries[rhrSeries.length - 1]) : null),
      series: rhrSeries,
      detail: {
        latest_bpm: latestSample ? latestSample.bpm : null,
        latest_source: latestSample ? latestSample.source : null,
        latest_time: latestSample ? latestSample.timestamp : null,
        rhr_series: rhrSeries,
        rhr_avg: rhrSeries.length ? avg(rhrSeries) : null,
        samples_count: samples.length,
      },
    };
  }

  function renderSparkline(svg, series, opts) {
    opts = opts || {};
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!series || series.length < 2) return;

    const vb = svg.viewBox.baseVal;
    const W = vb.width;
    const H = vb.height;
    const pad = 2;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;

    const minV = Math.min.apply(null, series);
    const maxV = Math.max.apply(null, series);
    const range = maxV - minV || 1;

    const pts = series.map((v, i) => {
      const x = pad + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
      const y = pad + innerH - ((v - minV) / range) * innerH;
      return [x, y];
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    path.setAttribute('d', d);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    if (opts.showLastDot !== false) {
      const last = pts[pts.length - 1];
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', last[0].toFixed(1));
      c.setAttribute('cy', last[1].toFixed(1));
      c.setAttribute('r', opts.dotRadius || 2);
      svg.appendChild(c);
    }
  }

  function renderHome() {
    if (!data) return;
    const r = readinessTile(data.readiness);
    const s = sleepTile(data.sleep);
    const a = activityTile(data.activity);
    const h = heartTile(data.heartrate, data.readiness);

    $('tile-readiness-score').textContent = r.score != null ? r.score : '--';
    $('tile-sleep-score').textContent     = s.score != null ? s.score : '--';
    $('tile-activity-score').textContent  = a.score != null ? a.score : '--';
    $('tile-heart-score').textContent     = h.score != null ? h.score : '--';

    const steps = a.detail && a.detail.steps != null ? a.detail.steps : null;
    $('tile-activity-steps').textContent = steps != null ? steps.toLocaleString() : '';

    renderSparkline($('spark-readiness'), r.series, { dotRadius: 1.6 });
    renderSparkline($('spark-sleep'),     s.series, { dotRadius: 1.6 });
    renderSparkline($('spark-heart'),     h.series, { dotRadius: 1.6 });

    statusMeta.textContent = fmtTime(data.fetched_at);
    window.__tileData = { readiness: r, sleep: s, activity: a, heart: h };
  }

  function showDetail(metric) {
    const t = window.__tileData ? window.__tileData[metric] : null;
    if (!t) return;
    lastOpenedTile = metric;

    const wrap = detailOverlay.querySelector('.detail-content');
    wrap.classList.remove('readiness', 'sleep', 'activity', 'heart');
    wrap.classList.add(metric);

    const titles = { readiness: 'Readiness', sleep: 'Sleep', activity: 'Activity', heart: 'Heart' };
    $('detail-title').textContent = titles[metric];
    $('detail-score').textContent = t.score != null ? t.score : '--';

    const stats = $('detail-stats');
    stats.innerHTML = '';
    const items = buildDetailStats(metric, t.detail || {});
    items.forEach(it => {
      const sp = document.createElement('span');
      sp.className = 'stat';
      sp.innerHTML = '<span>' + it.label + '</span><span class="stat-v">' + it.value + '</span>';
      stats.appendChild(sp);
    });

    renderSparkline($('detail-spark'), t.series, { dotRadius: 3 });

    let trendText = ' ';
    if (t.series && t.series.length >= 2) {
      const last = t.series[t.series.length - 1];
      const prev = t.series[0];
      const delta = last - prev;
      const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
      const aAvg = Math.round(avg(t.series));
      trendText = '7d avg ' + aAvg + ' · ' + arrow + ' ' + Math.abs(Math.round(delta));
    }
    $('detail-trend').textContent = trendText;

    detailOverlay.classList.remove('hidden');
    const btn = detailOverlay.querySelector('[data-action="dismiss-overlay"]');
    if (btn) btn.focus();
  }

  function buildDetailStats(metric, d) {
    if (metric === 'readiness') {
      const c = d.contributors || {};
      const out = [];
      if (c.hrv_balance != null)        out.push({ label: 'HRV bal',    value: Math.round(c.hrv_balance) });
      if (c.recovery_index != null)     out.push({ label: 'Recovery',   value: Math.round(c.recovery_index) });
      if (c.resting_heart_rate != null) out.push({ label: 'RHR sub',    value: Math.round(c.resting_heart_rate) });
      if (c.body_temperature != null)   out.push({ label: 'Temp',       value: Math.round(c.body_temperature) });
      if (c.previous_night != null)     out.push({ label: 'Prev night', value: Math.round(c.previous_night) });
      if (d.temperature_deviation != null) {
        const dev = Number(d.temperature_deviation).toFixed(2);
        out.push({ label: 'Temp dev', value: (dev > 0 ? '+' : '') + dev + '°' });
      }
      return out;
    }
    if (metric === 'sleep') {
      const c = d.contributors || {};
      const out = [];
      if (c.total_sleep != null) out.push({ label: 'Total', value: Math.round(c.total_sleep) });
      if (c.deep_sleep != null)  out.push({ label: 'Deep',  value: Math.round(c.deep_sleep) });
      if (c.rem_sleep != null)   out.push({ label: 'REM',   value: Math.round(c.rem_sleep) });
      if (c.efficiency != null)  out.push({ label: 'Eff',   value: Math.round(c.efficiency) + '%' });
      if (c.restfulness != null) out.push({ label: 'Rest',  value: Math.round(c.restfulness) });
      return out;
    }
    if (metric === 'activity') {
      const out = [];
      if (d.steps != null)           out.push({ label: 'Steps',       value: d.steps.toLocaleString() });
      if (d.active_calories != null) out.push({ label: 'Active kcal', value: d.active_calories });
      if (d.total_calories != null)  out.push({ label: 'Total kcal',  value: d.total_calories });
      if (d.target_calories != null && d.active_calories != null) {
        const pct = Math.round((d.active_calories / d.target_calories) * 100);
        out.push({ label: 'Target', value: pct + '%' });
      }
      if (d.equivalent_walking_distance != null) {
        out.push({ label: 'Distance', value: (d.equivalent_walking_distance / 1000).toFixed(1) + 'km' });
      }
      return out;
    }
    if (metric === 'heart') {
      const out = [];
      if (d.latest_bpm != null) out.push({ label: 'Latest bpm', value: Math.round(d.latest_bpm) });
      if (d.latest_time)        out.push({ label: 'At',         value: fmtTime(d.latest_time) });
      if (d.rhr_avg != null)    out.push({ label: '7d RHR',     value: Math.round(d.rhr_avg) });
      if (d.samples_count != null) out.push({ label: 'Samples', value: d.samples_count });
      return out;
    }
    return [];
  }

  function dismissOverlay() {
    detailOverlay.classList.add('hidden');
    let target = null;
    if (lastOpenedTile) target = document.querySelector('.tile[data-metric="' + lastOpenedTile + '"]');
    if (!target) target = document.querySelector('.tile.focusable');
    if (target) target.focus();
  }

  function showScreen(id) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[id]) screens[id].classList.remove('hidden');
    setTimeout(() => {
      const first = screens[id] && screens[id].querySelector('.focusable');
      if (first) first.focus();
    }, 0);
  }

  function renderSettings() {
    $('val-refreshMins').textContent = prefs.refreshMins;
    $('conn-status').textContent = token ? 'Connected' : 'Not connected';
    $('token-status').textContent = token ? 'Yes' : 'No';
    $('conn-last-sync').textContent = data && data.fetched_at ? fmtTime(data.fetched_at) : 'Never';
  }

  function stepSetting(rowEl, dir) {
    const key = rowEl.dataset.setting;
    if (rowEl.dataset.toggle === 'true') {
      prefs[key] = !prefs[key];
      savePrefs();
      renderSettings();
      return;
    }
    const min = parseInt(rowEl.dataset.min || '0', 10);
    const max = parseInt(rowEl.dataset.max || '100', 10);
    const step = parseInt(rowEl.dataset.step || '1', 10);
    let v = prefs[key] != null ? prefs[key] : 0;
    v += dir * step;
    if (v < min) v = max;
    if (v > max) v = min;
    prefs[key] = v;
    savePrefs();
    renderSettings();
    if (key === 'refreshMins') scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (!prefs.refreshMins || prefs.refreshMins <= 0) return;
    refreshTimer = setTimeout(() => {
      refreshData().finally(scheduleRefresh);
    }, prefs.refreshMins * 60 * 1000);
  }

  async function refreshData() {
    if (!token) return;
    try {
      const fresh = await fetchAll();
      data = fresh;
      saveCache(fresh);
      renderHome();
    } catch (e) {
      if (e && e.status === 401) {
        clearToken();
        showError('Token expired', 'Please re-pair from the setup page on your phone.');
        return;
      }
      if (e && e.message === 'Proxy not configured') {
        showError('Proxy not configured', 'Edit app.js and replace YOUR-WORKER.workers.dev with your Cloudflare Worker URL, then re-upload.');
        return;
      }
      console.error('Refresh failed', e);
    }
  }

  function showError(title, msg) {
    errTitle.textContent = title || 'Error';
    errMsg.textContent = msg || '';
    showScreen('error');
  }

  document.addEventListener('click', function (e) {
    const tile = e.target.closest('.tile[data-metric]');
    if (tile && !e.target.closest('[data-action]')) {
      showDetail(tile.dataset.metric);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'refresh':       refreshData(); break;
      case 'open-settings': renderSettings(); showScreen('settings'); break;
      case 'back-home':     showScreen('home'); break;
      case 'clear-token':
        clearToken();
        showError('Signed out', 'Open the setup page on your phone to pair again.');
        break;
      case 'dismiss-overlay': dismissOverlay(); break;
      case 'retry':
        if (token) { showScreen('home'); refreshData(); }
        break;
    }
  });

  function getVisibleFocusables() {
    const all = document.querySelectorAll('.focusable');
    const list = [];
    for (const el of all) {
      if (el.offsetParent === null) continue;
      if (!detailOverlay.classList.contains('hidden')) {
        if (!detailOverlay.contains(el)) continue;
      }
      list.push(el);
    }
    return list;
  }

  function focusInDirection(currentIdx, dir, focusables) {
    if (!focusables.length) return;
    const cur = focusables[currentIdx];
    if (cur && cur.classList.contains('tile')) {
      const tiles = Array.from(document.querySelectorAll('.tile.focusable'))
        .filter(t => t.offsetParent !== null);
      const tileIdx = tiles.indexOf(cur);
      if (tileIdx !== -1) {
        const row = Math.floor(tileIdx / 2);
        const col = tileIdx % 2;
        let nr = row, nc = col;
        if (dir === 'up')    nr = row === 0 ? 1 : 0;
        if (dir === 'down')  nr = row === 1 ? 0 : 1;
        if (dir === 'left')  nc = col === 0 ? 1 : 0;
        if (dir === 'right') nc = col === 1 ? 0 : 1;
        const next = tiles[nr * 2 + nc];
        if (next) { next.focus(); return; }
      }
    }
    let next = currentIdx;
    if (dir === 'down' || dir === 'right') next = (currentIdx + 1) % focusables.length;
    else if (dir === 'up' || dir === 'left') next = (currentIdx - 1 + focusables.length) % focusables.length;
    focusables[next].focus();
  }

  document.addEventListener('keydown', function (e) {
    const focusables = getVisibleFocusables();
    if (focusables.length === 0) return;
    const current = document.activeElement;
    const idx = focusables.indexOf(current);
    const safeIdx = idx === -1 ? 0 : idx;

    const isStepperRow = current && current.classList && current.classList.contains('setting-row') && current.dataset.setting;
    if (isStepperRow && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      stepSetting(current, e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (isStepperRow && e.key === 'Enter') {
      e.preventDefault();
      stepSetting(current, 1);
      return;
    }

    if (e.key === 'ArrowDown')       { e.preventDefault(); focusInDirection(safeIdx, 'down',  focusables); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); focusInDirection(safeIdx, 'up',    focusables); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); focusInDirection(safeIdx, 'left',  focusables); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusInDirection(safeIdx, 'right', focusables); }
    else if (e.key === 'Enter') {
      if (current && current.click) { e.preventDefault(); current.click(); }
    } else if (e.key === 'Escape') {
      if (!detailOverlay.classList.contains('hidden')) {
        e.preventDefault();
        dismissOverlay();
      } else if (!screens.home.classList.contains('hidden')) {
        // already home
      } else {
        e.preventDefault();
        showScreen('home');
      }
    }
  });

  async function init() {
    loadPrefs();
    const t = bootstrapToken();
    if (!t) {
      showError('Not connected', 'Open the setup page on your phone to pair this app with your Oura account.');
      return;
    }
    const cached = loadCache();
    if (cached) { data = cached; renderHome(); }
    showScreen('home');
    await refreshData();
    scheduleRefresh();
  }

  init();
})();
