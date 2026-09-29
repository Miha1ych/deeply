'use strict';
// "Грядка": a watermelon grows with focus minutes. When it is ripe a cat walks in, eats it,
// turns into a round striped watermelon-cat and rolls away; then a new seed is planted.
// Procedural Canvas 2D drawing; the static sky/ground layer is cached in an offscreen canvas.

const GARDEN_TARGET = 100;

class Garden {
  constructor(canvas, info) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.info = info;              // { stage, sub, eaten, fill, min } DOM elements
    this.minutes = 0; this.eaten = 0; this.target = GARDEN_TARGET;
    this.onCatFinished = null;
    this.theme = null;
    this.visible = false;
    this.animStart = -1;
    this.visibleSince = 0;
    this.bg = null;
    this.fx = document.createElement('canvas');
    this.raf = 0; this.frame = 0;
    this.lastInfo = '';
    this.loop = this.loop.bind(this);
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    document.addEventListener('visibilitychange', () => this.kick());
  }

  get ripe() { return this.minutes >= this.target; }
  get animating() { return this.animStart >= 0; }
  now() { return performance.now() / 1000; }

  set(minutes, eaten) { this.minutes = minutes; this.eaten = eaten; this.kick(); this.updateInfo(this.animating ? this.now() - this.animStart : -1); }
  setTheme(theme) { this.theme = theme; this.bg = null; this.kick(); }
  setVisible(v) {
    this.visible = v;
    if (v) { this.visibleSince = this.now(); this.resize(); }
    this.kick();
  }

  kick() {
    if (this.visible && !document.hidden && !this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.fx.width = w; this.fx.height = h;
      this.bg = null;
    }
    this.kick();
  }

  loop() {
    this.raf = 0;
    if (!this.visible || document.hidden) return;
    this.frame++;
    const now = this.now();
    if (!this.animating && this.ripe && now - this.visibleSince > 1.2) this.animStart = now;
    if (this.animating && now - this.animStart > T.End) {
      this.animStart = -1;
      if (this.onCatFinished) this.onCatFinished();
    }
    // the cat scene runs every frame; the idle sway is fine at half rate
    if (this.animating || this.frame % 2 === 0) this.draw(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────── geometry ─────────────
  scene() {
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.min(H / 6.8, W / 10.5);
    return { W, H, u, gy: H - H * 0.28, px: W * 0.36 };
  }

  // ───────────── static layer ─────────────
  buildStatic(s) {
    const c = document.createElement('canvas');
    c.width = s.W; c.height = s.H;
    const g = c.getContext('2d');
    const light = !!(this.theme && this.theme.light);
    const { W, H, u, gy, px } = s;
    const rnd = seeded(7);

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, light ? '#F3E3C8' : '#102E24');
    sky.addColorStop(1, light ? '#E2C4A2' : '#06140F');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (!light) {
      for (let i = 0; i < 46; i++) {
        const x = rnd() * W, y = rnd() * gy * 0.8, d = (rnd() * 1.6 + 0.8) * (window.devicePixelRatio || 1);
        g.fillStyle = `rgba(255,255,255,${(40 + rnd() * 90) / 255})`;
        g.beginPath(); g.arc(x, y, d / 2, 0, Math.PI * 2); g.fill();
      }
    }
    // soft glow behind the plant in the theme accent
    const acc = hexRgb(this.theme ? this.theme.accent : '#43C59E');
    const glow = g.createRadialGradient(px, gy, 0, px, gy, 5 * u);
    glow.addColorStop(0, `rgba(${acc},.24)`); glow.addColorStop(1, `rgba(${acc},0)`);
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    // ground hill
    const P = groundCurve(s);
    g.beginPath();
    g.moveTo(P[0], P[1]); g.bezierCurveTo(P[2], P[3], P[4], P[5], P[6], P[7]);
    g.lineTo(W + 2, H + 2); g.lineTo(-2, H + 2); g.closePath();
    const soil = g.createLinearGradient(0, gy - u, 0, H);
    soil.addColorStop(0, '#4A3524'); soil.addColorStop(1, '#1C130C');
    g.fillStyle = soil; g.fill();
    for (let i = 0; i < 18; i++) {
      const x = rnd() * W, y = gy + 0.5 * u + rnd() * (H - gy - 0.6 * u), w = (rnd() * 0.12 + 0.06) * u;
      g.fillStyle = `rgba(141,112,85,${(40 + rnd() * 50) / 255})`;
      g.beginPath(); g.ellipse(x + w / 2, y + w * 0.35, w / 2, w * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
    // grass rim + tufts
    g.strokeStyle = '#3C9A55'; g.lineWidth = Math.max(2, 0.08 * u); g.lineCap = 'round';
    g.beginPath(); g.moveTo(P[0], P[1]); g.bezierCurveTo(P[2], P[3], P[4], P[5], P[6], P[7]); g.stroke();
    for (let x = 0.3 * u; x < W; x += (rnd() * 0.7 + 0.35) * u) {
      const y = groundY(P, x), h = (rnd() * 0.25 + 0.12) * u;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - h * 0.4, y - h); g.moveTo(x, y); g.lineTo(x + h * 0.3, y - h * 0.9); g.stroke();
    }
    return c;
  }

  // ───────────── frame ─────────────
  draw(now) {
    const s = this.scene();
    const g = this.ctx;
    if (s.W < 120 || s.H < 100) return;
    if (!this.bg) this.bg = this.buildStatic(s);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);

    const t = this.animating ? now - this.animStart : -1;
    const { u, gy, px } = s;
    let growth = Math.min(1, this.minutes / this.target);
    if (t >= T.Roll) growth = Math.min(1, Math.max(0, this.minutes - this.target) / this.target);   // replanted

    const bites = [];
    let fruitGone = false;
    if (t >= 0 && t < T.Roll) {
      const f = fruitGeom(px, gy, u, 1);
      for (let k = 0; k < CHOMPS; k++) if (t >= chompTime(k)) bites.push(bite(k, f));
      fruitGone = t >= chompTime(CHOMPS - 1) + 0.12;
    }

    this.drawPlant(g, s, growth, now, bites, fruitGone, t < 0);
    if (t >= 0) this.drawCatScene(g, s, t);
    if (t >= T.Roll) {
      const a = Math.min(1, (t - T.Roll) / 0.4) * Math.min(1, (T.End - t) / 0.5);
      if (a > 0) {
        g.globalAlpha = a;
        g.fillStyle = this.theme && this.theme.light ? '#2E2520' : '#F2FFF9';
        g.font = `600 ${Math.max(12, s.H * 0.05)}px "Segoe UI Variable Display", "Segoe UI"`;
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('Кот укатился. Сажаем новый арбуз!', s.W / 2, s.H * 0.1);
        g.globalAlpha = 1; g.textAlign = 'left';
      }
    }
    this.updateInfo(t);
  }

  updateInfo(t) {
    const growth = Math.min(1, this.minutes / this.target);
    let title, sub;
    if (t >= 0 && t < T.Roll) { title = 'Кот обедает'; sub = t < T.Eat ? 'Ням-ням-ням…' : 'Кажется, он стал немного круглее'; }
    else if (t >= T.Roll) { title = 'Новая грядка'; sub = 'Фокусируйся — вырастет новый арбуз'; }
    else if (this.ripe) { title = stageName(1); sub = 'Сейчас придёт кот…'; }
    else { title = stageName(growth); sub = `До урожая ≈ ${fmtMinutes(this.target - this.minutes)} фокуса`; }
    const shown = t >= T.Roll ? Math.min(1, Math.max(0, this.minutes - this.target) / this.target) : growth;
    const shownMin = t >= T.Roll ? Math.max(0, this.minutes - this.target) : Math.min(this.minutes, this.target);
    const sig = [title, sub, this.eaten, shownMin].join('|');
    if (sig === this.lastInfo) return;
    this.lastInfo = sig;
    this.info.stage.textContent = title;
    this.info.sub.textContent = sub;
    this.info.eaten.textContent = `Съедено котом: ${this.eaten}`;
    this.info.fill.style.width = (shown * 100).toFixed(1) + '%';
    this.info.min.textContent = `${shownMin} / ${this.target} мин`;
  }

  // ───────────── plant ─────────────
  drawPlant(g, s, growth, now, bites, fruitGone, idle) {
    const { u, gy, px } = s;
    g.fillStyle = '#5A412C';
    g.beginPath(); g.ellipse(px, gy - 0.2 * u + 0.21 * u, 0.75 * u, 0.21 * u, 0, 0, Math.PI * 2); g.fill();

    if (growth < 0.06) {
      const wob = Math.sin(now * 2) * 0.02 * u;
      g.fillStyle = '#3B2414';
      g.beginPath(); g.ellipse(px, gy - 0.18 * u + wob, 0.15 * u, 0.1 * u, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.27)';
      g.beginPath(); g.ellipse(px - 0.04 * u, gy - 0.235 * u + wob, 0.04 * u, 0.025 * u, 0, 0, Math.PI * 2); g.fill();
    }

    const sprout = clamp01((growth - 0.03) / 0.15);
    const vine = clamp01((growth - 0.16) / 0.28);
    const flower = clamp01((growth - 0.38) / 0.08) * (1 - clamp01((growth - 0.56) / 0.08));
    const fruitG = clamp01((growth - 0.5) / 0.5);

    if (vine > 0) {
      drawVine(g, px, gy, u, -1, 3.8 * u * vine, now, vine, 11);
      drawVine(g, px, gy, u, +1, 2.2 * u * vine, now, vine, 23);
    }
    if (sprout > 0) {
      const sway = Math.sin(now * 1.3) * 0.08 * u;
      const h = 1.25 * u * sprout;
      const tx = px + sway, ty = gy - 0.1 * u - h;
      g.strokeStyle = VINE; g.lineWidth = Math.max(2, 0.12 * u); g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, gy - 0.1 * u); g.bezierCurveTo(px - 0.15 * u, gy - h * 0.4, px + sway, gy - h * 0.8, tx, ty); g.stroke();
      const ls = Math.min(1, sprout * 1.2) * (1 - vine * 0.3);
      drawLeaf(g, tx, ty, 0.62 * u * ls, 0.34 * u * ls, -55 + Math.sin(now * 1.7) * 5);
      drawLeaf(g, tx, ty, 0.62 * u * ls, 0.34 * u * ls, 55 + Math.sin(now * 1.5 + 1) * 5);
    }
    if (flower > 0) drawFlower(g, px - 1.25 * u, gy - 0.72 * u, 0.26 * u * flower, now);
    if (fruitG > 0 && !fruitGone) {
      const f = fruitGeom(px, gy, u, fruitG);
      this.drawFruit(g, f, u, fruitG, bites);
      if (growth >= 1 && idle) drawSparkles(g, f, now);
    }
  }

  drawFruit(g, f, u, fruitG, bites) {
    const { fx, fy, rx, ry } = f;
    g.fillStyle = 'rgba(0,0,0,.27)';
    g.beginPath(); g.ellipse(fx, fy + ry + 0.02 * u, rx * 0.95, 0.14 * u, 0, 0, Math.PI * 2); g.fill();

    // with bites the fruit is composed offscreen: body → flesh rim (source-atop) → holes (destination-out)
    const target = bites.length ? this.fx.getContext('2d') : g;
    if (bites.length) { target.setTransform(1, 0, 0, 1, 0, 0); target.globalCompositeOperation = 'source-over'; target.clearRect(0, 0, this.fx.width, this.fx.height); }
    const c = target;
    c.save();
    c.beginPath(); c.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    const top = mixHex('#9CCC65', RIND_LIGHT, clamp01(fruitG * 2));
    const grad = c.createLinearGradient(0, fy - ry, 0, fy + ry);
    grad.addColorStop(0, top); grad.addColorStop(1, RIND_DARK);
    c.fillStyle = grad; c.fillRect(fx - rx, fy - ry, rx * 2, ry * 2);
    const sa = clamp01((fruitG - 0.05) / 0.35);
    if (sa > 0) {
      c.strokeStyle = `rgba(18,74,24,${0.9 * sa})`; c.lineWidth = Math.max(1.5, rx * 0.13); c.lineJoin = 'round';
      for (let k = -4; k <= 4; k++) {
        const x0 = fx + k * rx * 0.26;
        c.beginPath();
        for (let j = 0; j <= 12; j++) {
          const yy = fy - ry + j * (ry * 2 / 12);
          const bend = k * rx * 0.1 * Math.sin((yy - (fy - ry)) / (2 * ry) * Math.PI);
          const zig = (j % 2 === 0 ? -1 : 1) * rx * 0.035;
          j ? c.lineTo(x0 + bend + zig, yy) : c.moveTo(x0 + bend + zig, yy);
        }
        c.stroke();
      }
    }
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.beginPath(); c.ellipse(fx - rx * 0.27, fy - ry * 0.57, rx * 0.35, ry * 0.21, 0, 0, Math.PI * 2); c.fill();
    c.restore();

    if (bites.length) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = FLESH;
      for (const b of bites) { c.beginPath(); c.arc(b.cx, b.cy, b.r + ry * 0.13, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#2B1A14';
      for (const b of bites) for (let s = 0; s < 5; s++) {
        const a = (200 + s * 30) * Math.PI / 180;
        const sx = b.cx + Math.cos(a) * (b.r + ry * 0.07), sy = b.cy + Math.sin(a) * (b.r + ry * 0.07);
        c.beginPath(); c.ellipse(sx, sy, ry * 0.03, ry * 0.045, 0, 0, Math.PI * 2); c.fill();
      }
      c.globalCompositeOperation = 'destination-out';
      for (const b of bites) { c.beginPath(); c.arc(b.cx, b.cy, b.r, 0, Math.PI * 2); c.fill(); }
      c.globalCompositeOperation = 'source-over';
      g.drawImage(this.fx, 0, 0);
    }
  }

  // ───────────── cat ─────────────
  drawCatScene(g, s, t) {
    const { W, u, gy, px } = s;
    const cu = u * 1.05;
    const f = fruitGeom(px, gy, u, 1);
    const stopCx = f.fx + f.rx + 1.45 * cu;
    const eatShift = f.rx * 1.75;
    let cx, lunge = 0, roundness = 0, angle = 0, hop = 0, walk = 0, eyes = 'smug';

    if (t < T.Walk) {
      const k = t / T.Walk;
      cx = lerp(W + 3 * cu, stopCx, 1 - Math.pow(1 - k, 3));
      walk = t * 10;
    } else if (t < T.Eat) {
      const k = (t - T.Walk) / (T.Eat - T.Walk);
      cx = stopCx - eatShift * easeInOut(k);
      const per = (T.Eat - T.Walk) / CHOMPS;
      const ph = ((t - T.Walk) % per) / per;
      lunge = Math.max(0, Math.sin(ph * Math.PI));
      if (lunge > 0.55) eyes = 'happy';
    } else {
      cx = stopCx - eatShift;
      roundness = easeOutBack(clamp01((t - T.Eat) / (T.Inflate - T.Eat)));
      eyes = t < T.Inflate ? 'smug' : 'happy';
      if (t >= T.Idle) {
        const k = clamp01((t - T.Idle) / (T.Roll - T.Idle));
        const start = cx, end = -3.5 * cu;
        cx = lerp(start, end, k * k);
        const D = 2.35 * cu;
        angle = -(start - cx) / (D / 2);
        hop = Math.abs(Math.sin((start - cx) / D * Math.PI)) * 0.18 * cu;
      }
    }

    drawCat(g, cx, gy + 0.04 * u, cu, roundness, walk, lunge, eyes, angle, hop, t < T.Walk);

    // crumbs + "ням!" per bite
    for (let k = 0; k < CHOMPS; k++) {
      const dt = t - chompTime(k);
      if (dt < 0 || dt > 0.9) continue;
      const b = bite(k, f);
      const rnd = seeded(100 + k);
      for (let i = 0; i < 9; i++) {
        const vx = (rnd() * 3 - 1.2) * u, vy = (-rnd() * 3 - 1) * u;
        const x = b.cx + vx * dt, y = b.cy + vy * dt + 0.5 * 9 * u * dt * dt;
        const col = [FLESH, RIND_LIGHT, '#2B1A14'][i % 3];
        g.globalAlpha = 1 - dt / 0.9;
        g.fillStyle = col;
        const sz = 0.13 * u * (i % 3 === 2 ? 0.6 : 1);
        g.beginPath(); g.arc(x, y, sz / 2, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      if (dt < 0.75) pop(g, 'ням!', Math.max(12, 0.42 * u), b.cx + 0.4 * u, b.cy - 1.3 * u - dt * u, 1 - dt / 0.75);
    }
    if (t > T.Inflate - 0.2 && t < T.Inflate + 0.6)
      pop(g, 'ик!', Math.max(12, 0.36 * u), cx - 1.4 * cu, gy - 3.1 * cu, Math.min(1, (T.Inflate + 0.6 - t) / 0.3));
  }
}

// ───────────── timeline & constants ─────────────
const T = { Walk: 2.4, Eat: 5.6, Inflate: 7.0, Idle: 7.8, Roll: 10.4, End: 12.4 };
const CHOMPS = 4;
const LEAF_LIGHT = '#5CB85E', LEAF_DARK = '#2E7D32', VINE = '#35863E';
const RIND_LIGHT = '#4CAF50', RIND_DARK = '#1B5E20', FLESH = '#F25C66';
const CAT_GRAY = '#A9AFB5', CAT_STRIPE = '#6D747B', CAT_OUTLINE = 'rgba(78,85,91,.6)';

function chompTime(k) { return T.Walk + (k + 0.55) * (T.Eat - T.Walk) / CHOMPS; }
function bite(k, f) {
  return { cx: f.fx + f.rx * (0.98 - k * 0.62), cy: f.fy + (k % 2 === 0 ? -0.18 : 0.12) * f.ry, r: f.ry * 0.78 };
}
function fruitGeom(px, gy, u, fruitG) {
  const R = lerp(0.22, 1.55, fruitG) * u, rx = R * 1.28, ry = R;
  return { fx: px + 0.55 * u + rx, fy: gy + 0.06 * u - ry, rx, ry };
}
function stageName(g) {
  if (g < 0.06) return 'Семечко';
  if (g < 0.18) return 'Росток';
  if (g < 0.40) return 'Плети и листья';
  if (g < 0.52) return 'Цветёт';
  if (g < 0.80) return 'Завязь растёт';
  if (g < 1) return 'Почти созрел';
  return 'Арбуз созрел!';
}
function groundCurve(s) {
  const { W, u, gy, px } = s;
  return [-2, gy + 0.45 * u, px - 3 * u, gy + 0.05 * u, px + 1 * u, gy - 0.05 * u, W + 2, gy + 0.3 * u];
}
function groundY(P, x) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (bez(P[0], P[2], P[4], P[6], m) < x) lo = m; else hi = m; }
  return bez(P[1], P[3], P[5], P[7], (lo + hi) / 2);
}
function bez(a, b, c, d, t) { const m = 1 - t; return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d; }

