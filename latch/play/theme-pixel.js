/* LATCH — 16-BIT theme: the world is drawn on a low-res canvas (160 px wide)
 * and upscaled with nearest-neighbour; banded skies, pixel sprites, chiptune audio. */
(window.LATCH_THEMES = window.LATCH_THEMES || {}).pixel = (api) => {
'use strict';
const { ctx, C, TEXT } = api;
const { clamp, lerp, rand, dist, TAU, css } = api.util;

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = {
  gold: hex('#ffcc33'), orange: hex('#ff8833'), pink: hex('#ff4fa8'), violet: hex('#9a6bff'),
  cyan: hex('#33e0ff'), white: hex('#ffffff'), red: hex('#ff3355'), node: hex('#b9a7ff'), dim: hex('#a89cc8'),
};
PAL.confetti = [PAL.gold, PAL.pink, PAL.cyan, PAL.violet, PAL.white, PAL.orange];
const COMBO = [PAL.gold, PAL.orange, PAL.pink, PAL.violet, PAL.cyan, PAL.cyan, PAL.white, PAL.white];
const comboCol = api.comboCol;
const INK = '#120a26';
// Sky zones: 4 bands each, darkest on top. Change every 12 latches.
const ZONES = [
  ['#0f0a2b', '#1b1145', '#2b1960', '#3e2277'],
  ['#071a2b', '#0b2f46', '#114663', '#1a6080'],
  ['#2b0a24', '#4a1236', '#73203f', '#a8344a'],
  ['#06210f', '#0b3418', '#124b22', '#1c6630'],
  ['#2b1606', '#4a260a', '#704010', '#9c5f18'],
];
const PLANETS = [['#ff9a5c', '#b8502e'], ['#7fe0c8', '#2f8a7a'], ['#ffd35c', '#b8862e'], ['#c79bff', '#6a45b0'], ['#ff7a8a', '#a83048']];

const FONT_P = '"Press Start 2P", "Courier New", monospace';
const fp = s => `${Math.round(s)}px ${FONT_P}`;
if (document.fonts && document.fonts.load) document.fonts.load('16px "Press Start 2P"').catch(() => {});
const clean = s => s.replace(/×/g, 'x').replace(/·/g, '-');

// ---------- low-res buffer ----------
const LW = 160;               // field width in low-res pixels
const ls = LW / C.W;          // low-res pixels per world unit
const lo = document.createElement('canvas');
const lc = lo.getContext('2d');
let k = 1, fieldX = 0, LH = 0, skyCache = [], scanPat = null;

function resize() {
  const gw = api.scale * C.W;
  k = gw / LW;                                   // CSS px per low-res pixel
  lo.width = Math.ceil(api.cw / k) + 1;
  lo.height = Math.ceil(api.ch / k) + 1;
  LH = lo.height;
  fieldX = Math.round(api.offX / k);
  lc.imageSmoothingEnabled = false;
  skyCache = ZONES.map(makeSky);
  // scanlines: one dark row every low-res pixel
  const p = document.createElement('canvas');
  const ph = Math.max(2, Math.round(k * api.dpr));
  p.width = 1; p.height = ph;
  const pc = p.getContext('2d');
  pc.fillStyle = 'rgba(0,0,0,0.22)'; pc.fillRect(0, ph - Math.max(1, Math.round(ph / 3)), 1, Math.max(1, Math.round(ph / 3)));
  scanPat = ctx.createPattern(p, 'repeat');
}

// banded sky with dithered transitions, pre-rendered once per zone
function makeSky(cols) {
  const c = document.createElement('canvas'); c.width = lo.width; c.height = lo.height;
  const x = c.getContext('2d');
  const bands = 8, bh = Math.ceil(c.height / bands);
  for (let b = 0; b < bands; b++) {
    x.fillStyle = cols[Math.min(3, b >> 1)];
    x.fillRect(0, b * bh, c.width, bh);
    if ((b & 1) && b < bands - 1) {
      // checkerboard dither into the next colour
      x.fillStyle = cols[Math.min(3, (b + 1) >> 1)];
      for (let row = 0; row < 3; row++) {
        const y = (b + 1) * bh - 3 + row;
        for (let px = (row & 1); px < c.width; px += row === 1 ? 2 : 4) x.fillRect(px, y, 1, 1);
      }
    }
  }
  return c;
}

// ---------- pixel primitives ----------
const R = Math.round;
function fill(c) { lc.fillStyle = typeof c === 'string' ? c : css(c); }
function px(x, y) { lc.fillRect(x | 0, y | 0, 1, 1); }
function disc(cx, cy, r) {
  cx = R(cx); cy = R(cy);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    lc.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}
function ring(cx, cy, r) {
  cx = R(cx); cy = R(cy); r = R(r);
  if (r <= 0) { px(cx, cy); return; }
  let x = r, y = 0, err = 1 - x;
  while (x >= y) {
    px(cx + x, cy + y); px(cx + y, cy + x); px(cx - y, cy + x); px(cx - x, cy + y);
    px(cx - x, cy - y); px(cx - y, cy - x); px(cx + y, cy - x); px(cx + x, cy - y);
    y++;
    if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
  }
}
function dots(cx, cy, r, gap, off = 0, frac = 1) {
  const n = Math.max(6, Math.floor(TAU * r / gap));
  const m = Math.ceil(n * frac);
  for (let i = 0; i < m; i++) {
    const a = off + i / n * TAU;
    px(R(cx + Math.cos(a) * r), R(cy + Math.sin(a) * r));
  }
}
function line(x0, y0, x1, y1, pat) {
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sxs = x0 < x1 ? 1 : -1, sys = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  for (;;) {
    const c = pat ? pat(i++) : null;
    if (!pat || c) { if (c) fill(c); px(x0, y0); }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sxs; }
    if (e2 <= dx) { err += dx; y0 += sys; }
  }
}

