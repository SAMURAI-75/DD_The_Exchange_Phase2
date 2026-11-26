// Life on the planet: themed creatures, a side-view landscape preview of the
// inspected spot, and the "Creature Catcher" mini-game.
'use strict';

// Biome id -> habitat group (ids from BIOMES in planet.js)
const HABITAT = ['ocean', 'ocean', 'ocean', 'ice', 'beach', 'desert', 'grass', 'forest', 'forest', 'tundra', 'ice', 'rock', 'grass'];

const LIFE = {
  earth: {
    craft: '✈️', craftTop: '',
    creatures: {
      ocean: ['🐋', '🐬', '🐢'], ice: ['🐧', '🦭'], beach: ['🦀', '🦩'], desert: ['🐪', '🦂'],
      grass: ['🦒', '🐘', '🦓'], forest: ['🦌', '🐒', '🦜'], tundra: ['🐺', '🦌'], rock: ['🦅', '🐐'],
    },
    flora: { ocean: '', ice: '❄️', beach: '🌴', desert: '🌵', grass: '🌾', forest: '🌳', tundra: '🪨', rock: '🏔️' },
    sky: { day: ['#6fb9ff', '#d9f0ff'], night: ['#060a1f', '#1b2350'] },
  },
};

class Life {
  constructor(planet, renderer, view) {
    this.planet = planet;
    this.renderer = renderer;
    this.view = view;
    this.creatures = [];
    this.game = null;         // { time, score, keys... }
    this.keys = new Set();
    this.vel = { yaw: 0, tilt: 0 };
    this.best = this._loadBest();
    this.onGameEnd = null;
    this.onScore = null;
    renderer.overlay = (ctx) => this.draw(ctx);
  }

  get theme() { return Object.prototype.hasOwnProperty.call(LIFE, this.planet.theme) ? LIFE[this.planet.theme] : LIFE.earth; } // [FIX B1]