// ───────────── drawing helpers ─────────────
function drawVine(g, px, gy, u, dir, len, now, vine, seed) {
  if (len < 2) return;
  const p0 = [px, gy - 0.08 * u], p1 = [px + dir * len * 0.33, gy - 0.55 * u], p2 = [px + dir * len * 0.66, gy + 0.08 * u], p3 = [px + dir * len, gy - 0.12 * u];
  g.strokeStyle = VINE; g.lineCap = 'round'; g.lineWidth = Math.max(2, 0.09 * u);
  g.beginPath(); g.moveTo(...p0); g.bezierCurveTo(...p1, ...p2, ...p3); g.stroke();
  // curly tendril at the tip
  const r = 0.16 * u;
  g.lineWidth = Math.max(1.2, 0.04 * u);
  g.beginPath();
  if (dir < 0) g.arc(p3[0] - r, p3[1] - r, r, 0, 1.5 * Math.PI);
  else g.arc(p3[0] + r, p3[1] - r, r, Math.PI, 2.5 * Math.PI);
  g.stroke();
  const n = 1 + Math.floor(len / (0.75 * u));
  const rnd = seeded(seed);
  for (let i = 1; i <= n; i++) {
    const s = i / (n + 0.4);
    const x = bez(p0[0], p1[0], p2[0], p3[0], s), y = bez(p0[1], p1[1], p2[1], p3[1], s);
    const size = 0.78 * u * Math.min(1, vine * 1.6) * (1 - 0.3 * s) * (0.85 + rnd() * 0.3);
    const ang = (i % 2 === 0 ? -30 : 30) * dir + Math.sin(now * 1.4 + i * 1.3 + seed) * 6;
    drawLeaf(g, x, y, size, size * 0.62, ang);
  }
}

