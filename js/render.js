// Software renderer: orthographic globe + equirectangular map, both with a
// moving day/night terminator, drifting clouds and night-side city lights.
'use strict';

const GLOBE_SIZE = 800; // [UI] sharper globe (was 600)
// damage tint per disaster type id (1 asteroid, 2 quake, 3 tsunami, 4 volcano, 5 wildfire)
const DISASTER_COLORS = [null, [40, 30, 26], [130, 98, 64], [104, 88, 64], [64, 40, 32], [34, 26, 20]];
const TWO_PI = Math.PI * 2;
const INV_TWO_PI = 1 / TWO_PI;

class Renderer {
  constructor(canvas, planet) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.planet = planet;
    this.mode = 'globe';
    this.tilt = 0.35;          // radians, camera tilt (drag vertically)
    this.tableTilt = null;
    this.marker = null;        // { row, col } of inspected point
    this.zoom = 1;             // globe zoom (scroll wheel)
    this.highlight = -1;       // biome id to highlight, -1 = none
    this._makeStars();
    this.setMode('globe');
  }

  setMode(mode) {
    this.mode = mode === 'map' ? 'map' : 'globe';
    const w = this.mode === 'globe' ? GLOBE_SIZE : MAP_W;
    const h = this.mode === 'globe' ? GLOBE_SIZE : MAP_H;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.canvas.classList.toggle('map', this.mode === 'map');
    this.tableTilt = null;
  }

  _makeStars() {
    const S = GLOBE_SIZE;
    this.stars = new Uint32Array(S * S);
    // [UI] transparent background: the page's full-screen starfield shows behind the globe
    this.stars.fill(0);
  }

  // Per-pixel lookup for the globe at the current tilt: screen pixel ->
  // latitude row + base longitude. Rebuilt only when tilt changes.
  _buildGlobeTable() {
    const S = GLOBE_SIZE, R = S * 0.42 * this.zoom, cx = S / 2, cy = S / 2;
    this.R = R; this.cx = cx; this.cy = cy;
    const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
    // [FIX B5] reuse preallocated typed arrays instead of growing 8 JS arrays (~360k push() each rebuild)
    const N = S * S;
    if (!this._pool) this._pool = {
      idx: new Int32Array(N), row: new Int32Array(N), lon0: new Float32Array(N), cosL: new Float32Array(N),
      sinL: new Float32Array(N), limb: new Float32Array(N), gIdx: new Int32Array(N), gA: new Float32Array(N), trow: new Int32Array(N),
    };
    const pl = this._pool;
    let n = 0, gn = 0;
    // only scan the square that can contain the globe + glow ring
    const ext = Math.ceil(R * 1.09) + 1;
    const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(S, Math.ceil(cx + ext));
    const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(S, Math.ceil(cy + ext));
    const invR = 1 / R, PIinv = 1 / Math.PI;
    for (let py = y0; py < y1; py++) {
      const y = -(py + 0.5 - cy) * invR, yy = y * y;
      for (let px = x0; px < x1; px++) {
        const x = (px + 0.5 - cx) * invR;
        const d2 = x * x + yy;
        if (d2 <= 1) {
          const z = Math.sqrt(1 - d2);
          // un-tilt view vector into planet frame
          let y2 = y * ct + z * st;
          if (y2 > 1) y2 = 1; else if (y2 < -1) y2 = -1;
          const z2 = -y * st + z * ct;
          const cosLat = Math.sqrt(1 - y2 * y2);               // cos(asin(y2)) without asin
          const lat = Math.asin(y2);
          let r = Math.floor((0.5 - lat * PIinv) * MAP_H);
          pl.idx[n] = py * S + px;
          pl.row[n] = r < 0 ? 0 : r > MAP_H - 1 ? MAP_H - 1 : r;
          pl.lon0[n] = Math.atan2(x, z2);
          pl.cosL[n] = cosLat; pl.sinL[n] = y2;
          pl.limb[n] = 0.55 + 0.45 * z;
          const tr = Math.floor((0.5 - lat * PIinv) * 1024); pl.trow[n] = tr < 0 ? 0 : tr > 1023 ? 1023 : tr; // [EARTH] hi-res texture row
          n++;
        } else if (d2 < 1.1881) { // 1.09^2
          const d = Math.sqrt(d2), q = 1 - (d - 1) / 0.09;
          pl.gIdx[gn] = py * S + px;
          pl.gA[gn] = q * q * 0.75;
          gn++;
        }
      }
    }
    this.gt = {
      idx: pl.idx.subarray(0, n), row: pl.row.subarray(0, n), lon0: pl.lon0.subarray(0, n),
      cosL: pl.cosL.subarray(0, n), sinL: pl.sinL.subarray(0, n), limb: pl.limb.subarray(0, n), trow: pl.trow.subarray(0, n),
      gIdx: pl.gIdx.subarray(0, gn), gA: pl.gA.subarray(0, gn),
    };
    this.tableTilt = this.tilt;
    this.tableZoom = this.zoom;
  }

  setZoom(z) {
    this.zoom = Math.max(0.6, Math.min(2.4, z));
  }

  setTilt(t) {
    this.tilt = Math.max(-1.3, Math.min(1.3, t));
  }

  // Shade one surface sample; writes ABGR into buf[o].
  // light = cos(angle to sun). Returns nothing (hot path).
  _shade(buf, o, i, row, col, light, limb, view) {
    const P = this.planet;
    let day = (light + 0.12) / 0.3;               // smoothstep(-0.12, 0.18)
    day = day <= 0 ? 0 : day >= 1 ? 1 : day * day * (3 - 2 * day);
    const direct = light > 0 ? light : 0;
    // [UI] darker, moonlit night side
    const f = (0.035 + 0.965 * day * (0.45 + 0.55 * direct)) * limb;
    let r, g, b;
    if (this._ti >= 0) { // [EARTH] sharp NASA imagery, blended with the simulated biome where the climate has changed
      const T = this._T, k = this._ti * 4, w = P.texW[i];
      r = (T.day[k] * (1 - w) + P.R[i] * w) * f; g = (T.day[k + 1] * (1 - w) + P.G[i] * w) * f; b = (T.day[k + 2] * (1 - w) + P.Bc[i] * w) * f;
    } else { r = P.R[i] * f; g = P.G[i] * f; b = P.Bc[i] * f; }
    const nt = (1 - day) * limb; r += 3 * nt; g += 6 * nt; b += 16 * nt; // faint blue moonlight
    if (this._fx) {
      const z = (limb - 0.55) * 2.2222; // cos(angle to viewer)
      // ocean glint: bright, tight sun reflection on water
      if (P.biome[i] <= 2 && light > 0) {
        const nh = (light + z) * this._hNorm;
        if (nh > 0.975) { const q = (nh - 0.975) * 40, s = q * q * q * 0.55 * day; r += 255 * s; g += 244 * s; b += 222 * s; }
      }
      // atmospheric scattering on the rim, brighter on the day side
      const rim = 1 - z, sc = rim * rim * rim * (0.18 + 0.82 * day) * 0.75, gl = this._pal.glow;
      r += gl[0] * sc; g += gl[1] * sc; b += gl[2] * sc;
    }
    const dm = this.damage ? this.damage[i] : 0;
    if (dm > 0) {
      const dc = DISASTER_COLORS[this.dtype[i]] || DISASTER_COLORS[1];
      const a = dm * 0.85;
      r = r * (1 - a) + dc[0] * f * a; g = g * (1 - a) + dc[1] * f * a; b = b * (1 - a) + dc[2] * f * a;
      if (dm > 0.75 && (this.dtype[i] === 1 || this.dtype[i] === 4 || this.dtype[i] === 5)) { // glowing embers / lava
        const glow = (dm - 0.75) * 4 * (0.6 + 0.4 * Math.sin(i * 12.9898));
        r += 220 * glow * limb; g += 70 * glow * limb;
      }
    }
    if (this.world && this.world.ready) { // [FEATURE] borders, selection, outbreaks, war fronts, human footprint, cataclysms
      const c = this._rgb; c[0] = r; c[1] = g; c[2] = b;
      this.world.shade(i, c, day * 0.9 + 0.1);
      r = c[0]; g = c[1]; b = c[2];
    }
    if (this.highlight >= 0 && P.biome[i] !== this.highlight) {
      const gray = (r + g + b) * 0.1; r = gray; g = gray; b = gray;
    }

    // warm twilight band along the terminator
    const tw = 1 - Math.abs(light - 0.02) / 0.08;
    if (tw > 0) { r += 34 * tw * limb; g += 10 * tw * limb; }

    const doomed = this.world && this.world.doomAmt > 0.4 && this.world.doom.type !== 'meteors';
    if (this._ti >= 0 && view.cities && !doomed) { // [EARTH] real night lights: tiny, sharp points
      const L = this._T.night[this._ti] / 255;
      if (L > 0.12 && (P.Tmap[i] > -40)) { const n = (1 - day) * L * L * limb * 1.15; r += 255 * n; g += 196 * n; b += 120 * n; }
    } else if (view.cities && !doomed) {
      const c = P.city[i];
      if (c && dm < 0.5) {
        const n = (1 - day) * (1 - dm * 2) * (c / 255) * limb;
        const cc = this._pal.city;
        const sp = ((i * 2654435761) >>> 0) % 7 === 0 ? 1 : 0.25; // [UI] sparse, small sparkles instead of blobs
        r += cc[0] * n * 0.6 * sp; g += cc[1] * n * 0.6 * sp; b += cc[2] * n * 0.6 * sp;
      }
    }
    if (view.clouds && !doomed) {
      let cc = col + view.cloudShift;
      cc = ((cc % MAP_W) + MAP_W) % MAP_W;
      const cv = P.cloud[row * MAP_W + cc];
      let a = (cv - 0.56) * 3.2;
      if (a > 0) {
        if (a > 0.85) a = 0.85;
        const cl = (0.06 + 0.94 * day) * limb, ct = this._pal.cloud;
        r = r * (1 - a) + ct[0] * cl * a; g = g * (1 - a) + ct[1] * cl * a; b = b * (1 - a) + ct[2] * cl * a;
      }
    }
    r = r > 255 ? 255 : r < 0 ? 0 : r; g = g > 255 ? 255 : g < 0 ? 0 : g; b = b > 255 ? 255 : b < 0 ? 0 : b;
    buf[o] = (this._alpha << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
  }

  render(view) {
    if (!this.planet.seed) return;
    this._pal = this.planet.palette; // [perf] look the theme up once per frame, not per pixel
    this._rgb = this._rgb || new Float32Array(3);
    const W = this.world, consumed = W && W.doom && W.doom.type === 'blackhole';
    this._alpha = consumed ? Math.max(0, Math.round(255 * (1 - W.doomAmt))) : 255;
    if (W && W.vanished && this.mode === 'globe') { this.buf.fill(0); this.ctx.putImageData(this.image, 0, 0); if (this.overlay) this.overlay(this.ctx, view); return; }
    if (this.mode === 'globe') this._renderGlobe(view);
    else this._renderMap(view);
    this.ctx.putImageData(this.image, 0, 0);
    this._drawMarker(view);
    if (this.overlay) this.overlay(this.ctx, view);
  }

  _renderGlobe(view) {
    if (this.tableTilt !== this.tilt || this.tableZoom !== this.zoom) this._buildGlobeTable();
    const buf = this.buf;
    buf.set(this.stars);
    const t = this.gt;
    const cosDec = Math.cos(view.sunDec), sinDec = Math.sin(view.sunDec);

    // atmosphere glow (tinted by world theme)
    const gc = this.planet.palette.glow;
    for (let k = 0; k < t.gIdx.length; k++) {
      const o = t.gIdx[k], a = t.gA[k];
      buf[o] = (((a * 255) | 0) << 24) | (gc[2] << 16) | (gc[1] << 8) | gc[0]; // glow fades into the page
    }

    const yaw = view.yaw, sunLon = view.sunLon;
    const texOn = this.planet.isEarth && typeof EARTH !== 'undefined' && EARTH.tex.ok; this._T = texOn ? EARTH.tex : null;
    // [UI] sun direction in view space for the ocean glint (Blinn-Phong half vector with view = +z)
    const l0 = sunLon - yaw, sx2 = cosDec * Math.cos(l0), sy2 = sinDec;
    const sz = sy2 * Math.sin(this.tilt) + sx2 * Math.cos(this.tilt);
    this._hNorm = 1 / Math.sqrt(Math.max(1e-4, 2 + 2 * sz));
    this._fx = true;
    for (let k = 0; k < t.idx.length; k++) {
      const lon = t.lon0[k] + yaw;
      let u = lon * INV_TWO_PI + 0.5;
      u -= Math.floor(u);
      let col = (u * MAP_W) | 0;
      if (col >= MAP_W) col = MAP_W - 1;
      const row = t.row[k];
      const light = t.cosL[k] * Math.cos(lon - sunLon) * cosDec + t.sinL[k] * sinDec;
      this._ti = texOn ? t.trow[k] * 2048 + ((u * 2048) | 0) : -1;
      this._shade(buf, t.idx[k], row * MAP_W + col, row, col, light, t.limb[k], view);
    }
  }

  _renderMap(view) {
    const P = this.planet, buf = this.buf;
    const texOn = P.isEarth && typeof EARTH !== 'undefined' && EARTH.tex.ok; this._T = texOn ? EARTH.tex : null;
    this._fx = false;
    const cosDec = Math.cos(view.sunDec), sinDec = Math.sin(view.sunDec);
    for (let row = 0; row < MAP_H; row++) {
      const cl = P.cosLat[row], sl = P.sinLat[row];
      for (let col = 0; col < MAP_W; col++) {
        const lon = ((col + 0.5) / MAP_W - 0.5) * TWO_PI;
        const light = cl * Math.cos(lon - view.sunLon) * cosDec + sl * sinDec;
        const i = row * MAP_W + col;
        this._ti = texOn ? (((row + 0.5) * 1024 / MAP_H) | 0) * 2048 + (((col + 0.5) * 2048 / MAP_W) | 0) : -1;
        this._shade(buf, i, i, row, col, light, 1, view);
      }
    }
  }

  // Screen (canvas px) -> { row, col } on the map, or null if off-planet.
  pick(px, py, view) {
    if (this.mode === 'map') {
      if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) return null;
      return { row: Math.floor(py), col: Math.floor(px) };
    }
    if (this.tableTilt !== this.tilt || this.tableZoom !== this.zoom) this._buildGlobeTable();
    const x = (px - this.cx) / this.R, y = -(py - this.cy) / this.R;
    const d2 = x * x + y * y;
    if (d2 > 1) return null;
    const z = Math.sqrt(1 - d2);
    const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
    const y2 = y * ct + z * st, z2 = -y * st + z * ct;
    const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
    const lon = Math.atan2(x, z2) + view.yaw;
    let u = lon * INV_TWO_PI + 0.5; u -= Math.floor(u);
    return {
      row: Math.min(MAP_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * MAP_H))),
      col: Math.min(MAP_W - 1, Math.floor(u * MAP_W)),
    };
  }

  _drawMarker(view) {
    if (!this.marker) return;
    const { row, col } = this.marker;
    let sx, sy;
    if (this.mode === 'map') {
      sx = col + 0.5; sy = row + 0.5;
    } else {
      const lat = (0.5 - (row + 0.5) / MAP_H) * Math.PI;
      const lon = ((col + 0.5) / MAP_W - 0.5) * TWO_PI;
      const l0 = lon - view.yaw;
      const x2 = Math.cos(lat) * Math.sin(l0), y2 = Math.sin(lat), z2 = Math.cos(lat) * Math.cos(l0);
      const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
      const y = y2 * ct - z2 * st, z = y2 * st + z2 * ct;
      if (z <= 0) return; // on the far side
      sx = this.cx + x2 * this.R; sy = this.cy - y * this.R;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, TWO_PI); ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, TWO_PI); ctx.fill();
    ctx.restore();
  }
}
