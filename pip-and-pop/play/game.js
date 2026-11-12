// PIP & POP — simulazione pura (nessun DOM): usata dal browser e dai test in Node.
(function (root) {
  'use strict';

  const W = 400;
  const C = {
    W,
    CX: W / 2,
    DR: 11,          // raggio delle luci
    S_MIN: 17,       // semi-distanza minima (chiuso)
    S_MAX: 178,      // semi-distanza massima (aperto)
    ACC: 1500,       // accelerazione di apertura/chiusura (unità/s²)
    VMAX: 500,
    V0: 290,         // velocità di scorrimento iniziale
    V1: 590,         // velocità massima
    D_START: 0.4,    // difficoltà iniziale (frazione della curva)
    RAMP: 75,        // ostacoli per arrivare alla difficoltà massima
    GRAZE: 8,        // margine (unità) sotto cui un passaggio è "sfiorato"
    COMBO_MAX: 5,
    DT: 1 / 120,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const diffAt = n => lerp(C.D_START, 1, clamp(n / C.RAMP, 0, 1));
  const speedAt = d => lerp(C.V0, C.V1, 1 - Math.pow(1 - d, 1.6));
  const THEMES = 6;

  // ---------- forme degli ostacoli ----------
  // Ogni ostacolo è fatto di "parti" orizzontali (colonna centrale, muri laterali).
  // La collisione usa la forma esatta disegnata (distanza con segno), così ciò che
  // si vede è esattamente ciò che colpisce. Ogni forma sta dentro il rettangolo
  // usato dal generatore, quindi la garanzia di fattibilità resta valida.
  function rrDist(px, py, cx, cy, bx, by, r) {
    r = Math.min(r, bx, by);
    const qx = Math.abs(px - cx) - bx + r, qy = Math.abs(py - cy) - by + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  // Catena di perle: cerchi di raggio h/2 sovrapposti, da x0 a x1.
  function beadLayout(x0, x1, h) {
    const rb = Math.min(h / 2, (x1 - x0) / 2), span = Math.max(0, x1 - x0 - 2 * rb);
    const n = Math.max(1, Math.round(span / (1.55 * rb)) + 1);
    return { rb, n, first: x0 + rb, step: n > 1 ? span / (n - 1) : 0 };
  }
  function partDist(o, x0, x1, px, py) {
    const cy = o.y - o.h / 2;
    if (o.shape === 'beads') {
      const L = beadLayout(x0, x1, o.h);
      const k = L.step ? Math.round((px - L.first) / L.step) : 0;
      let d = Infinity;
      for (let j = k - 1; j <= k + 1; j++) {
        if (j < 0 || j >= L.n) continue;
        d = Math.min(d, Math.hypot(px - (L.first + j * L.step), py - cy) - L.rb);
      }
      return d;
    }
    const r = o.shape === 'capsule' ? o.h / 2 : 9;
    return rrDist(px, py, (x0 + x1) / 2, cy, (x1 - x0) / 2, o.h / 2, r);
  }
  // Parti in coordinate relative al centro (lato destro; il sinistro è speculare).
  function partsOf(o) {
    const parts = [];
    if (o.lo > 0) parts.push({ kind: 'pillar', x0: -o.lo, x1: o.lo });
    if (o.hi > 0) parts.push({ kind: 'wall', x0: o.hi, x1: C.CX + 40 });
    return parts;
  }

  // Tempo minimo (accelera-frena) per spostare la semi-distanza di delta.
  function minMoveTime(delta) {
    if (delta <= 0) return 0;
    const dAcc = (C.VMAX * C.VMAX) / C.ACC;
    if (delta <= dAcc) return 2 * Math.sqrt(delta / C.ACC);
    return (2 * C.VMAX) / C.ACC + (delta - dAcc) / C.VMAX;
  }

  class Game {
    constructor(H, seed) {
      this.H = H;
      this.PY = Math.round(H * 0.76);
      this.reset(seed);
    }

    reset(seed) {
      this.seed = seed >>> 0;
      this.rand = mulberry32(this.seed || 1);
      this.look = mulberry32((this.seed ^ 0x9e3779b9) || 2);
      this.lastTheme = -1;
      this.s = 40; this.v = 0;
      this.obs = [];
      this.gen = 0;             // ostacoli generati
      this.passed = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.grazes = 0;
      this.time = 0;
      this.dist = 0;
      this.speed = speedAt(C.D_START);
      this.alive = true;
      this.hit = null;
      this.events = [];
      this.trail = [];
      this.cursor = this.H * 0.12;  // y (schermo) del bordo superiore dell'ultimo ostacolo: il primo appare subito
      this.lastRange = [this.s, this.s];
    }

    difficulty() { return diffAt(this.passed); }

    // ---------- generazione ----------
    rangeToObs(a, b, h) {
      const lo = a <= C.S_MIN + 0.5 ? 0 : a - C.DR;
      const hi = b >= C.S_MAX - 0.5 ? 0 : b + C.DR;
      return { lo, hi, h, a, b };
    }

    spawnOne(a, b, h, baseGap, k) {
      // Caso peggiore: il giocatore può trovarsi in qualunque punto dell'intervallo precedente.
      const [pa, pb] = this.lastRange;
      const delta = Math.max(0, a - pa, pb - b);
      const vEst = Math.min(C.V1, this.speed * 1.08);
      const need = vEst * (0.14 + k * minMoveTime(delta));
      const gap = Math.max(baseGap, need);
      const o = this.rangeToObs(a, b, h);
      o.y = this.cursor - gap;          // bordo inferiore
      o.passed = false; o.minClear = Infinity; o.idx = this.gen;
      // Aspetto (generatore separato: non altera la sequenza di gioco).
      const lr = this.look;
      let th = Math.floor(lr() * THEMES);
      if (th === this.lastTheme) th = (th + 1 + Math.floor(lr() * (THEMES - 1))) % THEMES;
      o.theme = this.lastTheme = th;
      const sr = lr();
      o.shape = h > 64 ? 'block' : sr < 0.4 ? 'capsule' : sr < 0.7 ? 'beads' : 'block';
      o.face = o.lo >= 34 && h <= 64 && lr() < 0.45;
      o.label = null;
      this.cursor = o.y - h;
      this.obs.push(o);
      this.lastRange = [a, b];
      this.gen++;
      return o;
    }

    spawnPattern() {
      const r = this.rand;
      const n = this.gen;
      const d = diffAt(n);
      const k = lerp(2.3, 1.35, d);           // margine "umano" sul tempo minimo
      const baseGap = lerp(330, 175, d);
      const hN = () => 34 + r() * 14;

      // Tutorial implicito: colonna, porta, colonna.
      if (n === 0) { const o = this.spawnOne(85, C.S_MAX, 40, 260, 3); o.label = 'HOLD'; return; }
      if (n === 1) { const o = this.spawnOne(C.S_MIN, 55, 40, 320, 3); o.label = 'RELEASE'; return; }
      if (n === 2) { this.spawnOne(110, C.S_MAX, 40, 320, 3); return; }

      // Ondate: ogni 16 ostacoli, gli ultimi 3 sono una pausa per respirare.
      const phase = n % 16;
      if (n > 16 && phase >= 13) {
        const w = 70 + r() * 20;
        const c = lerp(C.S_MIN + w / 2 + 10, C.S_MAX - w / 2 - 10, r());
        this.spawnOne(c - w / 2, c + w / 2, hN(), baseGap * 1.5, 2.4);
        return;
      }

      const roll = r();
      const pWindow = d < 0.1 ? 0 : lerp(0.2, 0.45, d);
      const pCorr = d < 0.3 ? 0 : lerp(0.08, 0.18, d);
      const pSlalom = d < 0.45 ? 0 : lerp(0.08, 0.2, d);

      const slack = () => lerp(105, 22, Math.pow(d, 0.7)) * (0.88 + r() * 0.3);

      if (roll < pSlalom) {
        const count = 3 + Math.floor(r() * (2 + d * 2));
        let c = lerp(60, 140, r());
        let dir = c > 100 ? -1 : 1;
        for (let i = 0; i < count; i++) {
          const w = slack() * 1.15;
          c = clamp(c, C.S_MIN + w / 2 + 6, C.S_MAX - w / 2 - 6);
          this.spawnOne(c - w / 2, c + w / 2, 30 + r() * 10, baseGap * 0.55, k);
          c += dir * (35 + r() * 45);
          dir = -dir;
        }
        return;
      }
      if (roll < pSlalom + pCorr) {
        const w = slack() * 1.25;
        const c = lerp(C.S_MIN + w / 2 + 25, C.S_MAX - w / 2 - 20, r());
        this.spawnOne(c - w / 2, c + w / 2, lerp(140, 380, d) * (0.8 + r() * 0.4), baseGap, k);
        return;
      }
      if (roll < pSlalom + pCorr + pWindow) {
        const w = slack();
        const c = lerp(C.S_MIN + w / 2 + 18, C.S_MAX - w / 2 - 12, r());
        this.spawnOne(c - w / 2, c + w / 2, hN(), baseGap, k);
        return;
      }
      // Colonna o porta, alternate con preferenza per il cambio (è il cambio che crea tensione).
      const [pa] = this.lastRange;
      const wasOpen = pa > 60;
      const pillar = r() < (wasOpen ? 0.3 : 0.7);
      if (pillar) {
        const a = lerp(45, lerp(120, 158, d), r());
        this.spawnOne(a, C.S_MAX, hN(), baseGap, k);
      } else {
        const b = lerp(lerp(70, 38, d), 125, r());
        this.spawnOne(C.S_MIN, b, hN(), baseGap, k);
      }
    }

    // ---------- passo di simulazione ----------
    step(dt, holding) {
      if (!this.alive) return;
      this.time += dt;
      const d = this.difficulty();
      const target = speedAt(d);
      this.speed += (target - this.speed) * Math.min(1, dt * 0.8);
      const dy = this.speed * dt;
      this.dist += dy;

      // Fisica delle luci
      this.v += (holding ? C.ACC : -C.ACC) * dt;
      this.v = clamp(this.v, -C.VMAX, C.VMAX);
      this.s += this.v * dt;
      if (this.s < C.S_MIN) { this.s = C.S_MIN; if (this.v < 0) this.v = 0; }
      if (this.s > C.S_MAX) { this.s = C.S_MAX; if (this.v > 0) this.v = 0; }

      // Scorrimento + generazione
      this.cursor += dy;
      for (const o of this.obs) o.y += dy;
      while (this.cursor > -120) this.spawnPattern();

      // Scia
      this.trail.push(this.s, this.dist);
      const maxBack = this.H - this.PY + 40;
      while (this.trail.length > 4 && this.dist - this.trail[1] > maxBack) this.trail.splice(0, 2);

      // Collisioni (per simmetria basta la luce destra)
      const PY = this.PY, R = C.DR, s = this.s;
      for (const o of this.obs) {
        if (o.passed) continue;
        const top = o.y - o.h, bot = o.y;
        const vy = PY < top ? top - PY : PY > bot ? PY - bot : 0;
        if (vy < R + C.GRAZE) {
          let clear = Infinity, hitKind = null;
          for (const pt of partsOf(o)) {
            const d = partDist(o, pt.x0, pt.x1, s, PY) - R;
            if (d < clear) { clear = d; hitKind = pt.kind; }
          }
          if (clear < o.minClear) o.minClear = clear;
          if (clear < 0) {
            this.alive = false;
            const side = hitKind === 'pillar' ? 'in' : 'out';
            this.hit = { o, side, s };
            this.events.push({ type: 'die' });
            return;
          }
        }
        if (top > PY + R) {
          o.passed = true;
          this.passed++;
          let gain = 1;
          if (o.minClear < C.GRAZE) {
            this.combo = Math.min(C.COMBO_MAX, this.combo + 1);
            this.grazes++;
            gain += this.combo;
            this.events.push({ type: 'graze', combo: this.combo, gain, clear: o.minClear });
          } else {
            this.combo = 0;
          }
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.score += gain;
          this.events.push({ type: 'pass', gain, combo: this.combo });
        }
      }
      this.obs = this.obs.filter(o => o.y - o.h < this.H + 40);
    }
  }

  // ---------- bot (per test e modalità demo) ----------
  // skill: 1 = controllo perfetto; valori minori aggiungono ritardo di reazione e imprecisione.
  function makeBot(skill, seed) {
    const r = mulberry32(seed || 7);
    const latency = lerp(0.2, 0, skill);   // ritardo tra decisione e azione (s)
    const noise = lerp(12, 0, skill);      // imprecisione della mira (unità)
    const rate = lerp(0.06, 0, skill);     // intervallo tra decisioni (s)
    const queue = [];
    let decided = false, nextDecision = 0, aim = 0;
    return function (g) {
      if (g.time >= nextDecision) {
        nextDecision = g.time + rate;
        let o = null;
        for (const ob of g.obs) if (!ob.passed && (!o || ob.y > o.y)) o = ob;
        let target = 60;
        if (o) {
          target = (o.a + o.b) / 2;
          if (o.b >= C.S_MAX - 0.5) target = C.S_MAX + 40;   // colonna: tieni premuto
          if (o.a <= C.S_MIN + 0.5) target = C.S_MIN - 40;   // porta: lascia
        }
        if (r() < 0.15) aim = (r() * 2 - 1) * noise;
        const sp = g.s + g.v * latency;            // anticipa la propria latenza
        const stop = (g.v * Math.abs(g.v)) / (2 * C.ACC);
        decided = target + aim - sp - stop > 0;
      }
      queue.push([g.time + latency, decided]);
      let out = queue.length ? queue[0][1] : decided;
      while (queue.length && queue[0][0] <= g.time) out = queue.shift()[1];
      return out;
    };
  }

  const api = { C, Game, makeBot, mulberry32, minMoveTime, partsOf, beadLayout, partDist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Breathe = api;
})(typeof window !== 'undefined' ? window : globalThis);