const keepIn = (x, w) => clamp(x, api.offX + w / 2 + 6, api.offX + C.W * api.scale - w / 2 - 6);
const lx = x => fieldX + x * ls;
const ly = y => (y - api.g.camY) * ls;

// background stars and a slow planet
const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.05, 0.5), tw: rand(0, TAU), c: Math.random() < 0.2 ? '#9fe8ff' : Math.random() < 0.2 ? '#ffb3d9' : '#ffffff' }));

// ---------- render ----------
function render() {
  const { g, cw, ch, dpr, state, realT } = api;
  const t = g.t;
  const W = C.W, FW = R(W * ls);

  // sky with a bottom-up wipe between zones
  const z = g.zoneF, zi = Math.floor(z), zf = z - zi;
  const A = skyCache[zi % ZONES.length], B = skyCache[(zi + 1) % ZONES.length];
  lc.drawImage(A, 0, 0);
  const wipe = R(LH * (1 - clamp((zf - 0.5) * 2, 0, 1)));
  if (wipe < LH) lc.drawImage(B, 0, wipe, lo.width, LH - wipe, 0, wipe, lo.width, LH - wipe);

  // planet (parallax 0.04)
  const pz = (zi + (zf > 0.75 ? 1 : 0)) % PLANETS.length;
  const camL = g.camY * ls;
  const prad = 22, pcx = fieldX + FW * 0.78, span = LH + prad * 6;
  const pcy = ((LH * 0.62 - camL * 0.04) % span + span) % span - prad * 2;
  for (let dy = -prad; dy <= prad; dy++) {
    const w = Math.floor(Math.sqrt(prad * prad - dy * dy));
    const lit = R(w * 2 * (0.62 - dy / prad * 0.15));
    fill(PLANETS[pz][0]); lc.fillRect(R(pcx - w), R(pcy + dy), lit, 1);
    fill(PLANETS[pz][1]); lc.fillRect(R(pcx - w + lit), R(pcy + dy), w * 2 + 1 - lit, 1);
  }
  fill('rgba(255,255,255,0.5)');
  for (let i = -prad - 10; i <= prad + 10; i += 2) {
    const yy = pcy + i * 0.18 + 2;
    if (Math.abs(i) > prad - 4 || i % 4 === 0) px(R(pcx + i), R(yy));
  }

  // stars
  for (const s of stars) {
    const x = R(s.x * lo.width);
    const y = R(((s.y * LH - camL * s.z) % LH + LH) % LH);
    const b = Math.sin(realT * (1.5 + s.z * 4) + s.tw);
    fill(s.c);
    if (b > 0.85) { px(x, y); px(x - 1, y); px(x + 1, y); px(x, y - 1); px(x, y + 1); }
    else if (b > -0.4) px(x, y);
  }

  lc.save();
  if (g.shake > 0) lc.translate(R((Math.random() - 0.5) * g.shake * ls * 1.5), R((Math.random() - 0.5) * g.shake * ls * 1.5));

  // hazard stripes on the deadly walls
  const pNear = state === 'play' ? Math.min(g.p.x, W - g.p.x) : 999;
  const hot = pNear < 60 && Math.floor(realT * 10) % 2 === 0;
  const scroll = R(camL);
  for (const [x0, dir] of [[fieldX, 1], [fieldX + FW - 3, -1]]) {
    for (let y = -4; y < LH + 4; y += 1) {
      const on = (((y + scroll) * dir + 400000) >> 2) & 1;
      fill(on ? (hot ? '#ffffff' : '#ff3355') : INK);
      lc.fillRect(x0, y, 3, 1);
    }
  }

  const target = state === 'play' && !g.anchor ? api.findTarget() : null;

  // nodes
  for (const n of g.nodes) {
    const x = lx(n.x), y = ly(n.y);
    if (y < -60 || y > LH + 60) continue;
    if (n.type === 'red') { drawSpike(n, x, y, t); continue; }
    if (n.used && !n.dead) { drawCollapsing(n, x, y, realT); continue; }
    drawNode(n, x, y, t, realT, n === target);
  }

  // orbit preview
  if (target) {
    const r = dist(g.p.x, g.p.y, target.x, target.y);
    const gr = api.gradeFor(r);
    fill(gr === 'perfect' ? PAL.cyan : gr === 'good' ? '#ffffff' : '#7a6fa0');
    dots(lx(target.x), ly(target.y), r * ls, gr === 'perfect' ? 1.5 : 3, realT * 2);
    line(lx(g.p.x), ly(g.p.y), lx(target.x), ly(target.y), i => (i % 4 === 0 ? '#ffffff' : null));
  }

  // tether: marching pixels
  if (g.anchor && state !== 'dead') {
    const c = css(comboCol(g.combo)), m = Math.floor(realT * 24);
    line(lx(g.anchor.x), ly(g.anchor.y), lx(g.p.x), ly(g.p.y), i => ((i + m) % 4 < 2 ? '#ffffff' : c));
  }

  // trail: shrinking squares
  const tr = g.trail, tc = comboCol(g.combo);
  for (let i = 0; i < tr.length; i += 6) {
    const a = i / tr.length, s = a > 0.7 ? 2 : 1;
    fill(a > 0.5 ? tc : PAL.pink);
    lc.fillRect(R(lx(tr[i])) - (s >> 1), R(ly(tr[i + 1])) - (s >> 1), s, s);
  }
  // player: diamond sprite
  if (state !== 'dead') {
    const x = R(lx(g.p.x)), y = R(ly(g.p.y));
    fill(INK); for (let dy = -4; dy <= 4; dy++) { const w = 4 - Math.abs(dy); lc.fillRect(x - w, y + dy, w * 2 + 1, 1); }
    fill(tc); for (let dy = -3; dy <= 3; dy++) { const w = 3 - Math.abs(dy); lc.fillRect(x - w, y + dy, w * 2 + 1, 1); }
    fill('#ffffff'); px(x, y); px(x - 1, y - 1);
  }

  // particles
  for (const q of g.particles) {
    const a = clamp(q.life / q.max, 0, 1);
    const x = R(lx(q.x)), y = R(ly(q.y));
    if (q.kind === 'ring') {
      if (a < 0.15) continue;
      fill(q.col); ring(x, y, (C.CORE_R + (1 - a) * q.r) * ls);
    } else if (q.kind === 'confetti') {
      fill(q.col); lc.fillRect(x, y, Math.sin(realT * 10 + q.rot) > 0 ? 2 : 1, 1);
    } else {
      if (a < 0.2 && (Math.floor(realT * 30) & 1)) continue;   // flicker out
      fill(a > 0.6 ? '#ffffff' : css(q.col));
      const s = q.r > 1.5 && a > 0.4 ? 2 : 1;
      lc.fillRect(x, y, s, s);
    }
  }
  lc.restore();

  // flash, danger border, side areas
  if (g.flash > 0.05) { lc.globalAlpha = Math.min(0.5, g.flash * 0.5); fill(g.flashCol); lc.fillRect(fieldX, 0, FW, LH); lc.globalAlpha = 1; }
  if (state === 'play' && g.anchor && g.anchor.fuse < 0.6 && Math.floor(realT * 12) % 2 === 0) {
    fill(PAL.red); lc.fillRect(fieldX, 0, FW, 2); lc.fillRect(fieldX, LH - 3, FW, 2);
  }
  if (fieldX > 0) {
    fill('rgba(8,4,20,0.75)');
    lc.fillRect(0, 0, fieldX, LH); lc.fillRect(fieldX + FW, 0, lo.width, LH);
  }

  // upscale to the screen, crisp
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lo, 0, 0, lo.width * k * dpr, lo.height * k * dpr);
  if (scanPat) { ctx.fillStyle = scanPat; ctx.fillRect(0, 0, cw * dpr, ch * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // popups (hi-res pixel font)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of g.popups) {
    const age = q.max - q.life;
    if (q.life < 0.25 && Math.floor(realT * 20) % 2) continue;
    const s = age < 0.1 ? 1.4 : 1;
    ctx.font = fp(q.size * api.scale * 0.62 * s);
    const x = R(keepIn(lx(q.x) * k, ctx.measureText(clean(q.text)).width)), y = R(ly(q.y) * k);
    ctx.fillStyle = INK; ctx.fillText(clean(q.text), x + 2, y + 2);
    ctx.fillStyle = css(q.col); ctx.fillText(clean(q.text), x, y);
  }

  drawHUD();
}

