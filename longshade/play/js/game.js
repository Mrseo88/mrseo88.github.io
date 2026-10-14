// LONGSHADE — rendering, input, game states, juice.
import * as C from './core.js';
import { PAL, PHASE_PAL, SPR, buildArt, drawText, textWidth, mix, HERO_AX, HERO_AY } from './art.js';
import * as A from './audio.js';
import { haptic, initNative, exitApp, isNative, initAds, showInterstitial, privacyOptionsRequired, openPrivacyOptions } from './native.js';

// Layout is in logical units (W x H); the canvas has twice the resolution (16-bit density).
// The width is fixed; the height stretches (320..400) so tall phones are filled edge to edge.
// Menus are designed for 320 and centred with UY; the world camera keeps the walker at the same spot.
const W = C.VIEW_W, RES = 2;
let H = C.VIEW_H, UY = 0;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = W * RES;
canvas.height = H * RES;
ctx.imageSmoothingEnabled = false;
const snap = (v) => Math.round(v * RES) / RES; // align to the hi-res pixel grid
buildArt();

const params = new URLSearchParams(location.search);
const AUTOPLAY = params.has('autoplay');
const FIXED_SEED = params.get('seed');

// ---------------------------------------------------------------------------
// Persistence (per-device convenience only)
const store = { best: 0, bestPhase: 0, runs: 0, muted: false };
// Storage key kept from the working title so existing records survive the rename.
try { Object.assign(store, JSON.parse(localStorage.getItem('ombralunga') || '{}')); } catch (e) { /* storage unavailable */ }
function save() { try { localStorage.setItem('ombralunga', JSON.stringify(store)); } catch (e) { /* ignore */ } }
A.setMuted(!!store.muted);

// ---------------------------------------------------------------------------
// State
let state = 'title'; // title | howto | play | dead | paused
let howtoT = 0, howtoThen = 'title';
let g = null;
let demo = true;
const cam = { x: 0, y: 0 };
let particles = [], popups = [], rings = [], afterimages = [];
let shake = 0, hitstop = 0, flash = 0, flashColor = '#ffffff';
let deadT = 0, demoDeadT = 0, newRecord = false, streak = 0;
let adOpen = false; // an interstitial is on screen (Android only)
let banner = null;
let deathAnim = null;
let deathRay = null; // what killed you stays on screen: the ray and where the shade fell
let tNow = 0, acc = 0;
const STEP = 1 / 120;
const mothTrail = [];

// Where the walker sits vertically on screen.
const camY = () => 196 + (H - 320) * 0.6;

function newGame(isDemo) {
  const seed = FIXED_SEED ? +FIXED_SEED : (Math.random() * 2 ** 31) | 0;
  g = C.createGame(seed);
  demo = isDemo;
  particles = []; popups = []; rings = []; afterimages = [];
  streak = 0; deathAnim = null; deathRay = null; banner = null; demoDeadT = 0;
  cam.x = g.player.x - 52;
  cam.y = g.player.y - camY();
}

function startRun() {
  newGame(false);
  state = 'play';
  store.runs++;
  save();
  A.sfx.ui();
}

// The attract-mode / autoplay pilot: jumps to the next island once teetering at an edge.
function botWantsTap() {
  const s = g.shadow, cur = g.player.block;
  if (!s || s.kind !== 'land' || !cur || g.player.walking) return false;
  if (s.block !== cur) return s.block.idx === cur.idx + 1 && C.safeIntervals(s.block, 3).some(([a, c]) => s.x >= a && s.x <= c);
  const iv = C.safeIntervals(cur, 1);
  for (let i = 0; i + 1 < iv.length; i++) {
    if (g.player.x <= iv[i][1] + 0.01 && s.x >= iv[i + 1][0] + 2 && s.x <= iv[i + 1][1] - 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects
function burst(x, y, n, colors, speed = 40, grav = 120, life = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: grav, life: life * (0.6 + Math.random() * 0.6), max: life, col: colors[(Math.random() * colors.length) | 0] });
  }
}

function popup(text, x, y, col) { popups.push({ text, x, y, t: 0, col }); }

const vibrate = (strength) => { if (!demo) haptic(strength); };

const DEATH_TEXT = {
  void: ['LOST IN THE VOID', 'YOUR SHADOW FELL INTO NOTHING'],
  wall: ['HIT THE ROCK', 'YOUR SHADOW STRUCK A WALL'],
  spike: ['IMPALED', 'YOUR SHADOW HIT THE CRYSTALS'],
  crumble: ['THE ISLAND CRUMBLED', 'YOU WAITED TOO LONG'],
};