function drawLeaf(g, x, y, len, wid, deg) {
  if (len < 2) return;
  g.save();
  g.translate(x, y); g.rotate(deg * Math.PI / 180);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-wid * 0.9, -len * 0.15, -wid * 0.75, -len * 0.75, 0, -len);
  g.bezierCurveTo(wid * 0.75, -len * 0.75, wid * 0.9, -len * 0.15, 0, 0);
  const gr = g.createLinearGradient(0, -len, 0, 0);
  gr.addColorStop(0, LEAF_LIGHT); gr.addColorStop(1, LEAF_DARK);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(27,77,31,.47)'; g.lineWidth = Math.max(1, len * 0.05); g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -len * 0.05); g.lineTo(0, -len * 0.85);
  g.moveTo(0, -len * 0.45); g.lineTo(-wid * 0.4, -len * 0.62);
  g.moveTo(0, -len * 0.45); g.lineTo(wid * 0.4, -len * 0.62);
  g.stroke();
  g.restore();
}

function drawFlower(g, x, y, r, now) {
  if (r < 1) return;
  g.strokeStyle = VINE; g.lineWidth = Math.max(1.5, r * 0.25);
  g.beginPath(); g.moveTo(x, y + r); g.lineTo(x + r * 0.3, y + r * 3); g.stroke();
  const spin = now * 8;
  g.fillStyle = '#FFD54F';
  for (let i = 0; i < 5; i++) {
    const a = (spin + i * 72) * Math.PI / 180;
    g.beginPath(); g.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.55, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#F59E2B';
  g.beginPath(); g.arc(x, y, r * 0.4, 0, Math.PI * 2); g.fill();
}

function drawSparkles(g, f, now) {
  const pos = [[-0.9, -1.15], [0.95, -1.0], [1.25, 0.1], [-1.3, -0.2], [0.2, -1.45]];
  pos.forEach(([px, py], i) => {
    const a = (Math.sin(now * 3 + i * 1.7) + 1) / 2;
    const x = f.fx + px * f.rx, y = f.fy + py * f.ry, s = f.ry * 0.16 * (0.6 + a * 0.6);
    g.fillStyle = `rgba(255,243,176,${(60 + 180 * a) / 255})`;
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s, y); g.lineTo(x + s * 0.25, y + s * 0.25);
    g.lineTo(x, y + s); g.lineTo(x - s * 0.25, y + s * 0.25); g.lineTo(x - s, y); g.lineTo(x - s * 0.25, y - s * 0.25);
    g.closePath(); g.fill();
  });
}