  // ---------- creatures ----------
  _randomSpot() {
    // Uniform on the sphere, limited to |lat| < 65° so the globe can reach it.
    for (let tries = 0; tries < 40; tries++) {
      const lat = Math.asin((Math.random() * 2 - 1) * Math.sin(65 * Math.PI / 180));
      const row = Math.min(MAP_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * MAP_H)));
      const col = Math.floor(Math.random() * MAP_W);
      const b = this.planet.biome[row * MAP_W + col];
      if (b !== undefined) return { row, col, biome: b };
    }
    return { row: MAP_H >> 1, col: 0, biome: this.planet.biome[(MAP_H >> 1) * MAP_W] };
  }

  _spawn(bonusChance) {
    const s = this._randomSpot();
    const hab = HABITAT[s.biome] || 'grass';
    const list = this.theme.creatures[hab];
    const bonus = Math.random() < bonusChance;
    const k = Math.floor(Math.random() * list.length);
    return {
      row: s.row, col: s.col, hab,
      emoji: bonus ? '⭐' : list[k],
      points: bonus ? 5 : (k === list.length - 1 ? 2 : 1),
      phase: Math.random() * 6.28,
    };
  }

  populate(count) {
    if (!this.planet.seed) return;
    this.creatures = [];
    for (let i = 0; i < count; i++) this.creatures.push(this._spawn(this.game ? 0.12 : 0));
  }

  // Planet (row, col) -> canvas position, or null if on the far side.
  project(row, col) {
    const r = this.renderer;
    if (r.mode === 'map') return { x: col + 0.5, y: row + 0.5, z: 1 };
    if (!r.R) return null;
    const lat = (0.5 - (row + 0.5) / MAP_H) * Math.PI;
    const lon = ((col + 0.5) / MAP_W - 0.5) * Math.PI * 2;
    const l0 = lon - this.view.yaw;
    const x2 = Math.cos(lat) * Math.sin(l0), y2 = Math.sin(lat), z2 = Math.cos(lat) * Math.cos(l0);
    const ct = Math.cos(r.tilt), st = Math.sin(r.tilt);
    const y = y2 * ct - z2 * st, z = y2 * st + z2 * ct;
    if (z <= 0.08) return null;
    return { x: r.cx + x2 * r.R, y: r.cy - y * r.R, z };
  }

  sunlight(row, col) {
    const v = this.view;
    const lat = (0.5 - (row + 0.5) / MAP_H) * Math.PI;
    const lon = ((col + 0.5) / MAP_W - 0.5) * Math.PI * 2;
    return Math.cos(lat) * Math.cos(lon - v.sunLon) * Math.cos(v.sunDec) + Math.sin(lat) * Math.sin(v.sunDec);
  }

  // ---------- game ----------
  startGame() {
    if (!this.planet.seed) return;
    this.game = { time: 60, score: 0, caught: 0, flash: [] };
    this.vel.yaw = 0; this.vel.tilt = 0;
    this.populate(16);
  }

  stopGame(finished) {
    if (!this.game) return;
    const g = this.game;
    this.game = null;
    let newBest = false;
    if (finished && g.score > this.best) { this.best = g.score; this._saveBest(); newBest = true; }
    this.populate(10);
    if (this.onGameEnd) this.onGameEnd(g, finished, newBest);
  }

  _loadBest() {
    try { const v = Number(localStorage.getItem('tinyterra.best')); return Number.isFinite(v) && v > 0 ? v : 0; } catch (_) { return 0; }
  }
  _saveBest() { try { localStorage.setItem('tinyterra.best', String(this.best)); } catch (_) { /* optional */ } }

  update(dt) {
    const g = this.game;
    if (!g) return;
    const r = this.renderer;
    // Steering: arrows / WASD fly the craft (the planet turns beneath it).
    const ax = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    const ay = (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0);
    const accel = 3.2, damp = Math.pow(0.04, dt);
    this.vel.yaw = (this.vel.yaw + ax * accel * dt) * damp;
    this.vel.tilt = (this.vel.tilt + ay * accel * dt) * damp;
    this.view.yaw += this.vel.yaw * dt * 1.6;
    r.setTilt(r.tilt + this.vel.tilt * dt * 1.6);

    const before = Math.ceil(g.time);
    g.time -= dt;
    if (Math.ceil(g.time) < before && before <= 5 && this.onTick) this.onTick();
    // Catch creatures under the craft (screen centre), awake (daylit) only.
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      const p = this.project(c.row, c.col);
      if (!p) continue;
      const dx = p.x - r.cx, dy = p.y - r.cy;
      if (dx * dx + dy * dy < 30 * 30) {
        if (this.sunlight(c.row, c.col) > 0) {
          g.score += c.points; g.caught++; g.lastPoints = c.points;
          g.flash.push({ x: p.x, y: p.y, text: '+' + c.points, t: 0.9 });
          this.creatures[i] = this._spawn(0.12);
          if (this.onScore) this.onScore(g);
        } else if (!c.warned) {
          c.warned = true;
          if (this.onAsleep) this.onAsleep();
          g.flash.push({ x: p.x, y: p.y, text: 'asleep 💤', t: 0.9 });
        }
      } else c.warned = false;
    }
    for (const f of g.flash) { f.t -= dt; f.y -= dt * 30; }
    g.flash = g.flash.filter((f) => f.t > 0);
    if (g.time <= 0) { g.time = 0; this.stopGame(true); }
  }

  // ---------- overlay drawing on the planet canvas ----------
  draw(ctx) {
    if (!this.planet.seed) return;
    const t = performance.now() / 1000;
    const big = !!this.game;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of this.creatures) {
      const p = this.project(c.row, c.col);
      if (!p) continue;
      const awake = this.sunlight(c.row, c.col) > 0;
      const size = (big ? 24 : (this.renderer.mode === 'map' ? 13 : 16)) * (0.6 + 0.4 * p.z);
      ctx.globalAlpha = awake ? 1 : 0.45;
      ctx.font = `${size | 0}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(c.emoji, p.x, p.y + (awake ? Math.sin(t * 3 + c.phase) * 2 : 0));
      if (!awake && big) { ctx.font = '11px system-ui'; ctx.fillText('💤', p.x + size * 0.5, p.y - size * 0.5); }
    }
    ctx.globalAlpha = 1;

    const g = this.game;
    if (g) {
      const r = this.renderer, th = this.theme;
      // craft
      const ang = Math.atan2(-this.vel.tilt, this.vel.yaw);
      const moving = Math.abs(this.vel.yaw) + Math.abs(this.vel.tilt) > 0.05;
      ctx.save();
      ctx.translate(r.cx, r.cy);
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,179,71,0.55)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      if (th.craft === '✈️' && moving) ctx.rotate(ang + Math.PI / 4); // ✈️ emoji points up-right
      ctx.font = '34px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.fillText(th.craft, 0, 0);
      if (th.craftTop) { ctx.font = '18px system-ui, "Apple Color Emoji", sans-serif'; ctx.fillText(th.craftTop, 10, -14); }
      ctx.restore();
      // floating score popups
      ctx.font = 'bold 16px system-ui'; ctx.fillStyle = '#ffd36e';
      for (const f of g.flash) { ctx.globalAlpha = Math.min(1, f.t * 1.5); ctx.fillText(f.text, f.x, f.y - 20); }
      ctx.globalAlpha = 1;
      // HUD
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(12, 12, 210, 54);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui';
      ctx.fillText(`Score ${g.score}`, 22, 30);
      ctx.fillStyle = g.time < 10 ? '#ff7b7b' : '#ffb347';
      ctx.fillText(`⏱ ${Math.ceil(g.time)}s`, 130, 30);
      ctx.fillStyle = '#c9d2e3'; ctx.font = '12px system-ui';
      ctx.fillText(`Best ${this.best} · catch awake creatures`, 22, 52);
    }
    ctx.restore();
  }

  // ---------- side-view landscape preview ----------
  drawScene(canvas, row, col) {
    const P = this.planet;
    if (!P.seed || !canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const th = this.theme;
    const light = this.sunlight(row, col);
    const day = Math.max(0, Math.min(1, (light + 0.1) / 0.3));
    const mix = (a, b, k) => {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
      const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    };
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix(th.sky.night[0], th.sky.day[0], day));
    sky.addColorStop(1, mix(th.sky.night[1], th.sky.day[1], day));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '20px system-ui, "Apple Color Emoji", sans-serif';
    if (day > 0.5) ctx.fillText('☀️', W - 30, 24);
    else { ctx.fillText('🌙', W - 30, 24); ctx.fillStyle = '#fff'; for (let k = 0; k < 18; k++) ctx.fillRect((k * 53) % W, (k * 29) % (H * 0.45), 1.5, 1.5); }

    // terrain profile along the east-west line through the point
    const sea = P.seaLevel, seaY = H * 0.68, scale = H * 0.9;
    const span = 90; // map columns shown across the panel
    const ys = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const c = (((col + Math.round((x / W - 0.5) * span)) % MAP_W) + MAP_W) % MAP_W;
      const i = row * MAP_W + c;
      const e = P.elev[i];
      const y = seaY - (e - sea) * scale;
      ys[x] = y;
      if (e < sea) {
        ctx.fillStyle = `rgb(${th === LIFE.earth ? '30,90,160' : P.palette.shallow.join(',')})`;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, seaY, 1, H - seaY);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgb(${P.R[i] * 0.6 | 0},${P.G[i] * 0.6 | 0},${P.Bc[i] * 0.6 | 0})`;
        ctx.fillRect(x, Math.max(seaY, y), 1, H);
      } else {
        const f = 0.35 + 0.65 * day;
        ctx.fillStyle = `rgb(${P.R[i] * f | 0},${P.G[i] * f | 0},${P.Bc[i] * f | 0})`;
        ctx.fillRect(x, y, 1, H - y);
      }
    }
    // flora + creatures (deterministic per location so the scene doesn't flicker)
    let seed = (row * 7919 + col * 104729) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let x = 12; x < W - 10; x += 22 + Math.floor(rnd() * 14)) {
      const c = (((col + Math.round((x / W - 0.5) * span)) % MAP_W) + MAP_W) % MAP_W;
      const b = P.biome[row * MAP_W + c];
      const hab = HABITAT[b] || 'grass';
      const groundY = Math.min(ys[x], hab === 'ocean' ? seaY : ys[x]);
      const r = rnd();
      ctx.globalAlpha = 0.5 + 0.5 * day;
      if (hab === 'ocean') {
        if (r < 0.35) { ctx.font = '16px system-ui, "Apple Color Emoji", sans-serif'; ctx.fillText(th.creatures.ocean[Math.floor(rnd() * th.creatures.ocean.length)], x, seaY + 14 + rnd() * 10); }
      } else if (r < 0.6 && th.flora[hab]) {
        ctx.font = '18px system-ui, "Apple Color Emoji", sans-serif';
        ctx.fillText(th.flora[hab], x, groundY - 8);
      } else if (r < 0.85) {
        const list = th.creatures[hab];
        ctx.font = '16px system-ui, "Apple Color Emoji", sans-serif';
        ctx.fillText(list[Math.floor(rnd() * list.length)], x, groundY - 9);
      }
      ctx.globalAlpha = 1;
    }
    if (this.decorate) this.decorate(ctx, row, col, W, H, ys[W >> 1]); // [FEATURE] war, outbreak, flood, fire, ruins…
    // marker for the inspected point (centre)
    ctx.strokeStyle = '#ffb347'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
  }
}
