/* LATCH — LIGHT theme: paper background, pastel zones, soft shadows, card UI. */
(window.LATCH_THEMES = window.LATCH_THEMES || {}).light = (api) => {
'use strict';
const { ctx, C, TEXT } = api;
const { clamp, lerp, mix, rand, dist, TAU, css } = api.util;

const INK = [34, 34, 59];
const PAL = {
  gold: [236, 168, 36], orange: [255, 126, 71], pink: [255, 90, 95], violet: [107, 91, 214],
  cyan: [16, 163, 163], white: INK, red: [230, 57, 70], node: [130, 120, 170], dim: [140, 135, 160],
};
PAL.confetti = [PAL.gold, PAL.pink, PAL.cyan, PAL.violet, PAL.orange];
const COMBO = [PAL.gold, PAL.orange, PAL.pink, PAL.violet, PAL.cyan, PAL.cyan, INK, INK];
const comboCol = api.comboCol;
// pastel zones: change every 12 latches
const ZONES = [
  { top: [250, 246, 238], bot: [242, 234, 220], blob: [[255, 205, 178], [196, 226, 216]] },
  { top: [238, 248, 243], bot: [222, 240, 232], blob: [[170, 225, 210], [255, 220, 170]] },
  { top: [252, 240, 234], bot: [246, 226, 218], blob: [[255, 190, 180], [210, 200, 245]] },
  { top: [236, 243, 252], bot: [220, 232, 248], blob: [[180, 210, 250], [255, 214, 190]] },
  { top: [243, 238, 252], bot: [230, 222, 248], blob: [[215, 195, 250], [190, 232, 220]] },
];

const FONT_D = 'Unbounded, "Arial Black", system-ui, sans-serif';
const FONT_U = '"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif';
const fd = (s, w = 900) => `${w} ${Math.round(s)}px ${FONT_D}`;
const fu = (s, w = 700) => `${w} ${Math.round(s)}px ${FONT_U}`;
if (document.fonts && document.fonts.load) {
  ['900 40px Unbounded', '700 16px "Space Grotesk"', '500 16px "Space Grotesk"']
    .forEach(f => document.fonts.load(f).catch(() => {}));
}

const blobs = Array.from({ length: 6 }, (_, i) => ({ x: rand(0.05, 0.95), y: rand(0, 1), z: rand(0.05, 0.15), r: rand(0.25, 0.5), k: i % 2 }));

const keepIn = (x, w) => clamp(x, api.offX + w / 2 + 6, api.offX + C.W * api.scale - w / 2 - 6);
const sx = x => api.offX + x * api.scale;
const sy = y => (y - api.g.camY) * api.scale;

function zoneColors() {
  const z = api.g.zoneF, i = Math.floor(z), f = z - i;
  const a = ZONES[i % ZONES.length], b = ZONES[(i + 1) % ZONES.length];
  const ff = f * f * (3 - 2 * f);
  return { top: mix(a.top, b.top, ff), bot: mix(a.bot, b.bot, ff), b0: mix(a.blob[0], b.blob[0], ff), b1: mix(a.blob[1], b.blob[1], ff) };
}

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
function shadowDisc(x, y, r, a = 0.14) {
  ctx.fillStyle = `rgba(34,34,59,${a})`;
  ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + r * 0.45, r * 1.05, r * 0.85, 0, 0, TAU); ctx.fill();
}

