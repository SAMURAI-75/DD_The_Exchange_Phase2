// Software renderer: orthographic globe + equirectangular map, both with a
// moving day/night terminator, drifting clouds and night-side city lights.
'use strict';

const GLOBE_SIZE = 600;
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
    const idx = [], row = [], lon0 = [], cosL = [], sinL = [], limb = [];
    const gIdx = [], gA = [];
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = (px + 0.5 - cx) / R, y = -(py + 0.5 - cy) / R;
        const d2 = x * x + y * y;
        if (d2 <= 1) {
          const z = Math.sqrt(1 - d2);
          // un-tilt view vector into planet frame
          const y2 = y * ct + z * st;
          const z2 = -y * st + z * ct;
          const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
          idx.push(py * S + px);
          row.push(Math.min(MAP_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * MAP_H))));
          lon0.push(Math.atan2(x, z2));
          cosL.push(Math.cos(lat)); sinL.push(Math.sin(lat));
          limb.push(0.55 + 0.45 * z);
        } else {
          const d = Math.sqrt(d2);
          if (d < 1.09) {
            gIdx.push(py * S + px);
            gA.push(Math.pow(1 - (d - 1) / 0.09, 2) * 0.75);
          }
        }
      }
    }
    this.gt = {
      idx: Int32Array.from(idx), row: Int32Array.from(row), lon0: Float32Array.from(lon0),
      cosL: Float32Array.from(cosL), sinL: Float32Array.from(sinL), limb: Float32Array.from(limb),
      gIdx: Int32Array.from(gIdx), gA: Float32Array.from(gA),
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
    if (this.highlight >= 0 && P.biome[i] !== this.highlight) {
      const gray = (r + g + b) * 0.1; r = gray; g = gray; b = gray;
    }

    // warm twilight band along the terminator
    const tw = 1 - Math.abs(light - 0.02) / 0.08;
    if (tw > 0) { r += 34 * tw * limb; g += 10 * tw * limb; }

    if (view.cities) {
      const c = P.city[i];
      if (c) {
        const n = (1 - day) * (c / 255) * limb;
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