function handleEvents() {
  const loud = !demo;
  for (const e of g.events) {
    switch (e.type) {
      case 'tick': if (loud) A.sfx.tick(); break;
      case 'teleport': {
        const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
        const dist = Math.hypot(dx, dy);
        const n = Math.min(26, 6 + dist / 6);
        for (let i = 0; i < n; i++) {
          const t = i / n;
          particles.push({ x: e.from.x + dx * t, y: e.from.y - 6 + dy * t + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 10, g: 0, life: 0.25 + t * 0.2, max: 0.45, col: i % 3 ? PAL.ink : PAL.shadeEye });
        }
        afterimages.push({ x: e.from.x, y: e.from.y, t: 0 });
        if (e.kind !== 'land') { deathRay = { from: e.from, to: e.to, kind: e.kind }; break; }
        rings.push({ x: e.to.x, y: e.to.y - 6, t: 0 });
        burst(e.to.x, e.to.y, 7, [PAL.stone[4], PAL.lit[3], PAL.stone[3]], 22, 160, 0.35);
        if (loud) A.sfx.teleport(dist);
        vibrate('light');
        if (e.skip > 0) { streak++; if (loud) A.sfx.land(streak); } else if (loud) A.sfx.hop();
        if (e.close) {
          popup('CLOSE CALL +1', e.to.x, e.to.y - 18, PAL.gold);
          burst(e.to.x, e.to.y - 2, 8, [PAL.gold, PAL.ui], 50, 60, 0.4);
          if (loud) A.sfx.close();
        }
        if (e.skip >= 2) {
          popup('LONG SHADOW +' + (e.skip - 1), e.to.x, e.to.y - 26, PAL.shadeEye);
          hitstop = Math.max(hitstop, 0.06);
          if (loud) A.sfx.long(e.skip);
        }
        break;
      }
      case 'death': {
        const p = g.player;
        // Falling into the void happens off-screen: dissolve where you stood instead.
        const at = e.cause === 'void' && deathRay ? deathRay.from : p;
        deathAnim = { x: at.x, y: at.y, vy: e.cause === 'spike' || e.cause === 'void' ? 0 : -40, t: 0, cause: e.cause };
        shake = 6; hitstop = 0.12; flash = 0.12; flashColor = PAL.danger;
        burst(p.x, p.y - 6, 26, e.cause === 'spike' ? [PAL.spike[2], PAL.spike[4], PAL.danger, PAL.ui] : [PAL.ink, PAL.shadeEye, PAL.danger, PAL.shadeRim], 70, 140, 0.7);
        if (!demo) {
          A.sfx.death(e.cause);
          vibrate('heavy');
          state = 'dead';
          deadT = 0;
          newRecord = g.score > store.best;
          if (newRecord) store.best = g.score;
          store.bestPhase = Math.max(store.bestPhase, g.phase);
          // Every 5th game over an interstitial becomes due; it is shown once the fall has played out.
          store.gameOvers = (store.gameOvers || 0) + 1;
          if (store.gameOvers % 5 === 0) store.adDue = true;
          save();
        }
        break;
      }
      case 'crumbleWarn': if (loud) A.sfx.crumbleWarn(); break;
      case 'crumble': {
        const b = e.block;
        for (let i = 0; i < 10; i++) particles.push({ x: b.x1 + Math.random() * (b.x2 - b.x1), y: b.y + Math.random() * 6, vx: (Math.random() - 0.5) * 20, vy: Math.random() * 20, g: 300, life: 0.8, max: 0.8, col: Math.random() < 0.5 ? PAL.stone[3] : PAL.stone[1], size: 1 });
        if (loud) A.sfx.crumble();
        break;
      }
      case 'reverseWarn': if (loud) A.sfx.reverseWarn(); break;
      case 'phase': {
        banner = { text: C.PHASES[e.phase].name, t: 0 };
        flash = 0.25; flashColor = PHASE_PAL[e.phase].accent;
        if (loud) A.sfx.phase();
        break;
      }
      case 'fizzle': {
        burst(g.player.x, g.player.y - 12, 4, [PAL.uiDim], 12, 0, 0.3);
        if (loud) A.sfx.fizzle();
        break;
      }
    }
  }
  g.events.length = 0;
}

// ---------------------------------------------------------------------------
// Input
function toInternal(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

function inMuteButton(p) { return p && p.x > W - 24 && p.y < 24; }

function press(p) {
  A.unlock();
  if (state === 'title') {
    if (inMuteButton(p)) return toggleMute();
    if (privacyOptionsRequired() && p && p.x < 46 && p.y < 22) return openPrivacyOptions();
    if (inHowtoButton(p)) return openHowto('title');
    if (!store.seenHowTo) return openHowto('play');
    return startRun();
  }
  if (state === 'howto') {
    if (howtoT < 0.4) return;
    store.seenHowTo = true;
    save();
    A.sfx.ui();
    if (howtoThen === 'play') return startRun();
    state = 'title';
    return;
  }
  if (state === 'paused') { state = 'play'; A.resume(); return; }
  if (state === 'play') {
    if (AUTOPLAY) return;
    C.tap(g);
    handleEvents();
    return;
  }
  if (state === 'dead') {
    if (adOpen) return;
    if (inMuteButton(p)) return toggleMute();
    if (deadT > 0.45) startRun();
  }
}

function inHowtoButton(p) { return p && p.x > 40 && p.x < 140 && p.y - UY > 214 && p.y - UY < 244; }

function openHowto(then) {
  state = 'howto';
  howtoT = 0;
  howtoThen = then;
  A.sfx.ui();
}

function toggleMute() {
  store.muted = !A.isMuted();
  A.setMuted(store.muted);
  save();
  A.sfx.ui();
}

canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); press(toInternal(ev)); }, { passive: false });
window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'ArrowUp') { ev.preventDefault(); press(null); }
  if (ev.code === 'KeyM') toggleMute();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'play' && !AUTOPLAY) state = 'paused';
    A.suspend();
  } else if (state !== 'paused') A.resume();
});
['touchstart', 'touchmove', 'gesturestart', 'dblclick', 'contextmenu'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));

// ---------------------------------------------------------------------------
// Update
function update(dt) {
  tNow += dt;
  if (hitstop > 0) { hitstop -= dt; return; }
  if (state === 'paused') return;

  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    C.step(g, STEP);
    if ((demo || AUTOPLAY) && g.alive && botWantsTap()) C.tap(g);
    handleEvents();
    if (hitstop > 0) { acc = 0; break; }
  }

  if (state === 'howto') howtoT += dt;
  if ((state === 'title' || state === 'howto') && !g.alive) {
    demoDeadT += dt;
    if (demoDeadT > 1.4) newGame(true);
  }
  if (state === 'dead') {
    deadT += dt;
    if (store.adDue && !adOpen && deadT > 1.1 && !AUTOPLAY) {
      if (showInterstitial(() => { adOpen = false; deadT = 0.3; A.resume(); })) {
        adOpen = true;
        store.adDue = false;
        save();
        A.suspend();
      }
    }
    if (AUTOPLAY && deadT > 1.5) startRun();
  }

  // Camera: keep the sleepwalker on the left third, lots of room ahead. Frozen on death.
  const anchor = g.alive ? g.player : deathRay ? deathRay.from : g.player;
  const tx = anchor.x - 52, ty = anchor.y - camY();
  const k = Math.min(1, dt * 7);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * Math.min(1, dt * 4);

  if (deathAnim) {
    deathAnim.t += dt;
    if (deathAnim.cause !== 'spike' && deathAnim.cause !== 'void') { deathAnim.vy += 420 * dt; deathAnim.y += deathAnim.vy * dt; }
  }
  for (const p of particles) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < 1.1);
  for (const r of rings) r.t += dt;
  rings = rings.filter((r) => r.t < 0.25);
  for (const a of afterimages) a.t += dt;
  afterimages = afterimages.filter((a) => a.t < 0.25);
  if (banner) { banner.t += dt; if (banner.t > 2.2) banner = null; }
  shake = Math.max(0, shake - dt * 30);
  flash = Math.max(0, flash - dt);

  const m = C.mothWorld(g);
  mothTrail.push({ x: m.x, y: m.y });
  if (mothTrail.length > 7) mothTrail.shift();
}

// ---------------------------------------------------------------------------
// Background caches (all built at hi-res and drawn at half size in logical units)
function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function blit(cv, x, y) { ctx.drawImage(cv, snap(x), snap(y), cv.width / RES, cv.height / RES); }