function render() {
  const { g, cw, ch, dpr, scale, offX, state, realT } = api;
  const W = C.W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const Z = zoneColors();

  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, css(Z.top)); sky.addColorStop(1, css(Z.bot));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);

  // soft pastel blobs (parallax)
  const camPx = g.camY * scale;
  for (const b of blobs) {
    const span = ch * 2;
    const y = ((b.y * span - camPx * b.z) % span + span) % span - ch * 0.4;
    const r = b.r * Math.max(cw, ch) * 0.55;
    const gr = ctx.createRadialGradient(b.x * cw, y, 0, b.x * cw, y, r);
    const c = b.k ? Z.b1 : Z.b0;
    gr.addColorStop(0, css(c, 0.55)); gr.addColorStop(1, css(c, 0));
    ctx.fillStyle = gr; ctx.fillRect(b.x * cw - r, y - r, r * 2, r * 2);
  }

  ctx.save();
  const zc = 1 + g.zoom;
  if (zc !== 1) { ctx.translate(cw / 2, ch * 0.55); ctx.scale(zc, zc); ctx.translate(-cw / 2, -ch * 0.55); }
  if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake * scale, (Math.random() - 0.5) * g.shake * scale);

  // dot grid that scrolls with the world: shows motion
  const gs = 25, gy0 = Math.floor(g.camY / gs) * gs;
  ctx.fillStyle = 'rgba(34,34,59,0.1)';
  for (let y = gy0; y < g.camY + api.viewH + gs; y += gs) {
    for (let x = gs / 2; x < W; x += gs) ctx.fillRect(sx(x) - 1, sy(y) - 1, 2, 2);
  }

  // deadly walls
  const pNear = state === 'play' ? Math.min(g.p.x, W - g.p.x) : 999;
  const wa = pNear < 70 ? 1 - pNear / 70 : 0;
  for (const wx of [0, W]) {
    const x = sx(wx), dirx = wx ? -1 : 1;
    if (wa > 0) {
      const gr = ctx.createLinearGradient(x, 0, x + dirx * 30 * scale, 0);
      gr.addColorStop(0, css(PAL.red, 0.28 * wa)); gr.addColorStop(1, css(PAL.red, 0));
      ctx.fillStyle = gr; ctx.fillRect(Math.min(x, x + dirx * 30 * scale), -40, 30 * scale, ch + 80);
    }
    ctx.fillStyle = css(PAL.red, 0.55 + 0.45 * wa); ctx.fillRect(x - 1.5, -40, 3, ch + 80);
  }

  const target = state === 'play' && !g.anchor ? api.findTarget() : null;
  const t = g.t;

  for (const n of g.nodes) {
    const x = sx(n.x), y = sy(n.y);
    if (y < -100 || y > ch + 100) continue;
    if (n.type === 'red') { drawSpike(n, x, y, t); continue; }
    if (n.used && !n.dead) { drawCollapsing(n, x, y); continue; }
    drawNode(n, x, y, t, n === target);
  }

  // orbit preview
  if (target) {
    const r = dist(g.p.x, g.p.y, target.x, target.y);
    const gr = api.gradeFor(r);
    const col = gr === 'perfect' ? PAL.cyan : INK;
    ctx.strokeStyle = css(col, gr === 'perfect' ? 0.95 : gr === 'good' ? 0.5 : 0.2);
    ctx.lineWidth = gr === 'perfect' ? 2.5 : 1.5;
    circle(sx(target.x), sy(target.y), r * scale); ctx.stroke();
    ctx.setLineDash([2, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = css(col, 0.35);
    ctx.beginPath(); ctx.moveTo(sx(g.p.x), sy(g.p.y)); ctx.lineTo(sx(target.x), sy(target.y)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // tether: ink line with a moving dash
  if (g.anchor && state !== 'dead') {
    const ax = sx(g.anchor.x), ay = sy(g.anchor.y), px = sx(g.p.x), py = sy(g.p.y);
    ctx.lineCap = 'round';
    ctx.strokeStyle = css(INK, 0.85); ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke();
    ctx.strokeStyle = css(comboCol(g.combo)); ctx.lineWidth = 1.2 * scale;
    ctx.setLineDash([4 * scale, 6 * scale]); ctx.lineDashOffset = -realT * 60;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  // ribbon trail
  const tr = g.trail, tc = comboCol(g.combo);
  ctx.lineCap = 'round';
  for (let i = 2; i < tr.length; i += 2) {
    const a = i / tr.length;
    ctx.strokeStyle = css(mix(PAL.pink, tc, a), a * 0.55);
    ctx.lineWidth = C.PLAYER_R * scale * a * 1.6;
    ctx.beginPath(); ctx.moveTo(sx(tr[i - 2]), sy(tr[i - 1])); ctx.lineTo(sx(tr[i]), sy(tr[i + 1])); ctx.stroke();
  }
  // player: glossy ball
  if (state !== 'dead') {
    const px = sx(g.p.x), py = sy(g.p.y), r = C.PLAYER_R * scale * 1.15;
    shadowDisc(px, py, r, 0.18);
    ctx.fillStyle = css(tc); circle(px, py, r); ctx.fill();
    ctx.strokeStyle = css(INK); ctx.lineWidth = 1.8 * scale; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle(px - r * 0.35, py - r * 0.35, r * 0.3); ctx.fill();
  }

  // particles
  for (const q of g.particles) {
    const a = clamp(q.life / q.max, 0, 1);
    const x = sx(q.x), y = sy(q.y);
    if (q.kind === 'ring') {
      const e = 1 - a;
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = css(q.col); ctx.lineWidth = (1 + 4 * a) * scale;
      circle(x, y, (C.CORE_R + e * q.r) * scale); ctx.stroke();
    } else if (q.kind === 'spark') {
      ctx.globalAlpha = a; ctx.strokeStyle = css(q.col); ctx.lineWidth = q.r * scale * 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - q.vx * 0.03 * scale, y - q.vy * 0.03 * scale); ctx.stroke();
    } else if (q.kind === 'confetti') {
      ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = css(q.col);
      const w = q.r * scale, h = w * Math.abs(Math.sin(realT * 8 + q.rot)) + 1;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    } else {
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = css(q.col);
      circle(x, y, q.r * scale); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // popups
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of g.popups) {
    const kk = q.life / q.max, age = q.max - q.life;
    const s = age < 0.12 ? lerp(1.5, 1, age / 0.12) : 1;
    ctx.globalAlpha = clamp(kk * 2, 0, 1);
    ctx.font = fd(q.size * scale * s, 900);
    ctx.lineWidth = 4 * scale; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineJoin = 'round';
    const px = keepIn(sx(q.x), ctx.measureText(q.text).width);
    ctx.strokeText(q.text, px, sy(q.y));
    ctx.fillStyle = css(q.col); ctx.fillText(q.text, px, sy(q.y));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // flash, danger pulse, side areas
  if (g.flash > 0) {
    ctx.globalAlpha = g.flash * 0.22; ctx.fillStyle = css(g.flashCol); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
  }
  if (state === 'play' && g.anchor && g.anchor.fuse < 0.6) {
    ctx.globalAlpha = 0.2 + 0.15 * Math.sin(realT * 30);
    const vr = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    vr.addColorStop(0, css(PAL.red, 0)); vr.addColorStop(1, css(PAL.red, 0.6));
    ctx.fillStyle = vr; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
  }
  if (offX > 0) {
    ctx.fillStyle = 'rgba(34,34,59,0.06)';
    ctx.fillRect(0, 0, offX - 1, ch); ctx.fillRect(offX + W * scale + 1, 0, offX, ch);
  }

  drawHUD();
}

function drawNode(n, x, y, t, isTarget) {
  const { g, scale } = api;
  const live = !n.dead;
  const breath = 1 + Math.sin(t * 2 + n.ph) * 0.03;
  const r = C.CORE_R * scale * (1 + n.pulse * 0.4) * breath;
  if (live && n !== g.anchor) {
    ctx.strokeStyle = css(PAL.cyan, isTarget ? 0.22 : 0.08);
    ctx.lineWidth = C.PERFECT_GAP * scale;
    circle(x, y, (C.MIN_ORBIT + C.PERFECT_GAP / 2) * scale); ctx.stroke();
    ctx.strokeStyle = css(INK, isTarget ? 0.35 : 0.1);
    ctx.lineWidth = 1.2; ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 20;
    circle(x, y, C.LATCH_RANGE * scale); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  const accent = n.dead ? PAL.red : isTarget ? PAL.cyan : n === g.anchor ? comboCol(g.combo) : PAL.node;
  shadowDisc(x, y, r);
  // white body, ink outline, coloured centre
  ctx.fillStyle = '#ffffff'; circle(x, y, r); ctx.fill();
  ctx.strokeStyle = css(INK); ctx.lineWidth = 2 * scale; ctx.stroke();
  ctx.fillStyle = css(accent); circle(x, y, r * (isTarget || n === g.anchor ? 0.62 : 0.45)); ctx.fill();
  // rotating dashed ring
  ctx.strokeStyle = css(isTarget ? PAL.cyan : INK, isTarget ? 0.9 : 0.35); ctx.lineWidth = 1.5 * scale;
  ctx.setLineDash([3 * scale, 5 * scale]);
  ctx.beginPath(); ctx.arc(x, y, r * 1.6, n.spin, n.spin + TAU); ctx.stroke();
  ctx.setLineDash([]);
  // fuse
  if (n.active && n.fuse < 50) {
    const f = clamp(n.fuse / n.fuseMax, 0, 1);
    ctx.strokeStyle = css(INK, 0.1); ctx.lineWidth = 4 * scale;
    circle(x, y, (C.CORE_R + 6) * scale); ctx.stroke();
    ctx.strokeStyle = n.fuse < 0.6 && Math.floor(t * 14) % 2 ? css(PAL.red) : css(PAL.orange);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, (C.CORE_R + 6) * scale, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
  }
  if (n.amp && live) {
    ctx.strokeStyle = css(INK, 0.15); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx(n.baseX - n.amp), y); ctx.lineTo(sx(n.baseX + n.amp), y); ctx.stroke();
  }
}

function drawCollapsing(n, x, y) {
  const scale = api.scale;
  if (n.collapse <= 0) { ctx.fillStyle = css(INK, 0.15); circle(x, y, 2.5 * scale); ctx.fill(); return; }
  const kk = n.collapse, r = C.CORE_R * scale * kk;
  ctx.globalAlpha = kk;
  ctx.fillStyle = '#ffffff'; circle(x, y, r); ctx.fill();
  ctx.strokeStyle = css(INK); ctx.lineWidth = 2 * scale; ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSpike(n, x, y, t) {
  const R = C.RED_R * api.scale, spikes = 8;
  shadowDisc(x, y, R);
  ctx.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = i / (spikes * 2) * TAU + t * 1.5;
    const r = i % 2 ? R * 0.6 : R * 1.2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = css(PAL.red); ctx.fill();
  ctx.strokeStyle = css(INK); ctx.lineWidth = 1.8 * api.scale; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = '#ffffff'; circle(x, y, R * 0.28); ctx.fill();
}

// ---------- HUD and screens ----------
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function card(x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(34,34,59,0.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff'; rrect(x, y, w, h, r); ctx.fill();
  ctx.restore();
}
function pillBtn(cx, cy, w, h, fill, textCol, label, size) {
  ctx.save();
  ctx.shadowColor = 'rgba(34,34,59,0.2)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  ctx.fillStyle = fill; rrect(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = textCol; ctx.font = fd(size, 900); ctx.fillText(label, cx, cy + 1);
}
function roundBtn(r) {
  ctx.save();
  ctx.shadowColor = 'rgba(34,34,59,0.15)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffffff'; circle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2); ctx.fill();
  ctx.restore();
}

function drawHUD() {
  const { g, ch, scale, offX, state, realT, deadTimer, best } = api;
  const u = api.U(), cx = offX + C.W * scale / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ink = css(INK);

  if (state === 'play' || state === 'paused') {
    const sc = 1 + g.scorePop * 0.3;
    ctx.save(); ctx.translate(0, api.safeTop);
    ctx.font = fd(40 * u * sc, 900);
    ctx.lineWidth = 6 * u; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(String(g.score), cx, 50 * u);
    ctx.fillStyle = ink; ctx.fillText(String(g.score), cx, 50 * u);
    ctx.fillStyle = css(INK, 0.5); ctx.font = fu(11 * u, 700);
    ctx.fillText('BEST ' + best, cx, 84 * u);
    if (g.combo > 0) pillBtn(cx, 108 * u, 54 * u, 24 * u, css(comboCol(g.combo)), '#ffffff', '×' + (g.combo + 1), 11 * u);
    ctx.restore();
    if (!g.started && state === 'play') {
      ctx.globalAlpha = 0.65 + Math.sin(realT * 5) * 0.35;
      ctx.fillStyle = ink; ctx.font = fu(15 * u, 700);
      ctx.fillText(TEXT.hint, cx, ch * 0.86);
      ctx.globalAlpha = 1;
    }
    const r = api.pauseBtnRect();
    roundBtn(r);
    ctx.fillStyle = ink;
    ctx.fillRect(r.x + r.w * 0.37, r.y + r.h * 0.32, r.w * 0.09, r.h * 0.36);
    ctx.fillRect(r.x + r.w * 0.54, r.y + r.h * 0.32, r.w * 0.09, r.h * 0.36);
  }

  if (state === 'title') {
    shade(0.35);
    drawMute();
    for (const b of api.versionBtns()) {
      ctx.save();
      if (!b.active) { ctx.shadowColor = 'rgba(34,34,59,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; }
      ctx.fillStyle = b.active ? ink : '#ffffff'; rrect(b.x, b.y, b.w, b.h, b.h / 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = b.active ? '#ffffff' : ink; ctx.font = fd(8.5 * u, 900);
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    const ty = ch * 0.2 + Math.sin(realT * 1.5) * 3 * u;
    ctx.font = fd(64 * u, 900);
    ctx.fillStyle = css(PAL.pink, 0.9); ctx.fillText(TEXT.title, cx + 4 * u, ty + 4 * u);
    ctx.fillStyle = ink; ctx.fillText(TEXT.title, cx, ty);
    ctx.fillStyle = css(INK, 0.65); ctx.font = fu(13 * u, 500);
    ctx.fillText(TEXT.tagline, cx, ty + 50 * u);
    if (best > 0) { ctx.fillStyle = css(INK, 0.55); ctx.font = fu(12 * u, 700); ctx.fillText('BEST ' + best, cx, ty + 76 * u); }
    // instructions card, anchored to the bottom
    const btnY = ch - 46 * u - api.safeBottom, cw2 = 330 * u, chh = 124 * u, cy0 = btnY - 36 * u - chh;
    card(cx - cw2 / 2, cy0, cw2, chh, 18 * u);
    TEXT.lines.forEach((l, i) => {
      const y = cy0 + 23 * u + i * 26 * u, c = PAL[l[0]];
      ctx.fillStyle = css(c, 0.14); rrect(cx - 148 * u, y - 10 * u, 62 * u, 20 * u, 10 * u); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = css(c); ctx.font = fd(8.5 * u, 900);
      ctx.fillText(l[1], cx - 117 * u, y + 1);
      ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.font = fu(13 * u, 500);
      ctx.fillText(l[2], cx - 74 * u, y + 1);
    });
    ctx.textAlign = 'center';
    const pulse = 1 + Math.sin(realT * 4) * 0.03;
    pillBtn(cx, btnY, 190 * u * pulse, 44 * u * pulse, ink, '#ffffff', TEXT.start, 13 * u);
  }

  if (state === 'paused') {
    shade(0.5);
    drawMute();
    card(cx - 130 * u, ch * 0.45 - 55 * u, 260 * u, 110 * u, 20 * u);
    ctx.fillStyle = ink; ctx.font = fd(30 * u, 900); ctx.fillText(TEXT.paused, cx, ch * 0.45 - 12 * u);
    ctx.fillStyle = css(INK, 0.6); ctx.font = fu(14 * u, 500); ctx.fillText(TEXT.resume, cx, ch * 0.45 + 26 * u);
  }

  if (state === 'dead') {
    const kk = clamp(deadTimer / 0.35, 0, 1);
    shade(0.45 * kk);
    ctx.globalAlpha = kk;
    const cardW = 320 * u, cardH = 218 * u, top = ch * 0.4 - 120 * u + (1 - kk) * 30 * u;
    card(cx - cardW / 2, top, cardW, cardH, 22 * u);
    ctx.fillStyle = css(PAL.red); ctx.font = fu(13 * u, 700);
    ctx.fillText(g.cause.toUpperCase(), cx, top + 32 * u);
    const pop = 1 + Math.max(0, 0.6 - deadTimer) * 0.4;
    ctx.fillStyle = ink; ctx.font = fd(76 * u * pop, 900);
    ctx.fillText(String(g.score), cx, top + 96 * u);
    if (g.newRecord) {
      pillBtn(cx, top + 152 * u, 140 * u, 28 * u, css(PAL.cyan), '#ffffff', TEXT.newBest, 11 * u);
    } else {
      ctx.fillStyle = css(INK, 0.7); ctx.font = fu(15 * u, 700);
      const diff = best - g.score;
      ctx.fillText('BEST ' + best + (diff > 0 && diff <= Math.max(5, best * 0.2) ? '  ·  only ' + diff + ' to go!' : ''), cx, top + 152 * u);
    }
    ctx.fillStyle = css(INK, 0.5); ctx.font = fu(12 * u, 500);
    ctx.fillText(`nodes ${g.latches}   ·   perfect ${g.perfects}   ·   max combo ×${g.maxCombo + 1}`, cx, top + 192 * u);
    if (deadTimer > 0.45) {
      const pulse = 1 + Math.sin(realT * 4) * 0.03;
      pillBtn(cx, top + cardH + 48 * u, 200 * u * pulse, 46 * u * pulse, ink, '#ffffff', TEXT.retry, 13 * u);
    }
    ctx.globalAlpha = 1;
  }
}

function drawMute() {
  const r = api.muteBtnRect(), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  roundBtn(r);
  ctx.fillStyle = css(INK);
  const s = r.w / 34;
  ctx.beginPath();
  ctx.moveTo(cx - 8 * s, cy - 4 * s); ctx.lineTo(cx - 3 * s, cy - 4 * s); ctx.lineTo(cx + 3 * s, cy - 9 * s);
  ctx.lineTo(cx + 3 * s, cy + 9 * s); ctx.lineTo(cx - 3 * s, cy + 4 * s); ctx.lineTo(cx - 8 * s, cy + 4 * s); ctx.fill();
  if (api.muted) {
    ctx.strokeStyle = css(PAL.red); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - 10 * s, cy - 10 * s); ctx.lineTo(cx + 10 * s, cy + 10 * s); ctx.stroke();
  }
}

function shade(a) { ctx.fillStyle = `rgba(250,246,238,${a})`; ctx.fillRect(0, 0, api.cw, api.ch); }

return { pal: PAL, combo: COMBO, render };
};
