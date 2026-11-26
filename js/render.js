// Software renderer: orthographic globe + equirectangular map, both with a
// moving day/night terminator, drifting clouds and night-side city lights.
'use strict';

const GLOBE_SIZE = 600;
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
    const bg = (255 << 24) | (14 << 16) | (8 << 8) | 5; // ABGR: very dark blue
    this.stars.fill(bg);
    const rng = mulberry32(1234567);
    for (let k = 0; k < 700; k++) {
      const i = Math.floor(rng() * S * S);
      const v = 90 + Math.floor(rng() * 165);
      this.stars[i] = (255 << 24) | (v << 16) | (v << 8) | Math.min(255, v + 10);
    }
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
      sinL: new Float32Array(N), limb: new Float32Array(N), gIdx: new Int32Array(N), gA: new Float32Array(N),
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
      cosL: pl.cosL.subarray(0, n), sinL: pl.sinL.subarray(0, n), limb: pl.limb.subarray(0, n),
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
    const f = (0.12 + 0.88 * day * (0.5 + 0.5 * direct)) * limb;
    let r = P.R[i] * f, g = P.G[i] * f, b = P.Bc[i] * f;
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
    if (this.highlight >= 0 && P.biome[i] !== this.highlight) {
      const gray = (r + g + b) * 0.1; r = gray; g = gray; b = gray;
    }

    // warm twilight band along the terminator
    const tw = 1 - Math.abs(light - 0.02) / 0.08;
    if (tw > 0) { r += 34 * tw * limb; g += 10 * tw * limb; }

    if (view.cities) {
      const c = P.city[i];
      if (c && dm < 0.5) {
        const n = (1 - day) * (1 - dm * 2) * (c / 255) * limb;
        const cc = this.planet.palette.city;
        r += cc[0] * n; g += cc[1] * n; b += cc[2] * n;
      }
    }
    if (view.clouds) {
      let cc = col + view.cloudShift;
      cc = ((cc % MAP_W) + MAP_W) % MAP_W;
      const cv = P.cloud[row * MAP_W + cc];
      let a = (cv - 0.56) * 3.2;
      if (a > 0) {
        if (a > 0.85) a = 0.85;
        const cl = (0.06 + 0.94 * day) * limb, ct = this.planet.palette.cloud;
        r = r * (1 - a) + ct[0] * cl * a; g = g * (1 - a) + ct[1] * cl * a; b = b * (1 - a) + ct[2] * cl * a;
      }
    }
    r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
    buf[o] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
  }

  render(view) {
    if (!this.planet.seed) return;
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
      const p = buf[o];
      const r = (p & 255) * (1 - a) + gc[0] * a, g = ((p >> 8) & 255) * (1 - a) + gc[1] * a, b = ((p >> 16) & 255) * (1 - a) + gc[2] * a;
      buf[o] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
    }

    const yaw = view.yaw, sunLon = view.sunLon;
    for (let k = 0; k < t.idx.length; k++) {
      const lon = t.lon0[k] + yaw;
      let u = lon * INV_TWO_PI + 0.5;
      u -= Math.floor(u);
      let col = (u * MAP_W) | 0;
      if (col >= MAP_W) col = MAP_W - 1;
      const row = t.row[k];
      const light = t.cosL[k] * Math.cos(lon - sunLon) * cosDec + t.sinL[k] * sinDec;
      this._shade(buf, t.idx[k], row * MAP_W + col, row, col, light, t.limb[k], view);
    }
  }

  _renderMap(view) {
    const P = this.planet, buf = this.buf;
    const cosDec = Math.cos(view.sunDec), sinDec = Math.sin(view.sunDec);
    for (let row = 0; row < MAP_H; row++) {
      const cl = P.cosLat[row], sl = P.sinLat[row];
      for (let col = 0; col < MAP_W; col++) {
        const lon = ((col + 0.5) / MAP_W - 0.5) * TWO_PI;
        const light = cl * Math.cos(lon - view.sunLon) * cosDec + sl * sinDec;
        const i = row * MAP_W + col;
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