// Sky: ten flat bands blended between three key colours, with checkered seams.
const skyCache = {};
function sky(phase) {
  const key = phase + ':' + H;
  if (skyCache[key]) return skyCache[key];
  const cv = mk(W * RES, H * RES), c = cv.getContext('2d');
  const [a, b, d] = PHASE_PAL[phase].sky;
  const BANDS = 10, bh = Math.ceil((H * RES) / BANDS);
  const colAt = (i) => { const t = i / (BANDS - 1); return t < 0.55 ? mix(a, b, t / 0.55) : mix(b, d, (t - 0.55) / 0.45); };
  for (let i = 0; i < BANDS; i++) {
    c.fillStyle = colAt(i);
    c.fillRect(0, i * bh, W * RES, bh);
    if (i > 0) { // checkered seam
      c.fillStyle = colAt(i - 1);
      for (let x = 0; x < W * RES; x += 2) { c.fillRect(x, i * bh, 1, 1); c.fillRect(x + 1, i * bh + 2, 1, 1); }
    }
  }
  skyCache[key] = cv;
  return cv;
}

const STARS = [];
{
  const r = C.rng32(4242);
  for (let i = 0; i < 110; i++) STARS.push({ x: r() * W, y: r() * 210, tw: r() * 6.28, size: r() < 0.1 ? 2 : r() < 0.4 ? 1 : 0 });
}

// Soft clouds: two-tone puffs, drawn translucent.
const cloudCache = [];
function clouds(phase) {
  if (cloudCache[phase]) return cloudCache[phase];
  const P = PHASE_PAL[phase];
  const cv = mk(720, 140), c = cv.getContext('2d');
  const r = C.rng32(77);
  const lo = mix(P.cloud, P.sky[1], 0.5);
  for (let k = 0; k < 9; k++) {
    const cx = r() * 720, cy = 40 + r() * 70, n = 4 + (r() * 5) | 0;
    for (let pass = 0; pass < 2; pass++) {
      c.fillStyle = pass ? P.cloud : lo;
      for (let j = 0; j < n; j++) {
        const px = cx + (j - n / 2) * 14 + r() * 6, rad = 10 + r() * 14;
        for (let y = -rad; y <= rad; y++) {
          const hw = Math.floor(Math.sqrt(rad * rad - y * y));
          if (pass && y > -rad * 0.2) continue; // lit tops only
          for (const off of [-720, 0, 720]) c.fillRect(Math.round(px - hw + off), Math.round(cy + y + (pass ? -2 : 0)), hw * 2, 1);
        }
      }
    }
  }
  cloudCache[phase] = cv;
  return cv;
}

// Parallax layers: far cliffs, mid ruins, near ruins. Each 960 hi-res wide, tiling.
const LAYER_W = 960;
const layerCache = {};
function layer(phase, which) {
  const key = phase + which;
  if (layerCache[key]) return layerCache[key];
  const P = PHASE_PAL[phase];
  const h = which === 'far' ? 260 : which === 'mid' ? 320 : 260;
  const cv = mk(LAYER_W, h), c = cv.getContext('2d');
  const r = C.rng32(which === 'far' ? 11 : which === 'mid' ? 23 : 37);
  // Atmospheric perspective: the far cliffs are hazy, closer to the horizon colour.
  const base = which === 'far' ? mix(P.sky[2], P.mid, 0.55) : P[which];
  const rim = mix(base, P.accent, which === 'far' ? 0.3 : 0.3);
  const dark = mix(base, '#000000', 0.35);
  if (which === 'far') {
    // jagged cliffs with a lit rim
    let y = 120;
    for (let x = 0; x < LAYER_W; x++) {
      const t = (x / LAYER_W) * Math.PI * 2;
      y = 90 + Math.sin(t * 3) * 34 + Math.sin(t * 7 + 1) * 16 + Math.sin(t * 17) * 6 + Math.sin(t * 41) * 2;
      c.fillStyle = base; c.fillRect(x, Math.round(y), 1, h);
      c.fillStyle = rim; c.fillRect(x, Math.round(y), 1, 2);
      if (hash(x, 3) < 0.08) { c.fillStyle = dark; c.fillRect(x, Math.round(y) + 6, 1, 20 + hash(x, 9) * 40); }
    }
    layerCache[key] = cv;
    return cv;
  }
  let x = 0;
  while (x < LAYER_W) {
    const w = Math.round((which === 'mid' ? 16 : 30) + r() * (which === 'mid' ? 40 : 60));
    const th = Math.round((which === 'mid' ? 90 : 60) + r() * (which === 'mid' ? 170 : 150));
    const top = h - th;
    c.fillStyle = base; c.fillRect(x, top, w, th);
    // brick courses
    c.fillStyle = dark;
    for (let y = top + 8; y < h; y += 8) {
      c.fillRect(x, y, w, 1);
      for (let bx = x + ((y / 8) % 2 ? 6 : 0); bx < x + w; bx += 12) c.fillRect(bx, y - 7, 1, 7);
    }
    // roof: crenellations or a spire
    c.fillStyle = base;
    if (r() < 0.55) { for (let i = 0; i < w; i += 6) c.fillRect(x + i, top - 4, 4, 4); }
    else for (let i = 0; i < w / 2; i++) c.fillRect(x + i, Math.round(top - i * 1.4), w - i * 2, Math.ceil(i * 1.4) + 1);
    // arched windows, some lit
    const nw = Math.max(1, Math.floor(w / 18));
    for (let i = 0; i < nw && th > 50; i++) {
      const wx = x + Math.round(((i + 0.5) * w) / nw) - 3, wy = top + 14 + Math.round(r() * 20);
      const lit = r() < (which === 'mid' ? 0.3 : 0.15);
      c.fillStyle = lit ? P.accent : dark;
      c.fillRect(wx, wy + 2, 6, 10); c.fillRect(wx + 1, wy + 1, 4, 1); c.fillRect(wx + 2, wy, 2, 1);
      if (lit) { c.fillStyle = mix(P.accent, '#ffffff', 0.5); c.fillRect(wx + 1, wy + 3, 2, 3); }
    }
    // rim light on the left edge
    c.fillStyle = rim; c.fillRect(x, top, 1, th);
    c.fillStyle = dark; c.fillRect(x + w - 1, top, 1, th);
    x += w + Math.round(r() * (which === 'mid' ? 24 : 40));
  }
  layerCache[key] = cv;
  return cv;
}

