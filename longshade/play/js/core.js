// LONGSHADE — core logic (pure, no DOM). Shared by the game and by the Node tests.
//
// Rule of the game in one line: a moth-lantern orbits you; tapping teleports you
// to wherever the tip of your shadow is falling at that instant.

export const VIEW_W = 180;
export const VIEW_H = 320;
export const HEAD = 11;        // eye height above feet: the point the shadow ray passes through
export const ORBIT_R = 26;     // moth orbit radius
export const ORBIT_LIFT = 8;   // orbit centre sits this far above the head
export const Y0 = 200;         // baseline world height of the first island
const TAU = Math.PI * 2;

export const PHASES = [
  { at: 0, name: 'DUSK' },
  { at: 20, name: 'NIGHTFALL' },
  { at: 50, name: 'MIDNIGHT' },
  { at: 90, name: 'WITCHING HOUR' },
  { at: 150, name: 'ECLIPSE' },
];

export function phaseIndex(progress) {
  let i = 0;
  while (i + 1 < PHASES.length && progress >= PHASES[i + 1].at) i++;
  return i;
}

export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Difficulty as a function of progress n (index of the island being generated / stood on).
export function tuning(n) {
  const t = clamp(n / 140, 0, 1);
  const e = t * (2 - t);
  const omega = lerp(2.4, 4.4, e);
  const flutter = n >= 50 ? lerp(0.1, 0.2, clamp((n - 50) / 100, 0, 1)) : 0;
  const omegaMax = omega * (1 + flutter);
  return {
    omega,
    flutter,
    omegaMax,
    reverse: n >= 20,
    gapMin: lerp(5, 10, e),
    gapMax: lerp(20, 40, e),
    wMin: lerp(20, 12, e),
    wMax: lerp(44, 30, e),
    rise: lerp(2, 7, e),
    drop: lerp(24, 40, e),
    spikeP: n < 8 ? 0 : lerp(0.18, 0.5, e),
    pillarP: n < 12 ? 0 : lerp(0.14, 0.3, e),
    minWin: lerp(0.24, 0.085, e),
    walk: lerp(20, 30, e),
    // Time an island holds once you stand at an edge: covers the worst case of a full orbit
    // plus a reversal.
    hold: Math.max(lerp(3.6, 1.8, e), 1.6 * ORBIT_UNIT / omegaMax + 0.4),
  };
}

export function mothPos(px, py, phi) {
  return { x: px + ORBIT_R * Math.cos(phi), y: py - HEAD - ORBIT_LIFT + ORBIT_R * Math.sin(phi) };
}

// The moth glides: slow while it lights you from behind (your shadow points forward, where the
// decisions are), slowest as it skims eye level (longest shadows), and it darts quickly through
// the dark arc and the far side of its orbit.
export function mothSpeedK(phi) {
  const sn = Math.sin(phi);
  if (sn > ORBIT_LIFT / ORBIT_R) return 2.6;
  if (Math.cos(phi) > 0.05) return 2.0;
  const h = (ORBIT_LIFT - ORBIT_R * sn) / (ORBIT_LIFT + ORBIT_R); // 0 at eye level .. 1 at top
  return 0.22 + 0.6 * Math.pow(h, 0.8);
}

// Orbit period for base angular speed omega = ORBIT_UNIT / omega
export const ORBIT_UNIT = (() => {
  let t = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) t += (TAU / n) / mothSpeedK(-Math.PI + (i + 0.5) * TAU / n);
  return t;
})();

// The moth is "in the dark arc" when it is below eye level: no shadow is cast.
export function inDarkArc(phi) {
  return Math.sin(phi) > ORBIT_LIFT / ORBIT_R;
}

function onSpike(b, x) {
  if (!b.spikes) return false;
  for (const s of b.spikes) if (x >= s.a - 0.5 && x <= s.b + 0.5) return true;
  return false;
}

// Cast the shadow ray: from the moth, through the player's eyes, onwards to the first surface.
// Returns kind: 'none' (no shadow) | 'land' | 'spike' | 'wall' | 'void'
export function castShadow(px, py, mx, my, blocks) {
  const ox = px, oy = py - HEAD;
  const dx = ox - mx, dy = oy - my;
  if (dy <= 0.35) return { kind: 'none' };
  const tMax = 420 / dy;
  let bestT = tMax, hit = null, face = null;
  for (const b of blocks) {
    if (b.falling) continue;
    let t = (b.y - oy) / dy;
    if (t > 1e-4 && t < bestT) {
      const x = ox + dx * t;
      if (x >= b.x1 && x <= b.x2) { bestT = t; hit = b; face = 'top'; }
    }
    if (dx !== 0) {
      const sx = dx > 0 ? b.x1 : b.x2;
      t = (sx - ox) / dx;
      if (t > 1e-4 && t < bestT) {
        const y = oy + dy * t;
        if (y > b.y && y <= b.y + b.th) { bestT = t; hit = b; face = 'side'; }
      }
    }
  }
  const x = ox + dx * bestT, y = oy + dy * bestT;
  if (!hit) return { kind: 'void', x, y };
  if (face === 'side') return { kind: 'wall', x, y, block: hit };
  if (onSpike(hit, x)) return { kind: 'spike', x, y: hit.y, block: hit };
  return { kind: 'land', x, y: hit.y, block: hit };
}