function drawNode(n, x, y, t, realT, isTarget) {
  const { g } = api;
  const live = !n.dead;
  const r = R(C.CORE_R * ls * (1 + n.pulse * 0.5)) + 1;
  if (live && isTarget) {
    // PERFECT band edges and latch range
    fill(PAL.cyan);
    dots(x, y, C.MIN_ORBIT * ls, 2, -realT);
    dots(x, y, (C.MIN_ORBIT + C.PERFECT_GAP) * ls, 2, realT);
    fill('rgba(255,255,255,0.45)');
    dots(x, y, C.LATCH_RANGE * ls, 4, realT * 0.3);
    // blinking target brackets
    if (Math.floor(realT * 6) % 2 === 0) {
      const d = r + 5; fill('#ffffff');
      for (const [sxs, sys] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = R(x + sxs * d), cy = R(y + sys * d);
        lc.fillRect(sxs < 0 ? cx : cx - 2, cy, 3, 1); lc.fillRect(cx, sys < 0 ? cy : cy - 2, 1, 3);
      }
    }
  }
  const base = n.dead ? PAL.red : isTarget ? PAL.cyan : n === g.anchor ? comboCol(g.combo) : PAL.node;
  // orb: outline, body, shade, highlight
  fill(INK); disc(x, y + 1, r + 1);
  fill(INK); disc(x, y, r + 1);
  fill(base); disc(x, y, r);
  fill('rgba(18,10,38,0.35)'); for (let dy = 0; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); lc.fillRect(R(x) + w - Math.max(1, w >> 1), R(y) + dy, Math.max(1, w >> 1) + 1, 1); }
  fill('#ffffff'); lc.fillRect(R(x - r / 2), R(y - r / 2), 2, 1); px(R(x - r / 2), R(y - r / 2) + 1);
  // orbiting satellites
  if (live) {
    fill(css(base));
    for (let i = 0; i < 3; i++) { const a = n.spin + i * TAU / 3; px(R(x + Math.cos(a) * (r + 3)), R(y + Math.sin(a) * (r + 3))); }
  }
  // fuse
  if (n.active && n.fuse < 50) {
    const f = clamp(n.fuse / n.fuseMax, 0, 1);
    fill(n.fuse < 0.6 && Math.floor(t * 14) % 2 ? PAL.red : PAL.orange);
    dots(x, y, (C.CORE_R + 6) * ls + 1, 1, -Math.PI / 2, f);
    dots(x, y, (C.CORE_R + 6) * ls + 2, 1, -Math.PI / 2, f);
  }
  if (n.amp && live) {
    fill('rgba(255,255,255,0.3)');
    for (let xx = lx(n.baseX - n.amp); xx <= lx(n.baseX + n.amp); xx += 3) px(R(xx), R(y));
  }
}