function drawLayer(cv, par, baseY) {
  const lw = cv.width / RES;
  const off = -(((cam.x * par) % lw) + lw) % lw;
  const y = snap(baseY - cam.y * par * 0.5);
  for (let k = 0; k < 2; k++) ctx.drawImage(cv, snap(off + k * lw), y, lw, cv.height / RES);
  return y + cv.height / RES;
}

// ---------------------------------------------------------------------------
// Islands: the stone body is rendered once per island at hi-res; light is added live.
function islandBody(b) {
  if (b._cv) return b._cv;
  const wh = Math.max(2, Math.round((b.x2 - b.x1) * RES));
  const S = PAL.stone;
  if (b.kind === 'pillar') {
    const hh = 760;
    const cv = mk(wh, hh), c = cv.getContext('2d');
    for (let x = 0; x < wh; x++) {
      const f = x / (wh - 1);
      c.fillStyle = f < 0.15 ? S[4] : f < 0.45 ? S[3] : f < 0.8 ? S[2] : S[1];
      c.fillRect(x, 0, 1, hh);
    }
    c.fillStyle = S[1];
    for (let y = 10; y < hh; y += 10) c.fillRect(0, y, wh, 1);
    c.fillStyle = S[0]; c.fillRect(wh - 1, 0, 1, hh);
    // capital
    c.fillStyle = S[4]; c.fillRect(0, 2, wh, 2);
    c.fillStyle = S[1]; c.fillRect(0, 4, wh, 1);
    b._cv = cv;
    return cv;
  }
  const th = b.th * RES;
  const depth = [];
  for (let x = 0; x < wh; x++) {
    const edge = Math.min(x, wh - 1 - x);
    let d = th - Math.max(0, 12 - edge) * 1.5 + Math.floor(hash(b.idx, x >> 1) * 5);
    if (edge > 4 && hash(b.idx + 7, x >> 2) < 0.14) d += 4 + Math.floor(hash(x, b.idx) * 8); // stalactites
    depth.push(Math.max(5, Math.round(d)));
  }
  const hh = Math.max(...depth) + 14;
  const cv = mk(wh, hh), c = cv.getContext('2d');
  const brickRow = 5;
  for (let x = 0; x < wh; x++) {
    const d = depth[x];
    for (let y = 2; y < d; y++) {
      let col;
      if (y < 13) {
        // masonry band
        const row = Math.floor((y - 3) / brickRow);
        const ry = (y - 3) % brickRow;
        const bx = (x + (row % 2) * 5 + b.idx * 3) % 10;
        if (y === 2) col = S[2];
        else if (ry === brickRow - 1 || bx === 0) col = S[1];
        else if (ry === 0 || bx === 1) col = S[4];
        else col = (hash(x >> 1, y + b.idx) < 0.12) ? S[2] : S[3];
      } else {
        // raw rock, darkening downwards with checkered transitions
        const t = (y - 13) / Math.max(1, d - 13);
        const lvl = t < 0.35 ? 2 : t < 0.7 ? 1 : 0;
        const seam = (t > 0.33 && t < 0.37) || (t > 0.68 && t < 0.72);
        col = S[seam && (x + y) % 2 ? lvl + 1 : lvl];
        if (hash(x, y * 7 + b.idx) < 0.05) col = S[Math.min(4, lvl + 2)];
      }
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = PAL.outline;
    c.fillRect(x, d, 1, 1);
  }
  // edge lighting: key light from the upper left, shade on the right
  for (let y = 2; y < depth[0]; y++) { c.fillStyle = S[5]; c.fillRect(0, y, 1, 1); }
  for (let y = 2; y < depth[wh - 1]; y++) { c.fillStyle = S[0]; c.fillRect(wh - 1, y, 1, 1); }
  // hanging roots
  for (let k = 0; k < wh / 14; k++) {
    const vx = 3 + Math.floor(hash(b.idx, k + 40) * (wh - 6));
    const len = 4 + Math.floor(hash(k, b.idx + 3) * 10);
    for (let j = 0; j < len; j++) {
      c.fillStyle = PAL.vine;
      c.fillRect(vx + (j % 4 === 3 ? 1 : 0), depth[vx] + j, 1, 1);
      if (j % 4 === 2) { c.fillStyle = mix(PAL.vine, '#9a7ec0', 0.5); c.fillRect(vx - 1, depth[vx] + j, 1, 1); }
    }
  }
  b._cv = cv;
  return cv;
}

function drawBlock(b, m, ox, oy) {
  const fy = b.fallY || 0;
  const mine = g.player.block === b && g.alive;
  const jx = mine && b.crumble !== undefined && b.crumble < 0.8 ? (Math.floor(tNow * 40) % 2) * 0.5 : 0;
  const x1 = snap(b.x1 - ox + jx), y = snap(b.y + fy - oy);
  const wl = b.x2 - b.x1;
  if (x1 + wl < -2 || x1 > W + 2 || y > H + 2) return;
  const body = islandBody(b);
  ctx.drawImage(body, x1, y, body.width / RES, body.height / RES);
  // Lit top: two hi-res rows per column, warm ramp by distance to the moth, dithered between levels.
  const lightAbove = m.y < b.y + fy;
  const cols = body.width;
  for (let x = 0; x < cols; x++) {
    const wx = b.x1 + x / RES;
    let l0 = PAL.stone[4], l1 = PAL.stone[3];
    if (lightAbove) {
      const lv = Math.max(0, 5.2 - Math.hypot(wx - m.x, b.y + fy - m.y) / 26);
      let li = Math.floor(lv);
      if (lv - li > 0.5 && x % 2) li++;
      li = Math.min(5, li);
      if (li > 0) { l0 = PAL.lit[li]; l1 = PAL.lit[Math.max(0, li - 2)]; }
    }
    ctx.fillStyle = l0; ctx.fillRect(x1 + x / RES, y, 0.5, 0.5);
    ctx.fillStyle = l1; ctx.fillRect(x1 + x / RES, y + 0.5, 0.5, 0.5);
  }
  // Pillar face turned to the moth catches light
  if (b.kind === 'pillar' && m.x < b.x1) {
    const lv = Math.max(0, 4 - Math.hypot(b.x1 - m.x, b.y - m.y) / 30);
    if (lv > 0.5) { ctx.fillStyle = PAL.lit[Math.min(4, Math.floor(lv))]; ctx.fillRect(x1, y + 1, 0.5, Math.min(60, H - y)); }
  }
  // Spikes: faceted crystal shards, the only cold colour in the world
  for (const sp of b.spikes || []) {
    const a = snap(sp.a - ox + jx), c = snap(sp.b - ox + jx);
    const pulse = 0.5 + 0.5 * Math.sin(tNow * 4 + b.idx);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    const gw = SPR.spikeGlow.width / RES;
    for (let gx = a; gx <= c; gx += 4) ctx.drawImage(SPR.spikeGlow, gx - gw / 2 + 1, y - gw / 2 - 1, gw, gw);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    let i = 0;
    for (let x = a; x < c + 0.5; x += 2, i++) {
      const hgt = (i % 2 ? 4 : 6) + Math.floor(hash(b.idx, i) * 2); // logical
      // left facet, right facet, edge highlight, tip
      for (let k = 0; k < hgt * RES; k++) {
        const yy = y - k / RES;
        const shrink = Math.floor((k / (hgt * RES)) * 2) / RES;
        ctx.fillStyle = PAL.spike[1]; ctx.fillRect(x + shrink, yy - 0.5, 0.5, 0.5);
        if (k < hgt * RES - 2) { ctx.fillStyle = PAL.spike[2]; ctx.fillRect(x + 0.5, yy - 0.5, 0.5, 0.5); }
        if (k < hgt * RES - 3) { ctx.fillStyle = PAL.spike[3]; ctx.fillRect(x + 1, yy - 0.5, 0.5, 0.5); }
        if (k > 1 && k < hgt * RES - 3) { ctx.fillStyle = PAL.spike[0]; ctx.fillRect(x + 1.5 - shrink, yy - 0.5, 0.5, 0.5); }
      }
      ctx.fillStyle = PAL.spike[4];
      ctx.fillRect(x + 0.5, y - hgt, 0.5, 0.5);
    }
  }
  // Cracks as the island gives way
  if (mine && b.crumble !== undefined && b.crumbleMax) {
    const r = 1 - b.crumble / b.crumbleMax;
    const n = Math.floor(r * r * 18);
    ctx.fillStyle = PAL.crack;
    for (let i = 0; i < n; i++) {
      let cx = x1 + Math.floor(hash(b.idx, i) * wl * RES) / RES;
      const len = 4 + Math.floor(hash(i, b.idx) * 8);
      for (let j = 0; j < len; j++) {
        cx += hash(i, j) < 0.3 ? -0.5 : hash(i, j) > 0.7 ? 0.5 : 0;
        ctx.fillRect(cx, y + j / RES, 0.5, 0.5);
      }
    }
    if (b.crumble < 0.8 && Math.random() < 0.35) particles.push({ x: b.x1 + Math.random() * wl, y: b.y + 4, vx: 0, vy: 10, g: 200, life: 0.5, max: 0.5, col: PAL.stone[3] });
  }
}

function dottedLine(x0, y0, x1, y1, col, every, phase = 0) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * RES);
  ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    if ((i + phase) % every) continue;
    const t = n ? i / n : 0;
    const x = snap(x0 + (x1 - x0) * t), y = snap(y0 + (y1 - y0) * t);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    ctx.fillRect(x, y, 0.5, 0.5);
  }
}

