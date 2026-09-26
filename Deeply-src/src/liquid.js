'use strict';
// "Liquid glass" for the Стекло theme: every glass surface refracts what is behind it like a lens.
// Each surface gets an SVG displacement filter (used via backdrop-filter: url(#id), Chromium only) whose
// map is generated from the element's own rounded-rect shape: pixels near the rim are pulled inwards,
// the flat middle stays clear — the same edge refraction iOS 26 uses.

const LiquidGlass = (() => {
  const SELECTOR = '.tasks-panel, .tile, .chart, .garden-card, .ring-face, .seg, .modal, .music-bar, .btn.round, .btn.icon-btn, .btn.start, .add-row, .task';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let enabled = false, defs = null;
  const maps = new Map();          // key → filter id
  const tracked = new Map();       // element → key
  const ro = new ResizeObserver(entries => { for (const e of entries) apply(e.target); });
  const mo = new MutationObserver(() => { if (enabled) scan(); });

  function ensureDefs() {
    if (defs) return defs;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  // signed distance to a rounded rectangle centred at 0 (negative inside)
  function sdf(px, py, hw, hh, r) {
    const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
  }

  // displacement map at half resolution; R/G = x/y offset (128 = none)
  function makeMap(w, h, r, band) {
    const k = 0.5, W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const hw = w / 2, hh = h / 2, e = 0.75;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = (x + 0.5) / k - hw, py = (y + 0.5) / k - hh;
        const dist = -sdf(px, py, hw, hh, r);          // distance from the rim, inside > 0
        let dx = 0, dy = 0;
        if (dist < band && dist > -1) {
          // outward normal from the SDF gradient
          let nx = sdf(px + e, py, hw, hh, r) - sdf(px - e, py, hw, hh, r);
          let ny = sdf(px, py + e, hw, hh, r) - sdf(px, py - e, hw, hh, r);
          const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          // lens profile: strongest right at the rim, smooth falloff to the flat centre
          const t = 1 - Math.max(0, dist) / band;
          const m = t * t * (3 - 2 * t);
          dx = -nx * m; dy = -ny * m;                   // sample from further inside → magnified, bent rim
        }
        const i = (y * W + x) * 4;
        d[i] = 128 + dx * 127; d[i + 1] = 128 + dy * 127; d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function filterFor(w, h, r) {
    const band = Math.max(8, Math.min(40, Math.min(w, h) * 0.3));
    const key = `${w}x${h}r${r}`;
    if (maps.has(key)) return maps.get(key);
    const id = 'lg' + maps.size;
    const scale = Math.round(band * 1.5);
    const f = document.createElementNS(SVG_NS, 'filter');
    f.setAttribute('id', id);
    f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', w); f.setAttribute('height', h);
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.innerHTML = `<feImage href="${makeMap(w, h, r, band)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
    ensureDefs().appendChild(f);
    maps.set(key, id);
    return id;
  }

  function radiusOf(el, w, h) {
    const s = getComputedStyle(el).borderTopLeftRadius;
    const v = parseFloat(s) || 0;
    return Math.min(s.endsWith('%') ? Math.min(w, h) * v / 100 : v, w / 2, h / 2);
  }

  function apply(el) {
    if (!enabled) return;
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 4 || h < 4) return;
    const r = Math.round(radiusOf(el, w, h));
    const id = filterFor(w, h, r);
    if (tracked.get(el) === id) return;
    tracked.set(el, id);
    const dbg = window.deeply && window.deeply.env('DEEPLY_LG_BLUR');
    const blur = dbg !== '' && dbg != null ? +dbg : el.matches('.modal') ? 16 : el.matches('.tasks-panel, .chart, .garden-card') ? 3 : el.matches('.task, .btn') ? 1 : 2;
    el.style.backdropFilter = `blur(${blur}px) url(#${id}) saturate(1.7) brightness(1.06)`;
  }

  function scan() {
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (!tracked.has(el)) { tracked.set(el, null); ro.observe(el); apply(el); }
    }
    for (const el of tracked.keys()) if (!el.isConnected) { ro.unobserve(el); tracked.delete(el); }
  }

  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    if (on) { scan(); mo.observe(document.body, { childList: true, subtree: true }); }
    else {
      mo.disconnect();
      for (const el of tracked.keys()) { ro.unobserve(el); el.style.backdropFilter = ''; }
      tracked.clear();
    }
  }

  return { setEnabled };
})();