// Safe standing intervals on a block (excluding spikes), shrunk by margin.
export function safeIntervals(b, margin) {
  const out = [];
  let cur = b.x1 + margin;
  const spikes = (b.spikes || []).slice().sort((p, q) => p.a - q.a);
  for (const s of spikes) {
    if (s.a - 1 - margin > cur) out.push([cur, s.a - 1 - margin]);
    cur = Math.max(cur, s.b + 1 + margin);
  }
  if (b.x2 - margin > cur) out.push([cur, b.x2 - margin]);
  return out;
}

function isSafeLanding(b, x, margin) {
  for (const [a, c] of safeIntervals(b, margin)) if (x >= a && x <= c) return true;
  return false;
}

// Longest continuous time (seconds) during which the shadow tip, cast from feet position fx on `from`,
// lands safely on `to` (optionally inside [lo, hi]) with a 1px margin. Worst case moth speed is used.
const SWEEP_STEPS = 1440;
export function windowTime(from, fx, to, omegaMax, lo = -Infinity, hi = Infinity) {
  const blocks = from === to ? [from] : [from, to];
  const dphi = TAU / SWEEP_STEPS;
  let best = 0, run = 0;
  for (let i = 0; i < SWEEP_STEPS * 2; i++) {
    const phi = -Math.PI + (i % SWEEP_STEPS) * dphi;
    const m = mothPos(fx, from.y, phi);
    const s = castShadow(fx, from.y, m.x, m.y, blocks);
    if (s.kind === 'land' && s.block === to && s.x >= lo && s.x <= hi && isSafeLanding(to, s.x, 1)) {
      run += dphi / (omegaMax * mothSpeedK(phi));
      if (run > best) best = run;
    } else run = 0;
  }
  return Math.min(best, ORBIT_UNIT / omegaMax);
}

// The sleepwalker always walks forward and stops, teetering, at the leading edge of the safe
// stretch it stands on. Fairness promise: from every such edge, the next stretch (the next safe
// part of the same island, past its spikes, or the next island) offers a landing window of at
// least minWin, and the island holds long enough for the moth to sweep past it.
// Where the sleepwalker stops: the leading edge of the safe stretch it is standing on.
export function walkTarget(b, x) {
  for (const [a, c] of safeIntervals(b, 1)) if (x <= c && x >= a - 1.5) return c;
  return x;
}

// How long an island holds once you land on it at x: the walk to each remaining edge plus one
// hold per edge still to be jumped from.
export function holdTime(b, x, tun) {
  let t = 0, started = false;
  for (const [a, c] of safeIntervals(b, 1)) {
    if (!started) { if (x <= c) { started = true; t += Math.max(0, c - x) / tun.walk + tun.hold; } }
    else t += (c - a) / tun.walk + tun.hold;
  }
  return started ? t : tun.hold;
}

export function islandIsFair(b, tun) {
  const iv = safeIntervals(b, 1);
  for (let i = 0; i + 1 < iv.length; i++) {
    if (windowTime(b, iv[i][1], b, tun.omegaMax, iv[i + 1][0], iv[i + 1][1]) < tun.minWin) return false;
  }
  return true;
}

export function pairIsFair(from, to, tun) {
  if (to.y <= from.y - HEAD + 3) return false; // must be below eye level to ever be reachable
  const iv = safeIntervals(from, 1);
  return windowTime(from, iv[iv.length - 1][1], to, tun.omegaMax) >= tun.minWin;
}

function addSpike(b, a, c) {
  b.spikes.push({ a, b: c });
  return b;
}

