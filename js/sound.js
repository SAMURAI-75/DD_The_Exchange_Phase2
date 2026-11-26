// Sound effects synthesised with the Web Audio API: no audio files needed.
// The AudioContext is created on the first user gesture (browser autoplay rules).
'use strict';

const Sfx = {
  ctx: null,
  muted: false,

  init() {
    try { this.muted = localStorage.getItem('tinyterra.muted') === '1'; } catch (_) { /* optional */ }
    const unlock = () => {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  },

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem('tinyterra.muted', this.muted ? '1' : '0'); } catch (_) { /* optional */ }
  },

  // One shaped oscillator note. freq may slide to `to`.
  tone(freq, dur, { type = 'sine', vol = 0.15, to = null, delay = 0 } = {}) {
    if (this.muted || !this.ctx) return;
    try {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (_) { /* never let audio break the app */ }
  },

  noise(dur, { vol = 0.12, from = 1800, to = 300 } = {}) {
    if (this.muted || !this.ctx) return;
    try {
      const c = this.ctx, t = c.currentTime;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
    } catch (_) { /* ignore */ }
  },

  click() { this.tone(660, 0.06, { type: 'triangle', vol: 0.08 }); },
  generate() { this.noise(0.6, { vol: 0.14, from: 300, to: 2400 }); this.tone(180, 0.5, { to: 520, vol: 0.08 }); },
  theme(name) {
    const sets = { earth: [523, 659, 784], candy: [784, 988, 1319], alien: [330, 311, 466] };
    const type = name === 'alien' ? 'square' : 'sine';
    (sets[name] || sets.earth).forEach((f, k) => this.tone(f, 0.18, { type, vol: 0.07, delay: k * 0.07 }));
  },
  inspect() { this.tone(880, 0.08, { type: 'sine', vol: 0.07, to: 1180 }); },
  catch(points) {
    const base = points >= 5 ? 988 : points >= 2 ? 784 : 659;
    this.tone(base, 0.09, { type: 'square', vol: 0.07 });
    this.tone(base * 1.5, 0.14, { type: 'square', vol: 0.07, delay: 0.07 });
    if (points >= 5) this.tone(base * 2, 0.2, { type: 'triangle', vol: 0.08, delay: 0.15 });
  },
  asleep() { this.tone(160, 0.25, { type: 'sawtooth', vol: 0.05, to: 110 }); },
  tick() { this.tone(1000, 0.05, { type: 'square', vol: 0.05 }); },
  start() { [392, 523, 659, 784].forEach((f, k) => this.tone(f, 0.12, { type: 'square', vol: 0.06, delay: k * 0.09 })); },
  end(best) {
    const notes = best ? [523, 659, 784, 1047, 1319] : [784, 659, 523, 392];
    notes.forEach((f, k) => this.tone(f, 0.2, { type: 'triangle', vol: 0.08, delay: k * 0.12 }));
  },
  disaster(key) {
    if (key === 'tsunami') { this.noise(1.6, { vol: 0.22, from: 600, to: 150 }); return; }
    if (key === 'wildfire') { this.noise(1.4, { vol: 0.16, from: 2500, to: 900 }); return; }
    if (key === 'asteroid') this.tone(1400, 0.7, { type: 'sawtooth', vol: 0.05, to: 200 });
    const d = key === 'asteroid' ? 0.6 : 0;
    setTimeout(() => {
      this.noise(1.8, { vol: 0.3, from: 400, to: 60 });
      this.tone(70, 1.6, { type: 'sine', vol: 0.25, to: 30 });
    }, d * 1000);
  },
  snapshot() { this.noise(0.12, { vol: 0.2, from: 4000, to: 1500 }); },
};
Sfx.init();
