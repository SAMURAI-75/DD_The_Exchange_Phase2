// Planet generation and climate/biome classification.
//
// Two stages so the UI stays responsive:
//   generate(seed, roughness)  -> expensive noise fields (elevation, moisture,
//                                 clouds, settlements). Depends only on seed
//                                 and roughness.
//   classify(climate)          -> cheap per-pixel biome + colour pass. Runs
//                                 live while temperature / ocean / moisture
//                                 sliders are dragged.
'use strict';

const MAP_W = 768;
const MAP_H = 384;

const BIOMES = [
  // id, name, colour
  { name: 'Deep ocean',     color: [10, 35, 80] },
  { name: 'Ocean',          color: [22, 74, 140] },
  { name: 'Shallow sea',    color: [44, 120, 190] },
  { name: 'Sea ice',        color: [214, 230, 240] },
  { name: 'Beach',          color: [222, 204, 146] },
  { name: 'Desert',         color: [216, 178, 106] },
  { name: 'Grassland',      color: [126, 170, 74] },
  { name: 'Forest',         color: [58, 118, 52] },
  { name: 'Rainforest',     color: [32, 92, 40] },
  { name: 'Tundra',         color: [132, 146, 118] },
  { name: 'Snow & ice',     color: [240, 245, 250] },
  { name: 'Mountain rock',  color: [118, 104, 90] },
  { name: 'Savanna',        color: [176, 168, 82] },
];
const B = {
  DEEP: 0, OCEAN: 1, SHALLOW: 2, SEA_ICE: 3, BEACH: 4, DESERT: 5, GRASS: 6,
  FOREST: 7, RAINFOREST: 8, TUNDRA: 9, SNOW: 10, ROCK: 11, SAVANNA: 12,
};

