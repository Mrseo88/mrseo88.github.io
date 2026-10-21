/* LATCH — a one-tap arcade game. Shared engine: rules, physics, input, audio, loop.
 * You orbit a node. Tap to let go (you fly straight along the tangent).
 * Tap again to latch onto the nearest node: your new orbit radius is your distance
 * at that exact moment. Closer = more points, but tighter orbits spin faster.
 * A node burns out shortly after you latch: don't stay too long.
 *
 * Visuals live in theme-*.js files, which register a factory in window.LATCH_THEMES.
 * Each HTML page sets window.LATCH_THEME and loads its theme before this file.
 */
(() => {
'use strict';

const VERSIONS = [
  { id: 'pixel', label: '16-BIT', href: 'index.html' },
  { id: 'neon', label: 'NEON', href: 'neon.html' },
  { id: 'light', label: 'LIGHT', href: 'light.html' },
];
const THEME_NAME = window.LATCH_THEME || 'pixel';

// ---------- Gameplay constants (world units: field width = 400) ----------
const W = 400;
const STEP = 1 / 120;          // fixed-step physics: identical on every frame rate
const PLAYER_R = 6;
const CORE_R = 11;
const RED_R = 13;
const LATCH_RANGE = 135;
const PERFECT_GAP = 18;        // gap between core and player that counts as PERFECT
const GOOD_GAP = 40;
const MIN_ORBIT = CORE_R + PLAYER_R + 1;
const MAX_COMBO = 7;
const MAX_SPIN = 7.5;          // rad/s: tight orbits spin fast, but stay aimable
const NEAR_MISS = 12;

const TEXT = {
  title: 'LATCH',
  tagline: 'one tap to let go  ·  one tap to latch',
  lines: [
    ['gold', 'TAP', 'let go and fly straight'],
    ['white', 'TAP', 'latch onto the nearest node'],
    ['cyan', 'HUG', 'the core: PERFECT + combo'],
    ['red', 'HURRY', 'nodes burn out under you'],
  ],
  start: 'TAP TO START', retry: 'TAP TO RETRY', hint: 'TAP when you\'re aiming at a node',
  paused: 'PAUSED', resume: 'tap to resume', newBest: 'NEW BEST',
};

// Game events for optional native glue (haptics): window 'latch:event' with detail {type, grade}
const emit = (type, extra) => { try { window.dispatchEvent(new CustomEvent('latch:event', { detail: { type, ...extra } })); } catch (e) { /* old browsers */ } };

// ---------- Utilities ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TAU = Math.PI * 2;
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
};

// ---------- Audio (synthesized, no assets) ----------
const Audio = {
  ctx: null, master: null, chip: false, muted: store.get('latch.muted', store.get('nodo.muted', '0')) === '1',
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  toggle() {
    this.muted = !this.muted;
    store.set('latch.muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },
  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    if (this.chip) { if (type === 'sine' || type === 'triangle') type = 'square'; vol *= 0.4; }
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.4, freq = 900) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  },
  // pentatonic scale: each combo step climbs one degree
  note(i) { const s = [0, 2, 4, 7, 9]; return 330 * Math.pow(2, (s[i % 5] + 12 * Math.floor(i / 5)) / 12); },
  release() { this.tone(520, 0.07, 'triangle', 0.12, -260); this.noise(0.12, 0.08, 3000); },
  latch(grade, combo) {
    if (grade === 'perfect') {
      const f = this.note(combo + 2);
      this.tone(f, 0.25, 'sine', 0.32);
      this.tone(f * 1.5, 0.35, 'sine', 0.14, 0, 0.05);
      this.tone(f * 2, 0.4, 'triangle', 0.06, 0, 0.1);
    } else if (grade === 'good') this.tone(this.note(1), 0.14, 'triangle', 0.22);
    else this.tone(196, 0.12, 'triangle', 0.2);
  },
  miss() { this.tone(140, 0.08, 'square', 0.06); },
  warn() { this.tone(880, 0.05, 'square', 0.05); },
  close() { this.tone(1320, 0.08, 'sine', 0.12, 400); },
  collapse() { this.tone(300, 0.2, 'sine', 0.06, -220); },
  death() {
    this.tone(140, 0.45, 'sine', 0.45, -100);          // soft low thump
    this.noise(0.15, 0.1, 2200);                         // short, light crack
    [659, 494, 392].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, 0, 0.12 + i * 0.11)); // gentle falling notes
  },
  record() { [0, 4, 7, 12].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), 0.35, 'sine', 0.18, 0, 0.35 + i * 0.09)); },
};