// The real cast shadow: rays from the moth through each point of the body, painted on the surfaces they hit.
function drawCastShadow(m, ox, oy) {
  const p = g.player;
  if (!g.alive || !g.shadow || g.shadow.kind === 'none') return;
  let prev = null;
  ctx.fillStyle = PAL.ink;
  for (let j = 0.6; j <= C.HEAD + 0.01; j += 0.5) {
    const s = C.castShadow(p.x, p.y - j + C.HEAD, m.x, m.y, g.blocks);
    if (s.kind !== 'land' && s.kind !== 'spike') { prev = null; continue; }
    const sx = snap(s.x - ox), sy = snap(s.y - oy);
    if (prev && prev.b === s.block) {
      const a = Math.min(prev.x, sx), c = Math.max(prev.x, sx);
      if (c - a < 200) ctx.fillRect(a, sy, c - a + 0.5, 1);
    } else ctx.fillRect(sx, sy, 0.5, 1);
    prev = { x: sx, b: s.block };
  }
}

function drawSprite(spr, x, feetY) {
  ctx.drawImage(spr, snap(x - HERO_AX), snap(feetY - HERO_AY), spr.width / RES, spr.height / RES);
}

function drawShade(ox, oy) {
  const s = g.shadow;
  if (!g.alive || !s || s.kind === 'none') return;
  const p = g.player;
  const hx = p.x - ox, hy = p.y - C.HEAD - oy;
  const tx = s.x - ox, ty = s.y - oy;
  const bad = s.kind !== 'land';
  dottedLine(hx, hy, tx, ty, bad ? PAL.danger : PAL.shadeEye, 4, Math.floor(tNow * 30) % 4);
  if (s.kind === 'void') {
    const ex = Math.max(4, Math.min(W - 8, tx)), ey = Math.min(H - 10, Math.max(6, ty));
    if (Math.floor(tNow * 8) % 2) drawText(ctx, 'X', ex - 2, ey - 3, PAL.danger, 2);
    return;
  }
  const dx = s.kind === 'wall' ? (s.x > p.x ? -HERO_AX - 1 : HERO_AX + 1) : 0;
  if (bad && Math.floor(tNow * 10) % 2) return;
  if (!bad) {
    // a faint violet aura (colour math) makes the shade read against dark stone
    ctx.globalCompositeOperation = 'lighter';
    const a = SPR.aura, aw = a.width / RES;
    ctx.drawImage(a, snap(tx - aw / 2), snap(ty - 6 - aw / 2), aw, aw);
    ctx.globalCompositeOperation = 'source-over';
  }
  drawSprite(bad ? SPR.shadeBad : SPR.shade, tx + dx, ty);
}

function drawHero(ox, oy) {
  const p = g.player;
  for (const a of afterimages) {
    ctx.globalAlpha = 1 - a.t / 0.25;
    drawSprite(SPR.shade, a.x - ox, a.y - oy);
  }
  ctx.globalAlpha = 1;
  if (deathAnim) {
    const d = deathAnim;
    if (d.cause === 'void') {
      // Dissolve into ink, row by row from the feet up.
      if (d.t < 0.5) {
        const rows = Math.max(0, SPR.shade.height - Math.floor(d.t * 60));
        ctx.drawImage(SPR.shade, 0, 0, SPR.shade.width, rows, snap(d.x - ox - HERO_AX), snap(d.y - oy - HERO_AY), SPR.shade.width / RES, rows / RES);
      }
      return;
    }
    if (d.cause === 'spike' && Math.floor(d.t * 12) % 2) return;
    drawSprite(d.cause === 'spike' ? SPR.heroT : SPR.heroA, d.x - ox, d.y - oy);
    return;
  }
  let spr, wob = 0;
  if (p.walking) spr = Math.floor(tNow * 7) % 2 ? SPR.heroA : SPR.heroB;
  else { spr = SPR.heroT; wob = Math.sin(tNow * 9) > 0.5 ? 0.5 : 0; }
  drawSprite(spr, p.x - ox + wob, p.y - oy);
}

