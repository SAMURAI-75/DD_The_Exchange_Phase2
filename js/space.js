// Full-screen space backdrop: nebula glow + layered starfield with gentle twinkle.
// Drawn on its own fixed canvas behind the whole UI (panels float over it).
'use strict';

(function () {
  const cv = document.getElementById('space');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, stars = [], base = null;
  const rng = mulberry32(20261126);

  function build() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

    // static layer: deep-space gradient, nebulae and faint stars, rendered once per resize
    base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height;
    const b = base.getContext('2d'); b.scale(dpr, dpr);
    const g = b.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0b1020'); g.addColorStop(0.55, '#05060c'); g.addColorStop(1, '#000');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    const nebula = (x, y, r, c) => {
      const n = b.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)');
      b.globalCompositeOperation = 'lighter'; b.fillStyle = n; b.fillRect(x - r, y - r, r * 2, r * 2);
      b.globalCompositeOperation = 'source-over';
    };
    nebula(W * 0.12, H * 0.2, Math.max(W, H) * 0.35, 'rgba(94, 92, 230, 0.10)');
    nebula(W * 0.88, H * 0.78, Math.max(W, H) * 0.38, 'rgba(10, 132, 255, 0.08)');
    nebula(W * 0.72, H * 0.12, Math.max(W, H) * 0.22, 'rgba(191, 90, 242, 0.06)');
    const faint = Math.round(W * H / 900);
    for (let i = 0; i < faint; i++) {
      const a = 0.15 + rng() * 0.35;
      b.fillStyle = `rgba(220,228,255,${a})`;
      b.fillRect(rng() * W, rng() * H, 0.8, 0.8);
    }
    // animated layer: brighter stars that twinkle
    stars = [];
    const count = Math.round(W * H / 5200);
    for (let i = 0; i < count; i++) {
      const warm = rng();
      stars.push({
        x: rng() * W, y: rng() * H, r: 0.5 + rng() * rng() * 1.6,
        ph: rng() * Math.PI * 2, sp: 0.4 + rng() * 1.6,
        c: warm < 0.15 ? '255,214,170' : warm < 0.3 ? '170,200,255' : '255,255,255',
      });
    }
  }

  let last = 0;
  function draw(now) {
    if (now - last > 50 || reduce) { // ~20 fps is plenty for a twinkle
      last = now;
      const t = now / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const drift = reduce ? 0 : t * 1.5;
      for (const s of stars) {
        const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
        let x = (s.x - drift * s.r) % W; if (x < 0) x += W;
        ctx.fillStyle = `rgba(${s.c},${tw})`;
        ctx.beginPath(); ctx.arc(x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        if (s.r > 1.5) { ctx.fillStyle = `rgba(${s.c},${tw * 0.12})`; ctx.beginPath(); ctx.arc(x, s.y, s.r * 3.2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    if (!reduce) requestAnimationFrame(draw);
  }

  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); last = 0; if (reduce) draw(performance.now()); }, 120); });
  build();
  requestAnimationFrame(draw);
})();