function makeCandidate(rng, prev, idx, tun) {
  const gap = lerp(tun.gapMin, tun.gapMax, rng());
  const x1 = prev.x2 + gap;
  if (idx >= 12 && rng() < tun.pillarP && prev.kind !== 'pillar') {
    const w = Math.round(lerp(8, 12, rng()));
    const y = clamp(Math.round(prev.y + lerp(-6, 10, rng())), Y0 - 50, Y0 + 90);
    return { kind: 'pillar', x1, x2: x1 + w, y, th: 400, idx };
  }
  let dy;
  if (idx < 6) dy = lerp(4, 16, rng());
  else dy = rng() < 0.45 ? -lerp(0, tun.rise, rng()) : lerp(0, tun.drop, rng());
  let y = Math.round(prev.y + dy);
  if (y > Y0 + 90) y = Math.round(prev.y - lerp(1, tun.rise, rng()));
  if (y < Y0 - 50) y = Math.round(prev.y + lerp(4, tun.drop, rng()));
  const w = Math.round(idx < 6 ? lerp(26, 40, rng()) : lerp(tun.wMin, tun.wMax, rng()));
  const b = { kind: 'island', x1, x2: x1 + w, y, th: Math.round(lerp(9, 18, rng())), idx, spikes: [] };
  if (idx >= 8 && w >= 20 && rng() < tun.spikeP) {
    const sw = Math.round(lerp(4, Math.max(5, w * 0.45), rng()));
    const where = rng();
    let a;
    if (where < 0.4) a = b.x1 + 1;                         // guard the near edge
    else if (where < 0.75) a = b.x1 + Math.round((w - sw) / 2); // split the island
    else { a = b.x2 - 1 - Math.min(sw, 7); return addSpike(b, a, a + Math.min(sw, 7)); } // guard the far edge: short, you shoot over it
    return addSpike(b, a, a + sw);
  }
  return b;
}

function shiftBlock(b, dx) {
  b.x1 += dx; b.x2 += dx;
  for (const sp of b.spikes || []) { sp.a += dx; sp.b += dx; }
}

export const genStats = { ok: 0, fallback: 0, attempts: 0, lastResort: 0 };
export function generateNext(rng, prev, idx) {
  const tun = tuning(idx);
  for (let attempt = 0; attempt < 30; attempt++) {
    const c = makeCandidate(rng, prev, idx, tun);
    // If the island is out of fair reach, pull it closer before giving up on it.
    for (const pull of [0, 0.35, 0.6, 0.85]) {
      if (pull > 0) shiftBlock(c, -Math.max(0, (c.x1 - prev.x2) - tun.gapMin) * pull);
      genStats.attempts++;
      if (pairIsFair(prev, c, tun) && islandIsFair(c, tun)) { genStats.ok++; return c; }
    }
  }
  genStats.fallback++;
  // Fallbacks: progressively easier, still validated.
  for (let k = 0; k < 24; k++) {
    const x1 = prev.x2 + Math.max(2, 6 - k);
    const c = { kind: 'island', x1, x2: x1 + 20 + k, y: prev.y + 8 + k * 2, th: 12, idx, spikes: [] };
    if (pairIsFair(prev, c, tun) && islandIsFair(c, tun)) return c;
  }
  genStats.lastResort++;
  const x1 = prev.x2 + 2;
  return { kind: 'island', x1, x2: x1 + 40, y: prev.y + 30, th: 12, idx, spikes: [] };
}

// ---------------------------------------------------------------------------
// Game state

export function createGame(seed) {
  const rng = rng32(seed);
  const start = { kind: 'island', x1: 8, x2: 78, y: Y0, th: 16, idx: 0, spikes: [] };
  const g = {
    seed, rng,
    blocks: [start],
    nextIdx: 1,
    player: { x: 50, y: Y0, block: start },
    moth: { phi: -Math.PI / 2, dir: -1, flT: 0, flash: 0, reversePending: false, wasDark: false },
    started: false,
    alive: true,
    deathCause: null,
    score: 0,
    progress: 0,
    phase: 0,
    time: 0,
    events: [],
    shadow: null,
    camX: 0,
  };
  fillAhead(g);
  updateShadow(g);
  return g;
}

function fillAhead(g) {
  const want = g.player.x + VIEW_W + 140;
  let last = g.blocks[g.blocks.length - 1];
  while (last.x2 < want) {
    last = generateNext(g.rng, last, g.nextIdx++);
    g.blocks.push(last);
  }
  const minX = g.player.x - 120;
  g.blocks = g.blocks.filter((b) => b.x2 > minX && !(b.falling && b.fallY > 400));
}

export function mothWorld(g) {
  return mothPos(g.player.x, g.player.y, g.moth.phi);
}

function updateShadow(g) {
  const m = mothWorld(g);
  g.shadow = castShadow(g.player.x, g.player.y, m.x, m.y, g.blocks);
}

function die(g, cause) {
  if (!g.alive) return;
  g.alive = false;
  g.deathCause = cause;
  g.events.push({ type: 'death', cause });
}