function drawCollapsing(n, x, y, realT) {
  if (n.collapse <= 0) { fill('rgba(255,255,255,0.25)'); px(R(x), R(y)); return; }
  const kk = n.collapse;
  if (Math.floor(realT * 30) % 2) return;
  fill('#ffffff'); ring(x, y, (C.CORE_R * ls + 1) * kk);
  fill(PAL.node); disc(x, y, Math.max(0, R((C.CORE_R * ls) * kk * kk)));
}

function drawSpike(n, x, y, t) {
  const r = R(C.RED_R * ls * 0.55) + 1, L = R(C.RED_R * ls * 1.25) + 1;
  const rot = Math.floor(t * 8) / 8 * (Math.PI / 4);
  for (let i = 0; i < 8; i++) {
    const a = rot + i * Math.PI / 4;
    line(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * L, y + Math.sin(a) * L, () => (i % 2 ? '#ff99aa' : '#ff3355'));
  }
  fill(INK); disc(x, y, r + 1);
  fill(PAL.red); disc(x, y, r);
  fill('#ffd0dc'); px(R(x) - 1, R(y) - 1);
}

// ---------- HUD (hi-res, pixel font) ----------
function box(x, y, w, h, fillC, border, b) {
  x = R(x); y = R(y); w = R(w); h = R(h); b = Math.max(2, R(b));
  ctx.fillStyle = border;
  ctx.fillRect(x + b, y, w - 2 * b, b); ctx.fillRect(x + b, y + h - b, w - 2 * b, b);
  ctx.fillRect(x, y + b, b, h - 2 * b); ctx.fillRect(x + w - b, y + b, b, h - 2 * b);
  ctx.fillStyle = fillC; ctx.fillRect(x + b, y + b, w - 2 * b, h - 2 * b);
}
function ptext(s, x, y, size, col, shadow = INK, off) {
  ctx.font = fp(size);
  const o = off || Math.max(2, R(size / 8));
  s = clean(s);
  ctx.fillStyle = shadow;
  ctx.fillText(s, R(x) + o, R(y) + o);
  ctx.fillStyle = col; ctx.fillText(s, R(x), R(y));
}

