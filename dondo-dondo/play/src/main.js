/*
 * DONDO DONDO — rendering, input, audio. La logica di gioco e' in game.js.
 * Parametri URL per i test: ?bot (gioca da solo), ?seed=N (livello fisso),
 * ?ff=S (avanza S secondi prima di disegnare), ?hold (il bot non riparte).
 */
(function () {
  'use strict';

  const P = window.Perno;
  const C = P.CFG;
  const params = new URLSearchParams(location.search);
  const BOT = params.has('bot');
  const SEED = params.get('seed');
  const FF = +params.get('ff') || 0;
  const HOLD = params.has('hold');

  const COL = {
    desk: '#e8e1d1',
    paper: '#f4efe3',
    grid: 'rgba(84, 128, 170, 0.16)',
    gridStrong: 'rgba(84, 128, 170, 0.32)',
    ink: '#211f1b',
    inkSoft: 'rgba(33, 31, 27, 0.22)',
    red: '#e03a2a',
    redSoft: 'rgba(224, 58, 42, 0.35)',
    blue: '#2442a6',
    blueDeep: '#172d78',
    // ostacoli: il colore dice come si comportano
    move: '#1d8a5a',     // pennarello verde: si muove
    moveSoft: 'rgba(29, 138, 90, 0.45)',
    spin: '#7446b8',     // pennarello viola: gira
    spinSoft: 'rgba(116, 70, 184, 0.4)',
  };
  // un solo carattere, due pesi: 400 per le frasi, 700 per numeri ed etichette
  const FONT = '"Space Mono", ui-monospace, Menlo, monospace';
  if (document.fonts) {
    document.fonts.load('400 16px "Space Mono"');
    document.fonts.load('700 16px "Space Mono"');
  }

  // --- memoria locale (facoltativa: il gioco funziona anche senza) --------
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ }
    },
  };
  // --- lingue: inglese predefinito, italiano a scelta ------------------------
  const STR = {
    en: {
      hint1: 'Tap when the red ball', hint2: 'reaches the mark at the top.', hint3: 'EVERY TAP SWAPS THE PIVOT',
      rhythm: 'RHYTHM ×', best: 'BEST ', last: 'LAST', newBest: 'NEW BEST', meters: 'METERS',
      close: (g) => 'only ' + g + ' m from your best', perfect: 'PERFECT ', retry: 'TAP TO RETRY',
      privacy: 'Privacy settings', surge: 'THE TIDE IS RISING!', surge2: 'HIT THE RED MARK',
      tips: {
        tide: ['Hit the red mark to calm the tide: if the fuse burns out, the tide surges.', 'The tide keeps speeding up: perfect taps make you spin faster.', 'Don\'t wait too long: every wasted turn is time handed to the tide.'],
        wall: ['The edge of the page is a wall: watch the dotted circle.', 'Tapping at the side moves the pivot: use it to get back to the middle.'],
        obstacle: ['The dotted circle is the red ball\'s path: if it hits something, swap the pivot sooner.', 'Two quick taps reverse the spin: handy when an obstacle is closing in.', 'Line the pivot up under the gap before climbing.'],
      },
    },
    it: {
      hint1: 'Tocca quando la sfera', hint2: 'rossa è sul segno in alto.', hint3: 'OGNI TOCCO CAMBIA PERNO',
      rhythm: 'RITMO ×', best: 'RECORD ', last: 'ULTIMA', newBest: 'NUOVO RECORD', meters: 'METRI',
      close: (g) => 'a soli ' + g + ' m dal record', perfect: 'PERFETTI ', retry: 'TOCCA PER RIPROVARE',
      privacy: 'Impostazioni privacy', surge: 'LA MAREA SALE!', surge2: 'TOCCA IL SEGNO ROSSO',
      tips: {
        tide: ['Tocca il segno rosso per calmare la marea: se la miccia finisce, la marea si gonfia.', 'La marea sale sempre più in fretta: i tocchi perfetti ti fanno girare più veloce.', 'Non aspettare troppo: ogni giro a vuoto è tempo regalato alla marea.'],
        wall: ['Il bordo del foglio è un muro: guarda il cerchio tratteggiato.', 'Toccare di lato sposta il perno: usalo per rientrare al centro.'],
        obstacle: ['Il cerchio tratteggiato è la strada della sfera rossa: se tocca un ostacolo, cambia perno prima.', 'Due tocchi rapidi invertono il giro: utile quando un ostacolo arriva addosso.', 'Allinea il perno sotto il varco prima di salire.'],
      },
    },
  };
  let lang = params.get('lang') || store.get('perno.lang', 'en');
  if (!STR[lang]) lang = 'en';
  let T = STR[lang];
  function setLang(l) {
    lang = l;
    T = STR[l];
    document.documentElement.lang = l;
    store.set('perno.lang', l);
  }
  document.documentElement.lang = lang;

  let best = store.get('perno.best', 0);
  let lastScore = store.get('perno.last', 0);
  let runs = store.get('perno.runs', 0);

  // --- canvas ---------------------------------------------------------------
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let dpr = 1, cw = 0, ch = 0, colX = 0, colW = 0, scale = 1, viewH = 0, safeTop = 0;

  // sonda per la safe area (notch): una variabile CSS non risolverebbe env()
  const safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden';
  document.body.appendChild(safeProbe);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    // stessa porzione di livello visibile su ogni schermo (iPad e desktop compresi):
    // la colonna non supera il rapporto 0.52 di uno smartphone, ai lati resta la scrivania
    colW = Math.min(cw, ch * 0.52);
    colX = (cw - colW) / 2;
    scale = colW / C.W;
    viewH = ch / scale;
    safeTop = safeProbe.offsetHeight || 0;
  }
  window.addEventListener('resize', resize);
  resize();

  const sx = (x) => colX + x * scale;
  const sy = (y) => ch - (y - camY) * scale;

  // --- audio sintetizzato (nessun file esterno) -----------------------------
  let ac = null, master = null, noiseBuf = null;
  let muted = !!store.get('perno.muted', false);
  function setMuted(m) {
    muted = m;
    store.set('perno.muted', m);
    if (master) master.gain.value = m ? 0 : 0.55;
  }
  function audio() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.55;
        master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f, dur, type, vol, f2, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }
  // scala pentatonica: una serie di perfetti suona come una melodia che sale
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const sfx = {
    tap() { tone(210, 0.07, 'triangle', 0.25, 140); noise(0.03, 0.12, 2500); },
    perfect(combo) {
      const f = 392 * Math.pow(2, PENTA[Math.min(combo, PENTA.length - 1)] / 12);
      tone(f, 0.14, 'triangle', 0.26);
      tone(f * 2, 0.06, 'sine', 0.08);
    },
    warn() { tone(880, 0.05, 'square', 0.07); tone(880, 0.05, 'square', 0.07, null, 0.12); },
    surge() { tone(70, 0.6, 'sawtooth', 0.14, 140); noise(0.6, 0.25, 300); },
    calm() { tone(1047, 0.12, 'sine', 0.14, 523); noise(0.25, 0.18, 900); },
    death() { noise(0.4, 0.45, 500); tone(160, 0.55, 'sawtooth', 0.12, 38); },
    record() { [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.16, 'triangle', 0.2, null, i * 0.08)); },
  };
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* niente */ } };

  // --- stato di presentazione ----------------------------------------------
  let game, mode, camY, modeT, shake, recordPassed, newRecord, trail, fx, texts, botWait, botCool = 0, tipIndex = 0;

  function newGame() {
    const seed = SEED ? +SEED : (Math.random() * 2 ** 32) >>> 0;
    game = P.create(seed);
    mode = 'play';
    modeT = 0;
    camY = game.ay - viewH * 0.34;
    shake = 0;
    recordPassed = false;
    newRecord = false;
    trail = [];
    fx = [];
    texts = [];
    botWait = -1;
  }

  function burst(x, y, n, color, speed, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      fx.push({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.35, size: size * (0.5 + Math.random()), color });
    }
  }
  function ring(x, y, color, maxR, max) { fx.push({ k: 'ring', x, y, life: 0, max, maxR, color }); }
  function floatText(str, x, y, color, size) { texts.push({ str, x, y, color, size, life: 0, max: 0.8 }); }

  function handleEvents() {
    for (const e of game.events) {
      if (e.type === 'tap') {
        sfx.tap(); buzz(6);
        burst(e.x, e.y, 5, COL.ink, 90, 2.5);
        ring(e.x, e.y, COL.inkSoft, 22, 0.25);
      } else if (e.type === 'perfect') {
        sfx.perfect(e.combo); buzz(10);
        burst(e.x, e.y, 7, COL.red, 120, 2.8);
        ring(e.x, e.y, COL.red, 30 + e.combo * 2, 0.35);
        if (e.combo >= 2) floatText('×' + e.combo, e.x + 26, e.y + 10, COL.red, 13 + Math.min(e.combo, 10));
      } else if (e.type === 'warn') {
        sfx.warn();
      } else if (e.type === 'surge') {
        sfx.surge(); buzz(30);
        shake = Math.max(shake, 4);
      } else if (e.type === 'calm') {
        sfx.calm();
        burst(e.x, game.tide + 10, 14, COL.blue, 160, 3);
        floatText(lang === 'it' ? 'CALMA' : 'CALM', e.x, e.y + 30, COL.blue, 15);
      } else if (e.type === 'death') {
        sfx.death(); buzz(40);
        burst(e.x, e.y, 26, COL.red, 260, 3.5);
        burst(e.x, e.y, 14, COL.ink, 200, 3);
        ring(e.x, e.y, COL.red, 70, 0.5);
        shake = 12;
        mode = 'dying';
        modeT = 0;
        endRun();
      }
    }
    game.events.length = 0;
  }

  // servizi nativi (AdMob); nel browser sono funzioni vuote
  const PF = window.Platform || {
    maybeShowAd: () => false, showPrivacyOptions() {},
    privacyRequired: false,
  };
  let adShowing = false;
  let prerollDone = false;
  let wasPaused = false;

  function endRun() {
    runs++;
    newRecord = game.score > best;
    if (newRecord) best = game.score;
    lastScore = game.score;
    store.set('perno.best', best);
    store.set('perno.last', lastScore);
    store.set('perno.runs', runs);
    tipIndex++;
  }

  // --- input ------------------------------------------------------------------
  // selettore EN · IT in alto a sinistra, solo a partita ferma
  const langVisible = () => (mode === 'play' && !game.started) || mode === 'over';
  const LANG_BOX = { w: 92, h: 44 };
  function hitLang(x, y) {
    return langVisible() && x >= colX && x <= colX + LANG_BOX.w && y <= safeTop + LANG_BOX.h;
  }
  // altoparlante accanto alla lingua: suono acceso / spento
  const SOUND_BOX = { w: 48 };
  function hitSound(x, y) {
    return langVisible() && x > colX + LANG_BOX.w && x <= colX + LANG_BOX.w + SOUND_BOX.w && y <= safeTop + LANG_BOX.h;
  }

  // pulsanti della schermata di game over (posizioni calcolate in drawOver)
  const buttons = { privacy: null };
  const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function press(x, y) {
    audio();
    if (adShowing || PF.paused) return;
    if (x !== undefined && hitLang(x, y)) {
      setLang(lang === 'en' ? 'it' : 'en');
      return;
    }
    if (x !== undefined && hitSound(x, y)) {
      setMuted(!muted);
      if (!muted) sfx.tap();
      return;
    }
    if (mode === 'over' && x !== undefined) {
      if (inRect(buttons.privacy, x, y)) { PF.showPrivacyOptions(); return; }
    }
    if (mode === 'play') {
      if (BOT) return;
      P.tap(game);
      handleEvents();
      // GameDistribution: annuncio iniziale al primo tocco (l'SDK mette in pausa il gioco)
      if (PF.preroll && !prerollDone) { prerollDone = true; PF.showBreak(); }
    } else if (mode === 'over' && modeT > 0.35) {
      newGame();
      // GameDistribution: annuncio sul tocco di "riprova"; la frequenza la decide l'SDK
      if (PF.adOnRetry) PF.showBreak();
    }
  }
  // preventDefault toglie il focus automatico: dentro un iframe (itch.io) la tastiera non arriverebbe al gioco
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); window.focus(); press(e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyM') { setMuted(!muted); return; }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); press(); }
  });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // --- aggiornamento -----------------------------------------------------------
  let acc = 0;
  function update(dt) {
    // pausa pubblicitaria (GameDistribution): gioco fermo e audio spento
    const paused = !!PF.paused;
    if (paused !== wasPaused) {
      wasPaused = paused;
      if (ac) { if (paused) ac.suspend(); else ac.resume(); }
    }
    if (paused) return;
    modeT += dt;
    if (mode === 'play') {
      acc += dt;
      while (acc >= C.DT && !game.dead) {
        if (BOT && botStep()) { /* il bot ha toccato */ }
        P.step(game, C.DT);
        acc -= C.DT;
      }
      handleEvents();
      if (!recordPassed && best > 0 && game.score > best && mode === 'play') {
        recordPassed = true;
        sfx.record();
        floatText(T.newBest, game.ax, game.ay + 40, COL.red, 18);
      }
      const mx = P.moverX(game), my = P.moverY(game);
      trail.push(mx, my);
      if (trail.length > 24) trail.splice(0, 2);
    } else if (mode === 'dying' && modeT > 0.6) {
      mode = 'over';
      modeT = 0;
      // annuncio nella pausa naturale tra la sconfitta e i risultati, mai durante il gioco
      adShowing = PF.maybeShowAd(() => { adShowing = false; modeT = 0; });
    } else if (mode === 'over' && BOT && !HOLD && modeT > 1.5) {
      newGame();
    }

    const target = game.ay - viewH * 0.34;
    camY += (target - camY) * Math.min(1, dt * 3.5);
    shake *= Math.pow(0.002, dt);

    for (const f of fx) {
      f.life += dt;
      if (f.k === 'dot') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 300 * dt; f.vx *= 0.97; }
    }
    fx = fx.filter((f) => f.life < f.max);
    for (const t of texts) { t.life += dt; t.y += 30 * dt; }
    texts = texts.filter((t) => t.life < t.max);
  }

  function botStep() {
    if (botCool > 0) { botCool--; return false; }
    if (botWait < 0) botWait = P.botPlan(game, 2);
    if (botWait < 0) { botCool = 12; return false; } // nessuna via: riprova tra poco
    if (botWait-- === 0) { P.tap(game); return true; }
    return false;
  }

  // --- disegno -------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str, x, y, size, color, opts) {
    opts = opts || {};
    ctx.font = (opts.weight || 700) + ' ' + size + 'px ' + FONT;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.base || 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawPaper() {
    ctx.fillStyle = COL.desk;
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = COL.paper;
    ctx.fillRect(colX, 0, colW, ch);
    // quadretti che scorrono con il mondo
    const g = 24;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.grid;
    ctx.beginPath();
    for (let x = g; x < C.W; x += g) { ctx.moveTo(Math.round(sx(x)) + 0.5, 0); ctx.lineTo(Math.round(sx(x)) + 0.5, ch); }
    const y0 = Math.floor(camY / g) * g;
    for (let y = y0; y < camY + viewH + g; y += g) { const yy = Math.round(sy(y)) + 0.5; ctx.moveTo(colX, yy); ctx.lineTo(colX + colW, yy); }
    ctx.stroke();
    // margine rosso del quaderno
    ctx.strokeStyle = COL.redSoft;
    ctx.beginPath(); ctx.moveTo(sx(12), 0); ctx.lineTo(sx(12), ch); ctx.stroke();
  }

  function drawMarkers() {
    // tacche ogni 50 m
    const step = 50 * C.UNIT;
    const first = Math.max(step, Math.ceil(camY / step) * step);
    for (let y = first; y < camY + viewH; y += step) {
      const yy = sy(y);
      ctx.strokeStyle = COL.gridStrong;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx(C.W - 16), yy); ctx.lineTo(sx(C.W), yy); ctx.stroke();
      text(y / C.UNIT + ' M', sx(C.W - 20), yy, 10, COL.gridStrong, { align: 'right' });
    }
    // linea del record e dell'ultima partita: "ero vicinissimo" si vede
    const lines = [];
    if (!game.started && mode === 'play') return; // la schermata iniziale ha gia' il titolo
    if (lastScore > 0 && lastScore !== best) lines.push([lastScore, T.last, COL.inkSoft]);
    if (best > 0) lines.push([best, T.best.trim(), COL.red]);
    for (const [v, label, color] of lines) {
      const y = v * C.UNIT;
      if (y < camY - 10 || y > camY + viewH + 10) continue;
      const yy = sy(y);
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(colX, yy); ctx.lineTo(colX + colW, yy); ctx.stroke();
      ctx.setLineDash([]);
      text(label + ' ' + v + ' M', sx(18), yy - 10, 11, color, { align: 'left' });
    }
  }

  // tratteggio a matita dentro i camini: pareti alte, da leggere come "muro"
  function hatch(x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(244,239,227,0.22)';
    ctx.lineWidth = 2;
    const g = 11 * scale;
    ctx.beginPath();
    for (let d = -h; d < w; d += g) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); }
    ctx.stroke();
    ctx.restore();
  }

  // frecce sul pezzo che si muove: il movimento si capisce anche da fermo
  function arrows(cx, cy) {
    const s = 4 * scale;
    ctx.strokeStyle = 'rgba(244,239,227,0.9)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 1.2, cy - s); ctx.lineTo(cx - s * 2.2, cy); ctx.lineTo(cx - s * 1.2, cy + s);
    ctx.moveTo(cx + s * 1.2, cy - s); ctx.lineTo(cx + s * 2.2, cy); ctx.lineTo(cx + s * 1.2, cy + s);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }

  function drawObstacles() {
    const t = game.t;
    const top = camY + viewH + 40;
    const bottom = camY - 40;
    for (const o of game.obs) {
      if (o.k === 'rect') {
        if (o.y > top || o.y + o.h < bottom) continue;
        const x = P.rectX(o, t);
        const moving = !!o.amp;
        if (moving) {
          // escursione del movimento, tratteggiata: il pericolo e' leggibile prima
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = COL.moveSoft;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (o.slide) {
            // blocco che scorre: tutta la corsa, da un estremo all'altro
            ctx.moveTo(sx(o.x - o.amp), sy(o.y + o.h / 2)); ctx.lineTo(sx(o.x + o.w + o.amp), sy(o.y + o.h / 2));
          } else {
            const edge = o.x < 0 ? o.x + o.w : o.x;
            ctx.moveTo(sx(edge - o.amp), sy(o.y + o.h / 2)); ctx.lineTo(sx(edge + o.amp), sy(o.y + o.h / 2));
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const bx = sx(x), by = sy(o.y + o.h), bw = o.w * scale, bh = o.h * scale;
        ctx.fillStyle = 'rgba(33,31,27,0.18)';
        roundRect(bx + 3, by + 3, bw, bh, 4 * scale);
        ctx.fill();
        ctx.fillStyle = moving ? COL.move : COL.ink;
        roundRect(bx, by, bw, bh, 4 * scale);
        ctx.fill();
        if (o.h > 30) hatch(bx, by, bw, bh);
        if (moving) {
          // le frecce vanno vicino al bordo del varco (le barre escono dallo schermo)
          const ax = o.slide ? x + o.w / 2 : o.x < 0 ? x + o.w - 22 : x + 22;
          arrows(sx(ax), by + bh / 2);
        }
      } else if (o.k === 'circ') {
        if (o.cy - o.r > top || o.cy + o.r < bottom) continue;
        const x = P.circX(o, t);
        if (o.amp) {
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = COL.moveSoft;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(sx(o.cx - o.amp - o.r), sy(o.cy)); ctx.lineTo(sx(o.cx + o.amp + o.r), sy(o.cy)); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = 'rgba(33,31,27,0.18)';
        ctx.beginPath(); ctx.arc(sx(x) + 3, sy(o.cy) + 3, o.r * scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = o.amp ? COL.move : COL.ink;
        ctx.beginPath(); ctx.arc(sx(x), sy(o.cy), o.r * scale, 0, Math.PI * 2); ctx.fill();
        if (o.amp) arrows(sx(x), sy(o.cy));
      } else if (o.k === 'poly') {
        if (o.y0 > top || o.y1 < bottom) continue;
        const p = o.pts;
        for (let pass = 0; pass < 2; pass++) {
          const off = pass === 0 ? 3 : 0;
          ctx.fillStyle = pass === 0 ? 'rgba(33,31,27,0.18)' : COL.ink;
          ctx.beginPath();
          for (let i = 0; i < p.length; i += 2) {
            if (i === 0) ctx.moveTo(sx(p[i]) + off, sy(p[i + 1]) + off);
            else ctx.lineTo(sx(p[i]) + off, sy(p[i + 1]) + off);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else {
        if (o.cy - o.len > top || o.cy + o.len < bottom) continue;
        const e = P.spinEnds(o, t);
        ctx.strokeStyle = COL.spinSoft;
        ctx.setLineDash([3, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx(o.cx), sy(o.cy), (o.len + o.thick / 2) * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        ctx.strokeStyle = COL.spin;
        ctx.lineWidth = o.thick * scale;
        ctx.beginPath(); ctx.moveTo(sx(e[0]), sy(e[1])); ctx.lineTo(sx(e[2]), sy(e[3])); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = COL.paper;
        ctx.beginPath(); ctx.arc(sx(o.cx), sy(o.cy), 3 * scale, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawPlayer() {
    const ax = sx(game.ax), ay = sy(game.ay);
    const mx = sx(P.moverX(game)), my = sy(P.moverY(game));
    const L = C.L * scale, R = C.R * scale;

    // orbita tratteggiata: mostra dove passera' la sfera rossa
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = COL.inkSoft;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ax, ay, L, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // zona del tocco perfetto (in alto)
    const pulse = game.combo > 0 ? 0.6 + 0.4 * Math.sin(game.t * 10) : 1;
    ctx.strokeStyle = COL.red;
    ctx.globalAlpha = 0.55 * pulse + 0.2;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ax, ay, L, -Math.PI / 2 - C.PERFECT, -Math.PI / 2 + C.PERFECT); ctx.stroke();
    ctx.globalAlpha = 1;

    // miccia della calma: si accorcia verso il segno; quando finisce la marea si gonfia
    if (game.started && mode === 'play') {
      const fr = R + 7 * scale;
      if (game.surge) {
        const p = 0.5 + 0.5 * Math.sin(game.t * 18);
        ctx.strokeStyle = COL.blue;
        ctx.globalAlpha = 0.5 + 0.5 * p;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(ax, ay, L + fr * 0.6, -Math.PI / 2 - C.PERFECT * 1.4, -Math.PI / 2 + C.PERFECT * 1.4); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        const k = Math.max(0, game.calm / P.calmMax(game.ay));
        const half = C.PERFECT + 1.1 * k;
        const warn = game.calm < C.CALM_WARN;
        ctx.strokeStyle = warn ? COL.blue : COL.red;
        ctx.globalAlpha = warn ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(game.t * 16)) : 0.5;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(ax, ay, L + fr * 0.6, -Math.PI / 2 - half, -Math.PI / 2 + half); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = 1;
      }
    }

    // freccia sull'orbita: ogni tocco inverte il verso, qui si legge dove va
    if (mode === 'play') {
      const a = game.th + game.dir * 0.42;
      const px = sx(game.ax + C.L * Math.cos(a)), py = sy(game.ay + C.L * Math.sin(a));
      const tx = -Math.sin(a) * game.dir, ty = -Math.cos(a) * game.dir; // tangente in coordinate schermo
      const nx = Math.cos(a), ny = -Math.sin(a);
      const s = 6;
      ctx.strokeStyle = COL.inkSoft;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - tx * s + nx * s, py - ty * s + ny * s);
      ctx.lineTo(px, py);
      ctx.lineTo(px - tx * s - nx * s, py - ty * s - ny * s);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // scia
    if (trail.length > 4 && mode === 'play') {
      ctx.lineCap = 'round';
      for (let i = 2; i < trail.length; i += 2) {
        const a = i / trail.length;
        ctx.strokeStyle = 'rgba(224,58,42,' + (a * 0.35).toFixed(3) + ')';
        ctx.lineWidth = R * 1.6 * a;
        ctx.beginPath();
        ctx.moveTo(sx(trail[i - 2]), sy(trail[i - 1]));
        ctx.lineTo(sx(trail[i]), sy(trail[i + 1]));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    if (mode !== 'play') return; // dopo l'impatto restano solo gli schizzi

    // filo
    ctx.strokeStyle = COL.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.stroke();

    // perno
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.paper;
    ctx.beginPath(); ctx.arc(ax, ay, R * 0.32, 0, Math.PI * 2); ctx.fill();

    // sfera mobile
    ctx.fillStyle = COL.red;
    ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(mx - R * 0.3, my - R * 0.3, R * 0.3, 0, Math.PI * 2); ctx.fill();
  }

  function drawTide() {
    const t = game.t;
    const base = sy(game.tide);
    // la marea si annuncia dal bordo inferiore anche quando e' fuori schermo
    const near = game.surge && mode === 'play' ? 1.6 : 1 - (base - ch) / (220 * scale);
    if (base > ch - 20 && near > 0) {
      const h = 70 * Math.min(1.8, near);
      const g = ctx.createLinearGradient(0, ch - h, 0, ch);
      g.addColorStop(0, 'rgba(36,66,166,0)');
      g.addColorStop(1, 'rgba(36,66,166,' + (0.45 * Math.min(1, near)).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(colX, ch - h, colW, h);
    }
    if (base > ch + 20) return;
    const wave = (x, k) => base - (6 * Math.sin(x * 0.035 + t * 2.2 + k) + 3 * Math.sin(x * 0.09 - t * 3.1)) * scale;
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? 'rgba(36,66,166,0.35)' : COL.blue;
      const lift = layer === 0 ? 7 * scale : 0;
      ctx.beginPath();
      ctx.moveTo(colX, ch);
      for (let x = 0; x <= C.W; x += 8) ctx.lineTo(sx(x), wave(x, layer * 1.7) - lift);
      ctx.lineTo(colX + colW, ch);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFx() {
    for (const f of fx) {
      const a = 1 - f.life / f.max;
      if (f.k === 'dot') {
        ctx.fillStyle = f.color;
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.size * scale, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), (C.R + (f.maxR - C.R) * (1 - a)) * scale, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of texts) {
      ctx.globalAlpha = 1 - t.life / t.max;
      text(t.str, sx(t.x), sy(t.y), t.size, t.color);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const top = 18 + safeTop;
    const cx = colX + colW / 2;
    if (game.started || mode !== 'play') {
      text(String(game.score), cx, top + 30, 44, COL.ink);
      if (game.surge && mode === 'play') {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(game.t * 12);
        text(T.surge, cx, top + 64, 14, COL.blue);
        text(T.surge2, cx, top + 84, 11, COL.red);
        ctx.globalAlpha = 1;
      } else if (game.combo >= 2 && mode === 'play') {
        text(T.rhythm + game.combo, cx, top + 62, 12, COL.red);
      }
    }
    if (best > 0) text(T.best + best, colX + colW - 14, top + 6, 11, COL.red, { align: 'right' });

    if (!game.started && mode === 'play') {
      const TITLE = 'DONDO DONDO';
      // monospaziato: ~0.62 em per carattere, il titolo resta dentro lo schermo
      const big = Math.min(52, (colW - 48) / (TITLE.length * 0.62));
      // il titolo sta nello spazio libero tra la prima barra e l'orbita
      const free0 = sy(C.SAFE_ZONE), free1 = sy(game.ay + C.L + C.R);
      const y = (free0 + free1) / 2 - 50;
      text(TITLE, cx, y, big, COL.ink);
      ctx.fillStyle = COL.red;
      ctx.fillRect(cx - 18, y + big * 0.62, 36, 3);
      text(T.hint1, cx, y + 62, 14, COL.ink, { weight: 400 });
      text(T.hint2, cx, y + 82, 14, COL.ink, { weight: 400 });
      text(T.hint3, cx, y + 116, 11, COL.red);
    }
  }

  function drawLang() {
    const y = safeTop + 24;
    const x = colX + 16;
    text('EN', x, y, 12, lang === 'en' ? COL.ink : COL.inkSoft, { align: 'left' });
    text('·', x + 30, y, 12, COL.inkSoft);
    text('IT', x + 40, y, 12, lang === 'it' ? COL.ink : COL.inkSoft, { align: 'left' });
    drawSpeaker(colX + LANG_BOX.w + 8, y);
  }

  function drawSpeaker(x, y) {
    ctx.fillStyle = COL.ink;
    ctx.strokeStyle = COL.ink;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 4, y - 3);
    ctx.lineTo(x + 9, y - 7);
    ctx.lineTo(x + 9, y + 7);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    if (muted) {
      ctx.strokeStyle = COL.red;
      ctx.moveTo(x + 13, y - 4); ctx.lineTo(x + 21, y + 4);
      ctx.moveTo(x + 21, y - 4); ctx.lineTo(x + 13, y + 4);
    } else {
      ctx.arc(x + 10, y, 5, -0.8, 0.8);
      ctx.moveTo(x + 10 + 9 * Math.cos(-0.8), y + 9 * Math.sin(-0.8));
      ctx.arc(x + 10, y, 9, -0.8, 0.8);
    }
    ctx.stroke();
  }

  function drawOver() {
    const a = Math.min(1, modeT / 0.2);
    ctx.globalAlpha = a * 0.88;
    ctx.fillStyle = COL.paper;
    ctx.fillRect(colX, 0, colW, ch);
    ctx.globalAlpha = a;
    const cx = colX + colW / 2;
    let y = ch * 0.3;
    text(T.meters, cx, y - 52, 10, 'rgba(33,31,27,0.55)');
    text(String(game.score), cx, y, Math.min(76, colW * 0.2), COL.ink);
    y += 56;
    if (newRecord) {
      text(T.newBest, cx, y, 12, COL.red);
    } else {
      text(T.best + best, cx, y, 12, COL.red);
      const gap = best - game.score;
      if (gap > 0 && gap <= Math.max(15, best * 0.2)) text(T.close(gap), cx, y + 24, 13, COL.ink, { weight: 400 });
    }
    y += 70;
    ctx.fillStyle = COL.inkSoft;
    ctx.fillRect(cx - 60, y - 22, 120, 1);
    text(T.perfect + game.perfects + '/' + game.taps + '   ' + T.rhythm + game.bestCombo, cx, y, 11, 'rgba(33,31,27,0.7)');
    const tips = T.tips[game.cause] || T.tips.obstacle;
    // preso dalla piena: il consiglio spiega la miccia
    const tip = game.cause === 'tide' && game.surges > 0 ? tips[0] : tips[tipIndex % tips.length];
    wrapText(tip, cx, y + 40, Math.min(colW - 64, 300), 13);
    if (modeT > 0.35) {
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(modeT * 5));
      text(T.retry, cx, ch * 0.8, 13, COL.ink);
    }
    ctx.globalAlpha = a;
    buttons.privacy = null;
    if (window.DONDO_CONFIG && window.DONDO_CONFIG.debug && PF.diag) {
      wrapText(PF.diag, cx, ch - 70, colW - 32, 10);
    }
    if (PF.privacyRequired) {
      const py = ch - 28;
      text(T.privacy, cx, py, 11, 'rgba(33,31,27,0.55)', { weight: 400 });
      buttons.privacy = { x: cx - 110, y: py - 20, w: 220, h: 40 };
    }
    ctx.globalAlpha = 1;
  }

  function wrapText(str, cx, y, maxW, size) {
    ctx.font = '400 ' + size + 'px ' + FONT;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const words = str.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        text(line, cx, y, size, 'rgba(33,31,27,0.7)', { weight: 400 });
        line = w;
        y += size * 1.5;
      } else line = test;
    }
    if (line) text(line, cx, y, size, 'rgba(33,31,27,0.7)', { weight: 400 });
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shx = shake > 0.3 ? (Math.random() * 2 - 1) * shake : 0;
    const shy = shake > 0.3 ? (Math.random() * 2 - 1) * shake : 0;
    ctx.translate(shx, shy);
    drawPaper();
    // il livello si disegna solo dentro la colonna di gioco (su iPad e desktop ai lati c'e' la scrivania)
    ctx.save();
    ctx.beginPath();
    ctx.rect(colX, 0, colW, ch);
    ctx.clip();
    drawMarkers();
    drawObstacles();
    drawPlayer();
    drawTide();
    drawFx();
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud();
    if (mode === 'over') drawOver();
    if (langVisible()) drawLang();
  }

  // --- ciclo principale ----------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // su iPhone la safe area arriva dopo il primo layout, senza evento resize
    safeTop = safeProbe.offsetHeight || 0;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  newGame();
  for (let i = 0; i < FF / C.DT; i++) update(C.DT);
  window.__perno = { get game() { return game; }, get mode() { return mode; } };
  requestAnimationFrame(frame);
})();
