// Disasters (Earth theme): strike any point and get an impact report:
// deaths, displaced, area, animals, global effects and recovery time.
// Damage is kept in its own layer so climate sliders don't erase it.
'use strict';

const EARTH_R_KM = 6371;
const PIXEL_KM2 = (2 * Math.PI * EARTH_R_KM / MAP_W) * (Math.PI * EARTH_R_KM / MAP_H); // at equator
const ANIMALS_PER_UNIT = 6e4; // wild animals per density unit per pixel-area (illustrative)

// Wildlife density by biome id (matches BIOMES order)
const ANIMAL_DENSITY = [0.08, 0.3, 0.6, 0.1, 0.4, 0.15, 0.8, 1.0, 1.5, 0.3, 0.05, 0.1, 0.9];

const DISASTERS = {
  asteroid: {
    label: '☄️ Asteroid', color: [40, 30, 26],
    // strength 1..10 -> diameter 0.05 .. 50 km (log scale)
    value: (s) => 0.05 * Math.pow(1000, (s - 1) / 9),
    fmt: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} km wide`,
    radiusKm: (v) => Math.max(40, v * 70),
    lethal: (d, v) => (d < 0.15 ? 1 : 0.85 * Math.pow(1 - d, 1.5)),
    affects: () => true,
    recovery: (v) => v < 0.5 ? [5, 20] : v < 5 ? [50, 300] : v < 15 ? [1e6, 1e7] : [1e7, 3e7],
    env: (v, ocean) => [
      v >= 5 ? 'Global firestorm and dust cloud block sunlight ("impact winter")' : 'Regional firestorm and shockwave flatten everything nearby',
      ocean ? 'Ocean impact triggers mega-tsunamis along distant coasts' : 'Crater and molten ejecta reshape the landscape',
      v >= 10 ? 'Mass extinction event: most large animal species die out' : 'Local ecosystems destroyed; wildlife returns slowly',
    ],
  },
  quake: {
    label: '🫨 Earthquake', color: [130, 98, 64],
    value: (s) => 5.5 + (s - 1) * (4 / 9),          // magnitude 5.5 .. 9.5
    fmt: (v) => `magnitude ${v.toFixed(1)}`,
    radiusKm: (v) => 50 * Math.pow(1.9, v - 5.5),
    lethal: (d, v) => 0.01 * Math.pow(2.2, v - 6) * (1 - d) * (1 - d),
    affects: (s) => s.land,
    recovery: (v) => [Math.round(2 + (v - 5.5) * 2), Math.round(5 + (v - 5.5) * 4)],
    env: (v) => [
      'Buildings, roads and bridges collapse near the epicentre',
      v >= 8 ? 'Landslides and aftershocks for months' : 'Aftershocks for weeks',
      'Burrowing and cliff-nesting animals lose habitat',
    ],
  },
  tsunami: {
    label: '🌊 Tsunami', color: [104, 88, 64],
    value: (s) => 2 + (s - 1) * 3.6,                // wave height 2 .. 34 m
    fmt: (v) => `${v.toFixed(0)} m waves`,
    radiusKm: (v) => 400 + v * 60,
    lethal: (d, v) => 0.03 * (v / 10) * (1 - d),
    affects: (s) => !s.land || s.h < 0.07,          // seas and low coasts only
    recovery: (v) => [Math.round(3 + v / 6), Math.round(8 + v / 3)],
    env: (v) => [
      'Coastal towns flooded; salt water ruins farmland',
      'Coral reefs and mangroves torn apart',
      'Fresh water supplies contaminated for months',
    ],
  },
  volcano: {
    label: '🌋 Volcano', color: [64, 40, 32],
    value: (s) => 2 + (s - 1) * (6 / 9),            // VEI 2 .. 8
    fmt: (v) => `VEI ${v.toFixed(1)}`,
    radiusKm: (v) => 12 * Math.pow(2.1, v - 2),
    lethal: (d, v) => 0.35 * (v / 8) * Math.pow(1 - d, 3),
    affects: () => true,
    recovery: (v) => v < 4 ? [1, 5] : v < 6 ? [5, 20] : [20, 100],
    env: (v) => [
      'Lava flows and pyroclastic clouds bury the area near the vent',
      'Ash fall collapses roofs and kills crops',
      v >= 7 ? 'Sulphur in the stratosphere cools the whole planet for 2–3 years' : 'Air travel and farming disrupted downwind',
    ],
  },
  wildfire: {
    label: '🔥 Wildfire', color: [34, 26, 20],
    value: (s) => s,                                // intensity 1..10
    fmt: (v) => `intensity ${v.toFixed(0)}/10`,
    radiusKm: (v) => 30 + v * 35,
    lethal: (d) => 0.002 * (1 - d),
    affects: (s, b) => b === B.FOREST || b === B.RAINFOREST || b === B.GRASS || b === B.SAVANNA,
    recovery: () => [10, 50],
    env: () => [
      'Forests and grasslands burned to ash',
      'Smoke causes breathing problems hundreds of km away',
      'Grass recovers in 1–3 years; forests take decades',
    ],
  },
};

function fmtNum(n) {
  if (!Number.isFinite(n) || n < 1) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' billion';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' million';
  if (n >= 1e3) return Math.round(n / 1e3).toLocaleString() + ',000';
  return Math.round(n).toLocaleString();
}
function fmtYears([a, b]) {
  const f = (y) => (y >= 1e6 ? (y / 1e6).toFixed(0) + ' million' : y.toLocaleString());
  return `${f(a)}–${f(b)} years`;
}

class Disasters {
  constructor(planet, life) {
    this.planet = planet;
    this.life = life;
    const N = MAP_W * MAP_H;
    this.damage = new Float32Array(N);
    this.dtype = new Uint8Array(N);
    this.typeKeys = Object.keys(DISASTERS);
    this.armed = null;          // disaster key waiting for a click
    this.effects = [];          // impact animations
    this.recovering = null;     // { start, duration, years }
    this.log = [];
  }

  clear() { this.damage.fill(0); this.effects = []; this.recovering = null; this.log = []; }

  // Apply a disaster at map (row, col). Returns the impact report.
  strike(key, strength, row, col) {
    const D = DISASTERS[key];
    const P = this.planet;
    if (!D || !P.seed) return null;
    const v = D.value(strength);
    const rKm = D.radiusKm(v);
    const ang = rKm / EARTH_R_KM;                         // angular radius (radians)
    const lat0 = P.latRad[row], lon0 = ((col + 0.5) / MAP_W - 0.5) * 2 * Math.PI;
    const c0 = Math.cos(lat0), s0 = Math.sin(lat0);
    const typeId = this.typeKeys.indexOf(key) + 1;
    const ocean0 = P.elev[row * MAP_W + col] < P.seaLevel;

    // Only scan rows that can be inside the radius.
    const dRow = Math.ceil((ang / Math.PI) * MAP_H) + 1;
    let deaths = 0, affectedPop = 0, area = 0, animals = 0;
    const habitats = new Set();
    for (let y = Math.max(0, row - dRow); y <= Math.min(MAP_H - 1, row + dRow); y++) {
      const cl = P.cosLat[y], sl = P.sinLat[y];
      for (let x = 0; x < MAP_W; x++) {
        const lon = ((x + 0.5) / MAP_W - 0.5) * 2 * Math.PI;
        const cosd = s0 * sl + c0 * cl * Math.cos(lon - lon0);
        const dist = Math.acos(Math.max(-1, Math.min(1, cosd)));
        if (dist > ang) continue;
        const i = y * MAP_W + x;
        const s = P.sample(i, y);
        const b = P.biome[i];
        if (!D.affects(s, b)) continue;
        const d = dist / ang;
        const w = cl;
        const pop = P.popD[i] * w * P.popK;
        const L = Math.min(1, D.lethal(d, v));
        deaths += pop * L;
        affectedPop += pop;
        area += PIXEL_KM2 * w;
        animals += ANIMAL_DENSITY[b] * w * ANIMALS_PER_UNIT * (1 - d * 0.5);
        habitats.add(HABITAT[b]);
        const sev = key === 'quake' ? 0.45 * (1 - d) : Math.min(1, (1 - d) * 1.3);
        if (sev > this.damage[i]) { this.damage[i] = sev; this.dtype[i] = typeId; }
      }
    }

    // Global effects
    const world = P.stats ? P.stats.population : 0;
    let globalDeaths = 0, coolC = 0, coolYears = 0;
    if (key === 'asteroid' && v >= 1) {
      const g = v < 5 ? 0.01 : v < 15 ? 0.35 : 0.8;
      globalDeaths = Math.max(0, world - deaths) * g;
      coolC = Math.min(18, v * 0.9); coolYears = v < 5 ? 1 : v < 15 ? 5 : 15;
    } else if (key === 'volcano' && v >= 6.5) {
      globalDeaths = Math.max(0, world - deaths) * (v >= 7.5 ? 0.02 : 0.003);
      coolC = (v - 6) * 1.2; coolYears = 3;
    }
    const localDeaths = deaths;
    deaths += globalDeaths;

    // Remove visible creatures caught in the zone.
    const before = this.life.creatures.length;
    this.life.creatures = this.life.creatures.filter((c) => {
      const lat = P.latRad[c.row], lon = ((c.col + 0.5) / MAP_W - 0.5) * 2 * Math.PI;
      const cd = s0 * Math.sin(lat) + c0 * Math.cos(lat) * Math.cos(lon - lon0);
      return Math.acos(Math.max(-1, Math.min(1, cd))) > ang;
    });
    const creaturesLost = before - this.life.creatures.length;

    const species = [];
    for (const h of habitats) for (const e of (LIFE.earth.creatures[h] || [])) if (!species.includes(e)) species.push(e);

    this.effects.push({ key, row, col, ang, t: 0, dur: key === 'asteroid' ? 3 : 2.2 });
    const rec = D.recovery(v);
    const report = {
      key, label: D.label, magnitude: D.fmt(v), row, col, radiusKm: rKm,
      area, deaths, injured: deaths * 2.2, displaced: Math.max(0, affectedPop - localDeaths) * 0.45 + (globalDeaths > 0 ? Math.max(0, world - deaths) * 0.25 : 0),
      animals, species: species.slice(0, 8), creaturesLost,
      env: D.env(v, ocean0), coolC, coolYears, globalDeaths, worldPop: world, recovery: rec,
      place: P.describe(row, col),
    };
    this.log.push(report);
    return report;
  }

  startRecovery(years) {
    if (!this.damage.some((x) => x > 0)) return false;
    this.recovering = { start: performance.now(), duration: 8000, years, from: this.damage.slice() };
    return true;
  }

  // Called every frame. Returns progress info while recovering.
  update(dt) {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
    const r = this.recovering;
    if (!r) return null;
    const k = Math.min(1, (performance.now() - r.start) / r.duration);
    const keep = 1 - k;
    for (let i = 0; i < this.damage.length; i++) if (r.from[i]) this.damage[i] = r.from[i] * keep;
    if (k >= 1) { this.recovering = null; this.damage.fill(0); this.life.populate(10); }
    return { k, year: Math.round(r.years * k), done: k >= 1 };
  }

  // Overlay animations (shockwave, asteroid streak, flash).
  draw(ctx) {
    const life = this.life, r = life.renderer;
    for (const e of this.effects) {
      const p = life.project(e.row, e.col);
      if (!p) continue;
      const scale = r.mode === 'map' ? MAP_H / Math.PI : r.R;
      const k = e.t / e.dur;
      ctx.save();
      if (e.key === 'asteroid' && e.t < 0.7) {
        const q = e.t / 0.7;
        const sx = p.x + 260 * (1 - q), sy = p.y - 260 * (1 - q);
        const g = ctx.createLinearGradient(sx + 60, sy - 60, sx, sy);
        g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,240,200,1)');
        ctx.strokeStyle = g; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(sx + 60, sy - 60); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 6.283); ctx.fill();
      } else {
        const kk = e.key === 'asteroid' ? (e.t - 0.7) / (e.dur - 0.7) : k;
        const rad = Math.max(4, Math.sin(Math.min(1.5, e.ang)) * scale * (0.2 + 0.8 * kk) * (r.mode === 'map' ? 1 : p.z));
        const col = e.key === 'tsunami' ? '120,200,255' : e.key === 'quake' ? '255,220,140' : '255,140,60';
        ctx.strokeStyle = `rgba(${col},${1 - kk})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.stroke();
        if (kk < 0.35) {
          ctx.fillStyle = `rgba(255,240,200,${0.8 * (1 - kk / 0.35)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, rad * 0.5, 0, 6.283); ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}

// Report card HTML. All values are numbers/our own strings; place names come from our tables.
function disasterReportHTML(r, progress) {
  const ns = r.place.lat >= 0 ? 'N' : 'S', ew = r.place.lon >= 0 ? 'E' : 'W';
  const glob = r.coolC > 0
    ? `<p class="warn">🌍 Global: planet cools ~${r.coolC.toFixed(1)} °C for ~${r.coolYears} year${r.coolYears > 1 ? 's' : ''}; famine adds ~${fmtNum(r.globalDeaths)} deaths worldwide.</p>`
    : '';
  const pct = r.worldPop > 0 ? (r.deaths / r.worldPop) * 100 : 0;
  return `
    <div class="rep-head"><b>${r.label}</b> · ${r.magnitude}</div>
    <div class="muted small">${Math.abs(r.place.lat).toFixed(1)}°${ns}, ${Math.abs(r.place.lon).toFixed(1)}°${ew} · ${r.place.biome} · radius ${Math.round(r.radiusKm).toLocaleString()} km</div>
    <div class="kpis rep-kpis">
      <div class="kpi"><div class="v red">${fmtNum(r.deaths)}</div><div class="k">deaths (${pct < 0.01 && r.deaths > 0 ? '<0.01' : pct.toFixed(2)}% of world)</div></div>
      <div class="kpi"><div class="v">${fmtNum(r.displaced)}</div><div class="k">displaced</div></div>
      <div class="kpi"><div class="v">${fmtNum(r.injured)}</div><div class="k">injured</div></div>
      <div class="kpi"><div class="v">${fmtNum(r.area)}</div><div class="k">km² affected</div></div>
    </div>
    <div class="small"><b>Animals affected:</b> ~${fmtNum(r.animals)} ${r.species.join(' ')}</div>
    <ul class="small env">${r.env.map((t) => `<li>${t}</li>`).join('')}</ul>
    ${glob}
    <div class="small"><b>Recovery:</b> ${fmtYears(r.recovery)}</div>
    ${progress ? `<div class="bar rec"><i style="width:${(progress.k * 100).toFixed(0)}%;background:#5fd38a"></i></div>
      <div class="small muted">${progress.done ? '✅ Recovered' : `Year ${progress.year.toLocaleString()} of ~${r.recovery[1].toLocaleString()}`}</div>` : ''}
    <p class="small muted">Estimates use simplified models for illustration.</p>`;
}