// ---------- Canvas and scale ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr = 1, cw = 0, ch = 0, scale = 1, offX = 0, viewH = 700;
// Safe-area insets (notch, status/navigation bars), in CSS px.
// Browsers report them through env(); Capacitor on Android also injects --safe-area-inset-* variables.
let safeTop = 0, safeBottom = 0, nativeTop = 0, nativeBottom = 0;
const insetProbe = document.createElement('div');
insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding-top:max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px));' +
  'padding-bottom:max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px));';
document.body.appendChild(insetProbe);
function readInsets() {
  const cs = getComputedStyle(insetProbe);
  safeTop = Math.max(parseFloat(cs.paddingTop) || 0, nativeTop);
  safeBottom = Math.max(parseFloat(cs.paddingBottom) || 0, nativeBottom);
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth; ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  const gw = Math.min(cw, ch * 0.62);   // tall playfield, even on desktop
  scale = gw / W;
  offX = (cw - gw) / 2;
  viewH = ch / scale;
  readInsets();
  if (theme && theme.resize) theme.resize();
}

// ---------- UI layout shared by every theme ----------
const U = () => Math.min(cw, ch * 0.62) / 400;   // UI unit
function pauseBtnRect() { const u = U(), s = 36 * u; return { x: offX + W * scale - s - 14 * u, y: 14 * u + safeTop, w: s, h: s }; }
function muteBtnRect() { const r = pauseBtnRect(); return { x: r.x - r.w - 10 * U(), y: r.y, w: r.w, h: r.h }; }
function versionBtns() {
  const u = U(), w = 68 * u, h = 26 * u, gap = 6 * u, y = 19 * u + safeTop;
  return VERSIONS.map((v, i) => ({ ...v, active: v.id === THEME_NAME, x: offX + 14 * u + i * (w + gap), y, w, h }));
}

// ---------- State ----------
let g = null;
let best = parseInt(store.get('latch.best', store.get('nodo.best', '0')), 10) || 0;
let state = 'title';      // title | play | paused | dead
let deadTimer = 0;
let realT = 0;
let PAL = null, COMBO = null;
const comboCol = c => COMBO[Math.min(c, COMBO.length - 1)];

function speedFor(n) { return 250 + Math.min(n, 60) * 3.4; }           // 250 → 454
function fuseFor(n) { return Math.max(1.45, 3.4 - n * 0.035); }        // 3.4s → 1.45s

function newGame() {
  g = {
    t: 0, score: 0, combo: 0, latches: 0, lastIdx: 0, perfects: 0, maxCombo: 0,
    nodes: [], nextIdx: 1, genY: 0, genX: W / 2,
    camY: -viewH * 0.58, shake: 0, flash: 0, flashCol: PAL.cyan, zoom: 0,
    hitstop: 0, zoneF: 0, scorePop: 0,
    particles: [], popups: [], trail: [],
    newRecord: false, cause: '',
    p: { x: 0, y: 0, vx: 0, vy: 0 },
    anchor: null, r: 52, ang: Math.PI * 0.9, dir: 1,
    warned: false, started: false,
  };
  const first = makeNode(W / 2, 0, 0, 'node');
  first.fuse = first.fuseMax = 99; // the first node doesn't burn until you leave it
  g.nodes.push(first);
  g.anchor = first; first.active = true;
  placeOnOrbit();
  generate();
}

function makeNode(x, y, idx, type) {
  return { x, y, baseX: x, idx, type, used: false, active: false, collapse: 0,
    fuse: 0, fuseMax: 0, amp: 0, per: 1, ph: rand(0, TAU), pulse: 0, dead: false, grazed: false, spin: rand(0, TAU) };
}

