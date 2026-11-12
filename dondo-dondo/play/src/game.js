/*
 * DONDO DONDO — simulazione di gioco (nessuna dipendenza dal DOM).
 *
 * Due sfere legate da un filo: una e' il perno (ferma), l'altra le gira
 * attorno. Ogni tocco scambia i ruoli e inverte il verso di rotazione.
 * Coordinate del mondo: x in [0, W], y cresce verso l'alto.
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const TAU = PI * 2;

  const CFG = {
    W: 360,            // larghezza del mondo
    L: 68,             // lunghezza del filo
    R: 11,             // raggio delle sfere (disegno)
    HIT: 9.5,          // raggio di collisione: un filo piu' clemente del disegno
    DT: 1 / 120,       // passo fisso della simulazione
    OMEGA: 4.2,        // velocita' angolare base (rad/s)
    PERFECT: 0.2,      // finestra del tocco perfetto attorno alla verticale (rad)
    COMBO_GAIN: 0.05,  // +5% di velocita' per ogni perfetto consecutivo
    COMBO_MAX: 10,
    TIDE_START: -150,  // quota iniziale della marea
    TIDE_V0: 26,       // velocita' iniziale della marea (unita'/s)
    TIDE_V1: 80,       // velocita' massima della marea
    TIDE_RAMP: 90,     // secondi per arrivare alla velocita' massima
    TIDE_LEASH: 320,   // distanza massima tra marea e giocatore (resta a bordo schermo)
    SAFE_ZONE: 330,    // quota del primo ostacolo
    UNIT: 10,          // unita' per metro di punteggio
    DIFF_HEIGHT: 4800, // quota a cui la difficolta' arriva al massimo
    DIFF_START: 0.4,   // la difficolta' parte gia' da qui: si sente subito
    OVER_HEIGHT: 6000, // oltre il massimo: altri 600 m in cui stringono ancora calma e distanze
    // calma: ogni tocco perfetto calma la marea per qualche secondo; se scade
    // senza un perfetto la marea si gonfia e sale veloce finche' non torni sul segno
    CALM_0: 6,         // secondi di calma all'inizio...
    CALM_1: 2.7,       // ...e alla difficolta' massima
    CALM_2: 2.2,       // ...e in fondo alla zona oltre il massimo
    CALM_WARN: 1.2,    // ultimi secondi: il segno lampeggia
    SURGE_V: 260,      // velocita' della marea gonfia (piu' di chi sale senza perfetti)
    SURGE_PUSH: 50,    // un perfetto durante la piena respinge la marea
  };

  // --- utilita' -----------------------------------------------------------

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function wrapAngle(a) {
    a = (a + PI) % TAU;
    if (a < 0) a += TAU;
    return a - PI;
  }

  // mulberry32 con stato in un oggetto, cosi' la partita si puo' clonare
  function rand(g) {
    g.s = (g.s + 0x6d2b79f5) | 0;
    let t = g.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // --- ostacoli -----------------------------------------------------------
  // rect: { k:'rect', x, y, w, h, amp, freq, ph }  (amp>0 => si muove in x)
  // spin: { k:'spin', cx, cy, len, thick, w, ph }  (barra rotante)
  // circ: { k:'circ', cx, cy, r, amp, freq, ph }    (cerchio, amp>0 => si muove in x)
  // poly: { k:'poly', pts:[x0,y0,x1,y1,...], y0, y1 } (poligono convesso fermo)

  function rectX(o, t) {
    return o.amp ? o.x + o.amp * Math.sin(o.freq * t + o.ph) : o.x;
  }

  function spinEnds(o, t) {
    const a = o.ph + o.w * t;
    const dx = Math.cos(a) * o.len;
    const dy = Math.sin(a) * o.len;
    return [o.cx - dx, o.cy - dy, o.cx + dx, o.cy + dy];
  }

  function circX(o, t) {
    return o.amp ? o.cx + o.amp * Math.sin(o.freq * t + o.ph) : o.cx;
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const u = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
    const dx = px - (ax + vx * u), dy = py - (ay + vy * u);
    return dx * dx + dy * dy;
  }

  function hitCircle(o, t, px, py, r) {
    if (o.k === 'circ') {
      const dx = px - circX(o, t);
      const dy = py - o.cy;
      const rr = r + o.r;
      return dx * dx + dy * dy < rr * rr;
    }
    if (o.k === 'poly') {
      const p = o.pts;
      const n = p.length;
      let pos = false, neg = false, best = Infinity;
      for (let i = 0; i < n; i += 2) {
        const ax = p[i], ay = p[i + 1], bx = p[(i + 2) % n], by = p[(i + 3) % n];
        const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if (c > 0) pos = true; else if (c < 0) neg = true;
        best = Math.min(best, segDist2(px, py, ax, ay, bx, by));
      }
      if (!(pos && neg)) return true; // centro dentro il poligono
      return best < r * r;
    }
    if (o.k === 'rect') {
      const x = rectX(o, t);
      const qx = clamp(px, x, x + o.w);
      const qy = clamp(py, o.y, o.y + o.h);
      const dx = px - qx;
      const dy = py - qy;
      return dx * dx + dy * dy < r * r;
    }
    const e = spinEnds(o, t);
    const vx = e[2] - e[0];
    const vy = e[3] - e[1];
    const u = clamp(((px - e[0]) * vx + (py - e[1]) * vy) / (vx * vx + vy * vy), 0, 1);
    const dx = px - (e[0] + vx * u);
    const dy = py - (e[1] + vy * u);
    const rr = r + o.thick / 2;
    return dx * dx + dy * dy < rr * rr;
  }

  function topOf(o) {
    if (o.k === 'rect') return o.y + o.h;
    if (o.k === 'circ') return o.cy + o.r;
    if (o.k === 'poly') return o.y1;
    return o.cy + o.len;
  }

  function bottomOf(o) {
    if (o.k === 'rect') return o.y;
    if (o.k === 'circ') return o.cy - o.r;
    if (o.k === 'poly') return o.y0;
    return o.cy - o.len;
  }

  function poly(pts) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { y0 = Math.min(y0, pts[i]); y1 = Math.max(y1, pts[i]); }
    return { k: 'poly', pts, y0, y1 };
  }

  // --- generazione procedurale -------------------------------------------
  // Pattern costruiti a mano, parametrizzati dalla difficolta' d in [0,1]:
  // il caso sceglie posizione e ordine, mai l'impossibilita'.

  // cresce in fretta nei primi metri e poi piu' piano: le partite tipiche (100-300 m)
  // sono gia' nel vivo, ma il massimo resta a DIFF_HEIGHT
  function difficulty(y) {
    return lerp(CFG.DIFF_START, 1, Math.pow(clamp(y / CFG.DIFF_HEIGHT, 0, 1), 0.75));
  }

  // 0 al massimo della difficolta', 1 dopo altri OVER_HEIGHT: per chi arriva lontano
  function overdrive(y) {
    return clamp((y - CFG.DIFF_HEIGHT) / CFG.OVER_HEIGHT, 0, 1);
  }

  function calmMax(y) {
    const o = overdrive(y);
    return o > 0 ? lerp(CFG.CALM_1, CFG.CALM_2, o) : lerp(CFG.CALM_0, CFG.CALM_1, difficulty(y));
  }

  function pickGapX(s, gapW, d, margin, shift) {
    const W = CFG.W;
    const lo = gapW / 2 + margin;
    const hi = W - gapW / 2 - margin;
    const maxShift = shift || lerp(70, 170, d);
    const a = Math.max(lo, s.lastGapX - maxShift);
    const b = Math.min(hi, s.lastGapX + maxShift);
    const x = a < b ? lerp(a, b, rand(s.gen)) : clamp(s.lastGapX, lo, hi);
    s.lastGapX = x;
    return x;
  }

  function addGate(s, y, d, moving, shift) {
    const T = 16;
    // un'orbita (raggio L+R) attraversa la quota della barra a circa ±L dal perno:
    // sotto i ~150 di varco il passaggio sarebbe impossibile, non difficile
    const gapW = clamp(lerp(235, 160, d) * lerp(0.96, 1.08, rand(s.gen)), 156, 250);
    let amp = 0, freq = 0, ph = 0;
    if (moving) {
      const o = overdrive(y);
      amp = lerp(35, 80, d);
      freq = lerp(0.8, 1.6, d) + 0.35 * o;
      ph = rand(s.gen) * TAU;
    }
    const gx = pickGapX(s, gapW, d, 6 + amp, shift);
    const left = gx - gapW / 2;
    const right = gx + gapW / 2;
    s.obs.push({ k: 'rect', x: -200, y, w: left + 200, h: T, amp, freq, ph });
    s.obs.push({ k: 'rect', x: right, y, w: CFG.W - right + 200, h: T, amp, freq, ph });
    return T;
  }

  function addBlock(s, y, d) {
    const W = CFG.W;
    const h = 22;
    const w = lerp(70, 160, d) * lerp(0.8, 1.15, rand(s.gen));
    const pass = lerp(195, 160, d); // passaggio libero garantito su almeno un lato
    let x;
    const r = rand(s.gen);
    if (r < 0.4 && (W - w) / 2 >= pass) x = (W - w) / 2; // centrale: due vie
    else if (r < 0.7) x = W - pass - w;          // lascia libero il lato destro
    else x = pass;                               // lascia libero il lato sinistro
    x = clamp(x, 0, W - w);
    s.obs.push({ k: 'rect', x, y, w, h, amp: 0, freq: 0, ph: 0 });
    s.lastGapX = x + w / 2 < W / 2 ? lerp(x + w, W, 0.5) : x / 2;
    return h;
  }

  // blocco che scorre: apre a turno il lato sinistro e il destro, bisogna aspettare il varco
  function addSlider(s, y, d) {
    const W = CFG.W;
    const h = 22;
    const w = lerp(70, 110, d) * lerp(0.9, 1.1, rand(s.gen));
    const amp = lerp(55, 85, d);
    const freq = lerp(0.9, 1.5, d) + 0.3 * overdrive(y);
    if (rand(s.gen) < 0.4) {
      // variante rotonda: una pallina che attraversa tutto il foglio
      const r = lerp(26, 34, d);
      s.obs.push({ k: 'circ', cx: W / 2, cy: y + r, r, amp: lerp(80, 110, d), freq, ph: rand(s.gen) * TAU });
      s.lastGapX = W / 2;
      return 2 * r;
    }
    // al centro dell'oscillazione: il lato piu' aperto arriva a (W-w)/2+amp, sempre oltre i 190
    const x = (W - w) / 2;
    s.obs.push({ k: 'rect', x, y, w, h, amp, freq, ph: rand(s.gen) * TAU, slide: true });
    s.lastGapX = W / 2;
    return h;
  }

  // perline: due cerchi ai lati del varco, al posto della barra
  function addDots(s, y, d) {
    const r = lerp(24, 30, d);
    const gapW = clamp(lerp(235, 160, d) * lerp(0.96, 1.08, rand(s.gen)), 156, 250);
    const gx = pickGapX(s, gapW, d, 6);
    s.obs.push({ k: 'circ', cx: gx - gapW / 2 - r, cy: y + r, r, amp: 0, freq: 0, ph: 0 });
    s.obs.push({ k: 'circ', cx: gx + gapW / 2 + r, cy: y + r, r, amp: 0, freq: 0, ph: 0 });
    return 2 * r;
  }

  // rombo fermo: come il blocco, lascia sempre un passaggio libero su un lato
  function addDiamond(s, y, d) {
    const W = CFG.W;
    const w = lerp(90, 150, d) * lerp(0.85, 1.1, rand(s.gen));
    const h = lerp(56, 72, d);
    const pass = lerp(195, 160, d);
    const r = rand(s.gen);
    let cx;
    if (r < 0.4 && (W - w) / 2 >= pass) cx = W / 2;
    else if (r < 0.7) cx = W - pass - w / 2;
    else cx = pass + w / 2;
    cx = clamp(cx, w / 2, W - w / 2);
    s.obs.push(poly([cx, y, cx + w / 2, y + h / 2, cx, y + h, cx - w / 2, y + h / 2]));
    s.lastGapX = cx < W / 2 ? lerp(cx + w / 2, W, 0.5) : (cx - w / 2) / 2;
    return h;
  }

  // denti: triangoli che sporgono dalle pareti, alternati, da superare a zig-zag;
  // a ogni quota ne sporge uno solo, quindi il passaggio non scende mai sotto W - depth
  function addTeeth(s, y, d) {
    const W = CFG.W;
    const n = d > 0.5 ? 3 : 2;
    const hb = lerp(110, 92, d);
    const step = hb + lerp(45, 30, d);
    let left = rand(s.gen) < 0.5;
    let depth = 0;
    for (let i = 0; i < n; i++) {
      depth = lerp(145, 178, d) * lerp(0.92, 1, rand(s.gen));
      const yy = y + i * step;
      s.obs.push(left
        ? poly([-30, yy, depth, yy + hb / 2, -30, yy + hb])
        : poly([W + 30, yy, W + 30, yy + hb, W - depth, yy + hb / 2]));
      left = !left;
    }
    // dopo l'ultimo dente il lato libero e' quello opposto
    s.lastGapX = left ? (W - depth) / 2 : W - (W - depth) / 2;
    return (n - 1) * step + hb;
  }

  // coppia di barre ravvicinate: tra le due l'orbita non fa un giro intero,
  // si attraversano di fila; il secondo varco e' quasi allineato al primo
  function addPair(s, y, d) {
    const T = addGate(s, y, d, false);
    const sp = lerp(150, 125, d) + rand(s.gen) * 15;
    addGate(s, y + T + sp, d, false, lerp(25, 55, d));
    return T + sp + T;
  }

  function addChimney(s, y, d) {
    const W = CFG.W;
    // larghezza minima: il filo deve poter ruotare per intero (2*(L+R)=158)
    const cw = lerp(220, 184, d);
    const hgt = lerp(160, 300, d) * lerp(0.85, 1.15, rand(s.gen));
    const cx = pickGapX(s, cw, d, 4);
    const lw = cx - cw / 2;
    s.obs.push({ k: 'rect', x: -200, y, w: lw + 200, h: hgt, amp: 0, freq: 0, ph: 0 });
    s.obs.push({ k: 'rect', x: cx + cw / 2, y, w: W - cx - cw / 2 + 200, h: hgt, amp: 0, freq: 0, ph: 0 });
    return hgt;
  }

  function addSpinner(s, y, d) {
    const len = lerp(52, 82, d);
    const cx = CFG.W / 2 + (rand(s.gen) < 0.5 ? -1 : 1) * lerp(40, 75, rand(s.gen));
    const dir = rand(s.gen) < 0.5 ? -1 : 1;
    const w = dir * lerp(1.1, 2.0, d);
    s.obs.push({ k: 'spin', cx, cy: y + len, len, thick: 12, w, ph: rand(s.gen) * TAU });
    s.lastGapX = cx < CFG.W / 2 ? CFG.W * 0.75 : CFG.W * 0.25;
    return len * 2;
  }

  function generate(s, upTo) {
    while (s.genY < upTo) {
      const d = difficulty(s.genY);
      const table = [
        ['gate', 4],
        ['block', d > 0.04 ? 0.7 : 0],
        ['dots', d > 0.06 ? 0.9 : 0],
        ['diamond', d > 0.1 ? 0.7 : 0],
        ['teeth', d > 0.2 ? 1.2 : 0],
        ['slider', d > 0.08 ? 1 + 2 * d : 0],
        ['moving', d > 0.12 ? 1.5 + 2.5 * d : 0],
        ['pair', d > 0.1 ? 0.6 + 1.2 * d : 0],
        ['chimney', d > 0.24 ? 1.4 : 0],
        ['spin', d > 0.34 ? 1.4 + 0.6 * overdrive(s.genY) : 0],
      ];
      // nessun pattern ripetuto due volte di fila (tranne il cancello)
      let total = 0;
      for (const e of table) if (e[0] === s.lastPattern && e[0] !== 'gate') e[1] = 0;
      for (const e of table) total += e[1];
      let r = rand(s.gen) * total;
      let kind = 'gate';
      // il primo ostacolo e' sempre una barra: insegna la regola, poi si fa sul serio
      if (s.lastPattern === null) r = -1;
      for (const e of table) {
        if (r < e[1]) { kind = e[0]; break; }
        r -= e[1];
      }
      let h;
      if (kind === 'gate') h = addGate(s, s.genY, d, false);
      else if (kind === 'moving') h = addGate(s, s.genY, d, true);
      else if (kind === 'block') h = addBlock(s, s.genY, d);
      else if (kind === 'slider') h = addSlider(s, s.genY, d);
      else if (kind === 'pair') h = addPair(s, s.genY, d);
      else if (kind === 'dots') h = addDots(s, s.genY, d);
      else if (kind === 'diamond') h = addDiamond(s, s.genY, d);
      else if (kind === 'teeth') h = addTeeth(s, s.genY, d);
      else if (kind === 'chimney') h = addChimney(s, s.genY, d);
      else h = addSpinner(s, s.genY, d);
      s.lastPattern = kind;
      s.genY += h + lerp(225, 170, d) + rand(s.gen) * 40;
    }
  }

  // --- partita -------------------------------------------------------------

  function create(seed) {
    const s = {
      t: 0,
      startT: 0,
      started: false,
      dead: false,
      cause: null,
      ax: CFG.W / 2,
      ay: 0,
      th: PI,          // la sfera mobile parte a sinistra...
      dir: -1,         // ...e gira in senso orario verso l'alto
      omega: CFG.OMEGA,
      targetOmega: CFG.OMEGA,
      combo: 0,
      bestCombo: 0,
      taps: 0,
      perfects: 0,
      tide: CFG.TIDE_START,
      calm: CFG.CALM_0,
      surge: false,
      surges: 0,
      maxY: 0,
      score: 0,
      obs: [],
      gen: { s: (seed >>> 0) || 1 },
      genY: CFG.SAFE_ZONE,
      lastGapX: CFG.W / 2,
      lastPattern: null,
      events: [],
    };
    generate(s, 1400);
    return s;
  }

  function clone(s) {
    const c = Object.assign({}, s);
    c.obs = s.obs.slice();
    c.gen = { s: s.gen.s };
    c.events = [];
    return c;
  }

  function moverX(s) { return s.ax + CFG.L * Math.cos(s.th); }
  function moverY(s) { return s.ay + CFG.L * Math.sin(s.th); }

  function tap(s) {
    if (s.dead) return;
    const mx = moverX(s);
    const my = moverY(s);
    const off = wrapAngle(s.th - PI / 2);
    const perfect = Math.abs(off) < CFG.PERFECT;
    if (!s.started) {
      s.started = true;
      s.startT = s.t;
    }
    s.ax = mx;
    s.ay = my;
    s.th = wrapAngle(s.th + PI);
    s.dir = -s.dir;
    s.taps++;
    if (perfect) {
      s.combo = Math.min(s.combo + 1, CFG.COMBO_MAX);
      s.perfects++;
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      s.calm = calmMax(my);
      if (s.surge) {
        s.surge = false;
        s.tide -= CFG.SURGE_PUSH;
        s.events.push({ type: 'calm', x: mx, y: my });
      }
    } else {
      s.combo = 0;
    }
    s.targetOmega = CFG.OMEGA * (1 + CFG.COMBO_GAIN * s.combo);
    s.events.push({ type: perfect ? 'perfect' : 'tap', x: mx, y: my, combo: s.combo, off });
  }

  function die(s, cause, x, y) {
    s.dead = true;
    s.cause = cause;
    s.events.push({ type: 'death', cause, x, y });
  }

  function checkOrb(s, x, y) {
    const R = CFG.HIT;
    if (x < R || x > CFG.W - R) return die(s, 'wall', x, y), true;
    if (y - R * 0.5 < s.tide) return die(s, 'tide', x, y), true;
    for (let i = 0; i < s.obs.length; i++) {
      const o = s.obs[i];
      if (bottomOf(o) > y + R + 1 || topOf(o) < y - R - 1) continue;
      if (hitCircle(o, s.t, x, y, R)) return die(s, 'obstacle', x, y), true;
    }
    return false;
  }

  function step(s, dt) {
    if (s.dead) return;
    s.t += dt;
    s.omega += (s.targetOmega - s.omega) * Math.min(1, dt * 6);
    s.th = wrapAngle(s.th + s.dir * s.omega * dt);

    const mx = moverX(s);
    const my = moverY(s);
    const low = Math.min(s.ay, my);
    const high = Math.max(s.ay, my);

    if (s.started) {
      const k = clamp((s.t - s.startT) / CFG.TIDE_RAMP, 0, 1);
      const was = s.calm;
      s.calm -= dt;
      if (was > CFG.CALM_WARN && s.calm <= CFG.CALM_WARN) s.events.push({ type: 'warn' });
      if (s.calm <= 0 && !s.surge) {
        s.surge = true;
        s.surges++;
        s.events.push({ type: 'surge' });
      }
      const v = lerp(CFG.TIDE_V0, CFG.TIDE_V1, k);
      s.tide += (s.surge ? Math.max(v, CFG.SURGE_V) : v) * dt;
      if (low - s.tide > CFG.TIDE_LEASH) s.tide = low - CFG.TIDE_LEASH;
    }

    if (high > s.maxY) {
      s.maxY = high;
      s.score = Math.floor(s.maxY / CFG.UNIT);
    }

    generate(s, high + 1400);

    if (checkOrb(s, s.ax, s.ay)) return;
    if (checkOrb(s, mx, my)) return;

    // pulizia degli ostacoli ormai sotto la marea
    if (s.obs.length > 40) s.obs = s.obs.filter((o) => topOf(o) > s.tide - 400);
  }

  // --- bot: ricerca in avanti sulla simulazione esatta ---------------------
  // Serve per verificare che i livelli generati siano superabili e per la demo.

  function advance(s, frames) {
    for (let i = 0; i < frames; i++) {
      step(s, CFG.DT);
      if (s.dead) return false;
    }
    return true;
  }

  function lowY(s) { return Math.min(s.ay, moverY(s)); }

  function search(s, depth, stride) {
    if (depth === 0) {
      const c = clone(s);
      return advance(c, 24) ? lowY(c) - 0.02 * (c.ax - CFG.W / 2) ** 2 / CFG.W : -1e9;
    }
    const maxF = Math.ceil((TAU / s.omega) / CFG.DT);
    const c = clone(s);
    let best = -1e9;
    for (let k = 0; k <= maxF; k += stride) {
      if (k > 0 && !advance(c, stride)) break;
      const c2 = clone(c);
      tap(c2);
      const v = search(c2, depth - 1, stride + 2);
      if (v > best) best = v;
    }
    return best;
  }

  // restituisce quanti frame aspettare prima del prossimo tocco (-1: nessuna via).
  // robust: sceglie solo tocchi che funzionano anche 6 frame prima o dopo (giocatore umano)
  function botPlan(s, depth, robust) {
    const maxF = Math.ceil((TAU / s.omega) / CFG.DT);
    const c = clone(s);
    const vs = [];
    for (let k = 0; k <= maxF; k += 6) {
      if (k > 0 && !advance(c, 6)) break;
      const c2 = clone(c);
      tap(c2);
      vs.push(search(c2, (depth || 2) - 1, 8));
    }
    let best = -1e9;
    let bestK = -1;
    for (let i = 0; i < vs.length; i++) {
      const v = robust ? Math.min(vs[i], i > 0 ? vs[i - 1] : vs[i], i + 1 < vs.length ? vs[i + 1] : -1e9) : vs[i];
      if (v > best) { best = v; bestK = i * 6; }
    }
    return best > -1e8 ? bestK : -1;
  }

  const api = {
    CFG, create, clone, step, tap, moverX, moverY, hitCircle, rectX, circX, spinEnds, topOf, bottomOf,
    difficulty, calmMax, wrapAngle, advance, botPlan,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Perno = api;
})(typeof self !== 'undefined' ? self : this);