export function step(g, dt) {
  g.time += dt;
  const tun = tuning(g.progress);
  const mo = g.moth;

  // Moth flight
  mo.flT += dt;
  const omega = tun.omega * (1 + tun.flutter * Math.sin(mo.flT * 2.1));
  const prevPhi = mo.phi;
  mo.phi += mo.dir * omega * mothSpeedK(mo.phi) * dt;
  if (mo.phi > Math.PI) mo.phi -= TAU;
  if (mo.phi <= -Math.PI) mo.phi += TAU;
  if (mo.flash > 0) mo.flash -= dt;

  // Audible tick each time the moth crosses the top of its orbit (rhythm cue).
  if (Math.cos(prevPhi) * Math.cos(mo.phi) <= 0 && Math.sin(mo.phi) < 0) g.events.push({ type: 'tick' });

  // Reversals happen only inside the dark arc and are telegraphed by a flash.
  const dark = inDarkArc(mo.phi);
  if (dark && !mo.wasDark && tun.reverse && g.alive && g.rng() < 0.35) {
    mo.reversePending = true;
    mo.flash = 0.5;
    g.events.push({ type: 'reverseWarn' });
  }
  if (mo.reversePending && dark && Math.cos(prevPhi) * Math.cos(mo.phi) <= 0) {
    mo.dir = -mo.dir;
    mo.reversePending = false;
    g.events.push({ type: 'reverse' });
  }
  if (!dark) mo.reversePending = false;
  mo.wasDark = dark;

  // Islands crumbling / falling
  for (const b of g.blocks) {
    if (b.falling) {
      b.vy = (b.vy || 0) + 420 * dt;
      b.fallY = (b.fallY || 0) + b.vy * dt;
      continue;
    }
    if (b.crumble !== undefined && g.alive && b === g.player.block) {
      const before = b.crumble;
      b.crumble -= dt;
      if (before > 0.8 && b.crumble <= 0.8) g.events.push({ type: 'crumbleWarn' });
      if (b.crumble <= 0) {
        b.falling = true;
        g.events.push({ type: 'crumble', block: b });
        if (g.player.block === b) die(g, 'crumble');
      }
    }
  }
  // The sleepwalker walks on to the edge of its stretch and teeters there.
  const p = g.player;
  if (g.alive && p.block && !p.block.falling) {
    const target = walkTarget(p.block, p.x);
    p.walking = p.x < target - 0.01;
    if (p.walking) p.x = Math.min(target, p.x + tun.walk * dt);
  }
  updateShadow(g);
}

export function tap(g) {
  if (!g.alive) return;
  const s = g.shadow;
  if (!s || s.kind === 'none') {
    g.events.push({ type: 'fizzle' });
    return;
  }
  const from = { x: g.player.x, y: g.player.y };
  const prevBlock = g.player.block;
  g.player.x = s.x;
  g.player.y = s.y;
  if (s.kind === 'void') { g.player.block = null; g.events.push({ type: 'teleport', from, to: { x: s.x, y: s.y }, kind: s.kind }); die(g, 'void'); return; }
  if (s.kind === 'wall') { g.player.block = null; g.events.push({ type: 'teleport', from, to: { x: s.x, y: s.y }, kind: s.kind }); die(g, 'wall'); return; }
  if (s.kind === 'spike') { g.player.block = s.block; g.events.push({ type: 'teleport', from, to: { x: s.x, y: s.y }, kind: s.kind }); die(g, 'spike'); return; }

  const b = s.block;
  g.player.block = b;
  const skip = b.idx - prevBlock.idx;
  const tun = tuning(b.idx);
  if (b !== prevBlock) {
    // Everything behind you collapses, including islands you shot past.
    for (const o of g.blocks) if (o.idx < b.idx && !o.falling) o.falling = true;
    g.started = true;
    b.crumble = holdTime(b, s.x, tun);
    b.crumbleMax = b.crumble;
  }
  let gained = Math.max(0, skip);
  // Near-miss: landing within 2.5px of an edge or a spike.
  let close = false;
  if (skip > 0) {
    if (s.x - b.x1 < 2.5 || b.x2 - s.x < 2.5) close = true;
    for (const sp of b.spikes || []) if (Math.abs(s.x - sp.a) < 3 || Math.abs(s.x - sp.b) < 3) close = true;
  }
  if (skip >= 2) gained += skip - 1;
  if (close) gained += 1;
  g.score += gained;
  g.progress = Math.max(g.progress, b.idx);
  g.events.push({ type: 'teleport', from, to: { x: s.x, y: s.y }, kind: 'land', skip, close, gained });
  const ph = phaseIndex(g.progress);
  if (ph > g.phase) { g.phase = ph; g.events.push({ type: 'phase', phase: ph }); }
  fillAhead(g);
  updateShadow(g);
}