// Procedural generation: every node can be reached in a straight line from the previous one.
function generate() {
  const top = g.camY - viewH * 0.6;
  while (g.genY > top) {
    const i = g.nextIdx++;
    const d = Math.min(i, 50);
    const gap = 150 + d * 1.5 + rand(-22, 22);
    const prevX = g.genX, prevY = g.genY;
    const y = prevY - gap;
    let x;
    do { x = rand(60, W - 60); } while (Math.abs(x - prevX) < 50 && Math.random() < 0.8);
    const n = makeNode(x, y, i, 'node');
    if (i >= 18 && Math.random() < Math.min(0.55, 0.25 + (i - 18) * 0.01)) {
      const maxAmp = Math.min(x - 50, W - 50 - x, 75);
      if (maxAmp > 20) { n.amp = rand(20, maxAmp); n.per = rand(1.8, 3.2); }
    }
    g.nodes.push(n);
    // Red spikes: can't latch, deadly. Placed between nodes, never on top of them.
    if (i >= 8 && Math.random() < Math.min(0.6, 0.3 + (i - 8) * 0.01)) {
      for (let k = 0; k < 6; k++) {
        const t = rand(0.35, 0.65);
        const rx = clamp(lerp(prevX, x, t) + rand(-90, 90), 28, W - 28);
        const ry = lerp(prevY, y, t) + rand(-15, 15);
        if (dist(rx, ry, prevX, prevY) > 70 && dist(rx, ry, x, y) > 70) {
          g.nodes.push(makeNode(rx, ry, -1, 'red'));
          break;
        }
      }
    }
    g.genX = x; g.genY = y;
  }
}

function placeOnOrbit() {
  const a = g.anchor, p = g.p, v = speedFor(g.latches);
  p.x = a.x + Math.cos(g.ang) * g.r;
  p.y = a.y + Math.sin(g.ang) * g.r;
  p.vx = -Math.sin(g.ang) * v * g.dir;
  p.vy = Math.cos(g.ang) * v * g.dir;
}

// The node you'd latch onto RIGHT NOW (always shown on screen: no hidden information)
function findTarget() {
  const p = g.p; let bestN = null, bd = LATCH_RANGE;
  for (const n of g.nodes) {
    if (n.type !== 'node' || n.used || n === g.anchor) continue;
    const d = dist(p.x, p.y, n.x, n.y);
    if (d <= bd) { bd = d; bestN = n; }
  }
  return bestN;
}

function gradeFor(r) {
  const gap = r - MIN_ORBIT;
  return gap <= PERFECT_GAP ? 'perfect' : gap <= GOOD_GAP ? 'good' : 'far';
}

// ---------- The one action ----------
function action() {
  if (g.anchor) {
    // let go: the node you leave collapses
    const a = g.anchor;
    a.used = true; a.active = false; a.collapse = 1;
    g.anchor = null;
    g.started = true;
    g.warned = false;
    Audio.release(); Audio.collapse();
    emit('release');
    sparks(g.p.x, g.p.y, 10, comboCol(g.combo), 160, 0.3, Math.atan2(g.p.vy, g.p.vx) + Math.PI, 0.8);
    implode(a.x, a.y);
    return;
  }
  const n = findTarget();
  if (!n) {
    // tapped on empty space: combo lost
    if (g.combo > 0) popup(g.p.x, g.p.y - 18, 'combo lost', PAL.red, 0.8, 12);
    g.combo = 0;
    Audio.miss();
    return;
  }
  const p = g.p;
  const r = dist(p.x, p.y, n.x, n.y);
  const rx = p.x - n.x, ry = p.y - n.y;
  g.anchor = n;
  g.r = r;
  g.ang = Math.atan2(ry, rx);
  g.dir = (rx * p.vy - ry * p.vx) >= 0 ? 1 : -1;
  n.active = true;
  n.fuse = n.fuseMax = fuseFor(g.latches);
  n.pulse = 1;
  g.latches++;

  const grade = gradeFor(r);
  const skip = Math.max(1, n.idx - g.lastIdx);  // skipping nodes is worth more
  g.lastIdx = Math.max(g.lastIdx, n.idx);
  if (grade === 'perfect') { g.combo = Math.min(MAX_COMBO, g.combo + 1); g.perfects++; }
  else if (grade === 'far') g.combo = 0;
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  const pts = skip * (1 + g.combo);
  g.score += pts;
  g.scorePop = 1;

  let label = grade === 'perfect' ? 'PERFECT' : grade === 'good' ? 'NICE' : '';
  if (skip > 1) label = (label ? label + ' · ' : '') + 'SKIP ×' + skip;
  const col = grade === 'perfect' ? comboCol(g.combo) : grade === 'good' ? PAL.white : PAL.dim;
  popup(n.x, n.y - CORE_R - 30, '+' + pts, col, 1, grade === 'perfect' ? 22 : 16);
  if (label) popup(n.x, n.y - CORE_R - 52, label, col, 1, grade === 'perfect' ? 13 : 11);

  if (grade === 'perfect') {
    g.hitstop = 0.06; g.flash = 0.3; g.flashCol = comboCol(g.combo); g.shake = 5; g.zoom = 0.05;
    sparks(p.x, p.y, 26, comboCol(g.combo), 320, 0.55);
    sparks(p.x, p.y, 10, PAL.white, 200, 0.35);
    shock(n.x, n.y, comboCol(g.combo), 90, 0.5);
    shock(n.x, n.y, PAL.white, 50, 0.3);
  } else {
    sparks(p.x, p.y, 12, PAL.gold, 180, 0.4);
    shock(n.x, n.y, PAL.node, 45, 0.35);
    g.shake = 2; g.zoom = 0.015;
  }
  Audio.latch(grade, g.combo);
  emit('latch', { grade, combo: g.combo });
  placeOnOrbit();
}

