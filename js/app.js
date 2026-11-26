// UI wiring: controls, animation loop, inspector, census, presets,
// time-lapse and shareable links.
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const planet = new Planet();
  const canvas = $('planet');
  const renderer = new Renderer(canvas, planet);

  const el = {
    seed: $('seed'), seedForm: $('seedForm'), randomSeed: $('randomSeed'), seedError: $('seedError'),
    ocean: $('ocean'), temp: $('temp'), moisture: $('moisture'), rough: $('rough'), melt: $('melt'), axial: $('axial'), tiltOut: $('tiltOut'),
    legend: $('legend'), disasterTypes: $('disasterTypes'), strength: $('strength'), strengthOut: $('strengthOut'),
    arm: $('arm'), recover: $('recover'), report: $('report'), reportWrap: $('reportWrap'), mute: $('mute'), play: $('play'), dpad: $('dpad'), gameMsg: $('gameMsg'), scene: $('scene'), themes: $('themes'), savePlanet: $('savePlanet'), gallery: $('gallery'),
    oceanOut: $('oceanOut'), tempOut: $('tempOut'), moistOut: $('moistOut'), roughOut: $('roughOut'),
    timelapse: $('timelapse'), presets: $('presets'),
    planetName: $('planetName'), planetClass: $('planetClass'),
    viewGlobe: $('viewGlobe'), viewMap: $('viewMap'), busy: $('busy'),
    pause: $('pause'), daySpeed: $('daySpeed'), spinSpeed: $('spinSpeed'), clouds: $('clouds'), cities: $('cities'),
    inspect: $('inspect'), stats: $('stats'),
    copyLink: $('copyLink'), snapshot: $('snapshot'), loadForm: $('loadForm'), loadCode: $('loadCode'), shareMsg: $('shareMsg'),
  };

  const view = { yaw: 0, sunLon: 1.2, sunDec: 0.3, cloudShift: 0, clouds: true, cities: true, days: 0 };
  const life = new Life(planet, renderer, view);
  const dis = new Disasters(planet, life);
  renderer.damage = dis.damage; renderer.dtype = dis.dtype;
  const world = new World(planet, life, dis); // [FEATURE] nations, war, pandemics, human impact, cataclysms
  renderer.world = world;
  life.decorate = (ctx, row, col, W, H, gy) => world.decorateScene(ctx, row, col, W, H, gy);
  let sunPos = null;
  renderer.overlay = (ctx) => { drawSun(ctx); life.draw(ctx); dis.draw(ctx); world.draw(ctx, (r, c) => life.project(r, c), renderer, sunPos); drawClock(ctx); };
  const state = {
    paused: false,
    needClassify: false,
    genToken: 0,
    timelapse: null,     // { start, from, to, duration }
    inspected: null,     // { row, col }
    season: 0,
    drag: null,
  };

  // ---------- helpers ----------
  const readClimate = () => ({
    ocean: Number(el.ocean.value) / 100,
    temp: Number(el.temp.value) + (world.ready ? world.warming : 0),       // [FEATURE] human-driven warming
    moisture: Number(el.moisture.value) / 100 - (world.ready ? world.drying : 0),
    meltRaisesSea: el.melt.checked,
  });

  function setSlider(input, value) {
    const v = clamp(Number(value), Number(input.min), Number(input.max));
    input.value = String(Number.isFinite(v) ? Math.round(v) : input.defaultValue);
  }

  function updateLabels() {
    // [FEATURE] show what temperature is doing to the sea right now
    const eff = Math.round(planet.effectiveOcean({ ocean: Number(el.ocean.value) / 100, temp: Number(el.temp.value) + (world.ready ? world.warming : 0), meltRaisesSea: el.melt.checked }) * 100);
    el.oceanOut.textContent = eff === Number(el.ocean.value) ? el.ocean.value + '%' : `${el.ocean.value}% → ${eff}%`;
    el.oceanOut.title = eff > Number(el.ocean.value) ? 'Melting ice is raising the sea' : eff < Number(el.ocean.value) ? 'Heat is evaporating the oceans / water locked in ice' : '';
    const t = Number(el.temp.value);
    el.tempOut.textContent = (t > 0 ? '+' : '') + t + ' °C';
    const m = Number(el.moisture.value);
    el.moistOut.textContent = (m > 0 ? '+' : '') + m + '%';
    el.roughOut.textContent = el.rough.value;
    el.tiltOut.textContent = el.axial.value + '°';
  }

  function showSeedError(msg) {
    el.seedError.textContent = msg || '';
    el.seedError.hidden = !msg;
  }

  const ADJ = ['amber', 'cobalt', 'misty', 'silent', 'golden', 'frozen', 'emerald', 'rusty', 'lunar', 'stormy', 'coral', 'violet'];
  const NOUN = ['harbor', 'drift', 'ridge', 'bloom', 'ember', 'tide', 'cradle', 'dune', 'grove', 'nova', 'reef', 'atlas'];
  function randomSeed() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return `${pick(ADJ)}-${pick(NOUN)}-${Math.floor(Math.random() * 1000)}`;
  }

  // [FIX B2] Impact-winter cooling belongs to one planet/scenario. Undo it (fresh planet) or
  // forget it (user picked a new temperature) so it can never leak or be re-applied later.
  function undoWinter() {
    if (!winterApplied) return;
    setSlider(el.temp, Number(el.temp.value) + winterApplied);
    winterApplied = 0; updateLabels();
  }
  function forgetWinter() { winterApplied = 0; }

  // ---------- generation ----------
  function generate() {
    const seed = normaliseSeed(el.seed.value);
    if (!seed) { showSeedError('Enter a seed (any text or number), or press 🎲.'); return; }
    showSeedError('');
    el.seed.value = seed;
    const rough = Number(el.rough.value) / 100;
    const token = ++state.genToken;
    Sfx.generate();
    el.busy.hidden = false;
    // Let the "Generating…" overlay paint before the heavy loop runs.
    if (EARTH.isEarthSeed(seed) && !EARTH.tex.ok) { // [EARTH] decode the NASA imagery once, then build
      EARTH.load().then(() => { if (token === state.genToken) { state.genToken--; generate(); } }).catch((err) => { el.busy.hidden = true; showSeedError(err.message); });
      return;
    }
    setTimeout(() => {
      if (token !== state.genToken) return; // a newer request superseded this one
      try {
        planet.generate(seed, rough);
        planet.classify(readClimate());
        if (life.game) life.stopGame(false);
        dis.clear(); el.reportWrap.hidden = true; el.recover.disabled = true; lastReport = null;
        life.populate(10);
        world.build(); onWorldBuilt();
        refreshInfo();
        writeHash();
      } catch (err) {
        showSeedError('Could not generate planet: ' + err.message);
      } finally {
        if (token === state.genToken) el.busy.hidden = true;
      }
    }, 20);
  }

  function reclassify() {
    if (!planet.seed) return;
    planet.classify(readClimate());
    if (world.ready) world.refreshStats(false);
    refreshInfo();
    writeHash();
  }

  // ---------- info panels ----------
  function pct(v) { return (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%'; }

  function refreshInfo() {
    el.planetName.textContent = planet.name();
    el.planetClass.textContent = planet.classification() + ' · seed “' + planet.seed + '”';
    const s = planet.stats;
    const bars = [
      ['Ocean', s.ocean, '#2f7fc4'],
      ['Ice & snow', s.ice, '#dfe9f3'],
      ['Forest', s.forest, '#3a7634'],
      ['Grass & savanna', s.grass, '#9aae4a'],
      ['Desert', s.desert, '#d8b26a'],
      ['Beach', s.beach, '#decc92'], // [FIX B10] so the land/sea buckets add up to 100%
      ['Tundra', s.tundra, '#84927a'],
      ['Mountains', s.rock, '#76685a'],
      ['Settled land (overlaps above)', s.cities, '#ffc46e'],
    ];
    const t = s.avgTemp;
    el.stats.innerHTML =
      `<div class="kpis">
        <div class="kpi"><div class="v">${t > 0 ? '+' : ''}${t.toFixed(1)}°</div><div class="k">avg temp (°C)</div></div>
        <div class="kpi"><div class="v">${pct(s.habitable)}</div><div class="k">habitable</div></div>
        <div class="kpi" style="grid-column:1/-1"><div class="v">👥 ${fmtNum(s.population)}</div><div class="k">population</div></div>
      </div>` +
      bars.map(([n, v, c]) =>
        `<div class="stat"><div class="lbl"><span>${n}</span><b>${pct(v)}</b></div>
         <div class="bar"><i style="width:${clamp(v * 100, 0, 100)}%;background:${c}"></i></div></div>`).join('');
    refreshInspect();
  }

  function refreshInspect() {
    const p = state.inspected;
    if (!p || !planet.seed) return;
    const d = planet.describe(p.row, p.col);
    el.scene.hidden = false;
    life.drawScene(el.scene, p.row, p.col);
    const ns = d.lat >= 0 ? 'N' : 'S', ew = d.lon >= 0 ? 'E' : 'W';
    const alt = d.altitude >= 0 ? `${d.altitude.toLocaleString()} m` : `${(-d.altitude).toLocaleString()} m deep`;
    el.inspect.classList.remove('muted');
    el.inspect.innerHTML =
      `<div class="big">${d.biome}</div>
       <dl>
         <dt>Position</dt><dd>${Math.abs(d.lat).toFixed(1)}°${ns}, ${Math.abs(d.lon).toFixed(1)}°${ew}</dd>
         <dt>${d.altitude >= 0 ? 'Altitude' : 'Depth'}</dt><dd>${alt}</dd>
         <dt>Temperature</dt><dd>${d.temp.toFixed(1)} °C</dd>
         <dt>Moisture</dt><dd>${Math.round(d.moisture * 100)}%</dd>
         <dt>Settlements</dt><dd>${d.settled ? 'yes' : 'none'}</dd>
         <dt>People here</dt><dd>${fmtNum(planet.popD[p.row * MAP_W + p.col] * planet.cosLat[p.row] * planet.popK)}</dd>
         <dt>Right now</dt><dd>${isDaytime(p) ? '☀️ day' : '🌙 night'}</dd>
       </dl>`;
  }

  function isDaytime(p) {
    const lat = (0.5 - (p.row + 0.5) / MAP_H) * Math.PI;
    const lon = ((p.col + 0.5) / MAP_W - 0.5) * Math.PI * 2;
    const light = Math.cos(lat) * Math.cos(lon - view.sunLon) * Math.cos(view.sunDec) + Math.sin(lat) * Math.sin(view.sunDec);
    return light > 0;
  }

  // ---------- share links ----------
  function currentParams() {
    const p = new URLSearchParams();
    p.set('seed', planet.seed || el.seed.value);
    p.set('ocean', el.ocean.value);
    p.set('temp', el.temp.value);
    p.set('moist', el.moisture.value);
    p.set('rough', el.rough.value);
    p.set('melt', el.melt.checked ? '1' : '0');
    p.set('tilt', el.axial.value);
    p.set('theme', planet.theme);
    return p;
  }

  let hashTimer = 0;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      try { history.replaceState(null, '', '#' + currentParams().toString()); } catch (_) { /* file:// in some browsers */ }
    }, 250);
  }

  // Accepts a full URL, "#seed=..", "seed=..&..", or a bare seed string.
  function parseShare(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    let q = raw;
    const hashAt = raw.indexOf('#');
    if (hashAt >= 0) q = raw.slice(hashAt + 1);
    else if (raw.includes('?')) q = raw.slice(raw.indexOf('?') + 1);
    if (!q.includes('=')) return { seed: normaliseSeed(raw) };
    let p;
    try { p = new URLSearchParams(q); } catch (_) { return null; }
    const seed = normaliseSeed(p.get('seed'));
    if (!seed) return null;
    const num = (k) => (p.has(k) && p.get(k).trim() !== '' && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);
    return { seed, ocean: num('ocean'), temp: num('temp'), moist: num('moist'), rough: num('rough'), tilt: num('tilt'), theme: p.get('theme'), melt: p.get('melt') };
  }

  function applyConfig(cfg) {
    if (!cfg || !cfg.seed) return false;
    stopTimelapse();
    undoWinter();
    el.seed.value = cfg.seed;
    if (cfg.ocean !== undefined) setSlider(el.ocean, cfg.ocean);
    if (cfg.temp !== undefined) { setSlider(el.temp, cfg.temp); forgetWinter(); }
    if (cfg.moist !== undefined) setSlider(el.moisture, cfg.moist);
    if (cfg.rough !== undefined) setSlider(el.rough, cfg.rough);
    if (cfg.tilt !== undefined) setSlider(el.axial, cfg.tilt);
    if (isTheme(cfg.theme)) setTheme(cfg.theme, true); // [FIX B1]
    if (cfg.melt === '0' || cfg.melt === '1') el.melt.checked = cfg.melt === '1';
    updateLabels();
    generate();
    return true;
  }

  function flash(msg) {
    el.shareMsg.textContent = msg;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { el.shareMsg.textContent = ''; }, 3500);
  }

  function shareURL() {
    const base = location.href.split('#')[0];
    return base + '#' + currentParams().toString();
  }

  // ---------- presets & time-lapse ----------
  const PRESETS = [
    { name: '🌎 Earthlike', ocean: 70, temp: 5, moist: 5 },
    { name: '🧊 Ice Age', ocean: 60, temp: -16, moist: -5 },
    { name: '🔥 Hothouse', ocean: 55, temp: 24, moist: 0 },
    { name: '🌊 Water World', ocean: 94, temp: 6, moist: 10 },
    { name: '🏜️ Dune', ocean: 8, temp: 14, moist: -35 },
    { name: '🌴 Jungle', ocean: 55, temp: 10, moist: 35 },
  ];
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.addEventListener('click', () => {
      stopTimelapse(); forgetWinter(); // [FIX B2] preset sets its own temperature
      setSlider(el.ocean, p.ocean); setSlider(el.temp, p.temp); setSlider(el.moisture, p.moist);
      updateLabels();
      state.needClassify = true;
    });
    el.presets.appendChild(b);
  }

  function startTimelapse() {
    forgetWinter(); // [FIX B2] the time-lapse drives temperature itself
    state.timelapse = { start: performance.now(), from: -25, to: 25, duration: 12000 };
    el.timelapse.textContent = '⏹ Stop time-lapse';
    el.timelapse.classList.add('active');
  }
  function stopTimelapse() {
    if (!state.timelapse) return;
    state.timelapse = null;
    el.timelapse.textContent = '🌡️ Play warming time-lapse';
    el.timelapse.classList.remove('active');
  }

  // ---------- events ----------
  el.seedForm.addEventListener('submit', (e) => { e.preventDefault(); undoWinter(); generate(); });
  el.randomSeed.addEventListener('click', () => { undoWinter(); el.seed.value = randomSeed(); generate(); });

  for (const input of [el.ocean, el.moisture]) {
    input.addEventListener('input', () => { updateLabels(); state.needClassify = true; });
  }
  el.temp.addEventListener('input', () => { stopTimelapse(); forgetWinter(); updateLabels(); state.needClassify = true; });
  el.melt.addEventListener('change', () => { updateLabels(); state.needClassify = true; });
  el.rough.addEventListener('input', updateLabels);
  el.axial.addEventListener('input', () => { updateLabels(); writeHash(); });
  el.rough.addEventListener('change', generate); // full regen only on release

  el.timelapse.addEventListener('click', () => (state.timelapse ? stopTimelapse() : startTimelapse()));

  function setView(mode) {
    if (life.game && mode === 'map') { flash('The game is played on the globe. Quit the game to use the map.'); return; } // [FIX B4]
    renderer.setMode(mode);
    el.viewGlobe.classList.toggle('on', mode === 'globe');
    el.viewMap.classList.toggle('on', mode === 'map');
    el.viewGlobe.setAttribute('aria-selected', String(mode === 'globe'));
    el.viewMap.setAttribute('aria-selected', String(mode === 'map'));
  }
  el.viewGlobe.addEventListener('click', () => setView('globe'));
  el.viewMap.addEventListener('click', () => setView('map'));

  function togglePause() {
    state.paused = !state.paused;
    el.pause.textContent = state.paused ? '▶ Play' : '⏸ Pause';
    // [FIX B13] make a paused game obvious
    if (life.game) { if (state.paused) { clearTimeout(msgTimer); el.gameMsg.innerHTML = '⏸ <b>Paused</b><br>Space or ▶ Play to resume'; el.gameMsg.hidden = false; } else el.gameMsg.hidden = true; }
  }
  el.pause.addEventListener('click', togglePause);
  el.clouds.addEventListener('change', () => { view.clouds = el.clouds.checked; });
  el.cities.addEventListener('change', () => { view.cities = el.cities.checked; });

  el.copyLink.addEventListener('click', async () => {
    if (!planet.seed) return;
    const url = shareURL();
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied — anyone opening it gets this exact planet.');
    } catch (_) {
      el.loadCode.value = url;
      el.loadCode.select();
      flash('Clipboard blocked — link is in the box below, copy it manually.');
    }
  });

  el.loadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const cfg = parseShare(el.loadCode.value);
    if (applyConfig(cfg)) { flash('Planet loaded.'); el.loadCode.value = ''; }
    else flash('That doesn’t look like a planet link or seed.');
  });

  el.snapshot.addEventListener('click', () => {
    if (!planet.seed) return;
    try {
      const a = document.createElement('a');
      a.download = (planet.name() || 'planet').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.png';
      // [UI] the globe canvas is transparent now: composite it on black for the saved image
      const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
      const oc = out.getContext('2d'); oc.fillStyle = '#000'; oc.fillRect(0, 0, out.width, out.height); oc.drawImage(canvas, 0, 0);
      a.href = out.toDataURL('image/png');
      Sfx.snapshot();
      document.body.appendChild(a); a.click(); a.remove();
    } catch (_) { flash('Could not save the image in this browser.'); }
  });

  window.addEventListener('hashchange', () => {
    const cfg = parseShare(location.hash);
    if (cfg && cfg.seed && location.hash.slice(1) !== currentParams().toString()) applyConfig(cfg);
  });

  // Pointer: drag rotates the globe, a click (little movement) inspects.
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }
  // [FIX B17] two-finger pinch zoom on touch screens
  const touches = new Map(); let pinch = null;
  const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* [FIX B15] pointer already gone */ }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && renderer.mode === 'globe') { pinch = { d0: pinchDist(), z0: renderer.zoom }; state.drag = null; return; }
    state.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) { renderer.setZoom(pinch.z0 * pinchDist() / pinch.d0); return; }
    const d = state.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (renderer.mode === 'globe' && d.moved > 4) {
      canvas.classList.add('dragging');
      view.yaw -= dx * 0.008;
      renderer.setTilt(renderer.tilt + dy * 0.006);
    }
  });
  function endDrag(e) {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; state.drag = null; return; }
    const d = state.drag;
    if (!d || d.id !== e.pointerId) return;
    state.drag = null;
    canvas.classList.remove('dragging');
    if (e.type === 'pointerup' && d.moved <= 4) {
      const p = toCanvas(e);
      const hit = renderer.pick(p.x, p.y, view);
      if (hit && armedKey && !life.game) { doStrike(hit); return; } // [FIX B3]
      if (hit && plagueArmed && !life.game) { releasePlague(hit); return; }
      state.inspected = hit;
      renderer.marker = hit;
      if (hit) { Sfx.inspect(); world.sel = world.regionAt(hit.row, hit.col); world.highlightCity = null; refreshInspect(); renderRegionCard(); }
      else { el.inspect.classList.add('muted'); el.inspect.textContent = 'That’s space. Click the planet to inspect a spot.'; }
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
  document.addEventListener('keydown', (e) => {
    if (life.game) {
      if (KEYMAP[e.code]) { e.preventDefault(); life.keys.add(KEYMAP[e.code]); return; }
      if (e.code === 'Escape') { life.stopGame(false); return; }
      if (e.code === 'Space') { e.preventDefault(); togglePause(); return; } // [FIX B13]
    }
  }, true);
  document.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) life.keys.delete(KEYMAP[e.code]); });
  window.addEventListener('blur', () => life.keys.clear());

  // ---------- mini-game ----------
  let msgTimer = 0;
  function gameMessage(html, ms) {
    el.gameMsg.innerHTML = html; el.gameMsg.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.gameMsg.hidden = true; }, ms);
  }
  function setPlaying(on) {
    el.play.textContent = on ? '⏹ Quit game' : '🎮 Play Creature Catcher';
    el.dpad.hidden = !on;
  }
  el.play.addEventListener('click', () => {
    if (life.game) { life.stopGame(false); return; }
    if (!planet.seed) return;
    stopTimelapse();
    setView('globe');
    if (armedKey) { armedKey = null; syncDisasterUI(); } // [FIX B3]
    if (state.paused) togglePause();
    renderer.setZoom(Math.max(renderer.zoom, 1.4));
    life.startGame();
    Sfx.start();
    setPlaying(true);
    el.play.blur();
    gameMessage('Fly with <b>arrows / WASD</b><br>Catch creatures in daylight ☀️<br>Sleeping ones 💤 can\'t be caught · ⭐ = 5 pts', 3500);
  });
  life.onScore = (g) => Sfx.catch(g.lastPoints || 1);
  life.onAsleep = () => Sfx.asleep();
  life.onTick = () => Sfx.tick();
  life.onGameEnd = (g, finished, newBest) => {
    if (finished) Sfx.end(newBest);
    setPlaying(false);
    life.keys.clear();
    if (finished) gameMessage(`<b>Time!</b> Score <b>${g.score}</b> · ${g.caught} caught<br>${newBest ? '🏆 New best!' : 'Best: ' + life.best}`, 5000);
  };
  for (const b of el.dpad.querySelectorAll('button')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); life.keys.add(k); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => life.keys.delete(k));
  }

  document.addEventListener('keydown', (e) => {
    if (life.game) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return; // [FIX B6] sliders/checkboxes too
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'r' || e.key === 'R') { el.seed.value = randomSeed(); generate(); }
    else if (e.key === 'g' || e.key === 'G') setView('globe');
    else if (e.key === 'm' || e.key === 'M') setView('map');
  });

  // ---------- main loop ----------
  let last = performance.now();
  let inspectTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // clamp after tab switches
    last = now;

    if (state.timelapse) {
      const tl = state.timelapse;
      const k = Math.min(1, (now - tl.start) / tl.duration);
      setSlider(el.temp, tl.from + (tl.to - tl.from) * k);
      updateLabels();
      state.needClassify = true;
      if (k >= 1) stopTimelapse();
    }
    try { // [FIX B1] one bad frame must never stop the animation loop
    if (state.needClassify) { state.needClassify = false; reclassify(); }
    life.update(state.paused ? 0 : dt);
    const prog = dis.update(state.paused ? 0 : dt); // [FIX B12]
    const yrs = state.paused ? 0 : dt * state.yearsPerSec;
    world.update(state.paused ? 0 : dt, yrs);
    life.hidden = world.vanished || world.doomAmt > 0.5;
    if (world.ready && world.warming !== state.labelWarm) { state.labelWarm = world.warming; updateLabels(); }
    if (world.ready && Math.abs(world.warming - (state.lastWarm || 0)) > 0.08) { state.lastWarm = world.warming; state.needClassify = true; }
    if (world.doom && world.doom.applied && el.rebuild.hidden) { el.rebuild.hidden = false; renderRegionCard(); }
    if (prog && lastReport) { el.report.innerHTML = disasterReportHTML(lastReport, prog); if (prog.done) onRecovered(); }

    if (!state.paused) {
      const day = Number(el.daySpeed.value) / 100;   // 0..1
      const spin = Number(el.spinSpeed.value) / 100; // 0..1
      view.sunLon -= dt * day * 1.6;
      view.days += dt * day * 1.6 / (Math.PI * 2);
      if (!state.drag && !life.game) view.yaw += dt * spin * 0.9;
      view.cloudShift += dt * (4 + day * 10);
      state.season += dt * day * 0.12;
      view.sunDec = (Number(el.axial.value) * Math.PI / 180) * Math.sin(state.season);  // axial tilt -> seasons
      if (view.sunLon < -Math.PI * 64) view.sunLon += Math.PI * 64; // keep floats small
      if (view.cloudShift > MAP_W * 1000) view.cloudShift -= MAP_W * 1000;
    }
    const cs = view.cloudShift;
    view.cloudShift = Math.floor(cs);
    renderer.render(view);
    view.cloudShift = cs;

    // keep the inspector's day/night line in sync, cheaply
    if (now - inspectTimer > 500) { inspectTimer = now; if (state.inspected) refreshInspect(); renderRegionCard(); renderWorldStats(); }
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }

  // ---------- zoom ----------
  canvas.addEventListener('wheel', (e) => {
    if (renderer.mode !== 'globe') return;
    e.preventDefault();
    renderer.setZoom(renderer.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  // ---------- legend (rebuilt per theme) ----------
  function buildLegend() {
  el.legend.textContent = '';
  const TH = planet.palette;
  TH.names.forEach((name, id) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.toggle('on', id === renderer.highlight);
    const sw = document.createElement('i');
    sw.style.background = `rgb(${TH.colors[id].join(',')})`;
    btn.append(sw, document.createTextNode(name));
    btn.addEventListener('click', () => {
      renderer.highlight = renderer.highlight === id ? -1 : id;
      [...el.legend.children].forEach((c, k) => c.classList.toggle('on', k === renderer.highlight));
    });
    el.legend.appendChild(btn);
  });
  }
  buildLegend();

  // ---------- world themes ----------
  function setTheme(name, quiet) {
    if (!isTheme(name)) return; // [FIX B1]
    planet.theme = name;
    if (name !== 'earth') { // [FIX B9] disasters are Earth-only: clear scars, report and arming
      dis.clear(); lastReport = null; el.reportWrap.hidden = true; el.recover.disabled = true;
      undoWinter();
      if (armedKey) { armedKey = null; syncDisasterUI(); }
    }
    [...el.themes.children].forEach((b) => {
      const on = b.dataset.theme === name;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    buildLegend();
    if (!quiet) { Sfx.theme(name); state.needClassify = true; if (planet.seed) life.populate(life.game ? 16 : 10); } // [FIX B14]
  }
  for (const [key, t] of Object.entries(THEMES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.theme = key; b.textContent = t.label; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => setTheme(key));
    el.themes.appendChild(b);
  }
  setTheme('earth', true);

  // ---------- saved planets (localStorage, per browser) ----------
  const STORE = 'tinyterra.saved.v1';
  function loadSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.params === 'string' && typeof x.name === 'string') : [];
    } catch (_) { return []; }
  }
  function storeSaved(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (_) { return false; }
  }
  function renderGallery() {
    const list = loadSaved();
    el.gallery.textContent = '';
    if (!list.length) { el.gallery.innerHTML = '<span class="muted" style="grid-column:1/-1;font-size:12px">No saved planets yet.</span>'; return; }
    list.forEach((p, k) => {
      const card = document.createElement('div');
      card.className = 'g'; card.title = 'Load ' + p.name;
      if (typeof p.thumb === 'string' && p.thumb.startsWith('data:image/')) {
        const img = document.createElement('img'); img.src = p.thumb; img.alt = ''; card.appendChild(img);
      }
      card.appendChild(document.createTextNode(p.name)); // textContent: never markup
      const x = document.createElement('button');
      x.className = 'x'; x.textContent = '×'; x.title = 'Remove';
      x.addEventListener('click', (e) => { e.stopPropagation(); const l = loadSaved(); l.splice(k, 1); storeSaved(l); renderGallery(); });
      card.appendChild(x);
      card.addEventListener('click', () => applyConfig(parseShare(p.params)));
      el.gallery.appendChild(card);
    });
  }
  el.savePlanet.addEventListener('click', () => {
    if (!planet.seed) return;
    let thumb = '';
    try {
      const t = document.createElement('canvas'); t.width = t.height = 96;
      const src = renderer.mode === 'globe' ? canvas : null;
      if (src) t.getContext('2d').drawImage(src, 0, 0, src.width, src.height, 0, 0, 96, 96);
      else t.getContext('2d').drawImage(canvas, canvas.width / 4, 0, canvas.height, canvas.height, 0, 0, 96, 96);
      thumb = t.toDataURL('image/jpeg', 0.7);
    } catch (_) { /* thumbnail is optional */ }
    const params = currentParams().toString();
    const list = loadSaved().filter((p) => p.params !== params);
    list.unshift({ name: planet.name(), params, thumb });
    if (!storeSaved(list.slice(0, 12))) { flash('Saving is not available in this browser.'); return; }
    flash('Saved “' + planet.name() + '”.');
    renderGallery();
  });
  renderGallery();

  // ---------- sound toggle + UI clicks ----------
  const syncMute = () => { el.mute.textContent = Sfx.muted ? '🔇' : '🔊'; el.mute.setAttribute('aria-pressed', String(!Sfx.muted)); };
  el.mute.addEventListener('click', () => { Sfx.setMuted(!Sfx.muted); syncMute(); Sfx.click(); });
  syncMute();
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && b !== el.mute && !b.closest('#themes') && b.id !== 'play' && b.id !== 'randomSeed') Sfx.click();
  });

  // ---------- disasters ----------
  let armedKey = null, chosenKey = 'asteroid', lastReport = null, winterApplied = 0;
  for (const key of Object.keys(DISASTERS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.key = key; b.textContent = DISASTERS[key].label;
    b.addEventListener('click', () => { chosenKey = key; syncDisasterUI(); });
    el.disasterTypes.appendChild(b);
  }
  function syncDisasterUI() {
    for (const b of el.disasterTypes.children) b.classList.toggle('on', b.dataset.key === chosenKey);
    el.strengthOut.textContent = DISASTERS[chosenKey].fmt(DISASTERS[chosenKey].value(Number(el.strength.value)));
    el.arm.classList.toggle('active', !!armedKey);
    el.arm.textContent = armedKey ? '✋ Cancel' : '👆 Choose where it hits';
  }
  el.strength.addEventListener('input', syncDisasterUI);
  el.arm.addEventListener('click', () => {
    if (planet.theme !== 'earth') { flash('Disasters run on the 🌍 Earth theme. Switch theme first.'); return; }
    if (life.game) { flash('Finish the game first.'); return; }
    armedKey = armedKey ? null : chosenKey;
    syncDisasterUI();
  });
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && armedKey) { armedKey = null; syncDisasterUI(); } });
  function doStrike(hit) {
    if (planet.theme !== 'earth') { armedKey = null; syncDisasterUI(); return; }
    const rep = dis.strike(armedKey, Number(el.strength.value), hit.row, hit.col);
    armedKey = null; syncDisasterUI();
    if (!rep) return;
    lastReport = rep;
    world.onStrike(rep);
    if (rep.coolC > 0) {               // impact / volcanic winter cools the planet
      const t = Number(el.temp.value);
      setSlider(el.temp, t - rep.coolC);
      winterApplied += t - Number(el.temp.value);
      updateLabels(); state.needClassify = true;
    }
    el.reportWrap.hidden = false;
    el.report.innerHTML = disasterReportHTML(rep, null);
    el.recover.disabled = !!rep.noEffect || !dis.damage.some((x) => x > 0); // [FIX B8]
    state.inspected = hit; renderer.marker = hit; refreshInspect();
    Sfx.disaster(rep.key);
  }
  el.recover.addEventListener('click', () => {
    if (!lastReport || dis.recovering) return;
    if (dis.startRecovery(lastReport.recovery[1])) el.recover.disabled = true;
    else { el.recover.disabled = true; flash('Nothing to recover: that disaster left no damage.'); } // [FIX B8]
  });
  function onRecovered() {
    if (winterApplied) { setSlider(el.temp, Number(el.temp.value) + winterApplied); winterApplied = 0; updateLabels(); state.needClassify = true; }
    el.recover.disabled = true;
  }
  syncDisasterUI();

  // ---------- sun + clock ----------
  // [UI] A realistic sun, as photographed from space: a white-hot disk with limb darkening and faint
  // granulation, a soft white bloom and wide haze, and faint camera diffraction spikes.
  let sunTex = null;
  function makeSunTexture() {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    const r = N / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, '#fffef8'); grad.addColorStop(0.55, '#fff6dc'); grad.addColorStop(0.82, '#ffe3a1'); grad.addColorStop(0.95, '#ffbe62'); grad.addColorStop(1, '#ff9a3a');
    g.fillStyle = grad; g.beginPath(); g.arc(r, r, r, 0, 6.283); g.fill();
    g.globalCompositeOperation = 'source-atop'; const rng = mulberry32(42);
    for (let k = 0; k < 900; k++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * r; g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(200,120,40,0.07)'; g.beginPath(); g.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, 1 + rng() * 2.2, 0, 6.283); g.fill(); }
    return c;
  }
  function paintSun(ctx, px, py, s, alpha) {
    if (!sunTex) sunTex = makeSunTexture();
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    const haze = ctx.createRadialGradient(px, py, 0, px, py, s * 10);
    haze.addColorStop(0, 'rgba(255,244,220,0.22)'); haze.addColorStop(0.35, 'rgba(255,220,170,0.06)'); haze.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(px, py, s * 10, 0, 6.283); ctx.fill();
    const bloom = ctx.createRadialGradient(px, py, s * 0.9, px, py, s * 3.4);
    bloom.addColorStop(0, 'rgba(255,252,240,0.85)'); bloom.addColorStop(0.3, 'rgba(255,240,210,0.28)'); bloom.addColorStop(1, 'rgba(255,225,180,0)');
    ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(px, py, s * 3.4, 0, 6.283); ctx.fill();
    ctx.translate(px, py); ctx.rotate(Math.PI / 4); // faint diffraction spikes
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2); const L = s * 7, gl = ctx.createLinearGradient(0, 0, L, 0);
      gl.addColorStop(0, 'rgba(255,250,235,0.35)'); gl.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(0, -s * 0.06); ctx.lineTo(L, 0); ctx.lineTo(0, s * 0.06); ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sunTex, px - s, py - s, s * 2, s * 2);
    ctx.restore();
  }
  function drawSun(ctx) {
    if (!planet.seed) return;
    const lat = view.sunDec, lon = view.sunLon;
    if (renderer.mode === 'map') {
      let u = lon / (Math.PI * 2) + 0.5; u -= Math.floor(u);
      paintSun(ctx, u * MAP_W, (0.5 - lat / Math.PI) * MAP_H, 7, 0.95);
      return;
    }
    if (!renderer.R) return;
    // sun direction in view space (z toward the viewer)
    const l0 = lon - view.yaw;
    const x2 = Math.cos(lat) * Math.sin(l0), y2 = Math.sin(lat), z2 = Math.cos(lat) * Math.cos(l0);
    const ct = Math.cos(renderer.tilt), st = Math.sin(renderer.tilt);
    const sy = y2 * ct - z2 * st, sz = y2 * st + z2 * ct;
    const len = Math.hypot(x2, sy);
    const W = renderer.canvas.width, R = renderer.R, cx = renderer.cx, cy = renderer.cy;
    if (sz > 0.9) return;                                   // behind the camera: we see the lit face, not the sun
    if (sz < -0.88 || len < 0.2) {                          // directly behind the planet: eclipse halo
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.5);
      g.addColorStop(0, 'rgba(255,220,160,0.55)'); g.addColorStop(0.25, 'rgba(255,180,90,0.18)'); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, 6.283); ctx.fill(); ctx.restore();
      return;
    }
    const dx = x2 / len, dy = sy / len;
    // place it well clear of the globe; partly occluded when it sits behind the planet
    const dist = Math.min(R + 26 + 140 * len, W / 2 - 30);
    const px = cx + dx * dist, py = cy - dy * dist;
    const s = 11 * (W / 800);
    const behind = sz < 0 && dist < R + s;
    sunPos = { x: px, y: py };
    paintSun(ctx, px, py, s, behind ? 0.35 : 1);
  }
  function drawClock(ctx) {
    if (!planet.seed) return;
    const lonC = renderer.mode === 'map' ? 0 : view.yaw;
    let h = 12 + ((lonC - view.sunLon) / (Math.PI * 2)) * 24;
    h = ((h % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const season = view.sunDec > 0.06 ? 'Northern summer' : view.sunDec < -0.06 ? 'Northern winter' : 'Equinox';
    const W = renderer.canvas.width;
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W - 196, 10, 186, 44);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui';
    ctx.fillText(`${hh < 6 || hh >= 19 ? '🌙' : '☀️'} Day ${Math.floor(view.days) + 1} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, W - 18, 16);
    ctx.fillStyle = '#c9d2e3'; ctx.font = '11px system-ui';
    ctx.fillText(`${renderer.mode === 'map' ? 'at 0° longitude' : 'at view centre'} · ${season}`, W - 18, 36);
    ctx.restore();
  }

  // ---------- [FEATURE] world simulation UI ----------
  el.rebuild = $('rebuild');
  const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmtPop = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' bn' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' m' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(Math.round(n)));
  const meter = (v, col) => `<div class="meter"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%;background:${col}"></i></div>`;
  const toneCol = (v) => (v >= 66 ? 'var(--green)' : v >= 40 ? 'var(--orange)' : 'var(--red)');
  state.yearsPerSec = 0;
  let plagueArmed = false, kind = 'Virus';

  function onWorldBuilt() {
    el.rebuild.hidden = true; state.lastWarm = 0;
    const opts = world.regions.map((r, k) => `<option value="${k}">${r.flag} ${esc(r.name)}</option>`).join('');
    $('warA').innerHTML = opts; $('warB').innerHTML = opts;
    if (world.regions.length > 1) $('warB').value = '1';
    const places = [];
    world.regions.forEach((r) => { places.push(r.name); r.cities.forEach((c) => places.push(c.name)); });
    $('places').innerHTML = places.map((p) => `<option value="${esc(p)}"></option>`).join('');
    renderWars(); renderRegionCard(); renderWorldStats(); updatePlagueStatus();
    hideSplash();
  }

  function renderRegionCard() {
    const card = $('regionCard'), r = world.regions[world.sel];
    if (!world.ready || !r) { card.hidden = true; return; }
    card.hidden = false;
    const m = world.mood(r), w = world.weather(r), eco = world.economyLabel(r), op = world.opinionOf(r.id);
    const enemies = [...r.atWar].map((k) => world.regions[k].flag + ' ' + esc(world.regions[k].name)).join(', ');
    const inf = r.pop > 0 ? r.infected / r.pop : 0;
    const pills = [];
    if (r.atWar.size) pills.push(['bad', '⚔️ At war']);
    if (r.lockdown) pills.push(['bad', '🔒 Lockdown']); else if (r.masks) pills.push(['', '😷 Masks advised']);
    if (world.inDrought(r)) pills.push(['bad', '🏜️ Drought']); else if (r.water < 0.25) pills.push(['', '🌵 Naturally arid']);
    if (r.crops < 0.3) pills.push(['bad', '🌾 Crop failure']); else if (r.crops > 0.7) pills.push(['good', '🌾 Good harvests']);
    if (r.shock > 20) pills.push(['bad', '🕯️ Mourning']);
    card.innerHTML = `
      <div class="rc-head"><span class="flag">${r.flag}</span><div><div class="rc-name">${esc(r.name)}</div><div class="rc-gov">${r.gov ? esc(r.gov) + ' · ' : ''}${eco.govState}${r.disputed ? `<br><span style="color:var(--orange)">${esc(r.disputed)}</span>` : ''}</div></div></div>
      <div class="kpis"><div class="kpi"><div class="v">${fmtPop(r.pop)}</div><div class="k">population</div></div><div class="kpi"><div class="v" style="color:#ff6961">${fmtPop(r.dead)}</div><div class="k">deaths</div></div></div>
      <div class="mood"><span class="e">${m.emoji}</span><div class="l"><b>People feel: ${m.label}</b>${meter(m.v, toneCol(m.v))}</div></div>
      <div class="rc-row"><span>Public approval of government</span><b>${r.approval.toFixed(0)}%</b></div>${meter(r.approval, toneCol(r.approval))}
      <div class="rc-row"><span>Economy</span><b>${r.economy.toFixed(0)}/100 · ${eco.trend}</b></div>${meter(r.economy, toneCol(r.economy))}
      <div class="rc-row"><span>Weather now</span><b>${w.emoji} ${w.text}</b></div>
      <div class="rc-row"><span>Crops</span><b>${(r.crops * 100).toFixed(0)}%</b></div>${meter(r.crops * 100, toneCol(r.crops * 100))}
      <div class="rc-row"><span>Fresh water</span><b>${(r.water * 100).toFixed(0)}%</b></div>${meter(r.water * 100, toneCol(r.water * 100))}
      ${enemies ? `<div class="rc-row"><span>At war with</span><b>${enemies}</b></div>` : ''}
      ${op && op.hostile ? `<div class="rc-row"><span>Public opinion is most hostile to</span><b>${op.hostile.flag} ${esc(op.hostile.name)} (${op.hostileV.toFixed(0)})</b></div>` : ''}
      ${op && op.friend ? `<div class="rc-row"><span>…and warmest toward</span><b>${op.friend.flag} ${esc(op.friend.name)} (+${op.friendV.toFixed(0)})</b></div>` : ''}
      ${world.plague && r.cases > 0 ? `<div class="rc-row"><span>🦠 ${esc(world.plague.name)}: total cases so far</span><b>${fmtPop(r.cases)}</b></div>
        <div class="rc-row"><span>Sick right now · deaths</span><b>${fmtPop(r.infected)} · ${fmtPop(r.plagueDead)}</b></div>
        <div class="rc-row"><span>First case</span><b>year ${Math.floor(r.firstCase)}${world.spreads.find((x) => x.b === r.id && x.route !== 'origin') ? ' via ' + (world.spreads.find((x) => x.b === r.id).route === 'air' ? '✈️ air travel from ' : '🚶 the border with ') + esc(world.regions[world.spreads.find((x) => x.b === r.id).a].name) : ' (outbreak started here)'}</b></div>` : ''}
      ${r.cities.length ? `<div class="rc-row"><span>Cities</span><b>${r.cities.slice(0, 6).map((c) => esc(c.name)).join(', ')}</b></div>` : ''}
      <div class="tagrow">${pills.map(([k, t]) => `<span class="tag-pill ${k}">${t}</span>`).join('')}</div>
      ${stanceHTML(r)}`;
    card.querySelectorAll('[data-stance]').forEach((b) => b.addEventListener('click', () => {
      const [wi, s] = b.dataset.stance.split(':').map(Number), w = world.wars[wi]; if (!w) return;
      world.setStance(w, r.id, s); Sfx.click(); renderWars(); renderRegionCard();
    }));
  }
  function stanceHTML(r) {
    return world.wars.map((w, wi) => {
      if (w.a === r.id || w.b === r.id) return '';
      const A = world.regions[w.a], Bq = world.regions[w.b], cur = w.stance[r.id];
      const opts = [[-2, `⚔️ Fight for ${A.flag}`], [-1, `🤝 Back ${A.flag}`], [0, '🕊️ Neutral'], [1, `🤝 Back ${Bq.flag}`], [2, `⚔️ Fight for ${Bq.flag}`]];
      const now = cur === 0 ? 'neutral' : `${STANCE_LABEL[cur].toLowerCase()} ${(cur < 0 ? A : Bq).name}`;
      return `<div class="rc-row"><span>Stance on ${A.flag} vs ${Bq.flag}</span><b>${esc(now)}</b></div>
        <div class="stances">${opts.map(([v, t]) => `<button type="button" class="${v === cur ? 'on' : ''}" data-stance="${wi}:${v}">${t}</button>`).join('')}</div>`;
    }).join('');
  }

  function renderWorldStats() {
    if (!world.ready) return;
    const items = [
      ['📅', `Year ${Math.floor(world.year)}`, 'since start'], ['👥', fmtPop(world.worldPop), 'people alive'],
      ['🪦', fmtPop(world.worldDead), 'deaths'], ['🌡️', `+${world.warming.toFixed(2)} °C`, 'human warming'],
      ['🦋', `${world.wildlife.toFixed(0)}%`, 'wildlife left'], ['🧬', fmtPop(world.speciesLost), 'species lost'],
      ['💧', `${Math.max(0, 100 - world.drying * 250).toFixed(0)}%`, 'fresh water'], ['⚔️', String(world.wars.length), 'active wars'],
    ];
    $('worldStats').innerHTML = items.map(([e, v, k]) => `<div class="kpi"><div class="v">${e} ${v}</div><div class="k">${k}</div></div>`).join('');
    updatePlagueStatus();
  }

  function renderWars() {
    const flags = (list) => list.map((x) => (Math.abs(x.s) === 2 ? '⚔️' : '') + world.regions[x.k].flag).join(' ') || '—';
    $('warList').innerHTML = world.wars.map((w, k) => { const sd = world.sides(w); return `<div class="row warrow"><div><b>${world.regions[w.a].flag} ${esc(world.regions[w.a].name)} ⚔️ ${world.regions[w.b].flag} ${esc(world.regions[w.b].name)}</b>
      <div class="side">With ${esc(world.regions[w.a].name)}: ${flags(sd.A)}</div><div class="side">With ${esc(world.regions[w.b].name)}: ${flags(sd.B)}</div><div class="side">Neutral: ${sd.N.length} nations</div></div>
      <button type="button" data-k="${k}">🕊️ Peace</button></div>`; }).join('');
    $('warList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const w = world.wars[Number(b.dataset.k)]; if (w) world.makePeace(w.a, w.b); renderWars(); renderRegionCard(); }));
  }
  $('declareWar').addEventListener('click', () => {
    if (!world.ready) return;
    const a = Number($('warA').value), b = Number($('warB').value);
    if (a === b) { flash('Pick two different nations.'); return; }
    if (world.doom) { flash('The planet is gone. Make a new one first.'); return; }
    if (!world.declareWar(a, b)) { flash('They are already at war.'); return; }
    Sfx.disaster('quake');
    if (state.yearsPerSec === 0) setSpeed(2);
    world.sel = a; renderWars(); renderRegionCard();
    flash(`${world.regions[a].name} declared war on ${world.regions[b].name}. Time is running so you can watch it unfold.`);
  });

  function setSpeed(v) {
    state.yearsPerSec = v;
    for (const b of $('timeSpeed').children) b.classList.toggle('on', Number(b.dataset.v) === v);
  }
  for (const b of $('timeSpeed').children) b.addEventListener('click', () => setSpeed(Number(b.dataset.v)));

  const syncLab = () => {
    $('pR0Out').textContent = Number($('pR0').value).toFixed(1);
    $('pLethOut').textContent = (Number($('pLeth').value) / 2).toFixed(1) + '%';
    $('pCureOut').textContent = $('pCure').value + '/10';
  };
  ['pR0', 'pLeth', 'pCure'].forEach((id) => $(id).addEventListener('input', syncLab)); syncLab();
  for (const b of $('pKind').children) b.addEventListener('click', () => { kind = b.dataset.v; for (const c of $('pKind').children) c.classList.toggle('on', c === b); });
  $('releasePlague').addEventListener('click', () => {
    if (!world.ready || life.game) return;
    plagueArmed = !plagueArmed;
    $('releasePlague').classList.toggle('active', plagueArmed);
    $('releasePlague').textContent = plagueArmed ? '✋ Cancel' : '👆 Choose where it starts';
  });
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && plagueArmed) { plagueArmed = false; $('releasePlague').click(); $('releasePlague').click(); } });
  function releasePlague(hit) {
    plagueArmed = false; $('releasePlague').classList.remove('active'); $('releasePlague').textContent = '👆 Choose where it starts';
    const cfg = { name: ($('pName').value || 'Unknown').trim().slice(0, 24) || 'Unknown', kind, r0: Number($('pR0').value), lethality: Number($('pLeth').value) / 200, cureDifficulty: Number($('pCure').value), air: $('pAir').checked, land: $('pLand').checked, water: $('pWater').checked };
    if (!world.release(cfg, hit.row, hit.col)) { flash('Release it on land where people live.'); return; }
    Sfx.asleep();
    world.sel = world.regionAt(hit.row, hit.col); state.inspected = hit; renderer.marker = hit;
    if (state.yearsPerSec === 0) setSpeed(2);
    flash(`${cfg.name} released in ${world.regions[world.sel].name}.`);
    renderRegionCard(); refreshInspect();
  }
  function updatePlagueStatus() {
    const p = world.plague, out = $('plagueStatus');
    if (!p) { out.textContent = ''; return; }
    const sick = world.regions.reduce((s, r) => s + r.infected, 0), hit = world.regions.filter((r) => r.infected > 0.5 || r.recovered > 0).length;
    const top = world.regions.filter((r) => r.cases > 0).sort((a, b) => b.cases - a.cases).slice(0, 5);
    out.innerHTML = `<b>${esc(p.kind)} “${esc(p.name)}”</b>${p.cured != null ? ` <span style="color:var(--green)">✅ cured in year ${Math.floor(p.cured)}</span>` : ''}: ${fmtPop(world.regions.reduce((s, r) => s + (r.cases || 0), 0))} cases in total · ${fmtPop(sick)} sick now · ${fmtPop(p.totalDead)} dead · ${hit} nations · vaccine ${p.vaccine.toFixed(0)}%` +
      (top.length ? `<div class="toplist">${top.map((r) => `<span>${r.flag} ${esc(r.name)} <b>${fmtPop(r.cases)}</b></span>`).join('')}</div>` : '');
  }

  for (const b of $('dooms').children) b.addEventListener('click', () => {
    if (!world.ready || life.game) return;
    if (!world.startDoom(b.dataset.v)) { flash('The planet is already doomed.'); return; }
    if (b.dataset.v !== 'meteors') { setView('globe'); }
    Sfx.disaster(b.dataset.v === 'meteors' ? 'asteroid' : 'volcano');
    flash({ meteors: 'A meteor storm is hitting the planet…', collision: 'A rogue planet is on a collision course…', supernova: 'The sun is going supernova…', blackhole: 'A black hole is passing close by…' }[b.dataset.v]);
  });
  world.onMeteor = () => {
    const row = Math.floor(MAP_H * (0.15 + Math.random() * 0.7)), col = Math.floor(Math.random() * MAP_W);
    const rep = dis.strike('asteroid', 5 + Math.floor(Math.random() * 4), row, col);
    if (rep) { world.onStrike(rep); lastReport = rep; el.reportWrap.hidden = false; el.report.innerHTML = disasterReportHTML(rep, null); Sfx.disaster('asteroid'); }
  };
  el.rebuild.addEventListener('click', () => { el.seed.value = randomSeed(); generate(); });

  $('realEarth').addEventListener('click', () => {
    stopTimelapse(); undoWinter();
    setSlider(el.ocean, 71); setSlider(el.temp, 0); setSlider(el.moisture, 0); setSlider(el.rough, 50);
    if (planet.theme !== 'earth') setTheme('earth', true);
    updateLabels(); el.seed.value = 'Earth'; generate();
  });

  $('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('search').value.trim().toLowerCase(), msg = $('searchMsg');
    if (!q || !world.ready) return;
    let found = null;
    for (const r of world.regions) for (const c of r.cities) if (!found && c.name.toLowerCase() === q) found = { r, c };
    if (!found) for (const r of world.regions) if (!found && r.name.toLowerCase() === q) found = { r, c: null };
    if (!found) for (const r of world.regions) for (const c of r.cities) if (!found && c.name.toLowerCase().startsWith(q)) found = { r, c };
    if (!found) for (const r of world.regions) if (!found && r.name.toLowerCase().startsWith(q)) found = { r, c: null };
    if (!found) { msg.textContent = planet.isEarth ? 'No match. Try a country or a major city.' : 'No match. On generated planets, search the nation names (or load the real Earth).'; return; }
    const lon = found.c ? found.c.lon : found.r.lon, lat = found.c ? found.c.lat : found.r.lat;
    setView('globe');
    view.yaw = lon * Math.PI / 180; renderer.setTilt(lat * Math.PI / 180);
    const hit = { row: Math.max(0, Math.min(MAP_H - 1, Math.floor((0.5 - lat / 180) * MAP_H))), col: Math.max(0, Math.min(MAP_W - 1, Math.floor((lon / 360 + 0.5) * MAP_W))) };
    if (found.c && planet.elev[hit.row * MAP_W + hit.col] < planet.seaLevel) { // [FIX] coastal cities: snap to the nearest land pixel
      let best = null;
      for (let d = 1; d <= 4 && !best; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        const rr = hit.row + dy, cc = (hit.col + dx + MAP_W) % MAP_W; if (rr < 0 || rr >= MAP_H) continue;
        if (!best && planet.elev[rr * MAP_W + cc] >= planet.seaLevel) best = { row: rr, col: cc };
      }
      if (best) { hit.row = best.row; hit.col = best.col; }
    }
    state.inspected = hit; renderer.marker = hit; world.sel = found.r.id; world.highlightCity = found.c ? found.c.name : null;
    msg.textContent = found.c ? `${found.c.name}, ${found.r.name}` : found.r.name;
    Sfx.inspect(); refreshInspect(); renderRegionCard();
  });

  // ---------- [UI] tabs and the "what happens when I click" banner ----------
  function showTab(group, name) {
    const bar = document.querySelector(`[data-tabs="${group}"]`); if (!bar) return;
    for (const b of bar.children) b.classList.toggle('on', b.dataset.tab === name);
    for (const p of bar.parentElement.querySelectorAll(':scope > .pane')) p.hidden = p.dataset.pane !== name;
  }
  document.querySelectorAll('[data-tabs]').forEach((bar) => bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => showTab(bar.dataset.tabs, b.dataset.tab))));
  function updateHint() {
    const h = $('actionHint');
    const msg = armedKey ? `👆 Click a spot on the planet to drop the ${DISASTERS[armedKey].label.replace(/^\S+\s/, '')}` : plagueArmed ? `👆 Click a spot on the planet where ${esc($('pName').value || 'the disease')} starts` : '';
    h.hidden = !msg; if (msg) h.innerHTML = msg + ' <span>Esc to cancel</span>';
  }
  setInterval(updateHint, 150);
  $('searchForm').addEventListener('submit', () => showTab('R', 'place'), true);
  canvas.addEventListener('pointerup', () => { if (world.sel >= 0) showTab('R', 'place'); });

  // ---------- [FEATURE] The Great Reset: everything back to normal, switches included ----------
  function greatReset() {
    if (life.game) life.stopGame(false);
    stopTimelapse(); forgetWinter();
    if (armedKey) { armedKey = null; syncDisasterUI(); }
    if (plagueArmed) { plagueArmed = false; $('releasePlague').classList.remove('active'); $('releasePlague').textContent = '👆 Choose where it starts'; }
    const earth = planet.isEarth;
    setSlider(el.ocean, earth ? 71 : 60); setSlider(el.temp, 0); setSlider(el.moisture, 0); setSlider(el.rough, 50); setSlider(el.axial, 23);
    el.melt.checked = true; el.clouds.checked = true; el.cities.checked = true; view.clouds = true; view.cities = true;
    el.daySpeed.value = 30; el.spinSpeed.value = 25; el.strength.value = 5; chosenKey = 'asteroid'; syncDisasterUI();
    $('pName').value = 'Crimson Flu'; $('pR0').value = 3; $('pLeth').value = 4; $('pCure').value = 5; $('pAir').checked = true; $('pLand').checked = true; $('pWater').checked = false; syncLab();
    kind = 'Virus'; for (const c of $('pKind').children) c.classList.toggle('on', c.dataset.v === 'Virus');
    setSpeed(0); if (state.paused) togglePause();
    renderer.highlight = -1; [...el.legend.children].forEach((c) => c.classList.remove('on'));
    renderer.setZoom(1); renderer.setTilt(0.35); setView('globe');
    state.inspected = null; renderer.marker = null; el.scene.hidden = true; el.inspect.classList.add('muted'); el.inspect.textContent = 'Click the planet to inspect a spot.';
    $('search').value = ''; $('searchMsg').textContent = '';
    showTab('L', 'planet'); showTab('R', 'place');
    updateLabels();
    generate(); // rebuild the same planet fresh: no wars, plagues, disasters, warming or doom
    flash('Everything is back to normal.');
  }
  $('greatReset').addEventListener('click', greatReset);

  // ---------- [UI] splash screen on every load ----------
  const splashStart = performance.now();
  function hideSplash() {
    const sp = $('splash'); if (!sp || sp.classList.contains('out')) return;
    setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 700); }, Math.max(0, 1600 - (performance.now() - splashStart)));
  }
  setTimeout(hideSplash, 9000); // never get stuck behind the splash

  // ---------- boot ----------
  updateLabels();
  const fromHash = parseShare(location.hash);
  if (!applyConfig(fromHash)) { el.seed.value = randomSeed(); generate(); }
  requestAnimationFrame(frame);
})();