function pop(g, text, size, x, y, alpha) {
  g.save();
  g.font = `900 ${size}px "Segoe UI Black", "Segoe UI", sans-serif`;
  g.textBaseline = 'top'; g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.18);
  g.strokeStyle = `rgba(0,0,0,${0.86 * alpha})`; g.strokeText(text, x, y);
  g.fillStyle = `rgba(255,255,255,${alpha})`; g.fillText(text, x, y);
  g.restore();
}

// Cartoon tabby. r: 0 = normal cat, 1 = watermelon ball with a cat head
function drawCat(g, cx, gy, cu, r, walkPhase, lunge, eyes, angle, hop, walking) {
  const rc = Math.min(1.15, Math.max(0, r));
  const bw = lerp(2.0, 2.35, rc) * cu, bh = lerp(1.1, 2.35, rc) * cu;
  const leg = Math.max(0, lerp(0.45, 0, Math.min(1, rc))) * cu;
  const bodyCy = -(leg + bh / 2);
  const rs = clamp01((r - 0.25) / 0.75);
  const olw = Math.max(1.2, 0.035 * cu);

  g.save();
  g.translate(cx, gy + bodyCy - hop);
  g.rotate(angle);
  g.lineCap = 'round'; g.lineJoin = 'round';

  // tail
  g.strokeStyle = mixHex(CAT_GRAY, CAT_STRIPE, 0.2);
  g.lineWidth = Math.max(3, lerp(0.22, 0.18, rc) * cu);
  {
    const tx = bw * 0.44, ty = -bh * 0.05, wag = Math.sin(walkPhase * 0.5) * 0.15 * cu;
    g.beginPath(); g.moveTo(tx, ty);
    g.bezierCurveTo(tx + 0.55 * cu, ty - 0.15 * cu, tx + 0.7 * cu + wag, ty - 0.85 * cu, tx + 0.35 * cu + wag, ty - 1.15 * cu);
    g.stroke();
  }

  // legs
  if (leg > 1) {
    const lx = [-0.34, -0.17, 0.2, 0.36];
    for (let i = 0; i < 4; i++) {
      const phase = walkPhase + (i % 2 === 0 ? 0 : Math.PI);
      const swing = walking || walkPhase > 0 ? Math.sin(phase) * 0.13 * cu : 0;
      const lift = Math.max(0, Math.sin(phase)) * 0.08 * cu;
      const x = lx[i] * bw + swing, top = bh * 0.25, bottom = bh / 2 + leg - lift;
      g.fillStyle = mixHex(CAT_GRAY, CAT_STRIPE, 0.15);
      roundRect(g, x - 0.12 * cu, top, 0.24 * cu, bottom - top, 0.1 * cu); g.fill();
      g.fillStyle = '#F4F4F2';
      g.beginPath(); g.ellipse(x, bottom - 0.04 * cu, 0.15 * cu, 0.08 * cu, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // body
  const bodyCol = mixHex(CAT_GRAY, RIND_LIGHT, rs);
  const bg = g.createLinearGradient(0, -bh / 2, 0, bh / 2);
  bg.addColorStop(0, mixHex(bodyCol, '#FFFFFF', 0.12)); bg.addColorStop(1, mixHex(bodyCol, '#000000', 0.25));
  g.save();
  g.beginPath(); g.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2);
  g.fillStyle = bg; g.fill();
  g.clip();
  if (rs < 1) {
    g.strokeStyle = `rgba(109,116,123,${0.78 * (1 - rs)})`; g.lineWidth = Math.max(2, 0.12 * cu);
    for (let k = 0; k < 5; k++) {
      const x = -bw * 0.28 + k * bw * 0.14;
      g.beginPath(); g.moveTo(x, -bh / 2 - 2);
      g.bezierCurveTo(x + 0.08 * cu, -bh * 0.3, x - 0.05 * cu, -bh * 0.12, x + 0.02 * cu, bh * 0.02);
      g.stroke();
    }
  }
  if (rs > 0) {
    g.strokeStyle = `rgba(18,74,24,${0.92 * rs})`; g.lineWidth = Math.max(2, bw * 0.07);
    for (let k = -4; k <= 4; k++) {
      g.beginPath();
      for (let j = 0; j <= 12; j++) {
        const yy = -bh / 2 + j * bh / 12;
        const bend = k * bw * 0.06 * Math.sin((yy + bh / 2) / bh * Math.PI);
        const x = k * bw * 0.13 + bend + (j % 2 === 0 ? -1 : 1) * bw * 0.018;
        j ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.beginPath(); g.ellipse(-bw * 0.13, -bh * 0.31, bw * 0.19, bh * 0.11, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.strokeStyle = CAT_OUTLINE; g.lineWidth = olw;
  g.beginPath(); g.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2); g.stroke();

  // head
  const m1 = Math.min(1, rc);
  const hr = lerp(0.56, 0.52, m1) * cu;
  const hx = lerp(-bw / 2 - hr * 0.2, -bw * 0.26, m1) - lunge * 0.4 * cu;
  const hy = lerp(-bh * 0.42, -bh * 0.36, m1) + lunge * 0.45 * cu;
  const earL = [[hx - hr * 0.9, hy - hr * 0.3], [hx - hr * 0.62, hy - hr * 1.35], [hx - hr * 0.1, hy - hr * 0.82]];
  const earR = [[hx + hr * 0.1, hy - hr * 0.82], [hx + hr * 0.62, hy - hr * 1.35], [hx + hr * 0.9, hy - hr * 0.3]];
  for (const e of [earL, earR]) {
    poly(g, e); g.fillStyle = CAT_GRAY; g.fill(); g.strokeStyle = CAT_OUTLINE; g.lineWidth = olw; g.stroke();
    poly(g, shrink(e, 0.5)); g.fillStyle = '#E8A0A8'; g.fill();
  }
  const hg = g.createLinearGradient(0, hy - hr * 0.92, 0, hy + hr * 0.92);
  hg.addColorStop(0, mixHex(CAT_GRAY, '#FFFFFF', 0.15)); hg.addColorStop(1, mixHex(CAT_GRAY, '#000000', 0.12));
  g.fillStyle = hg;
  g.beginPath(); g.ellipse(hx, hy, hr, hr * 0.92, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = CAT_STRIPE; g.lineWidth = Math.max(1.5, 0.06 * cu);
  g.beginPath();
  g.moveTo(hx, hy - hr * 0.85); g.lineTo(hx, hy - hr * 0.5);
  g.moveTo(hx - hr * 0.25, hy - hr * 0.8); g.lineTo(hx - hr * 0.2, hy - hr * 0.5);
  g.moveTo(hx + hr * 0.25, hy - hr * 0.8); g.lineTo(hx + hr * 0.2, hy - hr * 0.5);
  g.stroke();
  g.fillStyle = '#ECEEEF';
  g.beginPath(); g.ellipse(hx, hy + hr * 0.4, hr * 0.55, hr * 0.35, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = CAT_OUTLINE; g.lineWidth = olw;
  g.beginPath(); g.ellipse(hx, hy, hr, hr * 0.92, 0, 0, Math.PI * 2); g.stroke();

  // eyes
  const ey = hy - hr * 0.12, ew = hr * 0.42, eh = hr * 0.34;
  for (const ex of [hx - hr * 0.42, hx + hr * 0.42]) {
    if (eyes === 'happy') {
      g.strokeStyle = '#222'; g.lineWidth = Math.max(1.5, 0.06 * cu);
      g.beginPath(); g.ellipse(ex, ey - eh * 0.2 + eh * 0.45, ew / 2, eh * 0.45, 0, 200 * Math.PI / 180, 340 * Math.PI / 180); g.stroke();
      continue;
    }
    g.save();
    g.beginPath(); g.ellipse(ex, ey, ew / 2, eh / 2, 0, 0, Math.PI * 2);
    g.fillStyle = '#C8B65A'; g.fill();
    g.clip();
    g.fillStyle = '#141414';
    g.beginPath(); g.ellipse(ex, ey, ew * 0.22, eh * 0.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = mixHex(CAT_GRAY, '#FFFFFF', 0.05);
    g.fillRect(ex - ew / 2, ey - eh / 2 - 1, ew, eh * 0.48 + 1);
    g.restore();
    g.strokeStyle = '#333'; g.lineWidth = Math.max(1.2, 0.045 * cu);
    g.beginPath(); g.moveTo(ex - ew / 2, ey - eh / 2 + eh * 0.47); g.lineTo(ex + ew / 2, ey - eh / 2 + eh * 0.47); g.stroke();
  }
  // nose, mouth, whiskers
  const ny = hy + hr * 0.22;
  g.fillStyle = '#D98C8C';
  poly(g, [[hx - hr * 0.11, ny], [hx + hr * 0.11, ny], [hx, ny + hr * 0.12]]); g.fill();
  g.strokeStyle = '#443A3A'; g.lineWidth = Math.max(1.2, 0.04 * cu);
  if (lunge > 0.3) {
    const mo = hr * 0.28 * lunge;
    g.fillStyle = '#7A1F2A';
    g.beginPath(); g.ellipse(hx, ny + hr * 0.14 + (mo + hr * 0.08) / 2, hr * 0.2, (mo + hr * 0.08) / 2, 0, 0, Math.PI * 2); g.fill();
  } else {
    g.beginPath(); g.ellipse(hx - hr * 0.1, ny + hr * 0.11, hr * 0.1, hr * 0.09, 0, 0, 160 * Math.PI / 180); g.stroke();
    g.beginPath(); g.ellipse(hx + hr * 0.1, ny + hr * 0.11, hr * 0.1, hr * 0.09, 0, 20 * Math.PI / 180, Math.PI); g.stroke();
  }
  g.beginPath();
  for (let i = -1; i <= 1; i++) {
    g.moveTo(hx - hr * 0.3, ny + hr * 0.12 + i * hr * 0.1); g.lineTo(hx - hr * 1.05, ny + hr * 0.02 + i * hr * 0.2);
    g.moveTo(hx + hr * 0.3, ny + hr * 0.12 + i * hr * 0.1); g.lineTo(hx + hr * 1.05, ny + hr * 0.02 + i * hr * 0.2);
  }
  g.stroke();
  g.restore();
}

function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); }
function shrink(tri, k) {
  const cx = tri.reduce((s, p) => s + p[0], 0) / tri.length, cy = tri.reduce((s, p) => s + p[1], 0) / tri.length;
  return tri.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, Math.max(0, h), Math.min(r, w / 2, Math.max(0, h) / 2)); }

// ───────────── math / colour ─────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function seeded(seed) {   // tiny deterministic PRNG (mulberry32)
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hexToArr(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function hexRgb(h) { return hexToArr(h).join(','); }
function mixHex(a, b, t) {
  const A = hexToArr(a), B = hexToArr(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function fmtMinutes(m) {
  m = Math.max(0, Math.round(m));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}