function die(cause) {
  if (state !== 'play') return;
  state = 'dead';
  deadTimer = 0;
  g.cause = cause;
  g.shake = 16; g.flash = 0.7; g.flashCol = PAL.red; g.zoom = 0.08;
  const p = g.p;
  sparks(p.x, p.y, 50, PAL.gold, 420, 1.1);
  sparks(p.x, p.y, 30, PAL.red, 300, 0.9);
  sparks(p.x, p.y, 14, PAL.white, 520, 0.5);
  shock(p.x, p.y, PAL.red, 160, 0.8);
  shock(p.x, p.y, PAL.gold, 90, 0.5);
  if (g.anchor) { g.anchor.dead = true; g.anchor.active = false; }
  Audio.death();
  emit('death');
  if (g.score > best) {
    best = g.score; g.newRecord = true;
    store.set('latch.best', String(best));
    Audio.record();
    emit('record');
  }
}

// ---------- Fixed-step simulation ----------
function step(dt) {
  g.t += dt;
  for (const n of g.nodes) {
    if (n.amp) n.x = n.baseX + Math.sin(g.t * TAU / n.per + n.ph) * n.amp;
    n.spin += dt * (n.active ? 3 : 0.6);
  }

  if (state === 'play') {
    const v = speedFor(g.latches);
    const p = g.p;
    if (g.anchor) {
      const a = g.anchor;
      g.ang += g.dir * Math.min(v / g.r, MAX_SPIN) * dt;
      placeOnOrbit();
      if (a.fuse < 50) {
        a.fuse -= dt;
        // the fuse throws sparks from its burning end
        if (Math.random() < 0.6) {
          const fa = -Math.PI / 2 + clamp(a.fuse / a.fuseMax, 0, 1) * TAU, fr = CORE_R + 6;
          sparks(a.x + Math.cos(fa) * fr, a.y + Math.sin(fa) * fr, 1, a.fuse < 0.6 ? PAL.red : PAL.orange, 90, 0.35, fa, 1.2);
        }
        if (a.fuse < 0.6 && !g.warned) { g.warned = true; Audio.warn(); }
        if (a.fuse <= 0) { die('The node burned out under you'); return; }
      }
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.random() < 0.5) g.particles.push({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.4, max: 0.4, col: comboCol(g.combo), r: rand(0.6, 1.4), kind: 'dot' });
    }
    // collisions
    if (p.x < PLAYER_R || p.x > W - PLAYER_R) { die('You hit the wall'); return; }
    if (p.y > g.camY + viewH + PLAYER_R) { die('You fell off the screen'); return; }
    for (const n of g.nodes) {
      if (n === g.anchor || n.used) continue;
      const rr = (n.type === 'red' ? RED_R : CORE_R) + PLAYER_R;
      const d = dist(p.x, p.y, n.x, n.y);
      if (d < rr) { die(n.type === 'red' ? 'You hit a spike' : 'You hit a core'); return; }
      if (n.type === 'red' && !n.grazed && d < rr + NEAR_MISS) {
        n.grazed = true;
        popup(p.x, p.y - 20, 'CLOSE!', PAL.pink, 0.7, 13);
        sparks(p.x, p.y, 8, PAL.pink, 150, 0.3);
        Audio.close();
        emit('close');
      }
    }
    // camera: only goes up
    const focusY = g.anchor ? g.anchor.y : p.y;
    const target = focusY - viewH * 0.6;
    if (target < g.camY) g.camY = lerp(g.camY, target, 1 - Math.exp(-dt * 3.2));
    generate();
    const cut = g.camY + viewH + 150;
    if (g.nodes.length > 40) g.nodes = g.nodes.filter(n => n.y < cut || n === g.anchor);
  } else if (state === 'title') {
    g.ang += g.dir * 1.8 * dt;   // demo: slow orbit on the first node
    placeOnOrbit();
  }

  // trail
  if (state !== 'dead') {
    g.trail.push(g.p.x, g.p.y);
    if (g.trail.length > 52) g.trail.splice(0, 2);
  } else if (g.trail.length) g.trail.splice(0, 2);

  // particles, popups, timers
  for (const q of g.particles) {
    q.x += q.vx * dt; q.y += q.vy * dt;
    const drag = q.kind === 'confetti' ? 1.2 : 3;
    q.vx *= 1 - drag * dt; q.vy *= 1 - drag * dt;
    if (q.kind === 'confetti') q.vy += 160 * dt;
    q.life -= dt;
  }
  g.particles = g.particles.filter(q => q.life > 0);
  if (g.particles.length > 500) g.particles.splice(0, g.particles.length - 500);
  for (const q of g.popups) { q.y -= 30 * dt; q.life -= dt; }
  g.popups = g.popups.filter(q => q.life > 0);
  for (const n of g.nodes) {
    if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - dt * 2.2);
    if (n.collapse > 0) n.collapse = Math.max(0, n.collapse - dt * 2.2);
  }
  g.shake = Math.max(0, g.shake - dt * 30);
  g.flash = Math.max(0, g.flash - dt * 1.8);
  g.zoom = Math.max(0, g.zoom - dt * 0.35);
  g.scorePop = Math.max(0, g.scorePop - dt * 4);
  g.zoneF = lerp(g.zoneF, g.latches / 12, 1 - Math.exp(-dt * 1.5));
}