function drawMoth(m, ox, oy) {
  const mx = m.x - ox, my = m.y - oy;
  const warn = g.moth.flash > 0 && Math.floor(tNow * 16) % 2;
  ctx.globalCompositeOperation = 'lighter';
  const gl = warn ? SPR.glowWhite : SPR.glow;
  const flicker = 1 + Math.sin(tNow * 13) * 0.03;
  const gw = (gl.width / RES) * flicker;
  ctx.drawImage(gl, snap(mx - gw / 2), snap(my - gw / 2), gw, gw);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < mothTrail.length - 1; i++) {
    const t = mothTrail[i];
    ctx.globalAlpha = (i + 1) / mothTrail.length;
    ctx.fillStyle = PAL.glow;
    ctx.fillRect(snap(t.x - ox), snap(t.y - oy), 0.5, 0.5);
  }
  ctx.globalAlpha = 1;
  const fr = Math.floor(tNow * 14) % 2;
  const spr = warn ? (fr ? SPR.mothFlashA : SPR.mothFlashB) : fr ? SPR.mothA : SPR.mothB;
  ctx.drawImage(spr, snap(mx - spr.width / (2 * RES)), snap(my - spr.height / (2 * RES)), spr.width / RES, spr.height / RES);
}

function veil(alpha, y0 = 0, y1 = H) {
  // Translucent darkening (colour math), not dithering.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.globalAlpha = 1;
}

function drawMuteIcon() {
  const x = W - 16, y = 6;
  ctx.fillStyle = PAL.uiDim;
  ctx.fillRect(x, y + 3, 2, 4);
  ctx.fillRect(x + 2, y + 2, 1, 6);
  ctx.fillRect(x + 3, y + 1, 1, 8);
  if (A.isMuted()) {
    ctx.fillStyle = PAL.danger;
    for (let i = 0; i < 9; i++) { ctx.fillRect(x + 5 + i * 0.5, y + 3 + i * 0.5, 0.5, 0.5); ctx.fillRect(x + 9 - i * 0.5, y + 3 + i * 0.5, 0.5, 0.5); }
  } else {
    ctx.fillRect(x + 5, y + 3, 0.5, 4);
    ctx.fillRect(x + 7, y + 2, 0.5, 6);
    ctx.fillRect(x + 9, y + 1, 0.5, 8);
  }
}

// ---------------------------------------------------------------------------
// How to play
const HOWTO = [
  { art: 'moth', text: 'A MOTH CIRCLES YOU AND CASTS YOUR SHADOW.' },
  { art: 'jump', text: 'TAP TO JUMP TO THE TIP OF YOUR SHADOW.' },
  { art: 'safe', text: 'BLACK SHADOW: SAFE. RED SHADOW: VOID, WALL OR CRYSTALS.' },
  { art: 'crumble', text: "ISLANDS CRUMBLE, SO DON'T WAIT TOO LONG." },
];
const HOWTO_TIPS = [
  'A LOW MOTH MAKES A LONG, FAST SHADOW.',
  'SKIP ISLANDS OR LAND NEAR AN EDGE FOR BONUS POINTS.',
];

