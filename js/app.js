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
    legend: $('legend'), mute: $('mute'), play: $('play'), dpad: $('dpad'), gameMsg: $('gameMsg'), scene: $('scene'), themes: $('themes'), savePlanet: $('savePlanet'), gallery: $('gallery'),
    oceanOut: $('oceanOut'), tempOut: $('tempOut'), moistOut: $('moistOut'), roughOut: $('roughOut'),
    timelapse: $('timelapse'), presets: $('presets'),
    planetName: $('planetName'), planetClass: $('planetClass'),
    viewGlobe: $('viewGlobe'), viewMap: $('viewMap'), busy: $('busy'),
    pause: $('pause'), daySpeed: $('daySpeed'), spinSpeed: $('spinSpeed'), clouds: $('clouds'), cities: $('cities'),
    inspect: $('inspect'), stats: $('stats'),
    copyLink: $('copyLink'), snapshot: $('snapshot'), loadForm: $('loadForm'), loadCode: $('loadCode'), shareMsg: $('shareMsg'),
  };

  const view = { yaw: 0, sunLon: 1.2, sunDec: 0.3, cloudShift: 0, clouds: true, cities: true };
  const life = new Life(planet, renderer, view);
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
    temp: Number(el.temp.value),
    moisture: Number(el.moisture.value) / 100,
    meltRaisesSea: el.melt.checked,
  });

  function setSlider(input, value) {
    const v = clamp(Number(value), Number(input.min), Number(input.max));
    input.value = String(Number.isFinite(v) ? Math.round(v) : input.defaultValue);
  }

  function updateLabels() {
    el.oceanOut.textContent = el.ocean.value + '%';
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
    setTimeout(() => {
      if (token !== state.genToken) return; // a newer request superseded this one
      try {
        planet.generate(seed, rough);
        planet.classify(readClimate());
        if (life.game) life.stopGame(false);
        life.populate(10);
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
      ['Tundra', s.tundra, '#84927a'],
      ['Mountains', s.rock, '#76685a'],
      ['Settled land', s.cities, '#ffc46e'],
    ];
    const t = s.avgTemp;
    el.stats.innerHTML =
      `<div class="kpis">
        <div class="kpi"><div class="v">${t > 0 ? '+' : ''}${t.toFixed(1)}°</div><div class="k">avg temp (°C)</div></div>
        <div class="kpi"><div class="v">${pct(s.habitable)}</div><div class="k">habitable</div></div>
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
    el.seed.value = cfg.seed;
    if (cfg.ocean !== undefined) setSlider(el.ocean, cfg.ocean);
    if (cfg.temp !== undefined) setSlider(el.temp, cfg.temp);
    if (cfg.moist !== undefined) setSlider(el.moisture, cfg.moist);
    if (cfg.rough !== undefined) setSlider(el.rough, cfg.rough);
    if (cfg.tilt !== undefined) setSlider(el.axial, cfg.tilt);
    if (cfg.theme && THEMES[cfg.theme]) setTheme(cfg.theme, true);
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
      stopTimelapse();
      setSlider(el.ocean, p.ocean); setSlider(el.temp, p.temp); setSlider(el.moisture, p.moist);
      updateLabels();
      state.needClassify = true;
    });
    el.presets.appendChild(b);
  }

  function startTimelapse() {
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
  el.seedForm.addEventListener('submit', (e) => { e.preventDefault(); generate(); });
  el.randomSeed.addEventListener('click', () => { el.seed.value = randomSeed(); generate(); });

  for (const input of [el.ocean, el.moisture]) {
    input.addEventListener('input', () => { updateLabels(); state.needClassify = true; });
  }
  el.temp.addEventListener('input', () => { stopTimelapse(); updateLabels(); state.needClassify = true; });
  el.melt.addEventListener('change', () => { state.needClassify = true; });
  el.rough.addEventListener('input', updateLabels);
  el.axial.addEventListener('input', () => { updateLabels(); writeHash(); });
  el.rough.addEventListener('change', generate); // full regen only on release

  el.timelapse.addEventListener('click', () => (state.timelapse ? stopTimelapse() : startTimelapse()));

  function setView(mode) {
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
      a.href = canvas.toDataURL('image/png');
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
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    state.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
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
    const d = state.drag;
    if (!d || d.id !== e.pointerId) return;
    state.drag = null;
    canvas.classList.remove('dragging');
    if (e.type === 'pointerup' && d.moved <= 4) {
      const p = toCanvas(e);
      const hit = renderer.pick(p.x, p.y, view);
      state.inspected = hit;
      renderer.marker = hit;
      if (hit) { Sfx.inspect(); refreshInspect(); }
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
    if (tag === 'INPUT' && e.target.type === 'text') return;
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
    if (state.needClassify) { state.needClassify = false; reclassify(); }
    life.update(state.paused ? 0 : dt);

    if (!state.paused) {
      const day = Number(el.daySpeed.value) / 100;   // 0..1
      const spin = Number(el.spinSpeed.value) / 100; // 0..1
      view.sunLon -= dt * day * 1.6;
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
    if (state.inspected && now - inspectTimer > 500) { inspectTimer = now; refreshInspect(); }
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
    if (!THEMES[name]) return;
    planet.theme = name;
    [...el.themes.children].forEach((b) => {
      const on = b.dataset.theme === name;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    buildLegend();
    if (!quiet) { Sfx.theme(name); state.needClassify = true; if (planet.seed && !life.game) life.populate(10); }
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

  // ---------- boot ----------
  updateLabels();
  const fromHash = parseShare(location.hash);
  if (!applyConfig(fromHash)) { el.seed.value = randomSeed(); generate(); }
  requestAnimationFrame(frame);
})();
