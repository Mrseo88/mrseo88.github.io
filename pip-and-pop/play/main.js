// PIP & POP — rendering, input, audio. La logica di gioco è in game.js.
(function () {
  'use strict';
  const { C, Game, makeBot, partsOf, beadLayout } = window.Breathe;
  const params = new URLSearchParams(location.search);
  const BOT = params.has('bot') ? makeBot(parseFloat(params.get('bot')) || 1, 3) : null;

  const COL = {
    bg0: '#fff6ea', bg1: '#ffe0d2',          // crema → pesca
    light: '#ff6b3d', lightRim: '#b8401c', accent: '#d9481f',
    trail: '255,107,61',
    graze: '#00a6c7',
    text: '#2d2350', dim: 'rgba(45,35,80,0.55)', faint: 'rgba(45,35,80,0.16)',
  };
  const F_TITLE = "'Fredoka', system-ui, sans-serif";
  const F_UI = "'Fredoka', system-ui, sans-serif";
  const font = (w, px, fam) => `${w} ${px}px ${fam || F_UI}`;
  // Il canvas non scarica i web font da solo: li chiediamo esplicitamente (senza rete si usa il font di sistema).
  if (document.fonts) ['400 13px Fredoka', '500 15px Fredoka', '600 15px Fredoka', '700 40px Fredoka'].forEach(f => document.fonts.load(f).catch(() => {}));

  // ---------- storage (sempre protetto) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('breathe.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('breathe.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  let best = store.get('best', 0);
  let plays = store.get('plays', 0);
  let muted = store.get('muted', false);

  // ---------- canvas ----------
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d', { alpha: false });
  let H = 760, scale = 1, dpr = 1, offX = 0;
  let safeTop = 0;          // spazio occupato da notch/barra di stato (iPhone), in unità logiche

  const SOUND_BTN = { x: C.W - 32, y: 36, r: 20 };
  // env(safe-area-inset-top) si legge solo da una proprietà reale, non da una variabile CSS.
  const safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(safeProbe);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vw = window.innerWidth, vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    // Larghezza logica fissa 400; l'altezza segue il formato (limitata per tablet/desktop).
    const playW = Math.min(vw, vh * 0.62);
    scale = (playW / C.W) * dpr;
    offX = (cv.width - C.W * scale) / 2;
    H = Math.max(600, Math.min(900, cv.height / scale));
    safeTop = (parseFloat(getComputedStyle(safeProbe).paddingTop) || 0) * dpr / scale;
    SOUND_BTN.y = 36 + safeTop;
  }
  window.addEventListener('resize', resize);
  // Su iOS l'area sicura viene comunicata alla pagina un attimo dopo l'avvio, senza evento resize.
  let lastInset = '';
  setInterval(() => { const v = getComputedStyle(safeProbe).paddingTop; if (v !== lastInset) { lastInset = v; resize(); } }, 500);
  resize();

  // Sprite del bagliore, pre-renderizzato una volta (niente shadowBlur per frame).
  const glow = document.createElement('canvas');
  glow.width = glow.height = 128;
  (function () {
    const g = glow.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,130,70,0.45)');
    gr.addColorStop(0.3, 'rgba(255,130,70,0.18)');
    gr.addColorStop(1, 'rgba(255,130,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  })();

  // ---------- tavolozze e trame degli ostacoli ----------
  // Colori pastello saturi, lontani dall'ambra delle luci, così il giocatore resta sempre leggibile.
  const THEMES = [
    { base: '#ff7eb6', light: '#ffc4de', dark: '#b8467b', motif: 'stripes' },
    { base: '#46d9a8', light: '#b8f6df', dark: '#1d8f6a', motif: 'dots' },
    { base: '#a68cff', light: '#dcd0ff', dark: '#6447c9', motif: 'waves' },
    { base: '#52c2ff', light: '#c2eaff', dark: '#2479b8', motif: 'zigzag' },
    { base: '#b4e65a', light: '#e8ffbe', dark: '#6f9a26', motif: 'cross' },
    { base: '#ffd23f', light: '#fff2b3', dark: '#c99a00', motif: 'hearts' },
  ];
  const TILE = 24, RES = 3;
  function makeTile(t) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE * RES;
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.fillStyle = t.base; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = t.light; g.strokeStyle = t.light; g.lineCap = 'round'; g.lineJoin = 'round';
    const T = TILE;
    switch (t.motif) {
      case 'stripes':
        g.lineWidth = 5;
        for (let k = -T; k <= T; k += T / 2) { g.beginPath(); g.moveTo(k, T); g.lineTo(k + T, 0); g.stroke(); }
        break;
      case 'dots':
        for (const [x, y] of [[6, 6], [18, 18]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
        break;
      case 'waves':
        g.lineWidth = 2;
        for (const y0 of [7, 19]) {
          g.beginPath();
          for (let x = 0; x <= T; x++) { const y = y0 + 2.5 * Math.sin((x / T) * Math.PI * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
        break;
      case 'zigzag':
        g.lineWidth = 2;
        for (const y0 of [8, 20]) { g.beginPath(); g.moveTo(0, y0); g.lineTo(6, y0 - 4); g.lineTo(12, y0); g.lineTo(18, y0 - 4); g.lineTo(24, y0); g.stroke(); }
        break;
      case 'cross':
        g.lineWidth = 2;
        for (const [x, y] of [[6, 6], [18, 18]]) { g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y - 3); g.lineTo(x, y + 3); g.stroke(); }
        break;
      case 'hearts':
        for (const [x, y] of [[6, 7], [18, 19]]) {
          g.beginPath(); g.moveTo(x, y + 3);
          g.bezierCurveTo(x - 5, y - 1, x - 2, y - 5, x, y - 2);
          g.bezierCurveTo(x + 2, y - 5, x + 5, y - 1, x, y + 3); g.fill();
        }
        break;
    }
    return c;
  }
  const PATTERNS = THEMES.map(t => ctx.createPattern(makeTile(t), 'repeat'));

  // ---------- audio: morbido, con riverbero, niente toni continui invadenti ----------
  const Audio = {
    ctx: null, master: null, bus: null, pad: null, padFilter: null, padGain: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const a = this.ctx = new AC();
      this.master = a.createGain(); this.master.gain.value = muted ? 0 : 0.8;
      const comp = a.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(a.destination);

      // Riverbero sintetico: dà profondità e ammorbidisce ogni suono.
      const len = Math.floor(a.sampleRate * 2.2), ir = a.createBuffer(2, len, a.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const verb = a.createConvolver(); verb.buffer = ir;
      const wet = a.createGain(); wet.gain.value = 0.32;
      this.bus = a.createGain();
      this.bus.connect(this.master); this.bus.connect(verb); verb.connect(wet); wet.connect(this.master);

      this.ambLP = a.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 1100;
      this.ambGain = a.createGain(); this.ambGain.gain.value = 0;
      this.ambLP.connect(this.ambGain); this.ambGain.connect(this.bus);
      this.nextChord = a.currentTime + 0.3; this.chordIdx = 0;
    },
    setMuted(m) {
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    },
    // Sottofondo: accordi lenti (La min · Fa · Do · Sol) che entrano e sfumano piano.
    // Nessun suono continuo: tra un accordo e l'altro c'è respiro.
    CHORDS: [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]],
    ambient(level) {
      if (!this.ctx) return;
      const a = this.ctx, t = a.currentTime;
      this.ambGain.gain.setTargetAtTime(level, t, 0.8);
      if (t < this.nextChord) return;
      const chord = this.CHORDS[this.chordIdx++ % this.CHORDS.length];
      chord.forEach((f, i) => this.padNote(f, this.nextChord + i * 0.18));
      this.nextChord += 4.8;
      if (this.nextChord < t) this.nextChord = t + 0.2;
    },
    padNote(freq, t0) {
      const a = this.ctx;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 1.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.5);
      g.connect(this.ambLP);
      const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      o.connect(g); o.start(t0); o.stop(t0 + 5.6);
    },
    note(freq, dur, vol, type) {
      if (!this.ctx) return;
      const a = this.ctx, t = a.currentTime;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.bus);
      const o = a.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
      const o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
      const g2 = a.createGain(); g2.gain.value = 0.18;
      o.connect(g); o2.connect(g2); g2.connect(g);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },
    // La minore pentatonica: qualunque sequenza di passaggi suona come una melodia.
    PENTA: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],
    pass(combo, n) {
      const step = this.PENTA[(n % 5) + Math.min(combo, 5)];
      this.note(440 * Math.pow(2, step / 12), 0.9, 0.035);
    },
    graze(combo) {
      const f = 880 * Math.pow(2, this.PENTA[Math.min(combo, 5) + 2] / 12);
      this.note(f, 1.2, 0.03);
      setTimeout(() => this.note(f * 1.5, 1.0, 0.018), 60);
    },
    die() {
      if (!this.ctx) return;
      const a = this.ctx, t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.75);
      // soffio morbido al posto del rumore secco
      const n = Math.floor(a.sampleRate * 0.5), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
      f.type = 'lowpass'; f.frequency.value = 600; gn.gain.value = 0.12;
      src.buffer = b; src.connect(f); f.connect(gn); gn.connect(this.bus); src.start(t);
    },
    record() { [0, 3, 7, 12, 15].forEach((s, i) => setTimeout(() => this.note(440 * Math.pow(2, s / 12), 1.2, 0.05), i * 110)); },
    click() { this.note(660, 0.15, 0.04); },
  };

  // ---------- stato ----------
  let state = 'menu';        // menu | play | dying | over
  let demo = new Game(H, 7), demoBot = makeBot(1, 7);
  let game = demo;
  let holding = false;
  let overAt = 0, newRecord = false;
  let adBlock = false;       // true mentre un interstitial sta per apparire / è aperto
  let shake = 0, flash = 0, flashCol = '#fff';
  let particles = [], popups = [];
  let titleOpen = 0.5;
  const dust = [];
  for (let i = 0; i < 40; i++) dust.push({ x: Math.random() * C.W, y: Math.random() * 900, z: 0.2 + Math.random() * 0.6 });

  function newDemo() {
    const seed = (Math.random() * 1e9) | 0;
    demo = new Game(H, seed); demoBot = makeBot(1, seed);
    // Facciamo partire la demo già avviata, con ostacoli sullo schermo.
    for (let i = 0; i < 240; i++) demo.step(C.DT, demoBot(demo));
    demo.events.length = 0;
  }

  function start() {
    game = new Game(H, (Math.random() * 1e9) | 0);
    state = 'play';
    particles = []; popups = [];
    newRecord = false;
    plays++; store.set('plays', plays);
  }

  // ---------- input: un solo dito ----------
  function toLogical(e) {
    return { x: (e.clientX * dpr - offX) / scale, y: (e.clientY * dpr) / scale };
  }
  // Pulsante "Privacy" (solo nel menu, solo dove il GDPR lo richiede): riapre il modulo di consenso.
  const PRIVACY_BTN = { x: 16, w: 74, h: 30 };
  function privacyVisible() { return state === 'menu' && window.Ads && Ads.privacyRequired(); }
  function onPrivacyBtn(p) {
    const y = SOUND_BTN.y - PRIVACY_BTN.h / 2;
    return p.x > PRIVACY_BTN.x - 8 && p.x < PRIVACY_BTN.x + PRIVACY_BTN.w + 8 && p.y > y - 10 && p.y < y + PRIVACY_BTN.h + 10;
  }
  function onSoundBtn(p) { return Math.hypot(p.x - SOUND_BTN.x, p.y - SOUND_BTN.y) < SOUND_BTN.r + 12; }
  function toggleSound() {
    muted = !muted; store.set('muted', muted);
    Audio.init(); Audio.setMuted(muted);
    if (!muted) Audio.click();
  }

  function press(e) {
    if (e) e.preventDefault();
    if (e && e.clientX != null && onSoundBtn(toLogical(e))) { toggleSound(); return; }
    if (e && e.clientX != null && privacyVisible() && onPrivacyBtn(toLogical(e))) { Ads.showPrivacy(); return; }
    Audio.init();
    holding = true;
    if (state === 'menu') start();
    else if (state === 'over' && !adBlock && performance.now() - overAt > 380) start();
  }
  function release(e) { if (e) e.preventDefault(); holding = false; }
  cv.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) press(e);
    if (e.code === 'KeyM' && !e.repeat) toggleSound();
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') release(e); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { holding = false; if (Audio.ctx) Audio.ctx.suspend(); } else if (Audio.ctx) Audio.ctx.resume(); });

  // ---------- effetti ----------
  function burst(x, y, n, col, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col, r: 1.5 + Math.random() * 2.5 });
    }
  }

  function handleEvents() {
    for (const ev of game.events) {
      if (ev.type === 'pass') {
        Audio.pass(ev.combo, game.passed);
      } else if (ev.type === 'graze') {
        Audio.graze(ev.combo);
        flash = 0.25; flashCol = COL.graze;
        burst(C.CX + game.s, game.PY, 10, COL.graze, 140); burst(C.CX - game.s, game.PY, 10, COL.graze, 140);
        popups.push({ text: ev.combo > 1 ? `CLOSE CALL ×${ev.combo}` : 'CLOSE CALL', sub: `+${ev.gain}`, y: game.PY - 60, life: 1 });
      } else if (ev.type === 'die') {
        Audio.die();
        shake = 14; flash = 0.6; flashCol = '#ff5a4e';
        burst(C.CX + game.s, game.PY, 26, COL.light, 260); burst(C.CX - game.s, game.PY, 26, COL.light, 260);
        state = 'dying'; overAt = performance.now();
        if (game.score > best) { newRecord = true; best = game.score; store.set('best', best); }
      }
    }
    game.events.length = 0;
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'play') {
      acc += dt;
      while (acc >= C.DT && game.alive) {
        game.step(C.DT, BOT ? BOT(game) : holding);
        acc -= C.DT;
      }
      handleEvents();
    } else {
      if (state === 'dying' && now - overAt > 550) {
        state = 'over'; overAt = now;
        if (newRecord) Audio.record();
        if (BOT) setTimeout(start, 900);
        // Annuncio solo ogni tanto (regole in ads.js). Il giocatore vede prima il punteggio,
        // poi l'annuncio; al ritorno il punteggio è ancora lì e si riparte con un tocco.
        else if (window.Ads && Ads.due({ runSeconds: game.time, newRecord })) {
          adBlock = true;
          setTimeout(() => {
            if (Audio.ctx) Audio.ctx.suspend();
            Ads.show().then(() => {
              holding = false; adBlock = false; overAt = performance.now();
              if (Audio.ctx && !document.hidden) Audio.ctx.resume();
            });
          }, 900);
        }
      }
      if (state === 'menu') {
        // Attract mode: sullo sfondo gioca un bot, così il menu mostra subito il gioco.
        acc += dt;
        while (acc >= C.DT) { demo.step(C.DT, demoBot(demo)); acc -= C.DT; }
        demo.events.length = 0;
        if (!demo.alive || demo.time > 90) newDemo();
        game = demo;
        if (BOT) start();
      }
    }

    const slow = state === 'dying' ? 0.35 : 1;
    for (const p of particles) { p.x += p.vx * dt * slow; p.y += p.vy * dt * slow; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt * 1.4; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.y -= 40 * dt; p.life -= dt * 1.1; }
    popups = popups.filter(p => p.life > 0);
    shake *= Math.pow(0.02, dt); flash = Math.max(0, flash - dt * 1.8);

    Audio.ambient(state === 'play' ? 0.5 : 0.8);
    draw(now, dt);
    requestAnimationFrame(frame);
  }

  // ---------- disegno ----------
  function rrPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function rr(x, y, w, h, r) { if (w > 0 && h > 0) { rrPath(x, y, w, h, r); ctx.fill(); } }

  function draw(now, dt) {
    const g = game;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, cv.height);
    bg.addColorStop(0, COL.bg0); bg.addColorStop(1, COL.bg1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);

    const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(scale, 0, 0, scale, offX + sx * scale, sy * scale);
    const Hh = cv.height / scale;
    const PY = g.PY;

    // polvere in parallasse: dà il senso della velocità
    const spd = state === 'play' || state === 'menu' ? g.speed : 0;
    ctx.fillStyle = 'rgba(150,110,170,0.4)';
    for (const p of dust) {
      p.y += spd * p.z * dt;
      if (p.y > Hh) { p.y -= Hh + 10; p.x = Math.random() * C.W; }
      ctx.globalAlpha = p.z * 0.6;
      ctx.fillRect(p.x, p.y, 1.6, 1.6 + p.z * 4);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(45,35,80,0.05)';
    ctx.fillRect(C.CX - 0.75, 0, 1.5, Hh);

    // alone di respiro
    const open = (g.s - C.S_MIN) / (C.S_MAX - C.S_MIN);
    const rg = ctx.createRadialGradient(C.CX, PY, 0, C.CX, PY, 60 + g.s * 1.3);
    rg.addColorStop(0, `rgba(255,140,90,${0.12 + open * 0.1})`); rg.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, PY - 260, C.W, 520);

    // scia: il "disegno del respiro"
    const tr = g.trail;
    if (tr.length > 4) {
      ctx.lineWidth = 5; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      for (const side of [-1, 1]) {
        const chunks = 6, n = tr.length / 2;
        for (let c = 0; c < chunks; c++) {
          const i0 = Math.floor((n * c) / chunks), i1 = Math.min(n - 1, Math.floor((n * (c + 1)) / chunks) + 1);
          ctx.strokeStyle = `rgba(${COL.trail},${0.05 + 0.35 * ((c + 1) / chunks)})`;
          ctx.beginPath();
          for (let i = i0; i <= i1; i++) {
            const x = C.CX + side * tr[i * 2], y = PY + (g.dist - tr[i * 2 + 1]);
            i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }

    // ostacoli
    for (const o of g.obs) {
      const top = o.y - o.h;
      if (o.y < -20 || top > Hh + 20) continue;
      drawObstacle(o, top, now, g);
      if (state !== 'menu' && o.label && !o.passed && best < 8 && top < PY) {
        ctx.fillStyle = COL.text; ctx.globalAlpha = 0.85;
        ctx.font = font(600, 17); ctx.textAlign = 'center';
        ctx.fillText(o.label, C.CX, top - 14);
        ctx.globalAlpha = 1;
      }
    }

    // luci gemelle
    if (state !== 'over' || Math.floor(now / 120) % 2 === 0 || !g.hit) {
      for (const side of [-1, 1]) {
        const x = C.CX + side * g.s;
        ctx.drawImage(glow, x - 34, PY - 34, 68, 68);
        ctx.fillStyle = COL.light; ctx.strokeStyle = COL.lightRim; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, PY, C.DR - 1.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x - 3.5, PY - 3.5, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (g.combo > 0 && state === 'play') {
      ctx.strokeStyle = COL.graze; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.1 * g.combo;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(C.CX + side * g.s, PY, C.DR + 5 + g.combo * 1.5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = COL.graze; ctx.font = font(600, 18);
      ctx.fillText(p.text, C.CX, p.y);
      ctx.font = font(600, 15); ctx.fillText(p.sub, C.CX, p.y + 20);
    }
    ctx.globalAlpha = 1;

    // HUD
    if (state === 'play' || state === 'dying') {
      ctx.font = font(700, 52, F_TITLE);
      ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.strokeStyle = COL.bg0;
      ctx.strokeText(String(g.score), C.CX, 88 + safeTop);
      ctx.fillStyle = COL.text; ctx.fillText(String(g.score), C.CX, 88 + safeTop);
      if (best > 0) { ctx.fillStyle = COL.dim; ctx.font = font(500, 15); ctx.fillText('Best ' + best, C.CX, 114 + safeTop); }
    }

    if (state === 'menu') { drawMenu(now, dt); if (privacyVisible()) drawPrivacyBtn(); }
    if (state === 'over') drawOver(now);
    drawSoundBtn(state === 'play' ? 0.45 : 0.9);

    if (flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = flash * 0.35; ctx.fillStyle = flashCol; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = 1;
    }
  }

  // Percorso di una parte (coordinate assolute), rientrato di "inset" per bordo e riempimento.
  function partPath(o, x0, x1, top, inset) {
    if (o.shape === 'beads') {
      const L = beadLayout(x0 - C.CX, x1 - C.CX, o.h), cy = top + o.h / 2;
      ctx.beginPath();
      for (let j = 0; j < L.n; j++) {
        const cx = C.CX + L.first + j * L.step;
        ctx.moveTo(cx + L.rb - inset, cy); ctx.arc(cx, cy, Math.max(1, L.rb - inset), 0, Math.PI * 2);
      }
      return;
    }
    const r = o.shape === 'capsule' ? o.h / 2 : 9;
    rrPath(x0 + inset, top + inset, x1 - x0 - 2 * inset, o.h - 2 * inset, Math.max(1, r - inset));
  }

  function drawObstacle(o, top, now, g) {
    const t = THEMES[o.theme || 0], pat = PATTERNS[o.theme || 0];
    if (pat.setTransform) pat.setTransform(new DOMMatrix([1 / RES, 0, 0, 1 / RES, 0, top]));
    const shade = ctx.createLinearGradient(0, top, 0, top + o.h);
    shade.addColorStop(0, 'rgba(255,255,255,0.28)'); shade.addColorStop(0.45, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    const isHit = g.hit && g.hit.o === o;
    const spans = [];
    for (const pt of partsOf(o)) {
      spans.push([C.CX + pt.x0, C.CX + pt.x1]);
      if (pt.kind === 'wall') spans.push([C.CX - pt.x1, C.CX - pt.x0]);
    }
    for (const [x0, x1] of spans) {
      ctx.fillStyle = t.dark; partPath(o, x0, x1, top, 0); ctx.fill();
      ctx.fillStyle = pat; partPath(o, x0, x1, top, 2.5); ctx.fill();
      ctx.fillStyle = shade; ctx.fill();
      if (isHit && Math.floor(now / 120) % 2 === 0) { ctx.fillStyle = 'rgba(255,60,60,0.55)'; partPath(o, x0, x1, top, 0); ctx.fill(); }
    }
    if (o.face) drawFace(o, top, now, g, isHit);
  }

  // Faccina sulle colonne: gli occhi seguono le luci. Piccolo tocco di personalità.
  function drawFace(o, top, now, g, isHit) {
    const ey = top + o.h * 0.42, ex = Math.min(o.lo * 0.38, 13);
    const blink = ((now / 1000 + o.idx * 0.37) % 3.5) < 0.12;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const x = C.CX + side * ex;
      if (isHit) {
        ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 3, ey - 3); ctx.lineTo(x + 3, ey + 3); ctx.moveTo(x + 3, ey - 3); ctx.lineTo(x - 3, ey + 3); ctx.stroke();
      } else if (blink) {
        ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 4, ey); ctx.lineTo(x + 4, ey); ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, ey, 5, 0, Math.PI * 2); ctx.fill();
        const lx = C.CX + side * g.s - x, ly = g.PY - ey, len = Math.hypot(lx, ly) || 1;
        ctx.fillStyle = '#2a1830'; ctx.beginPath(); ctx.arc(x + (lx / len) * 2.3, ey + (ly / len) * 2.3, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (isHit) ctx.arc(C.CX, ey + 12, 3.5, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(C.CX, ey + 5, 3.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  function drawPrivacyBtn() {
    const { x, w, h } = PRIVACY_BTN, y = SOUND_BTN.y - h / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = COL.faint; ctx.lineWidth = 1.5;
    rrPath(x, y, w, h, h / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.dim; ctx.font = font(500, 14); ctx.textAlign = 'center';
    ctx.fillText('Privacy', x + w / 2, y + h / 2 + 5);
  }

  function drawSoundBtn(alpha) {
    const { x, y, r } = SOUND_BTN;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = COL.faint; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // altoparlante
    ctx.fillStyle = COL.text;
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 1, y - 9);
    ctx.lineTo(x + 1, y + 9); ctx.lineTo(x - 5, y + 4); ctx.lineTo(x - 9, y + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COL.text; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (muted) {
      ctx.beginPath(); ctx.moveTo(x + 5, y - 4); ctx.lineTo(x + 11, y + 4); ctx.moveTo(x + 11, y - 4); ctx.lineTo(x + 5, y + 4); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + 2, y, 5, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 2, y, 9.5, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  }

  // Mini-diagramma delle due luci con frecce: spiega il comando senza parole.
  function hintPill(cx, y, label, outward) {
    const w = 170, h = 64;
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = COL.faint; ctx.lineWidth = 1.5;
    rrPath(cx - w / 2, y - h / 2, w, h, 18); ctx.fill(); ctx.stroke();
    const dy = y - 9, gap = outward ? 30 : 12;
    ctx.fillStyle = COL.light;
    ctx.beginPath(); ctx.arc(cx - gap, dy, 5, 0, Math.PI * 2); ctx.arc(cx + gap, dy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.light; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const x0 = cx + s * (outward ? 40 : 52), x1 = cx + s * (outward ? 54 : 22);
      const dir = Math.sign(x1 - x0);
      ctx.beginPath(); ctx.moveTo(x0, dy); ctx.lineTo(x1, dy);
      ctx.moveTo(x1, dy); ctx.lineTo(x1 - dir * 5, dy - 4); ctx.moveTo(x1, dy); ctx.lineTo(x1 - dir * 5, dy + 4); ctx.stroke();
    }
    ctx.fillStyle = COL.text; ctx.font = font(500, 15);
    ctx.fillText(label, cx, y + 20);
  }

  function drawMenu(now, dt) {
    const Hh = cv.height / scale;
    // Velo scuro in alto: la demo resta visibile ma il titolo domina.
    const veil = ctx.createLinearGradient(0, 0, 0, Hh);
    veil.addColorStop(0, 'rgba(255,246,234,0.94)'); veil.addColorStop(0.55, 'rgba(255,240,228,0.7)'); veil.addColorStop(1, 'rgba(255,232,220,0.2)');
    ctx.fillStyle = veil; ctx.fillRect(-60, 0, C.W + 120, Hh);

    // Il titolo respira insieme alle luci della demo.
    const open = (game.s - C.S_MIN) / (C.S_MAX - C.S_MIN);
    titleOpen += (open - titleOpen) * Math.min(1, dt * 3);
    const ty = Hh * 0.2;
    ctx.save();
    ctx.font = font(700, 58, F_TITLE);
    const tg = ctx.createLinearGradient(0, -40, 0, 14);
    tg.addColorStop(0, '#ff9a3d'); tg.addColorStop(1, '#ff5a3d');
    ctx.fillStyle = tg;
    ctx.shadowColor = 'rgba(184,64,28,0.3)'; ctx.shadowOffsetY = 3 + titleOpen * 3; ctx.shadowBlur = 4 + titleOpen * 8;
    ctx.translate(C.CX, ty - 14); ctx.scale(1 + titleOpen * 0.08, 1 + titleOpen * 0.08);
    ctx.textAlign = 'center'; ctx.fillText('pip & pop', 0, 14);
    ctx.restore();

    // linea che si allarga col respiro
    const lw = 40 + titleOpen * 160;
    const lg = ctx.createLinearGradient(C.CX - lw / 2, 0, C.CX + lw / 2, 0);
    lg.addColorStop(0, 'rgba(255,107,61,0)'); lg.addColorStop(0.5, 'rgba(255,107,61,0.9)'); lg.addColorStop(1, 'rgba(255,107,61,0)');
    ctx.fillStyle = lg; ctx.fillRect(C.CX - lw / 2, ty + 20, lw, 2);

    ctx.fillStyle = COL.dim; ctx.font = font(400, 16);
    ctx.fillText('two lights, one finger', C.CX, ty + 46);

    // comandi
    const hy = ty + 120;
    hintPill(C.CX - 90, hy, 'Hold · open', true);
    hintPill(C.CX + 90, hy, 'Release · close', false);

    if (best > 0) {
      ctx.font = font(600, 15);
      const label = 'Best ' + best;
      const w = ctx.measureText(label).width + 44;
      ctx.fillStyle = 'rgba(255,107,61,0.1)'; ctx.strokeStyle = 'rgba(255,107,61,0.5)'; ctx.lineWidth = 1.5;
      rrPath(C.CX - w / 2, hy + 52, w, 32, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.accent; ctx.fillText(label, C.CX, hy + 73);
    }

    // invito a giocare con onde che si espandono
    const cy = Hh * 0.6;
    for (let i = 0; i < 3; i++) {
      const t = ((now / 1600) + i / 3) % 1;
      ctx.strokeStyle = `rgba(255,107,61,${0.5 * (1 - t)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(C.CX, cy, 16 + t * 46, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = COL.light; ctx.beginPath(); ctx.arc(C.CX, cy, 12 + 2 * Math.sin(now / 250), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.text; ctx.font = font(600, 20);
    ctx.fillText('Press and hold', C.CX, cy + 90);
    ctx.fillStyle = COL.dim; ctx.font = font(400, 15);
    ctx.fillText('to play', C.CX, cy + 114);
  }

  function drawOver(now) {
    const g = game;
    const Hh = cv.height / scale;
    // Velo solo dietro al testo: il punto dell'impatto resta ben visibile.
    const veil = ctx.createLinearGradient(0, 0, 0, Hh);
    veil.addColorStop(0, 'rgba(255,246,234,0.9)'); veil.addColorStop(0.6, 'rgba(255,246,234,0.75)'); veil.addColorStop(0.72, 'rgba(255,246,234,0)');
    ctx.fillStyle = veil; ctx.fillRect(-60, 0, C.W + 120, Hh);
    ctx.textAlign = 'center';
    const y0 = Hh * 0.27;
    ctx.fillStyle = COL.dim; ctx.font = font(500, 16); ctx.fillText('score', C.CX, y0 - 78);
    ctx.fillStyle = COL.text; ctx.font = font(700, 84, F_TITLE);
    ctx.fillText(String(g.score), C.CX, y0);
    if (newRecord) {
      ctx.fillStyle = `rgba(217,72,31,${0.75 + 0.25 * Math.sin(now / 150)})`;
      ctx.font = font(600, 22); ctx.fillText('New best!', C.CX, y0 + 40);
    } else {
      ctx.fillStyle = COL.dim; ctx.font = font(500, 16);
      const gap = best - g.score;
      ctx.fillText(best === 0 ? 'one more time' : gap === 0 ? 'tied your best!' : gap <= 5 ? `${gap} away from your best!` : `best ${best}`, C.CX, y0 + 38);
    }
    ctx.fillStyle = COL.dim; ctx.font = font(400, 14);
    ctx.fillText(`${g.passed} passed  ·  ${g.grazes} close calls  ·  combo ×${g.maxCombo}`, C.CX, y0 + 72);
    if (g.hit) {
      ctx.fillStyle = COL.text; ctx.font = font(600, 17);
      ctx.fillText(g.hit.side === 'in' ? 'Too closed' : 'Too open', C.CX, g.PY + 48);
    }
    if (!adBlock && now - overAt > 380) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 250);
      ctx.fillStyle = COL.text; ctx.font = font(600, 20);
      ctx.fillText('Tap to retry', C.CX, Hh * 0.55);
      ctx.globalAlpha = 1;
    }
  }

  newDemo();
  game = demo;
  requestAnimationFrame(frame);
})();