// ---------- Particle helpers (world space) ----------
function sparks(x, y, count, col, spd, life, dir, spread) {
  for (let i = 0; i < count; i++) {
    const a = dir === undefined ? Math.random() * TAU : dir + (Math.random() - 0.5) * spread;
    const s = spd * (0.3 + Math.random() * 0.7);
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.5), max: life, col, r: rand(0.8, 2), kind: 'spark' });
  }
}
function shock(x, y, col, size, life) { g.particles.push({ x, y, vx: 0, vy: 0, life, max: life, col, r: size, kind: 'ring' }); }
function implode(x, y) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, d = rand(20, 40);
    g.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.3, max: 0.3, col: PAL.node, r: rand(0.8, 1.6), kind: 'spark' });
  }
}
function popup(x, y, text, col, life, size) { g.popups.push({ x, y, text, col, life, max: life, size }); }
function confetti() {
  const wx = W / 2, wy = g.camY + (ch * 0.42) / scale;
  const cols = PAL.confetti;
  for (let i = 0; i < 70; i++) {
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), s = rand(150, 420);
    g.particles.push({ x: wx + rand(-40, 40), y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.2, 2.2), max: 2.2, col: cols[i % cols.length], r: rand(2, 4), kind: 'confetti', rot: rand(0, TAU) });
  }
}

// ---------- Input ----------
function inRect(x, y, r) { const m = 6; return x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m; }