function drawHUD() {
  const { g, ch, scale, offX, state, realT, deadTimer, best } = api;
  const u = api.U(), cx = offX + C.W * scale / 2;
  const blink = Math.floor(realT * 2.5) % 2 === 0;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  if (state === 'play' || state === 'paused') {
    const sc = 1 + g.scorePop * 0.3;
    ctx.save(); ctx.translate(0, api.safeTop);
    ptext(String(g.score), cx, 46 * u, 26 * u * sc, css(comboCol(g.combo)));
    ptext('BEST ' + best, cx, 78 * u, 8 * u, '#c9bdf0');
    if (g.combo > 0) {
      const c = css(comboCol(g.combo));
      box(cx - 26 * u, 92 * u, 52 * u, 22 * u, INK, c, 2 * u);
      ptext('x' + (g.combo + 1), cx + 1, 104 * u, 9 * u, c);
    }
    ctx.restore();
    if (!g.started && state === 'play' && blink) ptext(TEXT.hint, cx, ch * 0.86, 8.5 * u, css(PAL.gold));
    const r = api.pauseBtnRect();
    box(r.x, r.y, r.w, r.h, 'rgba(18,10,38,0.8)', '#ffffff', 2 * u);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(R(r.x + r.w * 0.34), R(r.y + r.h * 0.3), R(r.w * 0.12), R(r.h * 0.4));
    ctx.fillRect(R(r.x + r.w * 0.54), R(r.y + r.h * 0.3), R(r.w * 0.12), R(r.h * 0.4));
  }

  if (state === 'title') {
    shade(0.4);
    drawMute();
    for (const b of api.versionBtns()) {
      box(b.x, b.y, b.w, b.h, b.active ? css(PAL.pink) : 'rgba(18,10,38,0.85)', b.active ? '#ffffff' : '#7a6fa0', 2 * u);
      ptext(b.label, b.x + b.w / 2 + 1, b.y + b.h / 2 + 1, 7 * u, '#ffffff', INK, 1);
    }
    const ty = ch * 0.21 + (Math.floor(realT * 2) % 2) * 2 * u;
    ctx.font = fp(46 * u);
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [3, 3], [5, 5]]) { ctx.fillStyle = INK; ctx.fillText(TEXT.title, cx + dx * u, ty + dy * u); }
    ctx.fillStyle = css(PAL.pink); ctx.fillText(TEXT.title, cx + 2 * u, ty + 2 * u);
    ctx.fillStyle = css(PAL.gold); ctx.fillText(TEXT.title, cx, ty);
    ptext(TEXT.tagline, cx, ty + 50 * u, 7 * u, '#e6dcff');
    const by = ch * 0.73;
    TEXT.lines.forEach((l, i) => {
      const y = by + i * 30 * u, c = css(PAL[l[0]]);
      box(cx - 150 * u, y - 11 * u, 62 * u, 22 * u, INK, c, 2 * u);
      ctx.textAlign = 'center'; ptext(l[1], cx - 119 * u + 1, y + 1, 7 * u, c, INK, 1);
      ctx.textAlign = 'left'; ptext(l[2], cx - 78 * u, y + 1, 7.5 * u, '#ffffff');
    });
    ctx.textAlign = 'center';
    if (blink) ptext(TEXT.start, cx, ch * 0.92, 12 * u, css(PAL.gold));
    if (best > 0) ptext('BEST ' + best, cx, ch * 0.92 + 24 * u, 8 * u, '#c9bdf0');
  }

  if (state === 'paused') {
    shade(0.6);
    drawMute();
    box(cx - 120 * u, ch * 0.45 - 40 * u, 240 * u, 80 * u, 'rgba(18,10,38,0.95)', '#ffffff', 3 * u);
    ptext(TEXT.paused, cx, ch * 0.45 - 10 * u, 20 * u, css(PAL.cyan));
    ptext(TEXT.resume, cx, ch * 0.45 + 20 * u, 8 * u, '#ffffff');
  }

  if (state === 'dead') {
    const kk = clamp(deadTimer / 0.35, 0, 1);
    shade(0.55 * kk);
    if (kk < 1) return;
    ptext('GAME OVER', cx, ch * 0.2, 26 * u, css(PAL.red));
    ptext(g.cause.toUpperCase(), cx, ch * 0.2 + 34 * u, 7.5 * u, '#ffd0dc');
    box(cx - 130 * u, ch * 0.4 - 52 * u, 260 * u, 150 * u, 'rgba(18,10,38,0.9)', '#ffffff', 3 * u);
    ptext(String(g.score), cx, ch * 0.4 - 6 * u, 44 * u, css(PAL.gold));
    if (g.newRecord) {
      if (blink) ptext(TEXT.newBest, cx, ch * 0.4 + 42 * u, 12 * u, css(PAL.cyan));
    } else {
      const diff = best - g.score;
      ptext('BEST ' + best + (diff > 0 && diff <= Math.max(5, best * 0.2) ? ' - ' + diff + ' to go!' : ''), cx, ch * 0.4 + 42 * u, 9 * u, '#ffffff');
    }
    ptext(`nodes ${g.latches} - perfect ${g.perfects} - combo x${g.maxCombo + 1}`, cx, ch * 0.4 + 74 * u, 6.5 * u, '#c9bdf0');
    if (deadTimer > 0.45 && blink) ptext(TEXT.retry, cx, ch * 0.72, 12 * u, css(PAL.gold));
  }
}

