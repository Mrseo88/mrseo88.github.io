/* LATCH — NEON theme: cosmic gradients, additive glow, comet trail. */
(window.LATCH_THEMES = window.LATCH_THEMES || {}).neon = (api) => {
'use strict';
const { ctx, C, TEXT } = api;
const { clamp, lerp, mix, rand, dist, TAU, css } = api.util;

const RGB = {
  gold: [255, 200, 87], orange: [255, 128, 64], pink: [255, 79, 200], violet: [150, 120, 255],
  cyan: [70, 240, 255], white: [255, 255, 255], red: [255, 59, 107], node: [214, 200, 255], dim: [200, 190, 230],
};
RGB.confetti = [RGB.gold, RGB.pink, RGB.cyan, RGB.violet, RGB.white];
const COMBO = [RGB.gold, RGB.orange, RGB.pink, RGB.violet, RGB.cyan, RGB.cyan, RGB.white, RGB.white];
const comboCol = api.comboCol;
// background zones: change every 12 latches
const ZONES = [
  { top: [34, 14, 82], bot: [6, 3, 18], neb: [RGB.violet, RGB.pink] },
  { top: [8, 52, 74], bot: [2, 8, 16], neb: [RGB.cyan, RGB.violet] },
  { top: [74, 12, 56], bot: [14, 2, 10], neb: [RGB.pink, RGB.orange] },
  { top: [14, 30, 90], bot: [2, 4, 16], neb: [RGB.cyan, RGB.pink] },
  { top: [70, 34, 8], bot: [12, 5, 2], neb: [RGB.orange, RGB.red] },
];

const FONT_D = 'Unbounded, "Arial Black", system-ui, sans-serif';
const FONT_U = '"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif';
const fd = (s, w = 900) => `${w} ${Math.round(s)}px ${FONT_D}`;
const fu = (s, w = 700) => `${w} ${Math.round(s)}px ${FONT_U}`;
if (document.fonts && document.fonts.load) {
  ['900 40px Unbounded', '700 16px "Space Grotesk"', '500 16px "Space Grotesk"']
    .forEach(f => document.fonts.load(f).catch(() => {}));
}

let vignette = null;
function resize() {
  const { cw, ch } = api;
  vignette = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
}

// soft glow sprites, drawn additively: cheap bloom without shadowBlur
const glowCache = new Map();
function glowSprite(c) {
  const key = (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0);
  let s = glowCache.get(key);
  if (!s) {
    s = document.createElement('canvas'); s.width = s.height = 128;
    const x = s.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, css(c, 1)); gr.addColorStop(0.18, css(c, 0.55));
    gr.addColorStop(0.45, css(c, 0.16)); gr.addColorStop(1, css(c, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    if (glowCache.size > 200) glowCache.clear();
    glowCache.set(key, s);
  }
  return s;
}
function glow(c, x, y, r, a = 1) {
  if (a <= 0 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
}

// starfield (screen space, parallax by depth)
const stars = Array.from({ length: 150 }, () => ({
  x: Math.random(), y: Math.random(), z: rand(0.08, 0.6), r: rand(0.5, 1.6), tw: rand(0, TAU),
  c: Math.random() < 0.15 ? RGB.cyan : Math.random() < 0.15 ? RGB.pink : RGB.white,
}));
const nebulae = Array.from({ length: 5 }, (_, i) => ({ x: rand(0.1, 0.9), y: rand(0, 1), z: rand(0.03, 0.08), r: rand(0.5, 0.9), k: i % 2 }));

const keepIn = (x, w) => clamp(x, api.offX + w / 2 + 6, api.offX + C.W * api.scale - w / 2 - 6);
const sx = x => api.offX + x * api.scale;
const sy = y => (y - api.g.camY) * api.scale;

function zoneColors() {
  const z = api.g.zoneF, i = Math.floor(z), f = z - i;
  const a = ZONES[i % ZONES.length], b = ZONES[(i + 1) % ZONES.length];
  const ff = f * f * (3 - 2 * f);
  return { top: mix(a.top, b.top, ff), bot: mix(a.bot, b.bot, ff), n0: mix(a.neb[0], b.neb[0], ff), n1: mix(a.neb[1], b.neb[1], ff) };
}

function render() {
  const { g, cw, ch, dpr, scale, offX, state, realT } = api;
  const W = C.W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const Z = zoneColors();

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, css(Z.top)); sky.addColorStop(1, css(Z.bot));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);

  // nebulae + stars (additive)
  ctx.globalCompositeOperation = 'lighter';
  const camPx = g.camY * scale;
  for (const n of nebulae) {
    const y = ((n.y * ch * 2 - camPx * n.z) % (ch * 2) + ch * 2) % (ch * 2) - ch * 0.5;
    glow(n.k ? Z.n1 : Z.n0, n.x * cw, y, n.r * Math.max(cw, ch) * 0.6, 0.12);
  }
  const flying = state === 'play' && !g.anchor;
  const vlen = Math.hypot(g.p.vx, g.p.vy) || 1;
  const ux = g.p.vx / vlen, uy = g.p.vy / vlen;
  for (const s of stars) {
    const x = s.x * cw;
    const y = ((s.y * (ch + 40) - camPx * s.z) % (ch + 40) + ch + 40) % (ch + 40) - 20;
    const a = (0.35 + 0.65 * Math.abs(Math.sin(realT * (1 + s.z * 3) + s.tw))) * (0.4 + s.z);
    ctx.globalAlpha = Math.min(1, a);
    if (flying) {
      ctx.strokeStyle = css(s.c); ctx.lineWidth = s.r * 0.8;
      const L = s.z * 22 * scale;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L, y - uy * L); ctx.stroke();
    } else {
      ctx.fillStyle = css(s.c);
      ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

  // world transform: shake + zoom punch
  ctx.save();
  const zc = 1 + g.zoom;
  if (zc !== 1) { ctx.translate(cw / 2, ch * 0.55); ctx.scale(zc, zc); ctx.translate(-cw / 2, -ch * 0.55); }
  if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake * scale, (Math.random() - 0.5) * g.shake * scale);

  // deadly walls: they glow brighter as you get close
  const pNear = state === 'play' ? Math.min(g.p.x, W - g.p.x) : 999;
  const wa = 0.35 + (pNear < 70 ? (1 - pNear / 70) * 0.65 : 0);
  for (const wx of [0, W]) {
    const x = sx(wx), dirx = wx ? -1 : 1;
    const gr = ctx.createLinearGradient(x, 0, x + dirx * 26 * scale, 0);
    gr.addColorStop(0, css(RGB.red, 0.35 * wa)); gr.addColorStop(1, css(RGB.red, 0));
    ctx.fillStyle = gr; ctx.fillRect(Math.min(x, x + dirx * 26 * scale), -40, 26 * scale, ch + 80);
    ctx.fillStyle = css(RGB.red, 0.5 + 0.5 * wa); ctx.fillRect(x - 1, -40, 2, ch + 80);
  }

  const target = state === 'play' && !g.anchor ? api.findTarget() : null;
  const t = g.t;

  // nodes
  for (const n of g.nodes) {
    const x = sx(n.x), y = sy(n.y);
    if (y < -100 || y > ch + 100) continue;
    if (n.type === 'red') { drawSpike(n, x, y, t); continue; }
    if (n.used && !n.dead) { drawCollapsing(n, x, y); continue; }
    drawNode(n, x, y, t, n === target);
  }

  // preview of the orbit you'd get by latching now
  if (target) {
    const r = dist(g.p.x, g.p.y, target.x, target.y);
    const gr = api.gradeFor(r);
    const col = gr === 'perfect' ? RGB.cyan : RGB.white;
    ctx.strokeStyle = css(col, gr === 'perfect' ? 0.95 : gr === 'good' ? 0.55 : 0.22);
    ctx.lineWidth = gr === 'perfect' ? 2.5 : 1.2;
    ctx.beginPath(); ctx.arc(sx(target.x), sy(target.y), r * scale, 0, TAU); ctx.stroke();
    ctx.setLineDash([2, 5]); ctx.lineWidth = 1; ctx.strokeStyle = css(col, 0.35);
    ctx.beginPath(); ctx.moveTo(sx(g.p.x), sy(g.p.y)); ctx.lineTo(sx(target.x), sy(target.y)); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalCompositeOperation = 'lighter';
  // tether: energy beam
  if (g.anchor && state !== 'dead') {
    const ax = sx(g.anchor.x), ay = sy(g.anchor.y), px = sx(g.p.x), py = sy(g.p.y);
    const c = comboCol(g.combo);
    ctx.lineCap = 'round';
    ctx.strokeStyle = css(c, 0.18); ctx.lineWidth = 7 * scale;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke();
    ctx.strokeStyle = css(RGB.white, 0.85); ctx.lineWidth = 1.4 * scale;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    const segs = 8, nx = -(py - ay), ny = px - ax, nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < segs; i++) {
      const k = i / segs, w = Math.sin(k * Math.PI) * Math.sin(realT * 40 + i * 2.1) * 2.2 * scale;
      ctx.lineTo(lerp(ax, px, k) + nx / nl * w, lerp(ay, py, k) + ny / nl * w);
    }
    ctx.lineTo(px, py); ctx.stroke();
  }

  // comet trail
  const tr = g.trail, tc = comboCol(g.combo);
  ctx.lineCap = 'round';
  for (let i = 2; i < tr.length; i += 2) {
    const a = i / tr.length;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css(mix(RGB.pink, tc, a), a * 0.7);
    ctx.lineWidth = C.PLAYER_R * scale * a * 1.8;
    ctx.beginPath(); ctx.moveTo(sx(tr[i - 2]), sy(tr[i - 1])); ctx.lineTo(sx(tr[i]), sy(tr[i + 1])); ctx.stroke();
  }
  // player
  if (state !== 'dead') {
    const px = sx(g.p.x), py = sy(g.p.y);
    glow(tc, px, py, C.PLAYER_R * scale * 6, 0.9);
    glow(RGB.white, px, py, C.PLAYER_R * scale * 2.2, 0.9);
  }

  // particles
  for (const q of g.particles) {
    const a = clamp(q.life / q.max, 0, 1);
    const x = sx(q.x), y = sy(q.y);
    if (q.kind === 'ring') {
      const e = 1 - a;
      ctx.globalAlpha = a; ctx.strokeStyle = css(q.col); ctx.lineWidth = (1 + 5 * a) * scale;
      ctx.beginPath(); ctx.arc(x, y, (C.CORE_R + e * q.r) * scale, 0, TAU); ctx.stroke();
    } else if (q.kind === 'spark') {
      ctx.globalAlpha = a; ctx.strokeStyle = css(q.col); ctx.lineWidth = q.r * scale;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - q.vx * 0.035 * scale, y - q.vy * 0.035 * scale); ctx.stroke();
    } else if (q.kind === 'confetti') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = css(q.col);
      const w = q.r * scale, h = w * Math.abs(Math.sin(realT * 8 + q.rot)) + 1;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.globalCompositeOperation = 'lighter';
    } else {
      glow(q.col, x, y, q.r * 4 * scale, a * 0.8);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // popups: pop in, then float away
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of g.popups) {
    const k = q.life / q.max, age = q.max - q.life;
    const s = age < 0.12 ? lerp(1.6, 1, age / 0.12) : 1;
    ctx.globalAlpha = clamp(k * 2, 0, 1);
    ctx.font = fd(q.size * scale * s, 900);
    const px = keepIn(sx(q.x), ctx.measureText(q.text).width);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(q.text, px + 1.5, sy(q.y) + 2);
    ctx.fillStyle = css(q.col); ctx.fillText(q.text, px, sy(q.y));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // flash + danger pulse + vignette + side areas
  if (g.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = g.flash * 0.35; ctx.fillStyle = css(g.flashCol); ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (state === 'play' && g.anchor && g.anchor.fuse < 0.6) {
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(realT * 30);
    const vr = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    vr.addColorStop(0, 'rgba(255,59,107,0)'); vr.addColorStop(1, 'rgba(255,59,107,0.7)');
    ctx.fillStyle = vr; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, cw, ch);
  if (offX > 0) {
    ctx.fillStyle = 'rgba(3,2,10,0.72)';
    ctx.fillRect(0, 0, offX - 1, ch); ctx.fillRect(offX + W * scale + 1, 0, offX, ch);
  }

  drawHUD();
}

function drawNode(n, x, y, t, isTarget) {
  const { g, scale } = api;
  const live = !n.dead;
  const breath = 1 + Math.sin(t * 2 + n.ph) * 0.04;
  const coreR = C.CORE_R * scale * (1 + n.pulse * 0.4) * breath;
  ctx.globalCompositeOperation = 'lighter';
  if (live && n !== g.anchor) {
    // PERFECT band
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css(RGB.cyan, isTarget ? 0.32 : 0.07);
    ctx.lineWidth = C.PERFECT_GAP * scale;
    ctx.beginPath(); ctx.arc(x, y, (C.MIN_ORBIT + C.PERFECT_GAP / 2) * scale, 0, TAU); ctx.stroke();
    // latch range
    ctx.strokeStyle = css(RGB.white, isTarget ? 0.35 : 0.07);
    ctx.lineWidth = 1; ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.arc(x, y, C.LATCH_RANGE * scale, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  const col = n.dead ? RGB.red : isTarget ? RGB.cyan : n === g.anchor ? comboCol(g.combo) : RGB.node;
  glow(col, x, y, coreR * (isTarget ? 5 : 3.8), isTarget ? 0.9 : 0.6);
  // rotating orbital ring
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = css(col); ctx.lineWidth = 1.5 * scale;
  ctx.setLineDash([4 * scale, 5 * scale]);
  ctx.beginPath(); ctx.arc(x, y, coreR * 1.55, n.spin, n.spin + TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // core
  const cg = ctx.createRadialGradient(x - coreR * 0.3, y - coreR * 0.3, coreR * 0.1, x, y, coreR);
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, css(col));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(x, y, coreR, 0, TAU); ctx.fill();
  // fuse
  if (n.active && n.fuse < 50) {
    const f = clamp(n.fuse / n.fuseMax, 0, 1);
    const danger = n.fuse < 0.6;
    ctx.strokeStyle = danger && Math.floor(t * 14) % 2 ? css(RGB.red) : css(RGB.orange);
    ctx.lineWidth = 3.5 * scale; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, (C.CORE_R + 6) * scale, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
  }
  if (n.amp && live) { // shows the motion path
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(n.baseX - n.amp), y); ctx.lineTo(sx(n.baseX + n.amp), y); ctx.stroke();
  }
}

function drawCollapsing(n, x, y) {
  const scale = api.scale;
  if (n.collapse <= 0) {
    ctx.globalAlpha = 0.15; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 2 * scale, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    return;
  }
  const k = n.collapse;
  ctx.globalCompositeOperation = 'lighter';
  glow(RGB.node, x, y, C.CORE_R * scale * 4 * k, k);
  ctx.globalAlpha = k; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, C.CORE_R * scale * k * k, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function drawSpike(n, x, y, t) {
  const R = C.RED_R * api.scale, spikes = 8;
  ctx.globalCompositeOperation = 'lighter';
  glow(RGB.red, x, y, R * 3.5, 0.7 + Math.sin(t * 6 + n.ph) * 0.2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = css(RGB.red);
  ctx.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = i / (spikes * 2) * TAU + t * 1.5;
    const r = i % 2 ? R * 0.55 : R * 1.2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.fill();
  ctx.fillStyle = '#ffd0dc';
  ctx.beginPath(); ctx.arc(x, y, R * 0.3, 0, TAU); ctx.fill();
}

// ---------- HUD and screens ----------
function gradText(text, x, y, size, cols, glowCol) {
  ctx.font = fd(size, 900);
  const w = ctx.measureText(text).width;
  const gr = ctx.createLinearGradient(x - w / 2, y - size / 2, x + w / 2, y + size / 2);
  cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), css(c)));
  if (glowCol) { ctx.shadowColor = css(glowCol, 0.8); ctx.shadowBlur = size * 0.45; }
  ctx.fillStyle = gr; ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function pill(x, y, w, h, fill, stroke) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + r, y - h / 2); ctx.lineTo(x + w / 2 - r, y - h / 2);
  ctx.arc(x + w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - w / 2 + r, y + h / 2);
  ctx.arc(x - w / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function drawHUD() {
  const { g, cw, ch, scale, offX, state, realT, deadTimer, best } = api;
  const u = api.U(), cx = offX + C.W * scale / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  if (state === 'play' || state === 'paused') {
    const T = api.safeTop;
    const grd = ctx.createLinearGradient(0, 0, 0, 130 * u + T);
    grd.addColorStop(0, 'rgba(5,3,15,0.7)'); grd.addColorStop(1, 'rgba(5,3,15,0)');
    ctx.fillStyle = grd; ctx.fillRect(offX, 0, C.W * scale, 130 * u + T);
    ctx.save(); ctx.translate(0, T);
    const sc = 1 + g.scorePop * 0.35;
    gradText(String(g.score), cx, 50 * u, 40 * u * sc, [RGB.white, comboCol(g.combo)], comboCol(g.combo));
    ctx.fillStyle = 'rgba(243,236,255,0.55)'; ctx.font = fu(11 * u, 700);
    ctx.fillText('BEST ' + best, cx, 84 * u);
    if (g.combo > 0) {
      const c = comboCol(g.combo), pw = 54 * u, ph = 22 * u, py = 108 * u;
      pill(cx, py, pw, ph, css(c, 0.18), css(c, 0.9));
      ctx.fillStyle = css(c); ctx.font = fd(11 * u, 900);
      ctx.fillText('×' + (g.combo + 1), cx, py + 1);
    }
    ctx.restore();
    if (!g.started && state === 'play') {
      ctx.globalAlpha = 0.6 + Math.sin(realT * 5) * 0.35;
      ctx.fillStyle = css(RGB.gold); ctx.font = fu(15 * u, 700);
      ctx.fillText(TEXT.hint, cx, ch * 0.86);
      ctx.globalAlpha = 1;
    }
    // pause button
    const r = api.pauseBtnRect();
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(r.x + r.w * 0.37, r.y + r.h * 0.32, r.w * 0.08, r.h * 0.36);
    ctx.fillRect(r.x + r.w * 0.55, r.y + r.h * 0.32, r.w * 0.08, r.h * 0.36);
  }
  if (state === 'title') {
    shade(0.45);
    drawMute();
    for (const b of api.versionBtns()) {
      pill(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, b.active ? css(RGB.pink, 0.25) : 'rgba(255,255,255,0.05)', b.active ? css(RGB.pink) : 'rgba(255,255,255,0.3)');
      ctx.fillStyle = b.active ? '#fff' : 'rgba(255,255,255,0.7)'; ctx.font = fd(8.5 * u, 900);
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    const ty = ch * 0.2 + Math.sin(realT * 1.5) * 4 * u;
    gradText(TEXT.title, cx, ty, 66 * u, [RGB.gold, RGB.pink, RGB.cyan], RGB.pink);
    ctx.fillStyle = 'rgba(243,236,255,0.75)'; ctx.font = fu(13 * u, 500);
    ctx.fillText(TEXT.tagline, cx, ty + 52 * u);
    const by = ch * 0.74;
    TEXT.lines.forEach((l, i) => {
      const y = by + i * 28 * u, c = RGB[l[0]];
      pill(cx - 100 * u, y, 62 * u, 20 * u, css(c, 0.14), css(c, 0.7));
      ctx.textAlign = 'center'; ctx.fillStyle = css(c); ctx.font = fd(9 * u, 900);
      ctx.fillText(l[1], cx - 100 * u, y + 1);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,236,255,0.88)'; ctx.font = fu(13 * u, 500);
      ctx.fillText(l[2], cx - 58 * u, y + 1);
    });
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6 + Math.sin(realT * 4) * 0.35;
    gradText(TEXT.start, cx, ch * 0.92, 17 * u, [RGB.gold, RGB.pink], RGB.gold);
    ctx.globalAlpha = 1;
    if (best > 0) { ctx.fillStyle = 'rgba(243,236,255,0.55)'; ctx.font = fu(12 * u, 700); ctx.fillText('BEST ' + best, cx, ch * 0.92 + 26 * u); }
  }

  if (state === 'paused') {
    shade(0.6);
    drawMute();
    gradText(TEXT.paused, cx, ch * 0.45, 34 * u, [RGB.white, RGB.violet], RGB.violet);
    ctx.fillStyle = 'rgba(243,236,255,0.75)'; ctx.font = fu(14 * u, 500);
    ctx.fillText(TEXT.resume, cx, ch * 0.45 + 40 * u);
  }

  if (state === 'dead') {
    const k = clamp(deadTimer / 0.35, 0, 1);
    shade(0.6 * k);
    ctx.globalAlpha = k;
    ctx.fillStyle = css(RGB.red, 0.95); ctx.font = fu(14 * u, 700);
    ctx.fillText(g.cause.toUpperCase(), cx, ch * 0.28);
    const pop = 1 + Math.max(0, 0.6 - deadTimer) * 0.5;
    gradText(String(g.score), cx, ch * 0.4, 84 * u * pop, [RGB.white, RGB.gold, RGB.pink], RGB.pink);
    ctx.globalAlpha = k;
    if (g.newRecord) {
      const pw = 150 * u, ph = 28 * u, py = ch * 0.4 + 68 * u;
      pill(cx, py, pw, ph, css(RGB.cyan, 0.15 + 0.1 * Math.sin(realT * 8)), css(RGB.cyan));
      ctx.fillStyle = css(RGB.cyan); ctx.font = fd(12 * u, 900);
      ctx.fillText(TEXT.newBest, cx, py + 1);
    } else {
      ctx.fillStyle = 'rgba(243,236,255,0.7)'; ctx.font = fu(15 * u, 700);
      const diff = best - g.score;
      ctx.fillText('BEST ' + best + (diff > 0 && diff <= Math.max(5, best * 0.2) ? '  ·  only ' + diff + ' to go!' : ''), cx, ch * 0.4 + 68 * u);
    }
    // run stats: something to beat next time
    ctx.fillStyle = 'rgba(243,236,255,0.55)'; ctx.font = fu(12 * u, 500);
    ctx.fillText(`nodes ${g.latches}   ·   perfect ${g.perfects}   ·   max combo ×${g.maxCombo + 1}`, cx, ch * 0.4 + 106 * u);
    if (deadTimer > 0.45) {
      ctx.globalAlpha = k * (0.65 + Math.sin(deadTimer * 5) * 0.35);
      gradText(TEXT.retry, cx, ch * 0.72, 18 * u, [RGB.gold, RGB.pink], RGB.gold);
    }
    ctx.globalAlpha = 1;
  }
}

function drawMute() {
  const r = api.muteBtnRect(), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r.w / 2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const s = r.w / 34;
  ctx.beginPath();
  ctx.moveTo(cx - 8 * s, cy - 4 * s); ctx.lineTo(cx - 3 * s, cy - 4 * s); ctx.lineTo(cx + 3 * s, cy - 9 * s);
  ctx.lineTo(cx + 3 * s, cy + 9 * s); ctx.lineTo(cx - 3 * s, cy + 4 * s); ctx.lineTo(cx - 8 * s, cy + 4 * s); ctx.fill();
  if (api.muted) {
    ctx.strokeStyle = css(RGB.red); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 10 * s, cy - 10 * s); ctx.lineTo(cx + 10 * s, cy + 10 * s); ctx.stroke();
  }
}

function shade(a) { ctx.fillStyle = `rgba(5,3,15,${a})`; ctx.fillRect(0, 0, api.cw, api.ch); }

return { pal: RGB, combo: COMBO, render, resize };
};