function press(x, y) {
  Audio.init();
  if (x !== undefined) {
    if (state === 'title') {
      for (const b of versionBtns()) if (inRect(x, y, b)) { if (!b.active) window.location.href = b.href; return; }
    }
    if ((state === 'title' || state === 'paused') && inRect(x, y, muteBtnRect())) { Audio.toggle(); return; }
    if (state === 'play' && inRect(x, y, pauseBtnRect())) { pause(); return; }
  }
  if (state === 'title') { state = 'play'; return; }
  if (state === 'play') { action(); return; }
  if (state === 'paused') { resume(); return; }
  if (state === 'dead' && deadTimer > 0.45 && !holdRetry) restart();
}

// The Android app holds the retry while an interstitial ad is about to show (see ads.js).
let holdRetry = false;
function restart() { newGame(); state = 'play'; }
function pause() { if (state === 'play') state = 'paused'; }
function resume() { state = 'play'; last = performance.now(); }

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (e.button !== undefined && e.button > 0) return;
  press(e.clientX, e.clientY);
}, { passive: false });
// block scroll / zoom / context menu on mobile
['touchstart', 'touchmove', 'touchend', 'gesturestart', 'dblclick', 'contextmenu'].forEach(ev =>
  canvas.addEventListener(ev, e => e.preventDefault(), { passive: false }));

window.addEventListener('keydown', e => {
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault(); press();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'play') pause(); else if (state === 'paused') resume();
  } else if (e.code === 'KeyM') Audio.toggle();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', pause);

// ---------- Main loop ----------
let last = performance.now(), acc = 0, insetT = 0;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.1);           // no jump forward after a stall
  advance(dt);
  if (realT - insetT > 1) { insetT = realT; readInsets(); }   // insets can change after load (rotation, app bars)
  render();
  requestAnimationFrame(frame);
}

let confettiDone = false;
function advance(dt) {
  realT += dt;
  if (state === 'paused') return;
  if (state === 'dead') {
    deadTimer += dt;
    if (g.newRecord && !confettiDone && deadTimer > 0.4) { confettiDone = true; confetti(); }
    dt *= deadTimer < 0.6 ? 0.25 : 0.6;   // slow motion on the explosion
  } else confettiDone = false;
  if (g.hitstop > 0) { const h = Math.min(g.hitstop, dt); g.hitstop -= h; dt -= h; }
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 30) { step(STEP); acc -= STEP; n++; }
  if (n >= 30) acc = 0;
}

function render() { theme.render(); }

// ---------- Theme ----------
const api = {
  get g() { return g; }, get state() { return state; }, get deadTimer() { return deadTimer; },
  get realT() { return realT; }, get best() { return best; }, get muted() { return Audio.muted; },
  get cw() { return cw; }, get ch() { return ch; }, get dpr() { return dpr; },
  get scale() { return scale; }, get offX() { return offX; }, get viewH() { return viewH; },
  get safeTop() { return safeTop; }, get safeBottom() { return safeBottom; },
  ctx, canvas, TEXT, THEME_NAME,
  C: { W, PLAYER_R, CORE_R, RED_R, LATCH_RANGE, PERFECT_GAP, GOOD_GAP, MIN_ORBIT },
  findTarget, gradeFor, comboCol, U, pauseBtnRect, muteBtnRect, versionBtns,
  util: { clamp, lerp, mix, rand, dist, TAU, css },
};
const factories = window.LATCH_THEMES || {};
const theme = (factories[THEME_NAME] || factories.pixel || Object.values(factories)[0])(api);
PAL = theme.pal; COMBO = theme.combo;
if (theme.chipAudio) Audio.chip = true;
if (theme.sounds) Object.assign(Audio, theme.sounds);

window.addEventListener('resize', resize);
resize();
newGame();
requestAnimationFrame(frame);

// hook for automated tests
window.LATCH = {
  get g() { return g; }, get state() { return state; }, get best() { return best; },
  press, advance, render, findTarget, gradeFor, speedFor, fuseFor, restart, pause, resume,
  holdRetry(v) { holdRetry = !!v; },
  setInsets(top, bottom) { nativeTop = +top || 0; nativeBottom = +bottom || 0; readInsets(); },
  consts: { W, LATCH_RANGE, MIN_ORBIT, PERFECT_GAP, PLAYER_R, CORE_R, RED_R },
};
})();