function drawMute() {
  const r = api.muteBtnRect(), u = api.U();
  box(r.x, r.y, r.w, r.h, 'rgba(18,10,38,0.85)', api.muted ? css(PAL.red) : '#ffffff', 2 * u);
  ctx.textAlign = 'center';
  ptext(api.muted ? 'OFF' : 'SFX', r.x + r.w / 2 + 1, r.y + r.h / 2 + 1, 6.5 * u, api.muted ? css(PAL.red) : '#ffffff', INK, 1);
}

function shade(a) {
  // ordered-dither style darkening keeps the retro feel
  ctx.fillStyle = `rgba(10,5,24,${a})`; ctx.fillRect(0, 0, api.cw, api.ch);
}

// chiptune sound overrides (square waves, arpeggios)
const sounds = {
  release() { this.tone(660, 0.05, 'square', 0.25, -300); },
  collapse() { this.tone(220, 0.08, 'square', 0.12, -120); },
  latch(grade, combo) {
    if (grade === 'perfect') {
      const f = this.note(combo + 3);
      [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(f * m, 0.06, 'square', 0.4, 0, i * 0.04));
    } else if (grade === 'good') { this.tone(this.note(2), 0.06, 'square', 0.4); this.tone(this.note(4), 0.08, 'square', 0.35, 0, 0.05); }
    else this.tone(this.note(0), 0.1, 'square', 0.4);
  },
  close() { this.tone(1500, 0.04, 'square', 0.3); this.tone(2000, 0.05, 'square', 0.25, 0, 0.04); },
  death() {
    this.noise(0.25, 0.25, 1800);
    [523, 392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.09, 'square', 0.4, 0, 0.05 + i * 0.08));
  },
  record() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.1, 'square', 0.35, 0, 0.4 + i * 0.09)); },
};

return { pal: PAL, combo: COMBO, render, resize, chipAudio: true, sounds };
};