function wrapText(str, maxW, scale = 2) {
  const lines = [];
  let line = '';
  for (const w of str.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && textWidth(t, scale) > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawButton(label, cx, y) {
  const w = textWidth(label, 2) + 14, x = snap(cx - w / 2);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = PAL.ink; ctx.fillRect(x, y, w, 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAL.uiDim;
  ctx.fillRect(x, y, w, 0.5); ctx.fillRect(x, y + 15.5, w, 0.5); ctx.fillRect(x, y, 0.5, 16); ctx.fillRect(x + w - 0.5, y, 0.5, 16);
  ctx.fillStyle = PAL.shadeRim; ctx.fillRect(x + 0.5, y + 0.5, w - 1, 0.5);
  drawText(ctx, label, cx, y + 5, PAL.ui, 2, 'center');
}

function miniIsland(x, y, w, crack = false) {
  const S = PAL.stone;
  ctx.fillStyle = S[3]; ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = S[2]; ctx.fillRect(x + 0.5, y + 3, w - 1, 2);
  ctx.fillStyle = S[1]; ctx.fillRect(x + 1.5, y + 5, w - 3, 1.5);
  ctx.fillStyle = S[1]; for (let i = 3; i < w; i += 5) ctx.fillRect(x + i, y + 1, 0.5, 2);
  ctx.fillStyle = PAL.lit[4]; ctx.fillRect(x, y, w, 0.5);
  ctx.fillStyle = PAL.lit[2]; ctx.fillRect(x, y + 0.5, w, 0.5);
  if (crack) { ctx.fillStyle = PAL.crack; for (let i = 0; i < 5; i++) { ctx.fillRect(x + 3 + i * 4, y + (i % 2) * 0.5, 0.5, 2.5); ctx.fillRect(x + 3.5 + i * 4, y + 2.5, 0.5, 2); } }
}

function drawHowtoArt(art, x, y) {
  // Each illustration lives in a 40x40 box at (x, y).
  const base = y + 32;
  if (art === 'moth') {
    miniIsland(x + 4, base, 32);
    drawSprite(SPR.heroA, x + 20, base);
    const a = tNow * 2.4;
    const mx = x + 20 + Math.cos(a) * 14, my = base - 14 + Math.sin(a) * 12;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(SPR.glow, snap(mx - 24), snap(my - 24), 48, 48);
    ctx.globalCompositeOperation = 'source-over';
    const sp = Math.floor(tNow * 14) % 2 ? SPR.mothA : SPR.mothB;
    ctx.drawImage(sp, snap(mx - 4), snap(my - 2.5), sp.width / RES, sp.height / RES);
  } else if (art === 'jump') {
    miniIsland(x, base - 6, 14);
    miniIsland(x + 24, base, 16);
    const jumped = tNow % 2 > 1.4;
    drawSprite(jumped ? SPR.shade : SPR.heroT, x + 7, base - 6);
    dottedLine(x + 7, base - 17, x + 32, base, PAL.shadeEye, 3, Math.floor(tNow * 20) % 3);
    drawSprite(jumped ? SPR.heroA : SPR.shade, x + 32, base);
  } else if (art === 'safe') {
    miniIsland(x, base, 16);
    drawSprite(SPR.shade, x + 8, base);
    for (let i = 0; i < 4; i++) {
      const h = i % 2 ? 4 : 6;
      ctx.fillStyle = PAL.spike[1]; ctx.fillRect(x + 27 + i * 2, base - h, 0.5, h);
      ctx.fillStyle = PAL.spike[3]; ctx.fillRect(x + 27.5 + i * 2, base - h + 1, 0.5, h - 1);
      ctx.fillStyle = PAL.spike[4]; ctx.fillRect(x + 27.5 + i * 2, base - h, 0.5, 0.5);
    }
    miniIsland(x + 24, base, 16);
    if (Math.floor(tNow * 6) % 2) drawSprite(SPR.shadeBad, x + 31, base);
  } else if (art === 'crumble') {
    const shake = (Math.floor(tNow * 30) % 2) * 0.5;
    miniIsland(x + 6 + shake, base, 28, true);
    drawSprite(SPR.heroT, x + 20 + shake, base);
    ctx.fillStyle = PAL.stone[3];
    for (let i = 0; i < 5; i++) {
      const t = (tNow * 0.9 + i * 0.2) % 1;
      ctx.fillRect(x + 9 + i * 5, snap(base + 8 + t * 10), 0.5, 0.5);
    }
  }
}

function drawHowtoBackground() {
  ctx.fillStyle = '#0c0718';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(sky(2), 0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawHowto() {
  drawText(ctx, 'HOW TO PLAY', W / 2, 9, PAL.gold, 3, 'center');
  let y = 30;
  HOWTO.forEach((step, i) => {
    drawHowtoArt(step.art, 4, y);
    const lines = wrapText(step.text, 116);
    const ty = y + 22 - lines.length * 4.5;
    drawText(ctx, i + 1 + '.', 48, ty, PAL.gold, 2);
    lines.forEach((l, k) => drawText(ctx, l, 60, ty + k * 9, PAL.ui, 2));
    y += 50;
  });
  ctx.fillStyle = PAL.shadeRim;
  ctx.fillRect(10, y + 1, W - 20, 0.5);
  y += 7;
  drawText(ctx, 'TIPS', 10, y, PAL.gold, 2);
  y += 11;
  for (const tip of HOWTO_TIPS) {
    for (const l of wrapText(tip, W - 20)) { drawText(ctx, l, 10, y, PAL.uiDim, 2); y += 9; }
    y += 3;
  }
  if (howtoT > 0.4 && Math.floor(tNow * 2.2) % 2) drawText(ctx, howtoThen === 'play' ? 'TAP TO PLAY' : 'TAP TO GO BACK', W / 2, 306, PAL.ui, 2, 'center');
}

// ---------------------------------------------------------------------------
// Render
function render() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  const phase = g.phase;
  const P = PHASE_PAL[phase];
  const sxk = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const syk = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const ox = snap(cam.x + sxk), oy = snap(cam.y + syk);

  ctx.drawImage(sky(phase), 0, 0, W, H);
  for (const s of STARS) {
    const tw = Math.sin(tNow * 1.7 + s.tw);
    if (tw < -0.6) continue;
    const x = snap(((s.x - cam.x * 0.03) % W + W) % W), y = snap(s.y - cam.y * 0.02);
    ctx.fillStyle = tw > 0.6 ? PAL.star : PAL.starDim;
    ctx.fillRect(x, y, 0.5, 0.5);
    if (s.size >= 1 && tw > 0.3) ctx.fillRect(x, y, 1, 1);
    if (s.size === 2 && tw > 0.75) { ctx.fillRect(x - 1, y + 0.25, 2.5, 0.5); ctx.fillRect(x + 0.25, y - 1, 0.5, 2.5); }
  }
  // Clouds (translucent), drifting
  ctx.globalAlpha = 0.32;
  const cl = clouds(phase), clw = cl.width / RES;
  const coff = -((((cam.x * 0.05 + tNow * 2) % clw) + clw) % clw);
  for (let k = 0; k < 2; k++) ctx.drawImage(cl, snap(coff + k * clw), snap(30 - cam.y * 0.02), clw, cl.height / RES);
  ctx.globalAlpha = 1;
  // Parallax layers
  const dy = (H - 320) * 0.6;
  let yb = drawLayer(layer(phase, 'far'), 0.08, 150 + dy);
  if (yb < H) { ctx.fillStyle = mix(P.sky[2], P.mid, 0.55); ctx.fillRect(0, yb, W, H - yb); }
  yb = drawLayer(layer(phase, 'mid'), 0.18, 170 + dy);
  if (yb < H) { ctx.fillStyle = P.mid; ctx.fillRect(0, yb, W, H - yb); }
  // Mist over the abyss: translucent wavy ribbons
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = 0.12 + k * 0.05;
    ctx.fillStyle = P.mist;
    const base = H - 70 + k * 22;
    for (let x = 0; x < W; x += 0.5) {
      const top = base + Math.sin((x + cam.x * (0.2 + k * 0.1)) * 0.06 + tNow * (0.5 + k * 0.3)) * 4;
      ctx.fillRect(x, snap(top), 0.5, H - top);
    }
  }
  ctx.globalAlpha = 1;

  // Near ruins stay behind the islands so they never hide the path.
  drawLayer(layer(phase, 'near'), 0.45, 262 + dy);

  const m = C.mothWorld(g);
  for (const b of g.blocks) drawBlock(b, m, ox, oy);
  drawCastShadow(m, ox, oy);
  drawShade(ox, oy);
  if (deathRay && !g.alive) {
    const r = deathRay;
    const hx = r.from.x - ox, hy = r.from.y - C.HEAD - oy;
    const tx = r.to.x - ox, ty = r.to.y - oy;
    dottedLine(hx, hy, tx, ty, PAL.danger, 3, Math.floor(tNow * 20) % 3);
    if (r.kind === 'wall' || r.kind === 'spike') drawSprite(SPR.shadeBad, tx + (r.kind === 'wall' ? -HERO_AX - 1 : 0), ty);
  }
  drawHero(ox, oy);
  drawMoth(m, ox, oy);

  for (const r of rings) {
    const rad = 2 + r.t * 40;
    ctx.globalAlpha = 1 - r.t / 0.25;
    ctx.fillStyle = PAL.shadeEye;
    for (let a = 0; a < 28; a++) {
      const an = (a / 28) * Math.PI * 2;
      ctx.fillRect(snap(r.x - ox + Math.cos(an) * rad), snap(r.y - oy + Math.sin(an) * rad * 0.7), 0.5, 0.5);
    }
  }
  ctx.globalAlpha = 1;
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
    ctx.fillStyle = p.col;
    const sz = p.size || 0.5;
    ctx.fillRect(snap(p.x - ox), snap(p.y - oy), sz, sz);
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    if (p.t > 0.8 && Math.floor(p.t * 20) % 2) continue;
    drawText(ctx, p.text, p.x - ox, p.y - oy - p.t * 14, p.col, 2, 'center');
  }

  if (flash > 0) {
    ctx.globalAlpha = Math.min(0.45, flash * 2.5);
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // UI
  if ((state === 'play' || state === 'paused') && !window.__noHud) { // __noHud: clean frames for trailers
    drawText(ctx, g.score, W / 2, 8, PAL.ui, 5, 'center');
    if (store.best > 0) drawText(ctx, 'BEST ' + store.best, 5, 5, PAL.uiDim, 2);
    if (!g.started && store.runs <= 3) {
      const hy = 248 + (H - 320) * 0.6;
      veil(0.45, hy - 4, hy + 26);
      drawText(ctx, 'TAP WHEN YOUR SHADOW', W / 2, hy, PAL.ui, 2, 'center');
      drawText(ctx, 'FALLS ON THE NEXT ISLAND', W / 2, hy + 11, PAL.ui, 2, 'center');
    }
    if (banner) {
      const t = banner.t;
      if (!(t > 1.8 && Math.floor(t * 20) % 2)) {
        drawText(ctx, 'THE NIGHT DEEPENS', W / 2, 52, PAL.uiDim, 2, 'center');
        drawText(ctx, banner.text, W / 2, 64, P.accent, 3, 'center');
      }
    }
  }
  if (state === 'paused') veil(0.6);
  if (state === 'howto') drawHowtoBackground();
  ctx.translate(0, UY);
  if (state === 'paused') {
    drawText(ctx, 'PAUSED', W / 2, 136, PAL.ui, 5, 'center');
    drawText(ctx, 'TAP TO CONTINUE', W / 2, 168, PAL.uiDim, 2, 'center');
  }
  if (state === 'title') {
    veil(0.55, 28, 116);
    ctx.fillStyle = P.accent;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 28, W, 0.5); ctx.fillRect(0, 115.5, W, 0.5);
    ctx.globalAlpha = 1;
    drawText(ctx, 'LONG', W / 2, 36, '#ffe9b0', 7, 'center', PAL.shadeRim);
    drawText(ctx, 'SHADE', W / 2, 66, PAL.gold, 7, 'center', PAL.shadeRim);
    drawText(ctx, 'TAP TO BECOME YOUR SHADOW', W / 2, 100, PAL.uiDim, 2, 'center');
    drawButton('HOW TO PLAY', W / 2, 220);
    if (Math.floor(tNow * 2.2) % 2) drawText(ctx, 'TAP ANYWHERE TO START', W / 2, 274, PAL.ui, 2, 'center');
    if (store.best > 0) drawText(ctx, 'BEST ' + store.best + ' - ' + C.PHASES[store.bestPhase].name, W / 2, 292, PAL.uiDim, 2, 'center');
  }
  if (state === 'howto') drawHowto();
  if (state === 'dead') {
    veil(Math.min(0.75, deadT * 3), 54, 180);
    const [title, hint] = DEATH_TEXT[g.deathCause] || ['GAME OVER', ''];
    if (deadT > 0.15) {
      drawText(ctx, title, W / 2, 64, PAL.danger, 3, 'center');
      drawText(ctx, hint, W / 2, 84, PAL.uiDim, 2, 'center');
      drawText(ctx, g.score, W / 2, 104, PAL.ui, 8, 'center');
      drawText(ctx, 'ISLANDS ' + g.progress + '  ' + C.PHASES[g.phase].name, W / 2, 148, PAL.uiDim, 2, 'center');
      if (newRecord) { if (Math.floor(tNow * 5) % 2) drawText(ctx, 'NEW BEST!', W / 2, 162, PAL.gold, 2, 'center'); }
      else drawText(ctx, 'BEST ' + store.best, W / 2, 162, PAL.uiDim, 2, 'center');
    }
    if (deadT > 0.45 && Math.floor(tNow * 2.2) % 2) drawText(ctx, 'TAP TO TRY AGAIN', W / 2, 274, PAL.ui, 2, 'center');
  }
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  if (state === 'title' || state === 'dead') drawMuteIcon();
  if (state === 'title' && privacyOptionsRequired()) drawText(ctx, 'PRIVACY', 5, 7, PAL.uiDim, 2);
}

// ---------------------------------------------------------------------------
// Layout: integer scaling of the hi-res canvas when it fits well, otherwise fill
function layout() {
  // Measure the space actually available to the canvas (its parent's content box).
  const host = canvas.parentElement, cs = getComputedStyle(host);
  const iw = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || window.innerWidth;
  const ih = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) || window.innerHeight;
  // Taller screens get more sky and abyss instead of black bars.
  H = Math.max(C.VIEW_H, Math.min(400, Math.round(((W * ih) / iw) * 2) / 2));
  UY = snap((H - C.VIEW_H) / 2);
  if (canvas.height !== H * RES) {
    canvas.height = H * RES;
    ctx.imageSmoothingEnabled = false;
  }
  const cw = W * RES, ch = H * RES;
  let s = Math.min(iw / cw, ih / ch);
  if (s >= 1 && Math.floor(s) / s > 0.94) s = Math.floor(s);
  canvas.style.width = Math.floor(cw * s) + 'px';
  canvas.style.height = Math.floor(ch * s) + 'px';
}
window.addEventListener('resize', layout);
layout();

// ---------------------------------------------------------------------------
// Native shell: Android back button and app pause
initNative({
  onBack: () => {
    if (state === 'play') { state = 'paused'; A.suspend(); }
    else if (state === 'howto' || state === 'dead' || state === 'paused') { state = 'title'; A.resume(); }
    else exitApp();
  },
  onPause: () => { if (state === 'play' && !AUTOPLAY) state = 'paused'; },
});

initAds();

// ---------------------------------------------------------------------------
// Main loop
newGame(true);
if (AUTOPLAY) { state = 'play'; demo = false; }
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug hook for automated screenshots
// settle(): snap the camera (used by tools/store-art.mjs for screenshots).
window.__ombra = {
  isNative,
  settle() { const a = g.player; cam.x = a.x - 52; cam.y = a.y - camY(); popups = []; particles = []; }, get g() { return g; }, get state() { return state; }, press, startRun };
