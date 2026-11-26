// World simulation layered on top of the planet: nations (real countries on Earth,
// generated nations elsewhere), population, mood, public opinion, economy, crops & water,
// wars, pandemics, human impact over time, and planet-ending cataclysms.
'use strict';

// [FEATURE] real photos for events (Wikimedia Commons, freely licensed; see README credits)
const SCENE_PHOTOS = {};
for (const k of ['drought', 'quake', 'war', 'flood', 'fire', 'volcano', 'impact', 'plague', 'lava',
  'b_desert', 'b_forest', 'b_rainforest', 'b_grass', 'b_savanna', 'b_tundra', 'b_snow', 'b_mountain', 'b_beach', 'b_ocean', 'b_seaice']) {
  const im = new Image(); im.src = 'assets/scenes/' + k + '.jpg'; SCENE_PHOTOS[k] = im;
}
function drawPhoto(ctx, im, W, H) { // "cover" fit, slightly darkened at the bottom for the caption
  const s = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
  ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

const STANCE_LABEL = { '-2': 'Fighting alongside', '-1': 'Backing', '0': 'Neutral', '1': 'Backing', '2': 'Fighting alongside' };
const GOVS = ['Parliamentary republic', 'Presidential republic', 'Constitutional monarchy', 'Federation', 'One-party state', 'Military junta', 'Theocracy', 'Direct democracy'];
const NATION_SYL = ['ar', 'bel', 'cor', 'dan', 'el', 'fen', 'gar', 'hal', 'is', 'jor', 'kal', 'lor', 'mar', 'nor', 'os', 'pel', 'quin', 'ros', 'sal', 'tor', 'ul', 'var', 'wen', 'zan'];
const NATION_END = ['ia', 'land', 'stan', 'or', 'ica', 'heim', 'ova', 'aria', 'ea', 'ar'];

function regionRecord(id, o) {
  return Object.assign({
    id, name: '', flag: '🏳️', gov: '', econ0: 50, real: false,
    pop: 0, pop0: 0, dead: 0, warDead: 0, plagueDead: 0, disasterDead: 0, famineDead: 0, doomDead: 0,
    happiness: 65, approval: 55, economy: 50, crops: 0.6, water: 0.6, avgT: 15, avgM: 0.5, land: 0,
    atWar: new Set(), warYears: 0, shock: 0, infected: 0, recovered: 0, vaccinated: 0, masks: false, lockdown: false,
    cities: [], lon: 0, lat: 0, cap: 0,
  }, o);
}

class World {
  constructor(planet, life, dis) {
    this.planet = planet; this.life = life; this.dis = dis;
    const N = MAP_W * MAP_H;
    this.region = new Uint8Array(N).fill(255);
    this.border = new Uint8Array(N);
    this.front = new Float32Array(N);   // war front intensity
    this.foot = new Float32Array(N);    // human footprint (farmland, cities, deforestation)
    this.regions = []; this.adj = []; this.views = [];
    this.sel = -1; this.ready = false;
    this.tR = new Float32Array(256); this.tG = new Float32Array(256); this.tB = new Float32Array(256); this.tA = new Float32Array(256);
    this.reset();
  }

  reset() {
    this.year = 0; this.warming = 0; this.drying = 0; this.wildlife = 100; this.speciesLost = 0;
    this.wars = []; this.plague = null; this.spreads = []; this.doom = null; this.doomAmt = 0; this.vanished = false;
    this.front.fill(0); this.foot.fill(0); this.events = [];
  }

  // ---------- build regions after a planet is generated ----------
  build() {
    const P = this.planet, N = MAP_W * MAP_H;
    this.reset(); this.sel = -1;
    this.region.fill(255); this.border.fill(0);
    this.regions = [];
    const lonOf = (x) => ((x + 0.5) / MAP_W - 0.5) * 360;
    if (P.isEarth) {
      COUNTRY_DATA.forEach((c, id) => this.regions.push(regionRecord(id, { name: c.name, a3: c.a3, flag: flagOf(c.iso2), gov: GOV_BY_A3[c.a3] || '', disputed: DISPUTED[c.a3] || '', econ0: c.econ, real: true, realPop: c.pop, cont: c.cont, sub: c.sub, polys: c.polys })));
      for (let y = 0; y < MAP_H; y++) {
        const lat = P.latRad[y] * 57.29578;
        for (let x = 0; x < MAP_W; x++) { const id = EARTH.countryAt(lonOf(x), lat); if (id >= 0) this.region[y * MAP_W + x] = id; }
      }
      for (const [name, a3, lon, lat, popM] of CITIES) {
        const id = EARTH.byA3.get(a3);
        if (id !== undefined) this.regions[id].cities.push({ name, lon, lat, pop: popM * 1e6 });
      }
    } else {
      const rng = mulberry32(hashString('nations:' + P.seed));
      const K = 10 + Math.floor(rng() * 6), seeds = [];
      for (let tries = 0; tries < 4000 && seeds.length < K; tries++) {
        const y = Math.floor(rng() * MAP_H), x = Math.floor(rng() * MAP_W), i = y * MAP_W + x;
        if (P.elev[i] < P.seaLevel || Math.abs(P.latRad[y]) > 1.15) continue;
        const v = [P.cosLat[y] * Math.cos((lonOf(x)) / 57.29578), P.sinLat[y], P.cosLat[y] * Math.sin(lonOf(x) / 57.29578)];
        if (seeds.some((s) => s.v[0] * v[0] + s.v[1] * v[1] + s.v[2] * v[2] > 0.93)) continue; // keep capitals apart
        seeds.push({ v, x, y });
      }
      const word = () => { let w = ''; const n = 1 + Math.floor(rng() * 2); for (let k = 0; k < n; k++) w += NATION_SYL[Math.floor(rng() * NATION_SYL.length)]; w += NATION_END[Math.floor(rng() * NATION_END.length)]; return w[0].toUpperCase() + w.slice(1); };
      const flags = ['🟥', '🟦', '🟩', '🟨', '🟪', '🟧', '⬛', '⬜', '🟫', '🔷', '🔶', '🔺', '🌟', '🌙', '⚜️', '🔱'];
      seeds.forEach((s, id) => this.regions.push(regionRecord(id, { name: word(), flag: flags[id % flags.length], gov: GOVS[Math.floor(rng() * GOVS.length)], econ0: 15 + Math.floor(rng() * 75) })));
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const lon = lonOf(x) / 57.29578, px = P.cosLat[y] * Math.cos(lon), py = P.sinLat[y], pz = P.cosLat[y] * Math.sin(lon);
        let best = -2, bi = 255;
        for (let k = 0; k < seeds.length; k++) { const v = seeds[k].v, d = v[0] * px + v[1] * py + v[2] * pz; if (d > best) { best = d; bi = k; } }
        this.region[y * MAP_W + x] = bi;
      }
      // a capital at the seed plus two more towns at the most settled spots
      this.regions.forEach((r, id) => {
        const s = seeds[id]; r.cities.push({ name: word(), lon: lonOf(s.x), lat: P.latRad[s.y] * 57.29578, pop: 0 });
      });
    }
    // borders + adjacency (land pixels whose right/down neighbour is another nation)
    const R = this.regions.length;
    this.adj = Array.from({ length: R }, () => new Float32Array(R));
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x, a = this.region[i]; if (a === 255) continue;
      const j1 = y * MAP_W + ((x + 1) % MAP_W), j2 = y < MAP_H - 1 ? i + MAP_W : i;
      for (const j of [j1, j2]) { const b = this.region[j]; if (b !== 255 && b !== a) { this.border[i] = 1; this.adj[a][b]++; this.adj[b][a]++; } }
    }
    // initial views of other nations: mild, neighbours slightly warmer or cooler
    this.regions.forEach((r) => {
      if (r.real) r.bloc = BLOC_WEST.has(r.a3) ? 'west' : BLOC_EAST.has(r.a3) ? 'east' : null;
      else r.bloc = /one-party|junta|theocracy/i.test(r.gov) ? 'east' : /republic|democracy|monarchy/i.test(r.gov) && (hashString(r.name) % 3 !== 0) ? 'west' : null;
    });
    // [FEATURE] public opinion seeded from real alliances and rivalries (Earth) or from blocs (generated worlds)
    const groupsOf = (a3) => Object.entries(ALLIANCES).filter(([, l]) => l.includes(a3)).map(([g]) => g);
    const rel = new Map(); if (P.isEarth) for (const [x, y, v] of RELATIONS) { rel.set(x + y, v); rel.set(y + x, v); }
    this.views = Array.from({ length: R }, (_, a) => Float32Array.from({ length: R }, (_, b) => {
      if (a === b) return 100;
      const A = this.regions[a], Bq = this.regions[b];
      let v = 5 + ((hashString(a + ':' + b) % 5) - 2);              // mild, near-neutral by default
      if (this.adj[a][b] > 0) v += 5;                                  // neighbours trade and talk
      if (A.real) {
        if (A.cont === Bq.cont) v += 3;
        const ga = groupsOf(A.a3), gb = new Set(groupsOf(Bq.a3)), shared = ga.filter((g) => gb.has(g) && g !== 'AXIS');
        v += Math.min(45, shared.length * 22);
        if (ga.includes('AXIS') && gb.has('AXIS')) v += 30;
        if ((BLOC_WEST.has(A.a3) && BLOC_EAST.has(Bq.a3)) || (BLOC_EAST.has(A.a3) && BLOC_WEST.has(Bq.a3))) v -= 25;
        if (rel.has(A.a3 + Bq.a3)) v = rel.get(A.a3 + Bq.a3);         // known real relationship wins
      } else {
        if (A.bloc && A.bloc === Bq.bloc) v += 35; else if (A.bloc && Bq.bloc) v -= 25;
        v += (hashString(A.name + Bq.name) % 21) - 10;
      }
      return v;
    }));
    this.refreshStats(true);
    this.ready = true;
  }

  // per-region climate & capacity from the current classification
  refreshStats(initPop) {
    const P = this.planet, R = this.regions.length;
    const acc = Array.from({ length: R }, () => ({ n: 0, T: 0, M: 0, cap: 0, crop: 0, lon: 0, lat: 0, w: 0 }));
    for (let y = 0; y < MAP_H; y++) {
      const w = P.cosLat[y], lat = P.latRad[y] * 57.29578;
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x, r = this.region[i];
        if (r === 255 || P.elev[i] < P.seaLevel) continue;
        const a = acc[r], T = P.Tmap[i], M = P.Mmap[i];
        a.n += w; a.T += T * w; a.M += M * w; a.cap += P.popD[i] * w * P.popK;
        a.crop += w * Math.max(0, 1 - Math.abs(T - 18) / 22) * Math.min(1, M * 1.7);
        a.lon += ((x + 0.5) / MAP_W - 0.5) * 360 * w; a.lat += lat * w; a.w += w;
      }
    }
    this.regions.forEach((r, k) => {
      const a = acc[k];
      r.land = a.n; r.cap = a.cap;
      if (a.n > 0) { r.avgT = a.T / a.n; r.avgM = a.M / a.n; r.crops = a.crop / a.n; }
      else { r.avgT = -10; r.avgM = 0; r.crops = 0; }
      r.water = Math.max(0, Math.min(1, r.avgM * 1.35 - Math.max(0, r.avgT - 26) * 0.03 - this.drying));
      if (!r.real && r.cities.length && r.cities[0].pop === 0) r.cities[0].pop = Math.max(2e5, a.cap * 0.08);
      if (initPop) {
        if (a.w > 0) { r.lon = a.lon / a.w; r.lat = a.lat / a.w; }
        r.pop = r.pop0 = r.real ? r.realPop : Math.round(a.cap);
        r.water0 = r.water; // normal water level for this country (deserts are dry, not in drought)
        r.economy = r.econ0; r.approval = 50 + (r.econ0 - 50) * 0.3;
        r.happiness = 55 + r.crops * 20 + (r.econ0 - 50) * 0.2;
      }
    });
  }

  regionAt(row, col) { const r = this.region[row * MAP_W + col]; return r === 255 ? -1 : r; }
  get worldPop() { return this.regions.reduce((s, r) => s + r.pop, 0); }
  get worldDead() { return this.regions.reduce((s, r) => s + r.dead, 0); }

  // ---------- mood & weather (for the cards) ----------
  mood(r) {
    const inf = r.pop > 0 ? r.infected / r.pop : 0;
    if (r.pop < 1) return { emoji: '💀', label: 'No one left', v: 0 };
    if (inf > 0.01) return { emoji: '🤒', label: 'Sick', v: r.happiness };
    if (r.atWar.size) return { emoji: '😨', label: 'Scared (at war)', v: r.happiness };
    if (r.shock > 20) return { emoji: '😢', label: 'Grieving', v: r.happiness };
    const h = r.happiness;
    return h >= 72 ? { emoji: '😄', label: 'Happy', v: h } : h >= 58 ? { emoji: '🙂', label: 'Content', v: h } : h >= 42 ? { emoji: '😟', label: 'Worried', v: h } : h >= 28 ? { emoji: '😢', label: 'Sad', v: h } : { emoji: '😱', label: 'Desperate', v: h };
  }
  weather(r) {
    const T = r.avgT;
    if (this.doom) return { emoji: '☄️', text: 'Apocalyptic' };
    if (T > 32) return { emoji: '🥵', text: `Heatwave · ${T.toFixed(0)} °C` };
    if (T < -8) return { emoji: '❄️', text: `Freezing · ${T.toFixed(0)} °C` };
    if (this.inDrought(r)) return { emoji: '🏜️', text: `Drought · ${T.toFixed(0)} °C` };
    if (r.water < 0.22) return { emoji: '🌵', text: `Arid · ${T.toFixed(0)} °C` };
    if (r.avgM > 0.62) return { emoji: '🌧️', text: `Rainy · ${T.toFixed(0)} °C` };
    if (r.avgM > 0.45) return { emoji: '⛅', text: `Mild, some clouds · ${T.toFixed(0)} °C` };
    return { emoji: '☀️', text: `Sunny · ${T.toFixed(0)} °C` };
  }
  inDrought(r) { return r.water < 0.25 && r.water < (r.water0 == null ? r.water : r.water0) - 0.06; } // [FIX] drier than normal
  economyLabel(r) {
    const e = r.economy, d = e - r.econ0;
    const trend = d < -12 ? 'in recession' : d < -4 ? 'slowing' : d > 3 ? 'growing' : 'stable';
    const govState = this.doom ? 'collapsed' : r.atWar.size ? 'war footing' : r.lockdown ? 'emergency lockdown' : r.approval < 30 ? 'facing protests' : 'functioning normally';
    return { trend, govState };
  }
  opinionOf(a) { // most hostile / friendliest views held by nation a
    const r = this.regions[a]; if (!r) return null;
    let lo = 999, hi = -999, loI = -1, hiI = -1;
    this.views[a].forEach((v, b) => { if (b === a || this.regions[b].pop < 1) return; if (v < lo) { lo = v; loI = b; } if (v > hi) { hi = v; hiI = b; } });
    return { hostile: loI >= 0 && lo <= -15 ? this.regions[loI] : null, hostileV: lo, friend: hiI >= 0 && hi >= 30 ? this.regions[hiI] : null, friendV: hi };
  }

  // ---------- war ----------
  declareWar(a, b, cascade = true) {
    if (a === b || a < 0 || b < 0 || this.doom) return false;
    const A = this.regions[a], B = this.regions[b];
    if (A.atWar.has(b)) return false;
    A.atWar.add(b); B.atWar.add(a);
    if (!cascade) { this.views[a][b] = Math.min(this.views[a][b], -70); this.views[b][a] = Math.min(this.views[b][a], -70); this._markFront(a, b); return true; }
    const war = { a, b, since: this.year, stance: new Int8Array(this.regions.length), joined: [] };
    this.wars.push(war);
    this.views[a][b] = -90; this.views[b][a] = -95;
    A.approval += 8; B.approval += 12;   // rally-round-the-flag at first
    this._markFront(a, b);
    this.events.push({ t: 0, type: 'war', a, b });
    // [FEATURE] every other nation takes a stance: neutral, backing a side, or joining the fight
    this.regions.forEach((c, k) => {
      if (k === a || k === b || c.pop < 1) return;
      let lean = this.views[k][b] - this.views[k][a];                  // + means pro-defender
      if (c.bloc && c.bloc === B.bloc) lean += 30; if (c.bloc && c.bloc === A.bloc) lean -= 30;
      if (this.adj[k][a] > 0) lean += 12;                              // the aggressor next door is scary
      const side = lean > 0 ? 1 : -1, mag = Math.abs(lean);
      let s = mag < 40 ? 0 : side;
      const ally = side > 0 ? B : A, enemyK = side > 0 ? a : b;
      if (mag > 95 && ((c.bloc && c.bloc === ally.bloc) || this.adj[k][enemyK] > 0) && c.econ0 > 35 && (hashString(k + 'j' + a + b) % 100) < 30) s = side * 2;
      this.setStance(war, k, s, true);
    });
    this.regions.forEach((c, k) => { // then opinion shifts against the aggressor
      if (k === a || k === b) return;
      this.views[k][a] -= this.adj[k][b] > 0 ? 30 : 15; this.views[k][b] += this.adj[k][a] > 0 ? 5 : 8;
      if (this.adj[k][a] > 0 || this.adj[k][b] > 0) c.shock += 12;   // neighbours fear spill-over and refugees
    });
    return true;
  }
  // stance: -2 fight for a, -1 back a, 0 neutral, 1 back b, 2 fight for b
  setStance(war, k, s, initial) {
    const prev = war.stance[k], c = this.regions[k];
    if (prev === s && !initial) return;
    if (Math.abs(prev) === 2) { const enemy = prev > 0 ? war.a : war.b; c.atWar.delete(enemy); this.regions[enemy].atWar.delete(k); war.joined = war.joined.filter((j) => j.c !== k); }
    war.stance[k] = s;
    if (s === 0) return;
    const enemy = s > 0 ? war.a : war.b, friend = s > 0 ? war.b : war.a;
    this.views[k][enemy] = Math.min(this.views[k][enemy], s === 2 || s === -2 ? -80 : -40);
    this.views[enemy][k] -= 25; this.views[friend][k] += 20; this.views[k][friend] += 10;
    c.economy -= Math.abs(s) === 2 ? 6 : 2; // aid, sanctions or mobilisation cost
    if (Math.abs(s) === 2) { this.declareWar(k, enemy, false); war.joined.push({ c: k, enemy }); }
  }
  sides(war) {
    const A = [], Bs = [], N = [];
    war.stance.forEach((s, k) => { if (k === war.a || k === war.b || this.regions[k].pop < 1) return; (s < 0 ? A : s > 0 ? Bs : N).push({ k, s }); });
    return { A, B: Bs, N };
  }
  supportOf(k) { // how much outside help nation k gets across all its wars
    let m = 1;
    for (const w of this.wars) {
      const side = k === w.a ? -1 : k === w.b ? 1 : w.stance[k] < 0 ? -1 : w.stance[k] > 0 ? 1 : 0;
      if (!side) continue;
      w.stance.forEach((s, c) => { if (c !== k && Math.sign(s) === side) m += Math.abs(s) === 2 ? 0.25 : 0.1; });
    }
    return Math.min(2.5, m);
  }
  makePeace(a, b) {
    const A = this.regions[a], B = this.regions[b];
    const w = this.wars.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (w) for (const j of w.joined) { this.regions[j.c].atWar.delete(j.enemy); this.regions[j.enemy].atWar.delete(j.c); }
    A.atWar.delete(b); B.atWar.delete(a);
    this.wars = this.wars.filter((w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
    this.views[a][b] = Math.max(this.views[a][b], -40); this.views[b][a] = Math.max(this.views[b][a], -40);
  }
  _markFront(a, b) { // pixels along the shared border (or both capitals if they don't touch)
    const R = 7;
    let any = false;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x; if (!this.border[i]) continue;
      const r = this.region[i]; if (r !== a && r !== b) continue;
      const other = r === a ? b : a;
      const j1 = y * MAP_W + ((x + 1) % MAP_W), j2 = y < MAP_H - 1 ? i + MAP_W : i, j0 = y * MAP_W + ((x + MAP_W - 1) % MAP_W), j3 = y > 0 ? i - MAP_W : i;
      if (![j0, j1, j2, j3].some((j) => this.region[j] === other)) continue;
      any = true; this._stamp(x, y, R, 1);
    }
    if (!any) for (const r of [this.regions[a], this.regions[b]]) { const c = r.cities[0] || r; this._stamp(Math.floor((c.lon / 360 + 0.5) * MAP_W), Math.floor((0.5 - c.lat / 180) * MAP_H), 10, 1); }
  }
  _stamp(cx, cy, rad, v) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const d = Math.hypot(dx, dy); if (d > rad) continue;
      const y = cy + dy; if (y < 0 || y >= MAP_H) continue;
      const x = ((cx + dx) % MAP_W + MAP_W) % MAP_W, i = y * MAP_W + x;
      if (this.planet.elev[i] < this.planet.seaLevel) continue;
      this.front[i] = Math.max(this.front[i], v * (1 - d / (rad + 1)));
    }
  }

  // ---------- pandemic ----------
  release(cfg, row, col) {
    const r = this.regionAt(row, col);
    if (r < 0 || this.doom) return false;
    this.plague = Object.assign({ name: 'Unknown', kind: 'Virus', r0: 3, lethality: 0.02, incubation: 5, air: true, land: true, water: false, cureDifficulty: 5, vaccine: 0, origin: r, since: this.year, totalDead: 0 }, cfg);
    this.regions.forEach((q) => { q.infected = 0; q.recovered = 0; q.vaccinated = 0; q.masks = false; q.lockdown = false; q.cases = 0; q.firstCase = null; });
    this.regions[r].infected = 25; this.regions[r].cases = 25; this.regions[r].firstCase = this.year;
    this.spreads = [{ a: r, b: r, route: 'origin', t: 0, year: this.year }];
    this.events.push({ t: 0, type: 'plague', r });
    return true;
  }

  // ---------- disasters feed the world ----------
  onStrike(rep) {
    if (!rep || !this.ready || rep.noEffect) return;
    const P = this.planet, lat0 = P.latRad[rep.row], lon0 = ((rep.col + 0.5) / MAP_W - 0.5) * 2 * Math.PI;
    const c0 = Math.cos(lat0), s0 = Math.sin(lat0), ang = rep.radiusKm / EARTH_R_KM;
    const w = new Float64Array(this.regions.length); let tot = 0;
    const dRow = Math.ceil((ang / Math.PI) * MAP_H) + 1;
    for (let y = Math.max(0, rep.row - dRow); y <= Math.min(MAP_H - 1, rep.row + dRow); y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x, r = this.region[i]; if (r === 255) continue;
        const cosd = s0 * P.sinLat[y] + c0 * P.cosLat[y] * Math.cos(((x + 0.5) / MAP_W - 0.5) * 2 * Math.PI - lon0);
        if (Math.acos(Math.max(-1, Math.min(1, cosd))) > ang) continue;
        const v = P.popD[i] * P.cosLat[y]; w[r] += v; tot += v;
      }
    }
    const worldPop = this.worldPop || 1;
    this.regions.forEach((q, k) => {
      const local = tot > 0 ? (rep.deaths - rep.globalDeaths) * (w[k] / tot) : 0;
      const global = rep.globalDeaths * (q.pop / worldPop);
      const d = Math.min(q.pop, local + global);
      q.pop -= d; q.dead += d; q.disasterDead += d;
      if (w[k] > 0) { q.shock += 35; q.economy -= 8; }
    });
  }

  // ---------- cataclysms ----------
  startDoom(type) {
    if (this.doom) return false;
    this.doom = { type, t: 0, applied: false };
    return true;
  }

  // ---------- the simulation step ----------
  // dt: real seconds (for animations); years: simulated years to advance (0 when time is stopped)
  update(dt, years) {
    if (!this.ready) return;
    for (const e of this.events) e.t += dt;
    if (this.spreads) for (const s of this.spreads) s.t += dt;
    this.events = this.events.filter((e) => e.t < 4);
    this._updateDoom(dt);
    if (years > 0 && !this.vanished && !(this.doom && this.doom.applied) && this.worldPop > 1) this._simulate(years); // [FIX] time stops when no one is left
    // war fronts flicker down slowly when the war ends
    if (this.wars.length === 0 && years > 0) for (let i = 0; i < this.front.length; i++) if (this.front[i] > 0) this.front[i] = Math.max(0, this.front[i] - years * 0.2);
    // per-region overlay tint (pandemic red, cataclysm handled per pixel)
    for (let k = 0; k < this.regions.length; k++) {
      const r = this.regions[k], inf = r.pop > 0 ? r.infected / r.pop : 0;
      if (inf > 0.00005) { this.tR[k] = 230; this.tG[k] = 40; this.tB[k] = 50; this.tA[k] = Math.min(0.55, 0.08 + inf * 25); }
      else this.tA[k] = 0;
    }
  }

  _simulate(years) {
    const steps = Math.max(1, Math.ceil(years / 0.05)), dt = years / steps;
    for (let s = 0; s < steps; s++) this._step(dt);
    // human footprint: farmland and cities spread where people live, forests are cleared
    const P = this.planet, k = years * 0.012 * Math.min(3, this.worldPop / 8e9 + 0.2);
    for (let i = 0; i < this.foot.length; i++) {
      const d = P.popD[i]; if (d <= 0) continue;
      this.foot[i] = Math.min(1, this.foot[i] + k * d * 2); // [FIX] only where people actually live
    }
  }

  _step(dt) {
    this.year += dt;
    const pop = this.worldPop;
    // climate change driven by population (illustrative): warming, drying lakes, extinctions
    // warming slows as fossil fuels run out and emissions fall (illustrative), capped at +8 °C
    this.warming = Math.min(8, this.warming + dt * 0.022 * (pop / 8e9) * Math.max(0.05, 1 - this.warming / 8));
    this.drying = Math.min(0.35, this.warming * 0.012);
    this.wildlife = Math.max(0, this.wildlife - dt * (0.12 * (pop / 8e9) + this.wars.length * 0.4 + this.warming * 0.05));
    this.speciesLost = Math.round(8.7e6 * (1 - this.wildlife / 100) * 0.12);
    const pl = this.plague;
    const totalInf = pl ? this.regions.reduce((s, r) => s + r.infected, 0) : 0;
    for (let k = 0; k < this.regions.length; k++) {
      const r = this.regions[k]; if (r.pop < 1) { r.pop = 0; continue; }
      const war = r.atWar.size;
      // food & water
      const cropFactor = r.crops * (1 - this.drying * 0.8) * (war ? 0.75 : 1) * (r.lockdown ? 0.9 : 1);
      const growth = 0.012 * cropFactor * Math.min(1, r.water * 1.6) - 0.004;
      if (!war && !(r.lockdown)) r.pop *= Math.exp(growth * dt);
      if (cropFactor < 0.3 && r.pop > 0) { const d = r.pop * (0.3 - cropFactor) * 0.04 * dt; r.pop -= d; r.dead += d; r.famineDead += d; }
      // war casualties and wear
      if (war) {
        r.warYears += dt;
        for (const b of r.atWar) {
          const E = this.regions[b], ratio = Math.min(3, (E.pop * (E.economy + 10) * this.supportOf(b)) / Math.max(1, r.pop * (r.economy + 10) * this.supportOf(k)));
          const d = Math.min(r.pop, r.pop * 0.0025 * ratio * dt);
          r.pop -= d; r.dead += d; r.warDead += d;
        }
      } else r.warYears = 0;
      // pandemic (SIR in days, stable exponential form)
      if (pl && (r.infected > 0.5 || r.recovered > 0)) {
        const days = dt * 365, N = Math.max(1, r.pop);
        const beta = (pl.r0 / 7) * (r.masks ? 0.7 : 1) * (r.lockdown ? 0.42 : 1) * (pl.water && r.avgT > 20 && r.avgM > 0.5 ? 1.15 : 1);
        const S = Math.max(0, N - r.infected - r.recovered - r.vaccinated);
        const newInf = S * (1 - Math.exp(-beta * (r.infected / N) * days));
        const rec = r.infected * (1 - Math.exp(-days / 7));
        const care = 1.35 - (r.economy / 100) * 0.7;
        const deaths = Math.min(r.pop, rec * pl.lethality * care);
        r.infected = Math.max(0, r.infected + newInf - rec);
        r.cases = (r.cases || 0) + newInf; // [FEATURE] cumulative cases so far
        r.recovered += rec - deaths; r.pop -= deaths; r.dead += deaths; r.plagueDead += deaths; pl.totalDead += deaths;
        const frac = r.infected / N;
        if (!r.masks && frac > 0.0005) r.masks = true;
        if (!r.lockdown && frac > 0.004) r.lockdown = true;
        if (r.lockdown && frac < 0.0003) r.lockdown = false;
        // spread over land borders and by air
        if (frac > 0.0002) {
          for (let b = 0; b < this.regions.length; b++) {
            if (b === k || this.regions[b].pop < 1 || this.regions[b].infected > 0.5 || this.regions[b].recovered > 0) continue;
            let pLand = 0, pAir = 0;
            if (pl.land && this.adj[k][b] > 0) pLand = frac * 40 * days * (r.lockdown ? 0.3 : 1);
            if (pl.air) pAir = frac * 6 * days * (this.regions[b].cities.length ? 1 : 0.2) * (r.lockdown ? 0.15 : 1);
            if (Math.random() < pLand + pAir) {
              const B = this.regions[b]; B.infected = 10; B.cases = (B.cases || 0) + 10; B.firstCase = this.year;
              this.spreads.push({ a: k, b, route: Math.random() * (pLand + pAir) < pLand ? 'land' : 'air', t: 0, year: this.year }); // [FEATURE] remember the route
            }
          }
        }
      }
      // economy, happiness and public approval drift toward targets
      const inf = pl && r.pop > 0 ? r.infected / r.pop : 0;
      const ecoT = r.econ0 - (war ? 22 : 0) - (r.lockdown ? 14 : 0) - (1 - Math.min(1, cropFactor * 1.4)) * 8 - this.warming * 0.6 - r.shock * 0.15;
      r.economy += (Math.max(0, ecoT) - r.economy) * Math.min(1, dt * 0.9);
      const heat = Math.max(0, r.avgT + this.warming - 30) * 2, cold = Math.max(0, -r.avgT) * 1.1;
      const hapT = 58 + (cropFactor - 0.5) * 30 + (Math.min(1, r.water) - 0.5) * 16 + (r.economy - 50) * 0.3 - (war ? 28 : 0) - Math.min(35, inf * 500) - heat - cold - r.shock * 0.5 - (r.lockdown ? 8 : 0);
      r.happiness += (Math.max(0, Math.min(100, hapT)) - r.happiness) * Math.min(1, dt * 1.6);
      const rally = war && r.warYears < 1 ? 6 : 0, weary = war ? Math.min(25, r.warYears * 6) : 0;
      const appT = 48 + (r.economy - 50) * 0.35 + (r.happiness - 55) * 0.45 + rally - weary - (r.lockdown ? 5 : 0) - Math.min(20, inf * 300);
      r.approval += (Math.max(2, Math.min(98, appT)) - r.approval) * Math.min(1, dt * 1.2);
      r.shock = Math.max(0, r.shock - dt * 12);
      // views of warring nations harden over time
      for (const b of r.atWar) this.views[k][b] = Math.max(-100, this.views[k][b] - dt * 5);
    }
    // vaccine research: richer, harder-hit worlds work faster
    if (pl && totalInf > 0) {
      const effort = this.regions.reduce((s, r) => s + (r.infected > 0 ? r.economy : 0), 0) / Math.max(1, this.regions.length);
      pl.vaccine = Math.min(100, pl.vaccine + dt * 365 * (0.12 + effort * 0.01) / pl.cureDifficulty);
      if (pl.vaccine >= 100) for (const r of this.regions) { const S = Math.max(0, r.pop - r.infected - r.recovered - r.vaccinated); r.vaccinated += S * Math.min(1, dt * 365 * 0.004 * (0.4 + r.economy / 100)); }
    }
  }

  _updateDoom(dt) {
    const d = this.doom; if (!d) return;
    d.t += dt;
    const impactAt = { meteors: 0.2, collision: 3.2, supernova: 2.6, blackhole: 2.5 }[d.type];
    if (d.type === 'meteors' && d.t < 7 && Math.random() < dt * 6 && this.onMeteor) this.onMeteor();
    if (d.t > impactAt && d.type !== 'meteors') this.doomAmt = Math.min(1, (d.t - impactAt) / 2.2);
    if (!d.applied && d.t > impactAt + (d.type === 'meteors' ? 7 : 1)) {
      d.applied = true;
      if (d.type !== 'meteors') for (const r of this.regions) { r.doomDead += r.pop; r.dead += r.pop; r.pop = 0; r.infected = 0; r.happiness = 0; r.approval = 0; r.economy = 0; }
      if (d.type !== 'meteors') { this.wildlife = 0; this.speciesLost = 8.7e6; this.drying = 0.4; this.wars = []; this.regions.forEach((r) => r.atWar.clear()); }
    }
    if (d.type === 'blackhole' && this.doomAmt >= 1) this.vanished = true;
  }

  // ---------- per-pixel colouring hook used by the renderer ----------
  shade(i, rgb, f) {
    const P = this.planet;
    if (this.doomAmt > 0) {
      const a = this.doomAmt, n = P.cityNoise[i], t = this.doom.type;
      let dr, dg, db;
      if (t === 'collision') { const crack = n > 0.55 ? (n - 0.55) * 2.2 : 0; dr = 70 + 200 * crack; dg = 25 + 80 * crack; db = 15; }
      else if (t === 'supernova') { dr = 34 + 30 * n; dg = 26 + 10 * n; db = 24; }
      else { dr = 10; dg = 6; db = 18; }
      rgb[0] = rgb[0] * (1 - a) + dr * Math.max(f, t === 'collision' ? 0.9 : 0.3) * a;
      rgb[1] = rgb[1] * (1 - a) + dg * Math.max(f, t === 'collision' ? 0.9 : 0.3) * a;
      rgb[2] = rgb[2] * (1 - a) + db * Math.max(f, t === 'collision' ? 0.9 : 0.3) * a;
      if (t !== 'meteors') return;
    }
    const land = P.elev[i] >= P.seaLevel;
    if (land) {
      const ft = this.foot[i];
      if (ft > 0.05) { const k = Math.min(0.22, ft * 0.25); rgb[0] = rgb[0] * (1 - k) + 140 * f * k; rgb[1] = rgb[1] * (1 - k) + 122 * f * k; rgb[2] = rgb[2] * (1 - k) + 86 * f * k; } // [FIX] subtle farmland tint
      const reg = this.region[i];
      if (reg !== 255) {
        const ta = this.tA[reg];
        if (ta > 0) { rgb[0] = rgb[0] * (1 - ta) + this.tR[reg] * (0.35 + 0.65 * f) * ta; rgb[1] = rgb[1] * (1 - ta) + this.tG[reg] * f * ta; rgb[2] = rgb[2] * (1 - ta) + this.tB[reg] * f * ta; }
        if (reg === this.sel) { rgb[0] += 34 * f + 10; rgb[1] += 34 * f + 10; rgb[2] += 44 * f + 14; }
        if (this.border[i] && !P.isEarth) { const k = reg === this.sel ? 0.85 : 0.45; rgb[0] = rgb[0] * (1 - k) + 255 * k * (0.35 + 0.65 * f); rgb[1] = rgb[1] * (1 - k) + 255 * k * (0.35 + 0.65 * f); rgb[2] = rgb[2] * (1 - k) + 255 * k * (0.35 + 0.65 * f); }
      }
      const fr = this.front[i];
      if (fr > 0) { const fl = fr * (0.55 + 0.45 * Math.sin(i * 7.31 + performance.now() / 120)); rgb[0] += 230 * fl; rgb[1] += 70 * fl; rgb[2] = rgb[2] * (1 - fl * 0.6); }
    }
  }

  // ---------- overlay on the planet canvas ----------
  draw(ctx, project, renderer, sunPos) {
    if (!this.ready) return;
    const t = performance.now() / 1000;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ll = (lon, lat) => project(Math.floor((0.5 - lat / 180) * MAP_H), Math.floor((lon / 360 + 0.5) * MAP_W));
    if (this.planet.isEarth && !this.vanished && this.doomAmt < 0.6) this._drawBorders(ctx, renderer);
    if (!this.vanished && this.doomAmt < 0.6) {
      // cities: dots everywhere, names for the selected nation
      for (const r of this.regions) for (const c of r.cities) {
        if (r.pop < 1 && !r.real) continue;
        const p = ll(c.lon, c.lat); if (!p) continue;
        const big = c.pop > 8e6;
        ctx.fillStyle = r.id === this.sel ? '#ffd60a' : 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, (big ? 2.6 : 1.8) * (0.6 + 0.4 * p.z), 0, 6.283); ctx.fill();
        if (r.id === this.sel || (this.highlightCity && this.highlightCity === c.name)) {
          ctx.font = '600 12px -apple-system, system-ui, sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(c.name, p.x + 1, p.y - 10);
          ctx.fillStyle = '#fff'; ctx.fillText(c.name, p.x, p.y - 11);
        }
      }
      // war and outbreak markers
      ctx.font = '18px system-ui, "Apple Color Emoji", sans-serif';
      for (const w of this.wars) for (const k of [w.a, w.b]) { const r = this.regions[k], p = ll(r.lon, r.lat); if (p) ctx.fillText('⚔️', p.x, p.y + Math.sin(t * 4 + k) * 2); }
      if (this.plague) for (const r of this.regions) if (r.pop > 0 && r.infected / r.pop > 0.0005) { const p = ll(r.lon, r.lat); if (p) ctx.fillText('🦠', p.x + 14, p.y - 6); }
      if (this.plague && this.spreads.length) this._drawSpread(ctx, renderer);
    }
    ctx.restore();
    this._drawDoom(ctx, renderer, sunPos);
  }

  // [EARTH] project a lon/lat (degrees) to the canvas; null when on the far side
  _proj(renderer, lon, lat) {
    if (renderer.mode === 'map') return { x: (lon / 360 + 0.5) * MAP_W, y: (0.5 - lat / 180) * MAP_H, z: 1 };
    const la = lat * Math.PI / 180, l0 = lon * Math.PI / 180 - this.life.view.yaw;
    const x2 = Math.cos(la) * Math.sin(l0), y2 = Math.sin(la), z2 = Math.cos(la) * Math.cos(l0);
    const ct = Math.cos(renderer.tilt), st = Math.sin(renderer.tilt), y = y2 * ct - z2 * st, z = y2 * st + z2 * ct;
    return z > 0 ? { x: renderer.cx + x2 * renderer.R, y: renderer.cy - y * renderer.R, z } : null;
  }
  _drawBorders(ctx, renderer) {
    const isMap = renderer.mode === 'map';
    ctx.save(); ctx.lineJoin = 'round';
    const path = (r) => {
      for (const poly of r.polys) {
        let prev = null;
        for (let k = 0; k <= poly.length; k++) {
          const [lon, lat] = poly[k % poly.length], p = this._proj(renderer, lon, lat);
          if (p && prev && !(isMap && Math.abs(p.x - prev.x) > MAP_W / 2)) ctx.lineTo(p.x, p.y); else if (p) ctx.moveTo(p.x, p.y);
          prev = p;
        }
      }
    };
    ctx.beginPath(); for (const r of this.regions) if (r.id !== this.sel) path(r);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = isMap ? 0.6 : 0.8; ctx.stroke();
    const s = this.regions[this.sel];
    if (s) { ctx.beginPath(); path(s); ctx.shadowColor = 'rgba(10,132,255,0.9)'; ctx.shadowBlur = 8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0; }
    // country names for the bigger countries facing us (and always the selected one)
    ctx.font = '500 10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of this.regions) {
      if (r.land < (isMap ? 40 : 28) && r.id !== this.sel) continue;
      const p = this._proj(renderer, r.lon, r.lat); if (!p || p.z < 0.35) continue;
      ctx.globalAlpha = r.id === this.sel ? 1 : 0.55 * p.z;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(r.name, p.x + 0.8, p.y + 0.8); ctx.fillStyle = '#fff'; ctx.fillText(r.name, p.x, p.y);
    }
    ctx.restore();
  }

  // [FEATURE] where the disease is travelling: an arc from the country it came from to the one it reached.
  // New routes animate (a ✈️ flies along air routes, red dashes march along land routes) then stay as faint lines.
  _drawSpread(ctx, renderer) {
    const t = performance.now() / 1000;
    ctx.save(); ctx.lineCap = 'round';
    const recent = this.spreads.filter((s) => s.route === 'origin' || s.t < 14).slice(-30); // [UI] keep the globe readable
    for (const s of recent) {
      if (s.route === 'origin') { const o = this.regions[s.a], p = this._proj(renderer, o.lon, o.lat); if (p) { const pulse = (t % 1.6) / 1.6; ctx.strokeStyle = `rgba(255,69,58,${1 - pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + pulse * 22, 0, 6.283); ctx.stroke(); } continue; }
      const A = this.regions[s.a], Bq = this.regions[s.b];
      const pts = []; // sample the great circle between the two countries, lifted into an arc
      for (let k = 0; k <= 24; k++) {
        const f = k / 24, lon = A.lon + (((Bq.lon - A.lon + 540) % 360) - 180) * f, lat = A.lat + (Bq.lat - A.lat) * f;
        const p = this._proj(renderer, lon, lat); if (!p) { pts.push(null); continue; }
        const lift = Math.sin(f * Math.PI) * (s.route === 'air' ? 22 : 6) * (renderer.mode === 'map' ? 0.6 : 1);
        pts.push({ x: p.x, y: p.y - lift });
      }
      const fresh = Math.max(0, 1 - s.t / 6);
      const fade = Math.min(1, (14 - s.t) / 8); ctx.strokeStyle = `rgba(255,69,58,${(0.12 + 0.68 * fresh) * fade})`; ctx.lineWidth = 1 + 1.5 * fresh;
      ctx.setLineDash(s.route === 'land' ? [4, 4] : []); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); let started = false;
      for (const p of pts) { if (!p) { started = false; continue; } if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); }
      ctx.stroke(); ctx.setLineDash([]);
      if (fresh > 0) { // the traveller
        const idx = Math.min(24, Math.floor(((s.t * 0.5) % 1) * 25)), p = pts[idx];
        if (p) { ctx.font = s.route === 'air' ? '14px system-ui, "Apple Color Emoji"' : '12px system-ui, "Apple Color Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = fresh; ctx.fillText(s.route === 'air' ? '✈️' : '🦠', p.x, p.y); ctx.globalAlpha = 1; }
      }
    }
    ctx.restore();
  }

  _drawDoom(ctx, renderer, sunPos) {
    const d = this.doom; if (!d || !renderer.R) return;
    const cx = renderer.cx, cy = renderer.cy, R = renderer.R, W = renderer.canvas.width, t = d.t;
    ctx.save();
    if (d.type === 'collision') {
      const k = Math.min(1, t / 3.2), rr = R * 0.55;
      if (t < 3.2) {
        const x = cx - W * 0.75 * (1 - k) - R * 0.6 * k, y = cy - W * 0.45 * (1 - k) - R * 0.3 * k;
        const g = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
        g.addColorStop(0, '#b9a99a'); g.addColorStop(0.6, '#6e6258'); g.addColorStop(1, '#2b241f');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283); ctx.fill();
      } else if (t < 4.6) {
        const a = 1 - (t - 3.2) / 1.4, x = cx - R * 0.6, y = cy - R * 0.3;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, R * 2.4 * (1 - a * 0.5));
        g.addColorStop(0, `rgba(255,255,230,${a})`); g.addColorStop(0.4, `rgba(255,150,60,${a * 0.7})`); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
        for (let k2 = 0; k2 < 40; k2++) { const ang = k2 * 2.4, dist = (t - 3.2) * R * (0.8 + (k2 % 5) * 0.3); ctx.fillStyle = `rgba(255,${120 + (k2 % 3) * 40},60,${a})`; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, 2 + (k2 % 4), 0, 6.283); ctx.fill(); }
      }
    } else if (d.type === 'supernova') {
      const sp = sunPos || { x: cx + R * 1.3, y: cy - R * 0.9 };
      const swell = Math.min(1, t / 2.6), r0 = 14 + swell * R * 1.4;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r0 * 2.2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,230,180,0.85)'); g.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sp.x, sp.y, r0 * 2.2, 0, 6.283); ctx.fill();
      if (t > 2.6 && t < 5) { const a = 1 - (t - 2.6) / 2.4; ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`; ctx.fillRect(0, 0, W, W); ctx.strokeStyle = `rgba(180,220,255,${a})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(sp.x, sp.y, (t - 2.6) * W * 0.6, 0, 6.283); ctx.stroke(); }
    } else if (d.type === 'blackhole') {
      // [UI] a black hole, not Saturn: dark shadow, thin photon ring, a hot accretion disk whose far side is
      // lensed up over the top (and under the bottom) of the shadow, plus a dimming of the stars around it
      const k = Math.min(1, t / 2.5), brMax = Math.min(R * 0.3, W * 0.085), br = brMax * (0.35 + 0.65 * k);
      const bx = W - brMax * 2.6 - 10, by = brMax * 1.7 + 10;
      const flick = 0.85 + 0.15 * Math.sin(t * 9);
      const haze = ctx.createRadialGradient(bx, by, br, bx, by, br * 4.5);
      haze.addColorStop(0, 'rgba(0,0,0,0.85)'); haze.addColorStop(0.5, 'rgba(0,0,0,0.35)'); haze.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(bx, by, br * 4.5, 0, 6.283); ctx.fill();
      const disk = (half) => { // half = 0 back (behind the shadow), 1 front
        ctx.save(); ctx.translate(bx, by); ctx.scale(1, 0.18);
        const g = ctx.createRadialGradient(0, 0, br * 1.25, 0, 0, br * 3.6);
        g.addColorStop(0, `rgba(255,250,235,${0.95 * flick})`); g.addColorStop(0.25, 'rgba(255,196,110,0.9)'); g.addColorStop(0.6, 'rgba(255,110,40,0.55)'); g.addColorStop(1, 'rgba(160,40,10,0)');
        ctx.fillStyle = g; ctx.beginPath();
        if (half) { ctx.arc(0, 0, br * 3.6, 0, Math.PI); ctx.arc(0, 0, br * 1.25, Math.PI, 0, true); } else { ctx.arc(0, 0, br * 3.6, Math.PI, 6.283); ctx.arc(0, 0, br * 1.25, 6.283, Math.PI, true); }
        ctx.fill(); ctx.restore();
      };
      ctx.globalCompositeOperation = 'lighter';
      disk(0);
      // lensed image of the far disk, bent over the top and under the bottom of the shadow
      for (const [a0, a1, wgt] of [[Math.PI * 1.04, Math.PI * 1.96, 1], [Math.PI * 0.08, Math.PI * 0.92, 0.45]]) {
        const lg = ctx.createRadialGradient(bx, by, br * 1.05, bx, by, br * 1.75);
        lg.addColorStop(0, `rgba(255,245,225,${0.95 * wgt * flick})`); lg.addColorStop(0.45, `rgba(255,170,80,${0.6 * wgt})`); lg.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(bx, by, br * 1.75, a0, a1); ctx.arc(bx, by, br * 1.05, a1, a0, true); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.fill(); // event-horizon shadow
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,236,200,${0.9 * flick})`; ctx.lineWidth = Math.max(1, br * 0.05); ctx.beginPath(); ctx.arc(bx, by, br * 1.03, 0, 6.283); ctx.stroke(); // photon ring
      disk(1);
      ctx.globalCompositeOperation = 'source-over';
      if (this.doomAmt > 0) { // matter being pulled off the planet
        ctx.globalCompositeOperation = 'lighter';
        for (let s = 0; s < 60; s++) { const q = ((t * 0.6 + s / 60) % 1), ang = s * 0.9; const sx = cx + Math.cos(ang) * R * (1 - q) * 0.9 + (bx - cx) * q, sy = cy + Math.sin(ang) * R * (1 - q) * 0.9 + (by - cy) * q; ctx.fillStyle = `rgba(255,${140 + (s % 4) * 25},80,${0.7 * this.doomAmt * (1 - q)})`; ctx.fillRect(sx, sy, 2, 2); }
      }
    } else if (d.type === 'meteors' && t < 7.5) {
      ctx.globalCompositeOperation = 'lighter';
      for (let s = 0; s < 14; s++) { const q = ((t * 0.9 + s * 0.137) % 1), sx = cx + R * 1.6 - q * R * 2.2 + (s % 5) * 30, sy = cy - R * 1.4 + q * R * 1.9 + (s % 3) * 40; const g = ctx.createLinearGradient(sx + 40, sy - 40, sx, sy); g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,240,210,0.95)'); ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + 40, sy - 40); ctx.lineTo(sx, sy); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- close-up landscape decorations for whatever is happening at a spot ----------

  decorateScene(ctx, row, col, W, H, groundY) {
    if (!this.ready) return;
    const P = this.planet, i = row * MAP_W + col, r = this.regions[this.region[i]];
    // pick the most important thing happening here and show a real photo of it
    const dm0 = this.dis ? this.dis.damage[i] : 0, dt0 = this.dis ? this.dis.dtype[i] : 0, land0 = P.elev[i] >= P.seaLevel;
    let photo = null, label = '';
    if (this.doom && this.doomAmt > 0.3 && this.doom.type === 'collision') { photo = 'lava'; label = '🌋 Molten surface'; }
    else if (this.doom && this.doomAmt > 0.3) photo = null;
    else if (this.front[i] > 0.05 || (r && r.atWar.size && land0)) { photo = 'war'; label = '⚔️ War zone' + (r ? ' · ' + r.name : ''); }
    else if (r && this.plague && r.pop > 0 && r.infected / r.pop > 0.0002 && land0) { photo = 'plague'; label = `🦠 ${this.plague.name} outbreak`; }
    else if (dm0 > 0.1) { photo = { 1: 'impact', 2: 'quake', 3: 'flood', 4: 'volcano', 5: 'fire' }[dt0] || 'impact'; label = { 1: '☄️ Impact crater', 2: '🫨 Earthquake damage', 3: '🌊 Flooded', 4: '🌋 Eruption', 5: '🔥 Wildfire' }[dt0] || '☄️ Impact'; }
    else if (r && land0 && this.inDrought(r)) { photo = 'drought'; label = '🏜️ Drought'; }
    if (!photo && !(this.doom && this.doomAmt > 0.3)) { // [UI] no event here: a real photo of the landscape itself
      const b = P.biome[i];
      const BIO = { 0: ['b_ocean', '🌊 Deep ocean'], 1: ['b_ocean', '🌊 Ocean'], 2: ['b_ocean', '🌊 Shallow sea'], 3: ['b_seaice', '🧊 Sea ice'], 4: ['b_beach', '🏖️ Beach'], 5: ['b_desert', '🏜️ Desert'], 6: ['b_grass', '🌾 Grassland'], 7: ['b_forest', '🌳 Forest'], 8: ['b_rainforest', '🌴 Rainforest'], 9: ['b_tundra', '🪨 Tundra'], 10: ['b_snow', '❄️ Snow & ice'], 11: ['b_mountain', '🏔️ Mountains'], 12: ['b_savanna', '🦒 Savanna'] };
      const e = BIO[b] || ['b_grass', ''];
      // [FIX] no landmark photos for generic cities: show the local landscape, named after the nearest city
      const lat0 = P.latRad[row] * 57.29578, lon0 = ((col + 0.5) / MAP_W - 0.5) * 360;
      let near = null, best = 2.2;
      if (r) for (const c of r.cities) { const d = Math.hypot(((c.lon - lon0 + 540) % 360) - 180, c.lat - lat0); if (d < best) { best = d; near = c; } }
      photo = e[0]; label = e[1] + (near ? ' · near ' + near.name : '') + (r && land0 ? ', ' + r.name : '');
    }
    const im = photo && SCENE_PHOTOS[photo];
    if (im && im.complete && im.naturalWidth) {
      drawPhoto(ctx, im, W, H);
      // day / night: darken and cool the photo on the night side, warm it at dusk
      const light = this.life.sunlight(row, col), day = Math.max(0, Math.min(1, (light + 0.1) / 0.3));
      if (day < 1) { ctx.fillStyle = `rgba(6,10,30,${(1 - day) * 0.72})`; ctx.fillRect(0, 0, W, H); }
      if (day > 0 && day < 0.7) { ctx.fillStyle = `rgba(255,120,40,${0.18 * (1 - Math.abs(day - 0.35) / 0.35)})`; ctx.fillRect(0, 0, W, H); }
      if (day < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let k = 0; k < 24; k++) ctx.fillRect((k * 97) % W, (k * 53) % (H * 0.4), 1.5, 1.5); }
      ctx.save(); ctx.font = `600 ${Math.round(H / 11)}px -apple-system, system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const w = ctx.measureText(label).width + 20, hh = Math.round(H / 7);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(10, 10, w, hh, hh / 2) : ctx.rect(10, 10, w, hh); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, 20, 10 + hh / 2); ctx.restore();
      return true; // the photo covers the whole view
    }
    const em = (s, x, y, size = 16) => { ctx.font = `${size}px system-ui, "Apple Color Emoji", sans-serif`; ctx.fillText(s, x, y); };
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tags = [];
    const gy = groundY || H * 0.7;
    // skyline for settled places
    if (P.popD[i] > 0.12 && P.elev[i] >= P.seaLevel && this.doomAmt < 0.5) {
      const dmg = this.dis ? this.dis.damage[i] : 0;
      for (let b = 0; b < 9; b++) {
        const bx = W * 0.3 + b * 11, bh = 14 + ((b * 37) % 26) * (1 - dmg * 0.7), lean = dmg > 0.3 ? (b % 2 ? 0.25 : -0.2) * dmg : 0;
        ctx.save(); ctx.translate(bx, gy); ctx.rotate(lean); ctx.fillStyle = dmg > 0.3 ? '#4a4a4f' : '#2c3442'; ctx.fillRect(0, -bh, 9, bh);
        ctx.fillStyle = dmg > 0.3 ? '#222' : '#ffd36e'; for (let wy = -bh + 3; wy < -3; wy += 5) ctx.fillRect(2, wy, 2, 2);
        ctx.restore();
      }
    }
    const fr = this.front[i];
    if (fr > 0.05 || (r && r.atWar.size)) {
      tags.push('⚔️ War zone');
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff6a00'; ctx.fillRect(0, gy - 30, W, 30); ctx.globalAlpha = 1;
      em('💥', W * 0.22, gy - 22, 18); em('🪖', W * 0.6, gy - 9); em('💥', W * 0.78, gy - 30, 14);
      ctx.fillStyle = 'rgba(40,40,40,0.55)'; for (let s = 0; s < 6; s++) { ctx.beginPath(); ctx.arc(W * 0.2 + s * 30, gy - 40 - (s % 2) * 10, 10 + (s % 3) * 4, 0, 6.283); ctx.fill(); }
    }
    if (r && this.plague && r.pop > 0 && r.infected / r.pop > 0.0002) { tags.push('🦠 Outbreak'); em('😷', W * 0.45, gy - 9); em('🏥', W * 0.68, gy - 12, 18); em('🦠', W * 0.12, 18, 14); }
    const dm = this.dis ? this.dis.damage[i] : 0, dt = this.dis ? this.dis.dtype[i] : 0;
    if (dm > 0.1) {
      if (dt === 3) { tags.push('🌊 Flooded'); ctx.fillStyle = 'rgba(40,110,190,0.75)'; ctx.fillRect(0, gy - 18 * dm, W, H); em('🏚️', W * 0.5, gy - 20 * dm - 6); }
      else if (dt === 5) { tags.push('🔥 Wildfire'); for (let s = 0; s < 6; s++) em('🔥', 18 + s * 38, gy - 10, 16 + (s % 2) * 4); }
      else if (dt === 4) { tags.push('🌋 Eruption'); ctx.fillStyle = 'rgba(255,90,20,0.6)'; ctx.fillRect(0, gy - 6, W, H); em('🌋', W * 0.2, gy - 16, 22); ctx.fillStyle = 'rgba(70,70,70,0.5)'; ctx.fillRect(0, 0, W, gy * 0.5); }
      else if (dt === 2) { tags.push('🫨 Earthquake damage'); em('🏚️', W * 0.42, gy - 10); em('🏚️', W * 0.62, gy - 10); }
      else { tags.push('☄️ Impact crater'); ctx.fillStyle = 'rgba(20,14,10,0.8)'; ctx.beginPath(); ctx.ellipse(W / 2, gy, W * 0.28 * dm + 10, 12, 0, 0, Math.PI); ctx.fill(); em('🔥', W * 0.35, gy - 8); }
    }
    if (r && r.water < 0.22 && P.elev[i] >= P.seaLevel && !this.doom) { tags.push('🏜️ Drought'); ctx.strokeStyle = 'rgba(60,40,20,0.7)'; for (let s = 0; s < 8; s++) { ctx.beginPath(); ctx.moveTo(s * 30, gy + 6); ctx.lineTo(s * 30 + 12, gy + 14); ctx.lineTo(s * 30 + 6, gy + 22); ctx.stroke(); } em('🥀', W * 0.85, gy - 8); }
    if (this.foot[i] > 0.4 && !this.doom) { tags.push('🏭 Heavily developed'); em('🏭', W * 0.12, gy - 12); }
    if (this.doomAmt > 0.3 && this.doom.type !== 'meteors') { // [FIX] repaint the whole close-up, no water, sky or animals left
      const t = this.doom.type;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      if (t === 'collision') { sky.addColorStop(0, '#2a0703'); sky.addColorStop(1, '#ff5a14'); }
      else if (t === 'supernova') { sky.addColorStop(0, '#fff6e0'); sky.addColorStop(1, '#ffb86b'); }
      else { sky.addColorStop(0, '#000'); sky.addColorStop(1, '#14061f'); }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = t === 'collision' ? '#3a120a' : t === 'supernova' ? '#2b2420' : '#05020a';
      ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 12) ctx.lineTo(x, gy + Math.sin(x * 0.09) * 6 + ((x * 37) % 11)); ctx.lineTo(W, H); ctx.fill();
      if (t === 'collision') { ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2; for (let x = 10; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, gy + 8); ctx.lineTo(x + 12, gy + 20); ctx.lineTo(x + 6, H); ctx.stroke(); } }
      if (t === 'blackhole') { ctx.strokeStyle = 'rgba(255,170,80,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.28, 40, 8, -0.2, 0, 6.283); ctx.stroke(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W * 0.75, H * 0.28, 12, 0, 6.283); ctx.fill(); }
      tags.length = 0;
      tags.push(t === 'collision' ? '🌋 Molten surface' : t === 'supernova' ? '☀️ Scorched by the supernova' : t === 'blackhole' ? '🕳️ Being torn apart' : '☄️ Bombarded');
    }
    if (tags.length) {
      ctx.font = '600 11px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'left';
      const txt = tags.slice(0, 2).join(' · '), w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(6, 6, w, 18); ctx.fillStyle = '#fff'; ctx.fillText(txt, 13, 15);
    }
    ctx.restore();
  }
}