// World themes: same terrain & climate rules, different "material" per biome.
// Order of names/colors matches BIOMES ids.
const THEMES = {
  earth: {
    label: '🌍 Earth',
    names: BIOMES.map((b) => b.name), colors: BIOMES.map((b) => b.color),
    shallow: [47, 127, 196], deep: [8, 30, 72],
    cloud: [245, 245, 245], city: [255, 196, 110], glow: [90, 160, 255],
  },
  candy: {
    label: '🍭 Candy',
    names: ['Grape soda depths', 'Strawberry milk sea', 'Bubblegum shallows', 'Frosting floes', 'Sprinkle shore',
      'Sugar dunes', 'Mint meadow', 'Gumdrop grove', 'Lollipop jungle', 'Marshmallow plains',
      'Whipped-cream peaks', 'Chocolate mountains', 'Caramel fields'],
    colors: [[110, 40, 130], [214, 96, 160], [255, 168, 210], [255, 246, 250], [255, 214, 150],
      [255, 234, 205], [150, 238, 190], [255, 112, 160], [226, 58, 138], [246, 226, 236],
      [255, 255, 255], [108, 58, 34], [222, 150, 70]],
    shallow: [255, 168, 214], deep: [120, 40, 130],
    cloud: [255, 205, 238], city: [130, 255, 248], glow: [255, 140, 210],
  },
  alien: {
    label: '👽 Alien',
    names: ['Abyssal ooze', 'Ooze sea', 'Acid shallows', 'Crystal floes', 'Glass sand',
      'Rust flats', 'Violet moss', 'Fungal forest', 'Glowshroom jungle', 'Ash plains',
      'Methane frost', 'Obsidian spires', 'Amber scrub'],
    colors: [[10, 60, 60], [26, 120, 100], [70, 210, 150], [190, 255, 240], [200, 236, 255],
      [196, 90, 58], [150, 84, 204], [108, 40, 160], [62, 22, 122], [112, 110, 132],
      [214, 250, 255], [42, 36, 54], [232, 170, 40]],
    shallow: [70, 214, 150], deep: [8, 52, 56],
    cloud: [196, 255, 206], city: [120, 255, 120], glow: [120, 255, 170],
  },
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Sanitise any user-provided seed into a non-empty, bounded string.
function normaliseSeed(seed) {
  const s = String(seed == null ? '' : seed).trim().slice(0, 40);
  return s.length ? s : null;
}

// Default climate settings. Ranges are enforced in sanitiseClimate().
const DEFAULT_CLIMATE = {
  ocean: 0.6,      // fraction of surface covered by water (0.05 .. 0.95)
  temp: 0,         // global temperature offset, °C (-30 .. +30)
  moisture: 0,     // global moisture shift (-0.5 .. +0.5)
  meltRaisesSea: true,
};

function sanitiseClimate(c) {
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  return {
    ocean: clamp(num(c.ocean, DEFAULT_CLIMATE.ocean), 0.05, 0.95),
    temp: clamp(num(c.temp, DEFAULT_CLIMATE.temp), -30, 30),
    moisture: clamp(num(c.moisture, DEFAULT_CLIMATE.moisture), -0.5, 0.5),
    meltRaisesSea: c.meltRaisesSea !== false,
  };
}

class Planet {
  constructor() {
    const N = MAP_W * MAP_H;
    this.elev = new Float32Array(N);
    this.moist = new Float32Array(N);
    this.cloud = new Float32Array(N);
    this.cityNoise = new Float32Array(N);

    // classify() outputs
    this.biome = new Uint8Array(N);
    this.R = new Uint8Array(N);
    this.G = new Uint8Array(N);
    this.Bc = new Uint8Array(N);
    this.city = new Uint8Array(N);
    this.popD = new Float32Array(N);   // people density (0..~1)
    this.popK = 1.33e6;                // people per density unit per pixel-area (~8 bn on an Earthlike world)

    // Per-row latitude helpers (row 0 = north pole side).
    this.latRad = new Float32Array(MAP_H);
    this.cosLat = new Float32Array(MAP_H);
    this.sinLat = new Float32Array(MAP_H);
    for (let y = 0; y < MAP_H; y++) {
      const lat = (0.5 - (y + 0.5) / MAP_H) * Math.PI;
      this.latRad[y] = lat;
      this.cosLat[y] = Math.cos(lat);
      this.sinLat[y] = Math.sin(lat);
    }
    this.hist = new Float64Array(1024);
    this.seed = null;
    this.roughness = 0.5;
    this.seaLevel = 0.5;
    this.climate = { ...DEFAULT_CLIMATE };
    this.stats = null;
    this.theme = 'earth';
  }

  get palette() { return THEMES[this.theme] || THEMES.earth; }

  generate(seed, roughness) {
    const s = normaliseSeed(seed);
    if (!s) throw new Error('Seed cannot be empty');
    const r = clamp(Number.isFinite(roughness) ? roughness : 0.5, 0, 1);
    this.seed = s;
    this.roughness = r;

    const rng = mulberry32(hashString(s));
    const nCont = createNoise3D(rng);
    const nDetail = createNoise3D(rng);
    const nMoist = createNoise3D(rng);
    const nCloud = createNoise3D(rng);
    const nCity = createNoise3D(rng);
    const off = () => (rng() - 0.5) * 200; // decorrelate fields
    const o = [off(), off(), off(), off(), off(), off(), off(), off(), off(), off()];

    const detailOct = 4 + Math.round(r * 3);   // 4..7 octaves
    const detailPers = 0.42 + r * 0.16;        // rougher = more high-frequency energy
    const contScale = 0.9 + rng() * 0.8;       // continent size varies per seed

    const cosLon = new Float32Array(MAP_W), sinLon = new Float32Array(MAP_W);
    for (let x = 0; x < MAP_W; x++) {
      const lon = ((x + 0.5) / MAP_W - 0.5) * 2 * Math.PI;
      cosLon[x] = Math.cos(lon); sinLon[x] = Math.sin(lon);
    }

    let min = Infinity, max = -Infinity;
    for (let y = 0; y < MAP_H; y++) {
      const cl = this.cosLat[y], sl = this.sinLat[y];
      for (let x = 0; x < MAP_W; x++) {
        const px = cl * cosLon[x], py = sl, pz = cl * sinLon[x];
        const i = y * MAP_W + x;

        const cont = fbm(nCont, px * contScale + o[0], py * contScale + o[1], pz * contScale + o[2], 4, 0.5);
        const detail = fbm(nDetail, px * 3 + o[3], py * 3 + o[4], pz * 3 + o[5], detailOct, detailPers);
        let ridge = 1 - Math.abs(nDetail(px * 2.3 + o[5], py * 2.3 + o[4], pz * 2.3 + o[3]));
        ridge *= ridge;
        const e = cont * 0.8 + detail * (0.18 + 0.32 * r) + ridge * 0.3 * r;
        this.elev[i] = e;
        if (e < min) min = e;
        if (e > max) max = e;

        this.moist[i] = fbm(nMoist, px * 1.7 + o[6], py * 1.7 + o[7], pz * 1.7 + o[8], 4, 0.5) * 0.5 + 0.5;
        this.cloud[i] = fbm(nCloud, px * 2.6 + o[9], py * 5.2 + o[0], pz * 2.6 + o[1], 5, 0.55) * 0.5 + 0.5;
        this.cityNoise[i] = nCity(px * 16 + o[2], py * 16 + o[3], pz * 16 + o[4]) * 0.5 + 0.5;
      }
    }

    // Normalise elevation to [0, 1] and build an area-weighted histogram so
    // the "ocean coverage" slider means true % of surface, not % of pixels
    // (equirectangular rows near the poles cover much less area).
    const span = max - min || 1;
    const hist = this.hist;
    hist.fill(0);
    let total = 0;
    for (let y = 0; y < MAP_H; y++) {
      const w = this.cosLat[y];
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const e = (this.elev[i] - min) / span;
        this.elev[i] = e;
        hist[Math.min(1023, (e * 1024) | 0)] += w;
        total += w;
      }
    }
    for (let b = 0; b < 1024; b++) hist[b] /= total;
  }

  // Elevation value below which `fraction` of the surface area lies.
  quantile(fraction) {
    let acc = 0;
    for (let b = 0; b < 1024; b++) {
      const next = acc + this.hist[b];
      if (next >= fraction) {
        const t = this.hist[b] > 0 ? (fraction - acc) / this.hist[b] : 0;
        return (b + t) / 1024;
      }
      acc = next;
    }
    return 1;
  }

  effectiveOcean(climate) {
    // Warming melts ice and raises seas; cooling locks water in ice caps.
    const melt = climate.meltRaisesSea ? 0.12 * (climate.temp / 30) : 0;
    return clamp(climate.ocean + melt, 0.03, 0.97);
  }

  // Climate for a single pixel. Shared by classify() and the inspector so
  // what you click always matches what you see.
  sample(i, row) {
    const c = this.climate;
    const e = this.elev[i];
    const sea = this.seaLevel;
    const land = e >= sea;
    const h = land ? (e - sea) / Math.max(1e-6, 1 - sea) : (sea - e) / Math.max(1e-6, sea);
    const lat = this.latRad[row];
    const latDeg = Math.abs(lat) * 57.29578;
    let T = 33 - 50 * Math.pow(Math.abs(this.sinLat[row]), 1.6) + c.temp;
    if (land) T -= h * 42;           // lapse rate: mountains are colder
    else T = T * 0.92 + 1;           // oceans are slightly moderated
    // Subtropical dry belt (~25°) like Earth's Hadley cells; extreme heat dries land out.
    let m = this.moist[i] + c.moisture - 0.26 * Math.exp(-(((latDeg - 25) / 9) ** 2));
    if (T > 28) m -= (T - 28) * 0.012;
    if (land && h < 0.06) m += 0.06; // coasts are wetter
    m = clamp(m, 0, 1);
    // Reused object: avoids ~300k allocations per classify pass.
    const out = this._sampleOut || (this._sampleOut = {});
    out.land = land; out.h = h; out.T = T; out.m = m; out.e = e;
    return out;
  }

  biomeFor(s) {
    if (!s.land) {
      if (s.T < -5) return B.SEA_ICE;
      if (s.h < 0.07) return B.SHALLOW;
      if (s.h < 0.35) return B.OCEAN;
      return B.DEEP;
    }
    if (s.T < -4) return B.SNOW;
    if (s.h > 0.42) return s.T < 4 ? B.SNOW : B.ROCK;
    if (s.h < 0.012 && s.T > 2 && s.m < 0.8) return B.BEACH;
    if (s.T < 3) return B.TUNDRA;
    if (s.m < 0.28) return s.T > 10 ? B.DESERT : B.TUNDRA;
    if (s.m < 0.42) return s.T > 21 ? B.SAVANNA : B.GRASS;
    if (s.m > 0.6 && s.T > 18) return B.RAINFOREST;
    return B.FOREST;
  }

  classify(climateIn) {
    if (!this.seed) return;
    this.climate = sanitiseClimate(climateIn || {});
    const oceanFrac = this.effectiveOcean(this.climate);
    this.seaLevel = this.quantile(oceanFrac);

    const st = { ocean: 0, ice: 0, desert: 0, forest: 0, grass: 0, tundra: 0, rock: 0, habitable: 0, temp: 0, total: 0, cities: 0, pop: 0 };
    const { R, G, Bc, biome, city, elev } = this;
    const TH = this.palette, SHALLOW_RGB = TH.shallow, DEEP_RGB = TH.deep;

    for (let y = 0; y < MAP_H; y++) {
      const w = this.cosLat[y];
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const s = this.sample(i, y);
        const b = this.biomeFor(s);
        biome[i] = b;

        let r, g, bl;
        if (b === B.SHALLOW || b === B.OCEAN || b === B.DEEP) {
          const t = Math.min(1, s.h * 1.7);
          r = SHALLOW_RGB[0] + (DEEP_RGB[0] - SHALLOW_RGB[0]) * t;
          g = SHALLOW_RGB[1] + (DEEP_RGB[1] - SHALLOW_RGB[1]) * t;
          bl = SHALLOW_RGB[2] + (DEEP_RGB[2] - SHALLOW_RGB[2]) * t;
        } else {
          const col = TH.colors[b];
          // Hill shading from the east-west elevation gradient (wraps at the date line).
          const east = elev[y * MAP_W + ((x + 1) % MAP_W)];
          const north = elev[Math.max(0, y - 1) * MAP_W + x];
          const shade = b === B.SEA_ICE ? 1 : clamp(1 + (s.e - east) * 55 + (north - s.e) * 35, 0.7, 1.3);
          r = col[0] * shade; g = col[1] * shade; bl = col[2] * shade;
        }
        R[i] = clamp(r, 0, 255); G[i] = clamp(g, 0, 255); Bc[i] = clamp(bl, 0, 255);

        // Settlements: temperate, low, habitable land.
        let c = 0;
        if (s.land && s.h < 0.35 && s.T > 4 && s.T < 31 &&
            (b === B.GRASS || b === B.FOREST || b === B.SAVANNA || b === B.BEACH)) {
          c = clamp((this.cityNoise[i] - 0.6) * 4.5, 0, 1);
        }
        city[i] = (c * 255) | 0;
        const rural = s.land && s.T >= 0 && s.T <= 32 && b !== B.DESERT && b !== B.SNOW && b !== B.ROCK ? 0.05 : 0;
        this.popD[i] = c + rural;
        st.pop += (c + rural) * w;

        st.total += w;
        st.temp += s.T * w;
        if (!s.land) st.ocean += w;
        if (b === B.SEA_ICE || b === B.SNOW) st.ice += w;
        else if (b === B.DESERT) st.desert += w;
        else if (b === B.FOREST || b === B.RAINFOREST) st.forest += w;
        else if (b === B.GRASS || b === B.SAVANNA) st.grass += w;
        else if (b === B.TUNDRA) st.tundra += w;
        else if (b === B.ROCK) st.rock += w;
        if (s.land && s.T >= 0 && s.T <= 32 && b !== B.DESERT && b !== B.SNOW && b !== B.ROCK) st.habitable += w;
        if (c > 0) st.cities += w;
      }
    }
    const T = st.total;
    this.stats = {
      ocean: st.ocean / T, ice: st.ice / T, desert: st.desert / T, forest: st.forest / T,
      grass: st.grass / T, tundra: st.tundra / T, rock: st.rock / T,
      habitable: st.habitable / T, avgTemp: st.temp / T, cities: st.cities / T,
      oceanTarget: oceanFrac,
      population: st.pop * this.popK,
    };
  }

  // Human-readable info for a map pixel (used by the inspector).
  describe(row, col) {
    row = clamp(row | 0, 0, MAP_H - 1);
    col = ((col | 0) % MAP_W + MAP_W) % MAP_W;
    const i = row * MAP_W + col;
    const s = this.sample(i, row);
    const lat = this.latRad[row] * 57.29578;
    const lon = ((col + 0.5) / MAP_W - 0.5) * 360;
    return {
      biome: this.palette.names[this.biome[i]],
      lat, lon,
      altitude: s.land ? Math.round(s.h * 8800) : -Math.round(s.h * 11000),
      temp: s.T,
      moisture: s.m,
      settled: this.city[i] > 0,
    };
  }

  // Planet "class" from its stats.
  classification() {
    const s = this.stats;
    if (!s) return '';
    if (s.avgTemp > 40) return 'Scorched World';
    if (s.avgTemp > 28) return 'Hothouse World';
    if (s.ice > 0.55) return 'Ice World';
    if (s.ocean > 0.88) return 'Ocean World';
    if (s.desert > 0.3) return 'Desert World';
    if (s.forest > 0.25) return 'Jungle World';
    if (s.ocean < 0.25) return 'Barren Continent';
    if (s.habitable > 0.15) return 'Garden World';
    return 'Temperate World';
  }

  // Deterministic, pronounceable name from the seed.
  name() {
    if (!this.seed) return '';
    const rng = mulberry32(hashString('name:' + this.seed));
    const syl = ['ka', 'ri', 'ze', 'on', 'ta', 've', 'lu', 'mor', 'dra', 'xi', 'sel', 'qua', 'no', 'bek', 'ia', 'thal', 'or', 'en', 'vy', 'sa'];
    const n = 2 + Math.floor(rng() * 2);
    let w = '';
    for (let k = 0; k < n; k++) w += syl[Math.floor(rng() * syl.length)];
    const suffix = ['', '', ' Prime', ' II', ' IV', ' Major', ' b'][Math.floor(rng() * 7)];
    return w.charAt(0).toUpperCase() + w.slice(1) + suffix;
  }
}
