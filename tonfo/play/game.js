/* TONFO — una zattera, un lottatore tondo, l'acqua tutt'intorno.
   Tieni premuto: ti pianti e carichi. Rilascia: scatti nella direzione della freccia.
   Butta gli avversari in acqua. Non caderci tu.
   Nessuna dipendenza esterna. Fisica a passo fisso (120 Hz), identica su ogni frame rate. */
(() => {
  'use strict';

  // ---------- Costanti ----------
  const COL = {
    water: '#123a52', water2: '#17506e', foam: '#bfe9f2',
    disc: '#f1dfbf', disc2: '#e6cfa5', rim: '#c8a26b', rimDark: '#a4814f',
    player: '#ff6f59', playerDark: '#d9503d',
    walker: '#7a6cf0', walkerDark: '#5a4cc8',
    mini: '#4fc3a1', miniDark: '#36997d',
    brute: '#4a3b6b', bruteDark: '#33284c',
    dasher: '#ffb238', dasherDark: '#d98c14',
    text: '#fff8ec', ink: '#2b2233', mute: '#9fc3d3', danger: '#ff4d6d', gold: '#ffd166',
  };
  const STEP = 1 / 120;
  const DISC = 200;               // raggio della zattera (unità mondo)
  const VIEW = 232;               // raggio visibile
  const AIM_SPEED = 3.4;          // rad/s, rotazione della freccia
  const CHARGE_T = 0.6;           // tempo per la carica piena
  const PERFECT_WIN = 0.16;       // finestra "perfetta" appena raggiunta la carica piena
  const POW_MIN = 70, POW_MAX = 520, PERFECT_MULT = 1.22;
  const DAMP = 3.2, DAMP_BRACE = 9, DAMP_FALL = 2;
  const DASH_T = 0.38;
  const RECOVER_T = 0.28;         // dopo uno scatto la carica riparte solo dopo un attimo
  const FALL_T = 0.5;
  const COMBO_WIN = 2.5;
  const FEVER_T = 6;
  const LS_BEST = 'tonfo.best', LS_TUT = 'tonfo.tutorial', LS_MUTE = 'tonfo.muted';

  const TIPS = [
    "While you hold, you're planted: it's much harder to push you around.",
    'Release as soon as the ring flashes gold: a PERFECT dash hits way harder.',
    "The dotted line shows where you'll stop. If it turns red, you're going swimming.",
    'Launch an enemy into another one: CAROM, double points.',
    'Yellow chargers show their path. Step aside and let them dive in: OLÉ!',
    'Dark purple brutes are heavy: use a full charge, ideally near the edge.',
    'The more enemies you dunk in a row, the higher your combo.',
    "The center is safe only until they surround you.",
    'The chili makes your next 3 dashes explosive: hit the middle of the pack.',
    'With FREEZE, enemies slide: one tap and they fly into the water.',
    'When King Pudding jumps, get out of the red circle or plant yourself.',
    'In the wind, wait until enemies are downwind, then push them the same way.',
    'Combo of 4 or more: FEVER, double points. Every new splash extends it.',
    'Dunk enemies near the shark fin: CHOMP, ×3 points.',
    'Two enemies dunked with a single dash: DOUBLE, plus a bonus.',
    'Stopping a hair from the edge is a CLOSE CALL: +50.',
    'Complete missions to earn stars and unlock hats.',
  ];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } },
  };

  // ---------- Audio sintetizzato ----------
  const Sound = (() => {
    let ac = null, master = null, hum = null, humGain = null;
    let muted = store.get(LS_MUTE) === '1';
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.6;
        master.connect(ac.destination);
      } catch (e) { ac = null; }
    }
    function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0, delay = 0) {
      if (!ac) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, type, f0, f1, q = 0.8) {
      if (!ac) return;
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
      const t = ac.currentTime;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ac.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    }
    // versioni con orario assoluto, per la musica
    function toneAt(freq, dur, type, vol, when, dest, slideTo) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, when);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(dest); o.start(when); o.stop(when + dur + 0.03);
    }
    let noiseBuf = null;
    function noiseAt(dur, vol, type, freq, when, dest) {
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(when); src.stop(when + dur + 0.02);
    }
    // ---- musica procedurale: batteria, basso, arpeggio in "febbre" ----
    let mTimer = null, mNext = 0, mStep = 0, mTempo = 100, mLevel = 0, mFever = false, mGain = null;
    const ROOTS = [0, 5, 3, 7], ARP = [0, 4, 7, 12, 16, 12, 7, 4];
    function playStep(s, t) {
      const bar = Math.floor(s / 16) % 4, st = s % 16;
      const root = 65.41 * Math.pow(2, ROOTS[bar] / 12);
      if (st === 0 || st === 8 || (mLevel >= 2 && (st === 6 || st === 14))) toneAt(140, 0.22, 'sine', 0.5, t, mGain, 42);
      if (st === 4 || st === 12) noiseAt(0.14, 0.22, 'bandpass', 1900, t, mGain);
      if (mLevel >= 1 && st % 2 === 0) noiseAt(0.035, 0.07, 'highpass', 7500, t, mGain);
      if (mLevel >= 3 && st % 2 === 1) noiseAt(0.025, 0.04, 'highpass', 9000, t, mGain);
      if (st % 4 === 0 || st === 3 || st === 11) toneAt(root * 2, 0.2, 'triangle', 0.16, t, mGain);
      if (st === 0 && bar % 2 === 0) [4, 5, 6].forEach(m => toneAt(root * m, 1.6, 'sine', 0.018, t, mGain));
      if (mFever && st % 2 === 0) toneAt(root * 4 * Math.pow(2, ARP[(st / 2) % 8] / 12), 0.12, 'square', 0.03, t, mGain);
      else if (mLevel >= 1 && (st === 7 || st === 15) && Math.random() < 0.6) toneAt(root * 8 * Math.pow(2, [0, 4, 7][Math.floor(Math.random() * 3)] / 12), 0.1, 'triangle', 0.035, t, mGain);
    }
    function sched() {
      if (!ac) return;
      while (mNext < ac.currentTime + 0.15) { playStep(mStep, mNext); mNext += 60 / mTempo / 4; mStep = (mStep + 1) % 64; }
    }
    const PENTA = [0, 2, 4, 7, 9];
    const comboFreq = c => { const i = Math.min(c - 1, 12); return 392 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12); };
    return {
      init,
      get muted() { return muted; },
      toggleMute() {
        muted = !muted; store.set(LS_MUTE, muted ? '1' : '0');
        if (master) master.gain.value = muted ? 0 : 0.6;
      },
      chargeStart() {
        if (!ac) return;
        this.chargeStop();
        hum = ac.createOscillator(); humGain = ac.createGain();
        hum.type = 'triangle'; hum.frequency.value = 140;
        humGain.gain.setValueAtTime(0.0001, ac.currentTime);
        humGain.gain.exponentialRampToValueAtTime(0.045, ac.currentTime + 0.04);
        hum.connect(humGain); humGain.connect(master); hum.start();
      },
      chargeSet(c) { if (hum) hum.frequency.setTargetAtTime(140 + c * 260, ac.currentTime, 0.01); },
      chargeStop() {
        if (!hum) return;
        const h = hum, g = humGain, t = ac.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        h.stop(t + 0.06);
        hum = null; humGain = null;
      },
      full() { tone(880, 0.09, 'sine', 0.09); },
      musicStart() {
        if (!ac || mTimer) return;
        mGain = ac.createGain(); mGain.gain.value = 0.5; mGain.connect(master);
        mNext = ac.currentTime + 0.06; mStep = 0;
        mTimer = setInterval(sched, 25);
      },
      musicStop() {
        if (mTimer) { clearInterval(mTimer); mTimer = null; }
        if (mGain && ac) { const g = mGain; g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); setTimeout(() => g.disconnect(), 600); mGain = null; }
      },
      musicSet(level, tempo, fever) { mLevel = level; mTempo = tempo; mFever = fever; },
      waveStart(boss) { if (boss) { tone(110, 0.6, 'sawtooth', 0.08, 55); tone(82, 0.8, 'sine', 0.3, 0, 0.1); } else { tone(523, 0.12, 'triangle', 0.1); tone(784, 0.2, 'triangle', 0.1, 0, 0.09); } },
      waveClear() { [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.25, 'triangle', 0.1, 0, i * 0.08)); },
      power() { [0, 7, 12, 19].forEach((s, i) => tone(659 * Math.pow(2, s / 12), 0.18, 'sine', 0.12, 0, i * 0.05)); },
      powerSpawn() { tone(1320, 0.12, 'sine', 0.06); tone(1760, 0.12, 'sine', 0.05, 0, 0.06); },
      pop() { tone(900, 0.12, 'sine', 0.2, 300); noise(0.1, 0.2, 'highpass', 3000); },
      boom() { tone(90, 0.5, 'sine', 0.45, 35); noise(0.4, 0.35, 'lowpass', 1500, 200); },
      slam() { tone(70, 0.6, 'sine', 0.55, 30); noise(0.5, 0.4, 'lowpass', 800, 120); },
      bossJump() { tone(200, 0.6, 'triangle', 0.1, 600); },
      windWarn() { noise(1.2, 0.12, 'bandpass', 500, 1400, 2); },
      wind() { noise(2.5, 0.16, 'bandpass', 700, 300, 1.5); },
      chomp() { noise(0.12, 0.4, 'lowpass', 600); tone(120, 0.15, 'square', 0.12, 60); noise(0.12, 0.4, 'lowpass', 500); tone(90, 0.2, 'square', 0.12, 45, 0.14); },
      mission() { [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(587 * Math.pow(2, s / 12), 0.2, 'triangle', 0.09, 0, i * 0.06)); },
      near() { tone(300, 0.25, 'sine', 0.1, 1200); },
      multi(n) { [0, 4, 7, 12].slice(0, n + 1).forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.22, 'square', 0.06, 0, i * 0.07)); tone(784, 0.5, 'triangle', 0.1, 0, 0.3); },
      fever() { [0, 4, 7, 11, 14].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 0.2, 'square', 0.05, 0, i * 0.04)); },
      dash(perfect) { noise(0.22, 0.3, 'bandpass', 600, 2600, 0.7); if (perfect) { tone(1046, 0.18, 'sine', 0.1); tone(1568, 0.22, 'sine', 0.06, 0, 0.04); } },
      thump(strength) { const s = Math.min(1, strength); tone(150 - 60 * s, 0.16 + 0.1 * s, 'sine', 0.15 + 0.3 * s, 50); noise(0.06, 0.12 + 0.2 * s, 'lowpass', 900); },
      bump(strength) { tone(220, 0.07, 'sine', Math.min(0.12, 0.03 + strength * 0.1), 140); },
      land() { tone(90, 0.12, 'sine', 0.12, 60); noise(0.08, 0.08, 'lowpass', 500); },
      splash() { noise(0.55, 0.35, 'lowpass', 3200, 300, 0.5); tone(300, 0.25, 'sine', 0.05, 900, 0.03); },
      ko(combo) { const f = comboFreq(combo); tone(f, 0.25, 'sine', 0.16, 0, 0.12); tone(f * 1.5, 0.3, 'triangle', 0.07, 0, 0.18); },
      warn() { tone(660, 0.05, 'square', 0.03); },
      start() { tone(330, 0.12, 'sine', 0.12); tone(494, 0.18, 'sine', 0.12, 0, 0.08); },
      over() { [0, -4, -7, -12].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.32, 'triangle', 0.1, 0, 0.15 + i * 0.11)); },
      record() { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.28, 'sine', 0.1, 0, 0.7 + i * 0.07)); },
    };
  })();

  // ---------- Canvas & layout ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, scale = 1, cx = 0, cy = 0, hudTop = 0;
  const pauseBtn = { x: 0, y: 0, r: 22 };
  const muteBtn = { x: 0, y: 0, r: 18 };

  let cachesDirty = true;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    hudTop = Math.min(96, Math.max(70, H * 0.11));
    const availH = H - hudTop - 12;
    const R = Math.max(80, Math.min(W / 2 - 4, availH / 2));
    scale = R / VIEW;
    cx = W / 2; cy = hudTop + availH / 2;
    pauseBtn.x = W - 34; pauseBtn.y = 34;
    muteBtn.x = W - 82; muteBtn.y = 34;
    cachesDirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Stato ----------
  const S = {
    mode: 'title',          // title | play | paused | dying | over
    clock: 0, titleT: 1, t: 0, score: 0, best: parseInt(store.get(LS_BEST) || '0', 10) || 0,
    combo: 0, maxCombo: 0, lastKO: -99, kos: 0, perfects: 0, caroms: 0, oles: 0, newRecord: false,
    player: null, enemies: [], particles: [], texts: [], ripples: [],
    aim: -Math.PI / 2, charging: false, charge: 0, chargeOver: 0, fullPlayed: false,
    dashT: 0, dashPerfect: false, dashC: 0, recover: 0,
    nextSpawn: 0, hitstop: 0, shake: 0, flash: 0, flashCol: COL.danger,
    dieT: 0, overT: 0, tip: '', tutorial: store.get(LS_TUT) !== '1', tutKOs: 0,
    scorePop: 0, trauma: 0, zoomKick: 0,
    wave: 0, waveState: 'intro', waveT: 0, waveQueue: [], waveMax: 2, waveGap: 1, waveNext: 0, waveSp: 1, mod: '', wind: null, windNext: 0, iceK: 0,
    powerups: [], nextPower: 0, chili: 0, chiliDash: false, bubble: false, fever: 0, banner: null, slowmo: 0, bossKOs: 0,
    powersTaken: 0, sharkKOs: 0, bestMulti: 0, nears: 0, fevers: 0, saves: 0, bruteKOs: 0, runStars: 0, toasts: [], dashKOs: 0, nearCheck: false, hatPop: 0, missionT: 0,
    rings: [], stars: [], ghosts: [], confetti: [], glints: [], waves: [], fish: [], titleEnts: [],
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const len = (x, y) => Math.sqrt(x * x + y * y);

  const TYPES = {
    player: { r: 18, m: 1.2 },
    walker: { r: 16, m: 1.0, speed: 70, accel: 260 },
    mini:   { r: 11, m: 0.55, speed: 105, accel: 380 },
    brute:  { r: 28, m: 5.0, speed: 42, accel: 160 },
    dasher: { r: 17, m: 1.1, speed: 38, accel: 160 },
    boss:   { r: 36, m: 7.0, speed: 30, accel: 120 },
  };

  function makeEntity(kind, x, y) {
    const T = TYPES[kind];
    return {
      kind, x, y, vx: 0, vy: 0, r: T.r, m: T.m, face: rand(0, 6.283),
      drop: 0, fall: 0, stun: 0, credit: -99, carom: false, squash: 0, blink: rand(1, 4),
      state: 'walk', stateT: rand(1.2, 2.2), dashDir: 0, wob: rand(0, 6.28), sp: 1,
    };
  }

  function resetGame() {
    S.t = 0; S.score = 0; S.combo = 0; S.maxCombo = 0; S.lastKO = -99; S.kos = 0; S.perfects = 0; S.caroms = 0; S.oles = 0;
    S.newRecord = false;
    S.player = makeEntity('player', 0, 0);
    S.enemies.length = 0; S.particles.length = 0; S.texts.length = 0; S.ripples.length = 0;
    S.rings.length = 0; S.stars.length = 0; S.ghosts.length = 0; S.confetti.length = 0; S.trauma = 0; S.zoomKick = 0;
    S.aim = -Math.PI / 2; S.charging = false; S.charge = 0; S.chargeOver = 0; S.dashT = 0; S.dashC = 0; S.recover = 0;
    S.nextSpawn = 0.6; S.hitstop = 0; S.shake = 0; S.flash = 0; S.tutKOs = 0;
    S.powersTaken = 0; S.sharkKOs = 0; S.bestMulti = 0; S.nears = 0; S.fevers = 0; S.saves = 0; S.bruteKOs = 0; S.runStars = 0; S.toasts.length = 0; S.dashKOs = 0; S.nearCheck = false;
    shark.hidden = 0; shark.bite = 0; shark.a = rand(0, 6.283);
    S.powerups.length = 0; S.nextPower = 6; S.chili = 0; S.chiliDash = false; S.bubble = false; S.fever = 0; S.banner = null; S.slowmo = 0; S.bossKOs = 0; S.iceK = 0; S.mod = ''; S.wind = null;
  }

  function startGame() {
    Sound.init();
    Sound.chargeStop();
    resetGame();
    S.mode = 'play';
    S.bestAtStart = S.best; S.revived = false; S.starsDoubled = false; S.rewardedThisRun = false;
    Ads.sessionGames++; Ads.gamesSinceAd++;
    Sound.start();
    startWave(1);
    Sound.musicStart();
  }

  // ---------- Spawn ----------
  function spawnPos(minFromPlayer) {
    const p = S.player;
    let best = null;
    for (let i = 0; i < 30; i++) {
      const a = rand(0, 6.283), r = rand(40, DISC - 45);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (len(x - p.x, y - p.y) < minFromPlayer) continue;
      if (S.enemies.some(e => len(e.x - x, e.y - y) < e.r + 40)) continue;
      best = { x, y }; break;
    }
    if (!best) { const a = Math.atan2(-p.y, -p.x) + rand(-0.6, 0.6); best = { x: Math.cos(a) * 120, y: Math.sin(a) * 120 }; }
    return best;
  }
  function spawn(kind, x, y) {
    const e = makeEntity(kind, x, y);
    e.drop = 0.9;
    e.sp = S.waveSp;
    S.enemies.push(e);
    return e;
  }
  // ---------- Ondate, eventi, potenziamenti ----------
  const MODS = {
    vento: { name: 'WIND!', sub: 'gusts push everyone around' },
    ghiaccio: { name: 'ICE!', sub: 'slippery: every hit sends them flying' },
    pioggia: { name: 'MINI MADNESS!', sub: 'lots of small, fast, light ones' },
  };
  const POWERS = {
    chili: { col: '#ff5a3c', name: 'CHILI!', sub: '3 explosive dashes' },
    bubble: { col: '#7fd8ff', name: 'BUBBLE!', sub: 'saves you from one fall' },
    ice: { col: '#bdf0ff', name: 'FREEZE!', sub: 'frozen enemies slide away' },
  };
  function banner(text, sub, col) { S.banner = { text, sub: sub || '', col: col || '#ffffff', t: 0, dur: 2.1 }; }
  function pickW(opts) {
    let tot = 0; for (const o of opts) tot += o[1];
    let r = Math.random() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[0][0];
  }
  function startWave(n) {
    S.wave = n; S.waveState = 'intro'; S.waveT = 1.5; S.waveFightT = 0; S.rage = 0; S.rageShown = false;
    const boss = n % 5 === 0;
    let mod = '';
    if (!boss) {
      if (n === 3) mod = 'vento';
      else if (n === 6) mod = 'ghiaccio';
      else if (n === 8) mod = 'pioggia';
      else if (n > 8 && Math.random() < 0.5) mod = pickW([['vento', 1], ['ghiaccio', 1], ['pioggia', 1]]);
    }
    S.mod = mod;
    const q = [];
    if (boss) {
      q.push('boss');
      for (let i = 0; i < 2 + Math.floor(n / 5); i++) q.push(i % 2 ? 'dasher' : 'walker');
    } else if (mod === 'pioggia') {
      for (let i = 0; i < 4 + Math.ceil(n / 2); i++) q.push('minis');
    } else {
      const count = Math.min(3 + n, 14);
      for (let i = 0; i < count; i++) {
        const opts = [['walker', 3]];
        if (n >= 2) opts.push(['dasher', 2]);
        if (n >= 3) opts.push(['minis', 1.2]);
        if (n >= 4) opts.push(['brute', 1 + n * 0.05]);
        q.push(pickW(opts));
      }
    }
    if (n === 1 && S.tutorial) { q.length = 0; q.push('walker', 'walker'); }
    S.waveQueue = q;
    S.waveMax = boss ? 3 : Math.min(2 + Math.floor(n / 1.5), 7);
    S.waveGap = Math.max(0.55, 1.7 - n * 0.1);
    S.waveNext = 0;
    S.waveSp = 1 + Math.min(0.6, (n - 1) * 0.06);
    S.wind = null; S.windNext = 2.2;
    S.iceK = 0;
    if (boss) banner(`WAVE ${n}`, 'KING PUDDING IS COMING!', COL.danger);
    else if (mod) banner(`WAVE ${n}`, MODS[mod].name, COL.gold);
    else banner(`WAVE ${n}`, n === 1 ? 'dunk them all!' : '', '#ffffff');
    Sound.waveStart(boss);
    Sound.musicSet(Math.min(3, Math.floor((n - 1) / 2)), 100 + Math.min(40, (n - 1) * 3.5), S.fever > 0);
  }
  function waves(dt) {
    if (S.mod === 'ghiaccio') S.iceK = Math.min(1, S.iceK + dt * 1.5);
    else S.iceK = Math.max(0, S.iceK - dt * 1.5);
    if (S.waveState === 'intro') { S.waveT -= dt; if (S.waveT <= 0) S.waveState = 'fight'; return; }
    if (S.waveState === 'clear') { S.waveT -= dt; if (S.waveT <= 0) startWave(S.wave + 1); return; }
    S.waveFightT += dt;
    S.rage = clamp((S.waveFightT - 20) / 25, 0, 0.7);
    if (S.rage > 0 && !S.rageShown) { S.rageShown = true; banner("THEY'RE GETTING ANGRY!", 'dunk somebody!', COL.danger); }
    S.waveNext -= dt;
    if (S.waveQueue.length && S.waveNext <= 0 && S.enemies.length < S.waveMax) {
      const kind = S.waveQueue.shift();
      const p = spawnPos(kind === 'boss' ? 130 : 110);
      if (kind === 'minis') { spawn('mini', p.x - 14, p.y); spawn('mini', p.x + 14, p.y); }
      else spawn(kind, p.x, p.y);
      S.waveNext = S.waveGap;
    }
    if (!S.waveQueue.length && S.enemies.every(e => e.fall !== 0)) waveClear();
    if (S.mod === 'vento') windUpdate(dt);
    S.nextPower -= dt;
    if (S.nextPower <= 0 && !S.powerups.length && S.wave >= 2) { spawnPower(); S.nextPower = rand(9, 14); }
  }
  function waveClear() {
    S.waveState = 'clear'; S.waveT = 2.1;
    const bonus = 150 * S.wave;
    S.score += bonus; S.scorePop = 1;
    banner('RAFT CLEARED!', `wave bonus +${bonus}`, COL.gold);
    S.slowmo = 0.45;
    S.mod = ''; S.wind = null;
    Sound.waveClear();
  }

  function windUpdate(dt) {
    if (!S.wind) {
      S.windNext -= dt;
      if (S.windNext <= 0) { S.wind = { a: rand(0, 6.283), warn: 1.4, t: 3.2 }; Sound.windWarn(); }
      return;
    }
    const w = S.wind;
    if (w.warn > 0) { w.warn -= dt; if (w.warn <= 0) Sound.wind(); return; }
    w.t -= dt;
    if (Math.random() < dt * 70) {
      const ex = VIEW * 1.6, px = rand(-ex, ex), py = rand(-ex, ex), v = rand(480, 700);
      addP({ x: px, y: py, vx: Math.cos(w.a) * v, vy: Math.sin(w.a) * v, life: 0.5, max: 0.5, col: '#ffffff', size: rand(2.2, 3.6), kind: 'streak', drag: 0 });
    }
    if (w.t <= 0) { S.wind = null; S.windNext = rand(2.5, 4.5); }
  }
  const windActive = () => S.wind && S.wind.warn <= 0;
  function applyWind(e, dt) {
    if (!windActive() || e.fall !== 0 || e.drop > 0) return;
    const f = 80 / Math.sqrt(massOf(e));
    e.vx += Math.cos(S.wind.a) * f * dt; e.vy += Math.sin(S.wind.a) * f * dt;
  }
  // attrito di base: sul ghiaccio si scivola molto di più
  const baseDamp = () => DAMP * (1 - 0.62 * S.iceK);
  const playerDamp = () => DAMP * (1 - 0.35 * S.iceK);   // tu hai le scarpe chiodate: scivoli meno dei nemici

  function spawnPower() {
    const P = S.player;
    let pos = null;
    for (let i = 0; i < 25; i++) {
      const a = rand(0, 6.283), r = rand(20, 125), x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (len(x - P.x, y - P.y) > 70 && !S.enemies.some(e => len(e.x - x, e.y - y) < e.r + 20)) { pos = { x, y }; break; }
    }
    if (!pos) return;
    const opts = [['chili', 1.2], ['ice', 1]];
    if (!S.bubble) opts.push(['bubble', 1]);
    S.powerups.push({ x: pos.x, y: pos.y, type: pickW(opts), life: 9, max: 9, ph: rand(0, 6.28) });
    S.rings.push({ x: pos.x, y: pos.y, r: 4, vr: 120, life: 0.4, max: 0.4, col: '#ffffff', w: 4 });
    Sound.powerSpawn();
  }
  function powerUpdate(dt) {
    const P = S.player;
    for (const u of S.powerups) {
      u.life -= dt;
      if (P.fall === 0 && len(u.x - P.x, u.y - P.y) < P.r + 15) { collect(u); u.life = 0; }
    }
    S.powerups = S.powerups.filter(u => u.life > 0);
  }
  function collect(u) {
    const info = POWERS[u.type], P = S.player;
    if (u.type === 'chili') S.chili = 3;
    else if (u.type === 'bubble') S.bubble = true;
    else if (u.type === 'ice') {
      for (const e of S.enemies) if (e.drop <= 0 && e.fall === 0) {
        e.frozen = 3.6;
        if (e.state === 'aim' || e.state === 'dash' || e.state === 'jump') { e.state = e.kind === 'boss' ? 'walk' : 'rest'; e.stateT = 1.5; }
        burst(e.x, e.y, '#dff7ff', 10, 90);
      }
    }
    S.powersTaken++; buzz(25);
    floatText(P.x, P.y - 40, info.name, info.col, 18, true);
    floatText(P.x, P.y - 18, info.sub, '#ffffff', 11, true);
    S.rings.push({ x: P.x, y: P.y, r: P.r, vr: 320, life: 0.45, max: 0.45, col: info.col, w: 7 });
    burst(P.x, P.y, info.col, 22, 200);
    S.flash = 0.3; S.flashCol = info.col;
    Sound.power();
  }

  function chiliBlast(x, y) {
    // onda d'urto del peperoncino: spinge via tutti i nemici vicini
    S.rings.push({ x, y, r: 10, vr: 520, life: 0.4, max: 0.4, col: '#ff7a3c', w: 10 });
    S.rings.push({ x, y, r: 4, vr: 380, life: 0.35, max: 0.35, col: '#ffd166', w: 6 });
    for (let i = 0; i < 26; i++) {
      const a = rand(0, 6.283), v = rand(120, 300);
      addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.6), max: 0.6, col: Math.random() < 0.5 ? '#ff7a3c' : '#ffd166', size: rand(4, 8), kind: 'flame', drag: 4 });
    }
    for (const e of S.enemies) {
      if (e.drop > 0 || e.fall !== 0) continue;
      const dx = e.x - x, dy = e.y - y, d = len(dx, dy);
      if (d > 95 || d < 0.01) continue;
      const k = (260 * (1 - d / 95) + 90) / Math.sqrt(e.m);
      e.vx += dx / d * k; e.vy += dy / d * k;
      e.stun = Math.max(e.stun, 0.7); e.credit = S.t; e.carom = false; e.squash = 1;
    }
    S.trauma = Math.min(1, S.trauma + 0.5);
    Sound.boom();
  }

  function bubbleSave(P) {
    S.bubble = false; S.saves++; buzz(30);
    const r = len(P.x, P.y) || 1, nx = P.x / r, ny = P.y / r;
    P.x = nx * (DISC - 6); P.y = ny * (DISC - 6);
    const vn = P.vx * nx + P.vy * ny;
    P.vx = (P.vx - 2 * vn * nx) * 0.5 - nx * 160; P.vy = (P.vy - 2 * vn * ny) * 0.5 - ny * 160;
    P.squash = 1;
    S.rings.push({ x: P.x, y: P.y, r: P.r + 6, vr: 260, life: 0.4, max: 0.4, col: '#7fd8ff', w: 6 });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, 6.283), v = rand(60, 180);
      addP({ x: P.x, y: P.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 0, vz: rand(40, 140), g: 500, life: 0.8, max: 0.8, col: '#e9fbff', size: rand(2, 3.5), kind: 'drop', drag: 2 });
    }
    floatText(P.x - nx * 30, P.y - ny * 30 - 20, 'SAVED!', '#7fd8ff', 20, true);
    S.trauma = Math.min(1, S.trauma + 0.3);
    Sound.pop();
  }

  function bossAI(e, dt, ux, uy, d) {
    e.stateT -= dt;
    if (e.state === 'jump') {
      e.vx *= 1 - 8 * dt; e.vy *= 1 - 8 * dt;
      if (e.stateT <= 0) bossSlam(e);
      return;
    }
    if (e.stateT <= 0) { e.state = 'jump'; e.stateT = 0.95; Sound.bossJump(); return; }
    const T = TYPES.boss;
    const vAlong = e.vx * ux + e.vy * uy;
    if (vAlong < T.speed * e.sp) { e.vx += ux * T.accel * dt; e.vy += uy * T.accel * dt; }
    e.face = Math.atan2(uy, ux);
    const r = len(e.x, e.y);
    if (r > DISC - 40) { const out = (e.vx * e.x + e.vy * e.y) / r; if (out > 0) { e.vx -= (e.x / r) * 200 * dt; e.vy -= (e.y / r) * 200 * dt; } }
  }
  const SLAM_R = 125;
  function bossSlam(e) {
    e.state = 'walk'; e.stateT = rand(3.6, 5);
    e.squash = 1;
    for (const o of [S.player, ...S.enemies]) {
      if (o === e || o.drop > 0 || o.fall !== 0) continue;
      const dx = o.x - e.x, dy = o.y - e.y, d = len(dx, dy);
      if (d > SLAM_R || d < 0.01) continue;
      const k = (300 * (1 - d / SLAM_R) + 70) / Math.sqrt(o.kind === 'player' ? massOf(o) : o.m);
      o.vx += dx / d * k; o.vy += dy / d * k; o.squash = 1;
      if (o !== S.player) o.stun = Math.max(o.stun, 0.4);
    }
    S.rings.push({ x: e.x, y: e.y, r: e.r, vr: 500, life: 0.45, max: 0.45, col: '#fff3df', w: 12 });
    S.rings.push({ x: e.x, y: e.y, r: e.r, vr: 300, life: 0.4, max: 0.4, col: COL.danger, w: 5 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.283, v = rand(140, 220);
      addP({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, col: '#fff3df', size: rand(5, 9), kind: 'dust', grow: 1.6, drag: 4 });
    }
    S.trauma = 1;
    Sound.slam();
    buzz(50);
  }

  // ---------- Missioni, stelle, guardaroba ----------
  const MISSIONS = [
    { id: 'ko10', text: 'Dunk 10 enemies', stars: 1, ok: r => r.kos >= 10 },
    { id: 'perf3', text: 'Land 3 PERFECT dashes', stars: 1, ok: r => r.perfects >= 3 },
    { id: 'w4', text: 'Reach wave 4', stars: 1, ok: r => r.wave >= 4 },
    { id: 'carom', text: 'Score a CAROM', stars: 1, ok: r => r.caroms >= 1 },
    { id: 'pow3', text: 'Grab 3 power-ups', stars: 1, ok: r => r.powers >= 3 },
    { id: 'shark1', text: 'Feed an enemy to the shark', stars: 1, ok: r => r.sharks >= 1 },
    { id: 'ole', text: 'Score an OLÉ: dodge a charger', stars: 1, ok: r => r.oles >= 1 },
    { id: 'combo5', text: 'Hit a ×5 combo', stars: 2, ok: r => r.maxCombo >= 5 },
    { id: 'boss', text: 'Dunk King Pudding', stars: 2, ok: r => r.bossKOs >= 1 },
    { id: 'double', text: 'DOUBLE: dunk 2 with one dash', stars: 2, ok: r => r.bestMulti >= 2 },
    { id: 'near3', text: 'Pull off 3 CLOSE CALLS', stars: 2, ok: r => r.nears >= 3 },
    { id: 's5k', text: 'Score 5,000 points', stars: 2, ok: r => r.score >= 5000 },
    { id: 'bubble', text: 'Get saved by the bubble', stars: 1, ok: r => r.saves >= 1 },
    { id: 'fever2', text: 'Go into FEVER twice', stars: 2, ok: r => r.fevers >= 2 },
    { id: 'brute3', text: 'Dunk 3 brutes', stars: 2, ok: r => r.brutes >= 3 },
    { id: 'shark3', text: 'Feed 3 enemies to the shark', stars: 2, ok: r => r.sharks >= 3 },
    { id: 'w8', text: 'Reach wave 8', stars: 3, ok: r => r.wave >= 8 },
    { id: 'triple', text: 'TRIPLE: dunk 3 with one dash', stars: 3, ok: r => r.bestMulti >= 3 },
    { id: 's15k', text: 'Score 15,000 points', stars: 3, ok: r => r.score >= 15000 },
    { id: 'boss2', text: 'Dunk King Pudding twice', stars: 3, ok: r => r.bossKOs >= 2 },
    { id: 'ko60', text: 'Dunk 60 enemies in one run', stars: 3, ok: r => r.kos >= 60 },
    { id: 'w12', text: 'Reach wave 12', stars: 3, ok: r => r.wave >= 12 },
  ];
  const HATS = [
    { id: 'bandana', name: 'Red bandana', stars: 0 },
    { id: 'cap', name: 'Cap', stars: 2 },
    { id: 'shades', name: 'Sunglasses', stars: 4 },
    { id: 'straw', name: 'Straw hat', stars: 7 },
    { id: 'viking', name: 'Viking helmet', stars: 10 },
    { id: 'pirate', name: 'Pirate hat', stars: 14 },
    { id: 'swim', name: 'Swim cap', stars: 19 },
    { id: 'halo', name: 'Halo', stars: 25 },
  ];
  const META_KEY = 'tonfo.meta';
  const meta = (() => {
    try {
      const m = JSON.parse(store.get(META_KEY) || '{}');
      return { stars: m.stars | 0, done: Array.isArray(m.done) ? m.done : [], hat: typeof m.hat === 'string' ? m.hat : 'bandana' };
    } catch (e) { return { stars: 0, done: [], hat: 'bandana' }; }
  })();
  if (!HATS.some(h => h.id === meta.hat && meta.stars >= h.stars)) meta.hat = 'bandana';
  const saveMeta = () => store.set(META_KEY, JSON.stringify(meta));
  const activeMissions = () => MISSIONS.filter(m => !meta.done.includes(m.id)).slice(0, 3);
  const nextHat = () => HATS.find(h => h.stars > meta.stars);
  function cycleHat(dir) {
    const owned = HATS.filter(h => meta.stars >= h.stars);
    const i = owned.findIndex(h => h.id === meta.hat);
    meta.hat = owned[(i + dir + owned.length) % owned.length].id;
    saveMeta();
    S.hatPop = 1;
    Sound.powerSpawn();
  }
  function runStats() {
    return { kos: S.kos, perfects: S.perfects, wave: S.wave, caroms: S.caroms, powers: S.powersTaken, oles: S.oles, sharks: S.sharkKOs,
      maxCombo: S.maxCombo, bossKOs: S.bossKOs, bestMulti: S.bestMulti, nears: S.nears, score: S.score, fevers: S.fevers, saves: S.saves, brutes: S.bruteKOs };
  }
  function checkMissions() {
    const r = runStats();
    for (const m of activeMissions()) {
      if (!m.ok(r)) continue;
      const before = meta.stars;
      meta.done.push(m.id); meta.stars += m.stars; saveMeta();
      S.runStars += m.stars;
      S.toasts.push({ text: m.text, stars: m.stars, t: 0 });
      const hat = HATS.find(h => h.stars > before && h.stars <= meta.stars);
      if (hat) S.toasts.push({ text: `Unlocked: ${hat.name}!`, stars: 0, t: -1.3, hat: hat.id });
      Sound.mission();
      buzz(30);
    }
  }
  const buzz = ms => {
    if (Sound.muted) return;
    try {
      if (window.TonfoAndroid && window.TonfoAndroid.vibrate) window.TonfoAndroid.vibrate(ms);   // app Android
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* non supportato */ }
  };

  // ---------- Squalo ----------
  const shark = { a: 0.8, sp: 0.45, hidden: 0, bite: 0, bx: 0, by: 0 };
  const SHARK_R = DISC + 42;
  function sharkUpdate(dt) {
    if (shark.hidden > 0) {
      shark.hidden -= dt;
      if (shark.hidden <= 0) {
        shark.a = rand(0, 6.283); shark.sp = (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.6);
        S.ripples.push({ x: Math.cos(shark.a) * SHARK_R, y: Math.sin(shark.a) * SHARK_R, r: 4, vr: 40, life: 0.8, max: 0.8 });
      }
    } else shark.a += shark.sp * dt;
    shark.bite = Math.max(0, shark.bite - dt);
  }
  const sharkActive = () => S.wave >= 2 && shark.hidden <= 0;
  function sharkNear(e) {
    if (!sharkActive()) return false;
    const a = Math.atan2(e.y, e.x);
    return Math.abs(Math.atan2(Math.sin(a - shark.a), Math.cos(a - shark.a))) < 0.42;
  }
  function sharkBite(e) {
    const r = len(e.x, e.y) || 1;
    shark.bite = 0.6; shark.bx = e.x / r * (DISC + 26); shark.by = e.y / r * (DISC + 26);
    shark.hidden = 3.5;
    S.trauma = Math.min(1, S.trauma + 0.4);
    Sound.chomp();
  }

  // ---------- Colpi multipli e "per un pelo" ----------
  const MULTI = ['', '', 'DOUBLE!', 'TRIPLE!', 'STRIKE!'];
  function multiKO() {
    const n = S.dashKOs;
    S.bestMulti = Math.max(S.bestMulti, n);
    const bonus = 300 * (n - 1);
    S.score += bonus; S.scorePop = 1;
    S.banner = { text: MULTI[Math.min(n, 4)], sub: `bonus +${bonus}`, col: COL.gold, t: 0, dur: 1.4 };
    S.slowmo = Math.max(S.slowmo, 0.35);
    S.zoomKick = 0.06;
    Sound.multi(n);
    buzz(40);
  }
  function nearCheck() {
    const P = S.player;
    if (!S.nearCheck || P.fall !== 0 || S.dashT > 0 || len(P.vx, P.vy) > 30) return;
    S.nearCheck = false;
    if (len(P.x, P.y) > DISC - 14) {
      S.nears++; S.score += 50; S.scorePop = 1;
      floatText(P.x, P.y - 34, 'CLOSE CALL!', '#bfeaff', 17, true);
      floatText(P.x, P.y - 14, '+50', '#ffffff', 13, true);
      Sound.near();
    }
  }

  // ---------- Azioni ----------
  function press() {
    if (S.mode !== 'play' || S.charging || S.player.fall > 0) return;
    S.charging = true; S.charge = 0; S.chargeOver = 0; S.fullPlayed = false;
    Sound.chargeStart();
  }
  function release() {
    if (S.mode !== 'play' || !S.charging) return;
    S.charging = false;
    Sound.chargeStop();
    const p = S.player;
    if (S.recover > 0) return;            // rilasciato prima che la carica partisse: niente scatto
    const perfect = S.charge >= 1 && S.chargeOver <= PERFECT_WIN;
    const c = ease(S.charge);
    let pow = POW_MIN + (POW_MAX - POW_MIN) * c;
    if (perfect) { pow *= PERFECT_MULT; S.perfects++; floatText(p.x, p.y - 30, 'PERFECT', COL.gold, 14); }
    S.chiliDash = false;
    if (S.chili > 0) { S.chili--; S.chiliDash = true; pow *= 1.25; Sound.boom(); }
    p.vx = Math.cos(S.aim) * pow + p.vx * 0.2;
    p.vy = Math.sin(S.aim) * pow + p.vy * 0.2;
    p.squash = 1;
    S.dashKOs = 0; S.nearCheck = true;
    S.lastDash = S.t; S.dashT = DASH_T; S.dashPerfect = perfect; S.dashC = c; S.recover = RECOVER_T;
    dashFx(p, S.aim, perfect);
    Sound.dash(perfect);
  }
  const ease = c => 1 - Math.pow(1 - clamp(c, 0, 1), 2);
  function currentPower() {
    const perfect = S.charge >= 1 && S.chargeOver <= PERFECT_WIN;
    return (POW_MIN + (POW_MAX - POW_MIN) * ease(S.charge)) * (perfect ? PERFECT_MULT : 1) * (S.chili > 0 ? 1.25 : 1);
  }

  function massOf(e) {
    if (e.kind === 'player') return S.charging ? e.m + 1.3 * ease(S.charge) : S.dashT > 0 ? e.m + 1.8 * S.dashC + (S.dashPerfect ? 0.4 : 0) : e.m;
    if (e.kind === 'dasher' && e.state === 'dash') return 1.6;
    return e.m;
  }

  // ---------- Fisica ----------
  function collide(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = a.r + b.r;
    if (d2 >= rr * rr || d2 < 1e-6) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    const ma = massOf(a), mb = massOf(b), inv = 1 / ma + 1 / mb;
    const ov = rr - d;
    a.x -= nx * ov * (1 / ma) / inv; a.y -= ny * ov * (1 / ma) / inv;
    b.x += nx * ov * (1 / mb) / inv; b.y += ny * ov * (1 / mb) / inv;
    const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vrel >= 0) return;
    const j = -(1 + 0.8) * vrel / inv;
    a.vx -= j * nx / ma; a.vy -= j * ny / ma;
    b.vx += j * nx / mb; b.vy += j * ny / mb;
    impact(a, b, nx, ny, -vrel);
  }

  function impact(a, b, nx, ny, speed) {
    const P = S.player;
    if (a === P || b === P) {
      const e = a === P ? b : a, sx = a === P ? 1 : -1;
      if (S.dashT > 0 && speed > 90) {
        // colpo del giocatore: spinta extra, stordimento, credito per il KO
        const k = (0.08 + 0.32 * S.dashC) * (S.dashPerfect ? 1.55 : 1) * speed / Math.sqrt(e.m);
        e.vx += nx * sx * k; e.vy += ny * sx * k;
        e.stun = 0.8; e.credit = S.t; e.carom = false; e.squash = 1;
        if (e.state === 'aim' || e.state === 'dash') { e.state = 'rest'; e.stateT = 1.2; }
        if (e.kind === 'boss' && e.state === 'jump') { e.state = 'walk'; e.stateT = 2.5; }
        P.vx *= 0.3; P.vy *= 0.3; S.dashT = 0;
        S.hitstop = S.dashPerfect ? 0.09 : 0.05;
        S.shake = Math.max(S.shake, S.dashPerfect ? 9 : 5);
        impactFx((P.x + e.x) / 2, (P.y + e.y) / 2, speed / 450, S.dashPerfect, bodyColors(e)[0]);
        if (S.chiliDash) { S.chiliDash = false; chiliBlast((P.x + e.x) / 2, (P.y + e.y) / 2); }
        Sound.thump(speed / 500);
        buzz(12);
      } else if (e.kind === 'dasher' && e.state === 'dash') {
        e.state = 'rest'; e.stateT = 1.2; e.vx *= 0.3; e.vy *= 0.3;
        P.squash = 1; S.shake = Math.max(S.shake, 6);
        impactFx((P.x + e.x) / 2, (P.y + e.y) / 2, 0.6, false, COL.dasher);
        Sound.thump(0.6);
      } else if (speed > 40) Sound.bump(speed / 300);
      return;
    }
    // nemico contro nemico: il credito passa (carambola)
    if (speed > 110) {
      const fresh = x => x.credit > S.t - 3 && x.stun > 0;
      if (fresh(a) && !fresh(b)) { b.credit = a.credit; b.carom = true; b.stun = 0.7; }
      else if (fresh(b) && !fresh(a)) { a.credit = b.credit; a.carom = true; a.stun = 0.7; }
      a.squash = b.squash = 1;
      impactFx((a.x + b.x) / 2, (a.y + b.y) / 2, speed / 600, false);
      Sound.thump(speed / 700);
    } else if (speed > 40) Sound.bump(speed / 400);
  }

  function enemyAI(e, dt) {
    const P = S.player;
    const dx = P.x - e.x, dy = P.y - e.y, d = len(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const T = TYPES[e.kind];
    e.stun = Math.max(0, e.stun - dt);
    if (e.frozen > 0) { e.frozen -= dt; return; }
    if (e.stun > 0 || P.fall > 0) return;
    if (e.kind === 'boss') { bossAI(e, dt, ux, uy, d); return; }
    if (e.kind === 'dasher') {
      e.stateT -= dt;
      if (e.state === 'walk') {
        if (e.stateT <= 0 && d < 260) { e.state = 'aim'; e.stateT = 0.8; Sound.warn(); }
      } else if (e.state === 'aim') {
        if (e.stateT > 0.22) e.dashDir = Math.atan2(dy, dx);   // mira fino a 0,22 s prima, poi blocca
        e.face = e.dashDir;
        e.vx *= 1 - 6 * dt; e.vy *= 1 - 6 * dt;
        if (e.stateT <= 0) {
          e.state = 'dash'; e.stateT = 0.5;
          const v = 380 * e.sp;
          e.vx = Math.cos(e.dashDir) * v; e.vy = Math.sin(e.dashDir) * v; e.squash = 1;
        }
        return;
      } else if (e.state === 'dash') {
        if (e.stateT <= 0) { e.state = 'rest'; e.stateT = 1.0; }
        return;
      } else if (e.state === 'rest') {
        if (e.stateT <= 0) { e.state = 'walk'; e.stateT = rand(1.4, 2.4); }
        return;
      }
    }
    // cammina verso il giocatore
    const vAlong = e.vx * ux + e.vy * uy, rg = 1 + (S.rage || 0);
    if (vAlong < T.speed * e.sp * rg) { e.vx += ux * T.accel * rg * dt; e.vy += uy * T.accel * rg * dt; }
    e.face = Math.atan2(uy, ux);
    // un minimo di istinto di sopravvivenza vicino al bordo
    const r = len(e.x, e.y);
    if (r > DISC - 18) {
      const out = (e.vx * e.x + e.vy * e.y) / r;
      if (out > 0) { e.vx -= (e.x / r) * 300 * dt; e.vy -= (e.y / r) * 300 * dt; }
    }
  }

  function integrate(e, dt, damp) {
    const k = Math.exp(-damp * dt);
    e.vx *= k; e.vy *= k;
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.squash = Math.max(0, e.squash - 4 * dt);
  }

  // ---------- Eventi ----------
  function startFall(e) {
    e.fall = FALL_T;
    if (e === S.player && S.bubble && S.mode === 'play') { e.fall = 0; bubbleSave(e); return; }
    if (e === S.player) {
      S.deathCause = S.t - S.lastDash < 0.9 ? 'self' : 'pushed';
      if (sharkNear(e)) { sharkBite(e); floatText(e.x, e.y - 30, 'CHOMP!', '#9fe3f5', 22, true); }
      buzz(90);
      S.charging = false; Sound.chargeStop();
      return;
    }
    if (S.mode === 'play') ko(e);
  }

  function ko(e) {
    const credited = e.credit > S.t - 3;
    let pts = 100, label = '', col = COL.text;
    if (e.kind === 'dasher' && e.state === 'dash' && !credited) { pts = 200; label = 'OLÉ!'; col = COL.dasher; S.oles++; }
    else if (credited && e.carom) { pts = 200; label = 'CAROM!'; col = COL.gold; S.caroms++; }
    else if (!credited) { pts = 50; label = 'SLIPPED'; col = COL.mute; }
    if (e.kind === 'brute') pts *= 2;
    if (e.kind === 'boss') { pts = 1000; label = 'KING DUNKED!'; col = COL.gold; S.bossKOs++; confetti(); S.slowmo = 0.8; S.trauma = 1; }
    if (e.frozen > 0 && credited) label = label || 'WHEEE!';
    if (e.kind === 'brute') S.bruteKOs++;
    if (sharkNear(e)) { pts *= 3; label = 'CHOMP! ×3'; col = '#9fe3f5'; S.sharkKOs++; sharkBite(e); }
    if (credited && e.credit >= (S.lastDash || 0) - 0.001) { S.dashKOs++; if (S.dashKOs >= 2) multiKO(); }
    S.combo = S.t - S.lastKO < COMBO_WIN ? S.combo + 1 : 1;
    S.lastKO = S.t;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    if (S.combo >= 4 && S.fever <= 0) { S.fever = FEVER_T; S.fevers++; floatText(e.x, e.y - 72, 'FEVER!', '#ffb238', 22, true); Sound.fever(); Sound.musicSet(Math.min(3, Math.floor((S.wave - 1) / 2)) + 1, 100 + Math.min(40, (S.wave - 1) * 3.5) + 8, true); }
    else if (S.fever > 0) S.fever = Math.min(FEVER_T + 2, S.fever + 1);
    const total = pts * S.combo * (S.fever > 0 ? 2 : 1);
    S.score += total; S.kos++; S.scorePop = 1;
    floatText(e.x, e.y - 26, `+${total}`, '#ffffff', 20, true);
    if (label) floatText(e.x, e.y - 50, label, col, 17, true);
    if (S.combo > 1) floatText(e.x, e.y + 30, `COMBO ×${S.combo}`, COL.gold, 15, true);
    Sound.ko(S.combo);
    buzz(20);
    if (S.tutorial) { S.tutKOs++; if (S.tutKOs >= 2) { S.tutorial = false; store.set(LS_TUT, '1'); } }
  }

  function splash(e) {
    Sound.splash();
    splashFx(e);
  }

  function die() {
    S.mode = 'dying'; S.dieT = 0.5;
    S.flash = 0.5; S.flashCol = COL.water2;
  }
  function endGame() {
    S.mode = 'over'; S.overT = 0;
    S.newRecord = S.score > (S.bestAtStart == null ? S.best : S.bestAtStart);
    if (S.score > S.best) { S.best = S.score; store.set(LS_BEST, String(S.best)); }
    Ads.readyT = 0;
    S.tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    checkMissions();
    Sound.musicStop();
    Sound.over();
    if (S.newRecord) { Sound.record(); confetti(); }
  }

  function togglePause() {
    if (S.mode === 'play') {
      S.mode = 'paused';
      if (S.charging) { S.charging = false; Sound.chargeStop(); }
      Sound.musicStop();
    } else if (S.mode === 'paused') { S.mode = 'play'; Sound.musicStart(); }
  }

  // ---------- Effetti ----------
  // Particelle con altezza z (pseudo-3D): gli schizzi d'acqua salgono e ricadono.
  function addP(p) {
    S.particles.push(Object.assign({ z: 0, vz: 0, g: 0, drag: 4, rot: 0, vr: 0, kind: 'dot', grow: 0 }, p));
    if (S.particles.length > 800) S.particles.splice(0, S.particles.length - 800);
  }
  function burst(x, y, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), v = rand(0.35, 1) * spd;
      addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.45), max: 0.45, col, size: rand(1.5, 3), kind: 'spark', drag: 6 });
    }
  }
  function puff(x, y, col, spd) {
    const a = rand(0, 6.283), v = rand(0.2, 1) * spd;
    addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.35, 0.6), max: 0.6, col, size: rand(4, 7), kind: 'dust', grow: 1.6, drag: 5 });
  }
  function impactFx(x, y, strength, perfect, col) {
    const s = clamp(strength, 0, 1.4);
    S.rings.push({ x, y, r: 6, vr: 260 + 260 * s, life: 0.32, max: 0.32, col: perfect ? COL.gold : '#ffffff', w: 6 });
    S.stars.push({ x, y, life: 0.16, max: 0.16, size: 18 + 26 * s, rot: rand(0, 6.28), col: perfect ? COL.gold : '#ffffff' });
    burst(x, y, '#ffffff', 10 + Math.round(14 * s), 160 + 200 * s);
    if (col) burst(x, y, col, 6, 120);
    for (let i = 0; i < 5; i++) puff(x, y, '#fff3df', 70);
    S.trauma = Math.min(1, S.trauma + 0.22 + 0.3 * s);
    if (perfect) { S.zoomKick = 0.07; S.flash = 0.35; S.flashCol = '#fff6d8'; }
  }
  function dashFx(p, dir, perfect) {
    const bx = p.x - Math.cos(dir) * p.r, by = p.y - Math.sin(dir) * p.r;
    for (let i = 0; i < 10; i++) puff(bx, by, '#fff3df', 60);
    for (let i = 0; i < 6; i++) {
      const a = dir + Math.PI + rand(-0.5, 0.5), v = rand(80, 200);
      addP({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, max: 0.25, col: '#ffffff', size: 2, kind: 'spark', drag: 6 });
    }
    if (perfect) {
      S.rings.push({ x: p.x, y: p.y, r: p.r, vr: 220, life: 0.3, max: 0.3, col: COL.gold, w: 5 });
      for (let i = 0; i < 14; i++) {
        const a = rand(0, 6.283), v = rand(60, 160);
        addP({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, col: COL.gold, size: rand(2, 3.5), kind: 'twinkle', drag: 4 });
      }
    }
  }
  function landFx(e) {
    S.rings.push({ x: e.x, y: e.y, r: e.r, vr: 160, life: 0.3, max: 0.3, col: '#fff3df', w: 5 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283, v = rand(70, 120);
      addP({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, col: '#fff3df', size: rand(4, 7), kind: 'dust', grow: 1.4, drag: 5 });
    }
    S.trauma = Math.min(1, S.trauma + (e.kind === 'brute' ? 0.35 : 0.12));
  }
  function splashFx(e) {
    const big = e.r / 16;
    S.ripples.push({ x: e.x, y: e.y, r: e.r * 0.6, vr: 55, life: 1.2, max: 1.2 });
    S.ripples.push({ x: e.x, y: e.y, r: e.r * 0.2, vr: 38, life: 0.9, max: 0.9 });
    S.ripples.push({ x: e.x, y: e.y, r: 2, vr: 24, life: 0.7, max: 0.7 });
    const n = Math.round(26 * big);
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), v = rand(20, 90) * big;
      addP({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 0, vz: rand(120, 300) * Math.sqrt(big), g: 700,
        life: 1.2, max: 1.2, col: Math.random() < 0.7 ? '#e9fbff' : '#8fd8ec', size: rand(2, 4.5) * Math.sqrt(big), kind: 'drop', drag: 1 });
    }
    for (let i = 0; i < 8; i++) {
      addP({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r) * 0.7, vx: 0, vy: 0, life: rand(0.6, 1.1), max: 1.1, col: '#e9fbff', size: rand(2, 4), kind: 'foam', drag: 2 });
    }
    S.trauma = Math.min(1, S.trauma + 0.2);
  }
  function bubbles(x, y) {
    addP({ x: x + rand(-8, 8), y: y + rand(-6, 6), vx: rand(-8, 8), vy: 0, z: 0, vz: rand(15, 35), g: -20, life: rand(0.8, 1.4), max: 1.4, col: '#e9fbff', size: rand(1.5, 3.5), kind: 'bubble', drag: 1 });
  }
  function confetti() {
    const cols = [COL.player, COL.gold, COL.mini, COL.walker, '#ffffff', COL.dasher];
    for (let i = 0; i < 90; i++) {
      S.confetti.push({ x: rand(0, W), y: rand(-H * 0.5, -10), vx: rand(-40, 40), vy: rand(80, 220), rot: rand(0, 6.28), vr: rand(-8, 8),
        w: rand(6, 11), h: rand(3, 6), col: cols[i % cols.length], life: rand(2.5, 4) });
    }
  }
  function floatText(x, y, text, col, size, big) {
    S.texts.push({ x, y, text, col, size, life: 1.2, max: 1.2, rot: rand(-0.12, 0.12), big: !!big });
  }

  function updateFx(dt) {
    for (const p of S.particles) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) { p.vz -= p.g * dt; p.z += p.vz * dt; if (p.z < 0 && p.kind === 'drop') { p.life = 0; if (Math.random() < 0.3) S.ripples.push({ x: p.x, y: p.y, r: 1, vr: 22, life: 0.45, max: 0.45 }); } }
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    S.particles = S.particles.filter(p => p.life > 0);
    for (const t of S.texts) { t.y -= 20 * dt; t.life -= dt; }
    S.texts = S.texts.filter(t => t.life > 0);
    for (const r of S.ripples) { r.r += r.vr * dt; r.life -= dt; }
    S.ripples = S.ripples.filter(r => r.life > 0);
    for (const r of S.rings) { r.r += r.vr * dt; r.vr *= 1 - 5 * dt; r.life -= dt; }
    S.rings = S.rings.filter(r => r.life > 0);
    for (const s of S.stars) s.life -= dt;
    S.stars = S.stars.filter(s => s.life > 0);
    for (const g of S.ghosts) g.life -= dt;
    S.ghosts = S.ghosts.filter(g => g.life > 0);
    for (const c of S.confetti) { c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 1 - 0.8 * dt; c.rot += c.vr * dt; c.life -= dt; c.x += Math.sin(c.rot) * 20 * dt; }
    S.confetti = S.confetti.filter(c => c.life > 0 && c.y < H + 20);
    // pesci e riflessi del sole (ambiente)
    for (const f of S.fish) f.a += f.sp * dt;
    if (Math.random() < dt * 6) S.glints.push({ x: rand(-VIEW * 2.2, VIEW * 2.2), y: rand(-VIEW * 1.8, VIEW * 1.8), life: 0.6, max: 0.6, s: rand(2, 4) });
    for (const g of S.glints) g.life -= dt;
    S.glints = S.glints.filter(g => g.life > 0 && len(g.x, g.y) > DISC + 20);
    S.trauma = Math.max(0, S.trauma - 1.8 * dt);
    S.shake = 0;
    S.flash = Math.max(0, S.flash - 2.2 * dt);
    S.zoomKick = Math.max(0, S.zoomKick - 0.35 * dt);
    S.scorePop = Math.max(0, S.scorePop - 4 * dt);
  }

  // scie (fantasmi) e aura di carica, aggiornate a ogni passo
  let trailTick = 0;
  function updateTrails(dt) {
    trailTick++;
    if (trailTick % 3) return;
    const P = S.player;
    for (const e of [P, ...S.enemies]) {
      if (e.drop > 0 || e.fall !== 0) continue;
      const sp = len(e.vx, e.vy);
      if (sp > 230 || (e === P && S.dashT > 0 && sp > 120)) {
        S.ghosts.push({ x: e.x, y: e.y, r: e.r, col: bodyColors(e)[0], life: 0.2, max: 0.2 });
      }
    }
    if (S.chili > 0 && P.fall === 0) {
      const fa = rand(0, 6.283); addP({ x: P.x + Math.cos(fa) * (P.r + 3), y: P.y + Math.sin(fa) * (P.r + 3), vx: Math.cos(fa) * 25, vy: Math.sin(fa) * 25 - 30, life: 0.35, max: 0.35, col: Math.random() < 0.5 ? '#ff7a3c' : '#ffd166', size: rand(1.8, 3.2), kind: 'flame', drag: 2 });
    }
    if (S.chiliDash && S.dashT > 0) for (let i = 0; i < 3; i++) addP({ x: P.x + rand(-8, 8), y: P.y + rand(-8, 8), vx: -P.vx * 0.2 + rand(-30, 30), vy: -P.vy * 0.2 + rand(-30, 30), life: 0.35, max: 0.35, col: Math.random() < 0.5 ? '#ff5a3c' : '#ffd166', size: rand(4, 7), kind: 'flame', drag: 3 });
    if (S.charging && S.recover <= 0 && P.fall === 0) {
      const a = rand(0, 6.283), d = rand(34, 48);
      const full = S.charge >= 1;
      addP({ x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90, life: 0.3, max: 0.3,
        col: full ? COL.gold : '#ffffff', size: rand(1.5, 2.6), kind: 'twinkle', drag: 0 });
    }
  }

  // ---------- Update ----------
  function update(dt) {
    S.clock += dt;
    updateFx(dt);
    if (S.banner) S.banner.t += dt;
    for (const t of S.toasts) t.t += dt;
    if (S.toasts.length && S.toasts.every(t => t.t > 2.8)) S.toasts.length = 0;
    S.hatPop = Math.max(0, S.hatPop - 4 * dt);
    if (S.mode === 'title') {
      S.aim += AIM_SPEED * dt; S.titleT = (S.titleT || 0) + dt;
      Ads.privacyT -= dt;
      if (Ads.privacyT <= 0) { Ads.privacyT = 1; try { Ads.privacy = Ads.on() && !!window.TonfoAndroid.privacyOptionsRequired(); } catch (e) { Ads.privacy = false; } }
      return;
    }
    if (S.mode === 'over') {
      S.overT += dt;
      Ads.readyT -= dt;
      if (Ads.readyT <= 0) { Ads.readyT = 0.5; Ads.rewardedOk = Ads.rewardedReady(); }
    }
    if (S.mode === 'paused') return;
    if (S.mode === 'play') S.t += dt;

    const P = S.player;
    // freccia e carica
    if (S.mode === 'play') {
      S.recover = Math.max(0, S.recover - dt);
      if (S.charging && S.recover > 0) {
        // premuto durante il recupero: la mira è già bloccata, la carica partirà a breve
      } else if (S.charging) {
        S.charge = Math.min(1, S.charge + dt / CHARGE_T);
        if (S.charge >= 1) {
          if (!S.fullPlayed) { S.fullPlayed = true; Sound.full(); burst(S.player.x, S.player.y, COL.gold, 14, 140); }
          S.chargeOver += dt;
        }
        Sound.chargeSet(S.charge);
      } else S.aim += AIM_SPEED * dt;
      S.dashT = Math.max(0, S.dashT - dt);
    }
    if (P.fall <= 0) P.face = S.aim;

    // nemici: caduta dal cielo, IA
    for (const e of S.enemies) {
      if (e.drop > 0) {
        e.drop -= dt;
        if (e.drop <= 0) {
          e.drop = 0; e.squash = 1; Sound.land();
          landFx(e);
          // atterraggio: piccola spinta a chi è vicino
          for (const o of [P, ...S.enemies]) {
            if (o === e || o.drop > 0 || o.fall > 0) continue;
            const dx = o.x - e.x, dy = o.y - e.y, d = len(dx, dy);
            if (d < e.r + o.r + 14 && d > 0) { o.vx += dx / d * 120; o.vy += dy / d * 120; }
          }
        }
        continue;
      }
      if (e.fall > 0) continue;
      if (S.mode === 'play') enemyAI(e, dt);
      e.blink -= dt; if (e.blink < -0.12) e.blink = rand(2, 5);
    }

    // integrazione
    const bodies = [P, ...S.enemies].filter(e => e.drop <= 0);
    const bd = baseDamp();
    for (const e of bodies) {
      applyWind(e, dt);
      const pd = playerDamp();
      let damp = e.fall > 0 ? DAMP_FALL : e === P ? (S.charging ? pd + (DAMP_BRACE - pd) * ease(S.charge) : pd) : bd;
      if (e.frozen > 0 && e.fall === 0) damp = DAMP * 0.28;
      integrate(e, dt, damp);
    }
    // collisioni (solo chi è sulla zattera)
    updateTrails(dt);
    if (P.fall === -1 && Math.random() < dt * 10) bubbles(P.x, P.y);
    const solid = bodies.filter(e => e.fall === 0);
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) collide(solid[i], solid[j]);

    // fuori dalla zattera?
    for (const e of solid) if (len(e.x, e.y) > DISC) startFall(e);
    // cadute in corso
    for (const e of bodies) {
      if (e.fall > 0) {
        e.fall -= dt;
        if (e.fall <= 0) { e.fall = -1; splash(e); if (e === P) die(); }
      }
    }
    S.enemies = S.enemies.filter(e => e.fall !== -1);

    if (S.mode === 'dying') { S.dieT -= dt; if (S.dieT <= 0) endGame(); return; }
    if (S.mode === 'play' || S.mode === 'dying') sharkUpdate(dt);
    if (S.mode === 'play') {
      nearCheck();
      S.missionT -= dt;
      if (S.missionT <= 0) { S.missionT = 0.25; checkMissions(); }
      waves(dt);
      powerUpdate(dt);
      if (S.dashT <= 0) S.chiliDash = false;
      if (S.fever > 0) { S.fever -= dt; if (S.fever <= 0) Sound.musicSet(Math.min(3, Math.floor((S.wave - 1) / 2)), 100 + Math.min(40, (S.wave - 1) * 3.5), false); }
    }
    if (S.combo > 0 && S.t - S.lastKO > COMBO_WIN) S.combo = 0;
  }

  // ---------- Render ----------
  const FONT_D = '"Lilita One", "Arial Rounded MT Bold", "Arial Black", system-ui, sans-serif';
  const FONT_B = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  const INK = '#24173a';
  const fontD = size => `400 ${size}px ${FONT_D}`;
  const fontB = (size, w = 700) => `${w} ${size}px ${FONT_B}`;

  const shadeCache = {};
  function shade(hex, amt) {
    const key = hex + amt;
    if (shadeCache[key]) return shadeCache[key];
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return (shadeCache[key] = `rgb(${r | 0},${g | 0},${b | 0})`);
  }

  // testo con contorno spesso e ombra, stile "adesivo"
  function label(str, x, y, size, col, o = {}) {
    const align = o.align || 'center', alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.scale) ctx.scale(o.scale, o.scale);
    ctx.font = o.body ? fontB(size, o.weight || 700) : fontD(size);
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const ow = o.outline === false ? 0 : Math.max(2.5, size * (o.ow || 0.2));
    if (o.shadow !== false) {
      ctx.fillStyle = ctx.strokeStyle = 'rgba(8,18,36,0.45)';
      if (ow) { ctx.lineWidth = ow; ctx.strokeText(str, 0, size * 0.1); }
      ctx.fillText(str, 0, size * 0.1);
    }
    if (ow) { ctx.lineWidth = ow; ctx.strokeStyle = o.ink || INK; ctx.strokeText(str, 0, 0); }
    ctx.fillStyle = col; ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  function wrapLines(str, maxW, size, body = true) {
    ctx.font = body ? fontB(size) : fontD(size);
    const words = str.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
  function star(x, y, r1, r2, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r2 : r1;
      i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // pulsante a pillola
  function pill(x, y, w, h, c1, c2, txt, size, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rr(-w / 2, -h / 2 + 5, w, h, h / 2); ctx.fillStyle = 'rgba(8,18,36,0.45)'; ctx.fill();
    rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = INK; ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, c1); g.addColorStop(1, c2);
    rr(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, h / 2 - 3); ctx.fillStyle = g; ctx.fill();
    rr(-w / 2 + 10, -h / 2 + 6, w - 20, h * 0.28, h * 0.14); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    ctx.restore();
    label(txt, x, y + 1, size * s, '#ffffff', { ow: 0.18 });
  }

  // --- cache: sfondo, vignettatura, zattera pre-renderizzata ---
  let waterGrad = null, vignette = null, raftImg = null, raftHalf = 0;
  function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function buildCaches() {
    waterGrad = ctx.createLinearGradient(0, 0, 0, H);
    waterGrad.addColorStop(0, '#1a6f97'); waterGrad.addColorStop(0.55, '#125379'); waterGrad.addColorStop(1, '#0b3556');
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
    vignette.addColorStop(0, 'rgba(4,14,30,0)'); vignette.addColorStop(1, 'rgba(4,14,30,0.55)');
    raftImg = renderRaft();
    iceImg = null;
  }
  function renderRaft() {
    const R = DISC, pad = 30;
    raftHalf = R + pad;
    const k = scale * DPR * 1.15;                      // un po' di risoluzione extra per lo zoom
    const size = Math.ceil(raftHalf * 2 * k);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2); g.scale(k, k);
    const rnd = mulberry(7);
    const disc = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    // spessore del legno
    disc(0, 12, R + 7, '#5c3b1e');
    disc(0, 7, R + 7, '#7d532b');
    // assi
    g.save(); g.beginPath(); g.arc(0, 0, R - 3, 0, Math.PI * 2); g.clip();
    const pw = 34, tones = ['#ecc993', '#e4bb82', '#f0d2a2', '#e8c28a', '#e1b67c'];
    for (let i = -7; i <= 7; i++) {
      const x0 = i * pw - pw / 2;
      g.fillStyle = tones[(i + 21) % tones.length]; g.fillRect(x0, -R, pw, 2 * R);
      // venature
      g.strokeStyle = 'rgba(150,98,48,0.2)'; g.lineWidth = 1;
      for (let q = 0; q < 4; q++) {
        const xx = x0 + 4 + rnd() * (pw - 8), ph = rnd() * 6;
        g.beginPath();
        for (let y = -R; y <= R; y += 8) g.lineTo(xx + Math.sin(y * 0.025 + ph) * 2.2, y);
        g.stroke();
      }
      // nodi del legno
      if (rnd() < 0.7) {
        const kx = x0 + 8 + rnd() * (pw - 16), ky = -R + rnd() * 2 * R;
        g.fillStyle = 'rgba(140,88,40,0.35)'; g.beginPath(); g.ellipse(kx, ky, 4, 2.6, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(140,88,40,0.25)'; g.beginPath(); g.ellipse(kx, ky, 7, 4.5, 0, 0, Math.PI * 2); g.stroke();
      }
      // fessure tra le assi e tagli
      g.fillStyle = 'rgba(96,60,28,0.6)'; g.fillRect(x0 - 1, -R, 2, 2 * R);
      g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(x0 + 1, -R, 1, 2 * R);
      const cut = -R + rnd() * 2 * R;
      g.fillStyle = 'rgba(96,60,28,0.5)'; g.fillRect(x0, cut, pw, 1.6);
      // chiodi
      for (const yy of [cut - 6, cut + 7]) {
        disc(x0 + 6, yy, 1.6, '#6b5a4a'); disc(x0 + pw - 6, yy, 1.6, '#6b5a4a');
      }
    }
    // cerchio dipinto al centro
    g.strokeStyle = 'rgba(214,72,56,0.22)'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 74, 0, Math.PI * 2); g.stroke();
    // usura vicino al bordo
    const wear = g.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
    wear.addColorStop(0, 'rgba(120,70,30,0)'); wear.addColorStop(1, 'rgba(120,70,30,0.22)');
    g.fillStyle = wear; g.fillRect(-R, -R, 2 * R, 2 * R);
    // luce dall'alto a sinistra
    const lg = g.createRadialGradient(-R * 0.45, -R * 0.55, R * 0.05, 0, 0, R * 1.15);
    lg.addColorStop(0, 'rgba(255,251,235,0.35)'); lg.addColorStop(0.55, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(60,30,10,0.28)');
    g.fillStyle = lg; g.fillRect(-R, -R, 2 * R, 2 * R);
    g.restore();
    // corda intrecciata sul bordo
    g.lineWidth = 12; g.strokeStyle = '#b5834a'; g.beginPath(); g.arc(0, 0, R - 1, 0, Math.PI * 2); g.stroke();
    const n = 150;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.strokeStyle = i % 2 ? '#e0b273' : '#8f6236'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6)); g.lineTo(Math.cos(a + 0.035) * (R + 4.5), Math.sin(a + 0.035) * (R + 4.5)); g.stroke();
    }
    g.lineCap = 'butt';
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(50,28,10,0.6)';
    g.beginPath(); g.arc(0, 0, R + 5.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, R - 7, 0, Math.PI * 2); g.stroke();
    // paletti
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, px = Math.cos(a) * R, py = Math.sin(a) * R;
      disc(px, py + 3, 8, '#4a2f17'); disc(px, py, 7.5, '#7a5230'); disc(px, py, 5.5, '#a67848');
      disc(px - 1.5, py - 1.5, 2, 'rgba(255,240,210,0.5)');
    }
    return c;
  }

  // ambiente: increspature e pesci
  for (let i = 0; i < 70; i++) S.waves.push({ x: rand(-700, 700), y: rand(-700, 700), l: rand(6, 16), ph: rand(0, 6.28), sp: rand(4, 10) });
  for (let i = 0; i < 4; i++) S.fish.push({ a: rand(0, 6.28), rad: rand(250, 360), sp: rand(0.12, 0.25) * (Math.random() < 0.5 ? -1 : 1), size: rand(9, 15) });

  // --- telecamera ---
  const cam = { x: 0, y: 0, zoom: 1, ox: 0, oy: 0, bob: 0 };
  function updateCamera(dt) {
    const P = S.player;
    let tx = 0, ty = 0, tz = 1;
    if ((S.mode === 'dying' || S.mode === 'over') && P) { tx = P.x * 0.35; ty = P.y * 0.35; tz = 1.12; }
    const k = 1 - Math.exp(-4 * dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.zoom += (tz - cam.zoom) * k;
  }
  function applyWorld() {
    const z = scale * (cam.zoom + S.zoomKick);
    const tr = S.trauma * S.trauma, t = S.clock;
    cam.ox = tr * 14 * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 91.7) * 0.4);
    cam.oy = tr * 14 * (Math.sin(t * 53.1) * 0.6 + Math.sin(t * 77.9) * 0.4);
    cam.bob = Math.sin(t * 1.3) * 1.8;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(cx + cam.ox, cy + cam.oy);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y + cam.bob);
  }
  function w2s(x, y) {
    const z = scale * (cam.zoom + S.zoomKick);
    return { x: cx + cam.ox + (x - cam.x) * z, y: cy + cam.oy + (y - cam.y + cam.bob) * z };
  }

  // --- acqua ---
  function drawWater(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = waterGrad || COL.water; ctx.fillRect(0, 0, W, H);
    applyWorld();
    // pesci sotto la superficie
    ctx.fillStyle = 'rgba(4,26,46,0.35)';
    for (const f of S.fish) {
      const x = Math.cos(f.a) * f.rad, y = Math.sin(f.a) * f.rad * 0.9;
      const dir = f.a + (f.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
      const wig = Math.sin(t * 8 + f.rad) * 0.3;
      ctx.beginPath(); ctx.ellipse(0, 0, f.size, f.size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-f.size * 0.8, 0); ctx.lineTo(-f.size * 1.5, f.size * 0.45 + wig * 5); ctx.lineTo(-f.size * 1.5, -f.size * 0.45 + wig * 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // increspature
    ctx.strokeStyle = 'rgba(200,240,255,0.16)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const w of S.waves) {
      const x = ((w.x + t * w.sp + 700) % 1400) - 700, y = w.y + Math.sin(t * 0.8 + w.ph) * 3;
      if (len(x, y) < DISC + 14) continue;
      ctx.beginPath(); ctx.moveTo(x - w.l, y); ctx.quadraticCurveTo(x, y - 4 - Math.sin(t * 2 + w.ph) * 2, x + w.l, y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // riflessi del sole
    for (const g of S.glints) {
      const k = Math.sin((g.life / g.max) * Math.PI);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * k})`;
      star(g.x, g.y, g.s * 1.8 * k, g.s * 0.4, 4, 0); ctx.fill();
    }
    // onde d'acqua (cerchi)
    for (const r of S.ripples) {
      const k = r.life / r.max;
      ctx.strokeStyle = `rgba(233,251,255,${0.75 * k})`; ctx.lineWidth = 3 * k + 0.6;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // ombra della zattera e schiuma tutto intorno
    ctx.fillStyle = 'rgba(3,20,38,0.45)'; circ(10, 18, DISC + 10); ctx.fill();
    for (const [off, alpha, lw] of [[18, 0.12, 6], [10, 0.4, 3.5]]) {
      ctx.strokeStyle = `rgba(233,251,255,${alpha})`; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r = DISC + off + Math.sin(a * 7 + t * 2.1) * 2.5 + Math.sin(a * 13 - t * 3.3) * 1.5;
        i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 4) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r + 4);
      }
      ctx.stroke();
    }
  }

  function drawRaft() {
    if (raftImg) ctx.drawImage(raftImg, -raftHalf, -raftHalf, raftHalf * 2, raftHalf * 2);
    // pericolo: bordo che si illumina vicino al giocatore
    const P = S.player;
    if (S.mode === 'play' && P && P.fall === 0) {
      const d = len(P.x, P.y), k = clamp((d - (DISC - 45)) / 40, 0, 1);
      if (k > 0) {
        const a = Math.atan2(P.y, P.x);
        ctx.strokeStyle = `rgba(255,77,109,${(0.35 + 0.35 * Math.sin(S.clock * 16)) * k})`;
        ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, DISC, a - 0.45, a + 0.45); ctx.stroke(); ctx.lineCap = 'butt';
      }
    }
  }

  function bodyColors(e) {
    switch (e.kind) {
      case 'player': return [COL.player, COL.playerDark];
      case 'walker': return [COL.walker, COL.walkerDark];
      case 'mini': return [COL.mini, COL.miniDark];
      case 'brute': return [COL.brute, COL.bruteDark];
      case 'dasher': return [COL.dasher, COL.dasherDark];
      case 'boss': return ['#e0527c', '#a8304f'];
    }
    return ['#ffffff', '#cccccc'];
  }

  function drawShadow(e) {
    let r = e.r, k = 1;
    if (e.drop > 0) { const q = 1 - e.drop / 0.9; k = 0.35 + 0.65 * q; }
    if (e.kind === 'boss' && e.state === 'jump') k = 1 - Math.sin(clamp(1 - e.stateT / 0.95, 0, 1) * Math.PI) * 0.4;
    if (e.fall > 0) return;
    ctx.fillStyle = `rgba(74,40,14,${0.3 * k})`;
    ctx.beginPath(); ctx.ellipse(e.x + r * 0.15, e.y + r * 0.45, r * 1.05 * k, r * 0.6 * k, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawDropMarker(e, t) {
    if (e.drop <= 0) return;
    const k = 1 - e.drop / 0.9;
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.strokeStyle = `rgba(255,77,109,${0.35 + 0.4 * k})`; ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 5]); ctx.rotate(t * 2);
    circ(0, 0, e.r * (1.9 - 0.8 * k)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawGhosts() {
    for (const g of S.ghosts) {
      const k = g.life / g.max;
      ctx.fillStyle = g.col; ctx.globalAlpha = 0.28 * k;
      circ(g.x, g.y, g.r * (0.7 + 0.3 * k)); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBlob(e, t) {
    let x = e.x, y = e.y, r = e.r, alpha = 1, lift = 0;
    if (e.drop > 0) { const k = 1 - e.drop / 0.9; lift = (1 - k * k) * 320; alpha = clamp(k * 4, 0, 1); r *= 1 + (1 - k) * 0.5; }
    if (e.kind === 'boss' && e.state === 'jump' && e.fall === 0) lift += Math.sin(clamp(1 - e.stateT / 0.95, 0, 1) * Math.PI) * 70;
    let sinking = 0;
    if (e.fall > 0) { const k = e.fall / FALL_T; r *= 0.5 + 0.5 * k; alpha = 0.3 + 0.7 * k; sinking = 1 - k; }
    y -= lift;
    const [c1, c2] = bodyColors(e);
    const isP = e.kind === 'player';
    const sp = len(e.vx, e.vy), mv = Math.atan2(e.vy, e.vx);
    const stretch = clamp(sp / 800, 0, 0.3) + e.squash * 0.22;
    const breathe = Math.sin(t * 6 + e.wob) * 0.025;
    let jx = 0, jy = 0, crouch = 0;
    if (isP && S.charging && S.recover <= 0) {
      crouch = ease(S.charge) * 0.12;
      if (S.charge >= 1) { jx = rand(-0.8, 0.8); jy = rand(-0.8, 0.8); }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + jx, y + jy);
    if (sp > 25) { ctx.rotate(mv); ctx.scale(1 + stretch, 1 - stretch * 0.75); ctx.rotate(-mv); }
    ctx.scale(1 + breathe + crouch, 1 - breathe - crouch * 0.6);

    // parti dietro il corpo (orecchie, corna, becco, germoglio)
    ctx.save(); ctx.rotate(e.face);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK;
    if (e.kind === 'walker') {
      for (const s of [-1, 1]) { ctx.fillStyle = c2; circ(-r * 0.35, s * r * 0.78, r * 0.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = shade(c1, 0.35); circ(-r * 0.35, s * r * 0.78, r * 0.14); ctx.fill(); }
    } else if (e.kind === 'brute') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#f4e6c8';
        ctx.beginPath(); ctx.moveTo(r * 0.35, s * r * 0.6); ctx.quadraticCurveTo(r * 0.9, s * r * 1.2, r * 1.15, s * r * 0.85); ctx.quadraticCurveTo(r * 0.75, s * r * 0.75, r * 0.55, s * r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (e.kind === 'dasher') {
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.moveTo(r * 1.45, 0); ctx.lineTo(r * 0.6, r * 0.42); ctx.lineTo(r * 0.6, -r * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (e.state === 'dash') {
        ctx.strokeStyle = 'rgba(255,200,80,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const s of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(-r * 1.1, s * r); ctx.lineTo(-r * (1.6 + Math.random() * 0.8), s * r * 1.3); ctx.stroke(); }
        ctx.lineCap = 'butt';
      }
    } else if (e.kind === 'mini') {
      ctx.fillStyle = '#7ee08a';
      ctx.beginPath(); ctx.ellipse(-r * 1.05, -r * 0.25, r * 0.45, r * 0.22, -0.5 + Math.sin(t * 5 + e.wob) * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-r * 1.05, r * 0.25, r * 0.45, r * 0.22, 0.5 - Math.sin(t * 5 + e.wob) * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (isP && meta.hat === 'bandana') {
      // code della fascia, svolazzano dietro
      const flap = Math.sin(t * 16) * 0.25 + Math.sin(t * 23) * 0.1;
      const L = r * (0.9 + clamp(sp / 400, 0, 1) * 0.7);
      ctx.fillStyle = '#e8384f';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, s * r * 0.12);
        ctx.quadraticCurveTo(-r * 0.8 - L * 0.5, s * r * (0.2 + flap), -r * 0.8 - L, s * r * (0.45 + flap * s));
        ctx.lineTo(-r * 0.8 - L * 0.85, s * r * (0.15 + flap * s));
        ctx.quadraticCurveTo(-r * 0.8 - L * 0.4, s * r * 0.05, -r * 0.8, s * r * -0.05);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();

    // corpo: contorno + sfumatura
    ctx.fillStyle = INK; circ(0, r * 0.05, r + 2.4); ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.08, 0, 0, r * 1.05);
    g.addColorStop(0, shade(c1, 0.38)); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; circ(0, 0, r); ctx.fill();
    // fascia del giocatore
    if (isP && meta.hat === 'bandana') {
      ctx.save(); ctx.rotate(e.face);
      ctx.strokeStyle = '#e8384f'; ctx.lineWidth = r * 0.24;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.83, 1.85, 4.43); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.06;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 2.0, 4.28); ctx.stroke();
      ctx.restore();
    }
    // riflesso
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.47, r * 0.3, r * 0.16, -0.65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; circ(-r * 0.05, -r * 0.66, r * 0.07); ctx.fill();

    // faccia (nel sistema ruotato verso lo sguardo)
    ctx.save(); ctx.rotate(e.face);
    const stunned = e.stun > 0.3 || e.fall > 0;
    const closed = e.blink < 0 && e.blink > -0.12 && !stunned;
    const eyeR = r * (e.kind === 'mini' ? 0.32 : e.kind === 'brute' ? 0.21 : 0.27);
    const ex = r * 0.4, sep = r * 0.34;
    ctx.lineCap = 'round';
    // guance
    if (isP || e.kind === 'mini') {
      ctx.fillStyle = 'rgba(255,120,140,0.45)';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(r * 0.55, s * r * 0.62, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const s of [-1, 1]) {
      const ey = s * sep;
      if (closed) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.6, r * 0.09);
        ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.7, -1.2, 1.2); ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.4, r * 0.07);
      circ(ex, ey, eyeR); ctx.fill(); ctx.stroke();
      if (stunned) {
        // occhi a spirale
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, r * 0.055);
        ctx.beginPath();
        for (let i = 0; i < 18; i++) { const a = i * 0.7 + t * 10 * s, q = (i / 18) * eyeR * 0.8; i ? ctx.lineTo(ex + Math.cos(a) * q, ey + Math.sin(a) * q) : ctx.moveTo(ex, ey); }
        ctx.stroke();
      } else {
        const look = eyeR * 0.38;
        ctx.fillStyle = INK; circ(ex + look, ey, eyeR * 0.56); ctx.fill();
        ctx.fillStyle = '#ffffff'; circ(ex + look - eyeR * 0.18, ey - eyeR * 0.2, eyeR * 0.18); ctx.fill();
      }
      // palpebra concentrata (giocatore in carica) / sopracciglia arrabbiate (nemici)
      if (isP && S.charging && !stunned) {
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(ex, ey, eyeR + 0.5, Math.PI * 0.5 + (s > 0 ? 0 : Math.PI), Math.PI * 1.5 + (s > 0 ? 0 : Math.PI)); ctx.closePath();
        ctx.save(); ctx.beginPath(); ctx.rect(ex - eyeR * 1.2, ey - eyeR * 1.2, eyeR * 0.9, eyeR * 2.4); ctx.clip();
        ctx.fillStyle = c2; circ(ex, ey, eyeR + 0.5); ctx.fill(); ctx.restore();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.6, r * 0.08);
        ctx.beginPath(); ctx.moveTo(ex - eyeR * 0.3, ey - eyeR * 1.05); ctx.lineTo(ex - eyeR * 0.3, ey + eyeR * 1.05); ctx.stroke();
      } else if (!isP && !stunned) {
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * (e.kind === 'brute' ? 0.14 : 0.1));
        ctx.beginPath();
        ctx.moveTo(ex - eyeR * 1.4, s * (sep + eyeR * 0.85));
        ctx.lineTo(ex - eyeR * 0.55, s * (sep - eyeR * 0.95));
        ctx.stroke();
      }
    }
    // bocca
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.6, r * 0.08);
    const mx = r * 0.74;
    if (stunned || sinking > 0) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(mx, 0, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    } else if (isP && S.charging) {
      ctx.fillStyle = '#ffffff';
      rr(mx - r * 0.09, -r * 0.2, r * 0.18, r * 0.4, r * 0.06); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - r * 0.09, 0); ctx.lineTo(mx + r * 0.09, 0); ctx.stroke();
    } else if (isP) {
      ctx.beginPath(); ctx.arc(mx - r * 0.12, 0, r * 0.16, -1.1, 1.1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mx + r * 0.1, 0, r * 0.15, Math.PI - 1, Math.PI + 1); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
    if (isP) drawHat(meta.hat, r, e.face, t);
    ctx.restore();

    // corona del Re Budino
    if (e.kind === 'boss') {
      const cw = r * 0.9, ch = r * 0.55, by = y - r * 0.72;
      ctx.save(); ctx.translate(x, by); ctx.rotate(Math.sin(t * 3) * 0.08);
      ctx.fillStyle = COL.gold; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-cw / 2, 0); ctx.lineTo(-cw / 2, -ch); ctx.lineTo(-cw / 4, -ch * 0.45); ctx.lineTo(0, -ch * 1.15); ctx.lineTo(cw / 4, -ch * 0.45); ctx.lineTo(cw / 2, -ch); ctx.lineTo(cw / 2, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.danger; circ(0, -ch * 0.35, 3.5); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // stelline sopra la testa quando stordito
    if (e.stun > 0.3 && e.fall === 0) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i / 3) * Math.PI * 2;
        ctx.fillStyle = COL.gold; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
        star(x + Math.cos(a) * r * 0.9, y - r * 0.9 + Math.sin(a) * r * 0.3, 4.5, 2, 5, a); ctx.fill(); ctx.stroke();
      }
    }
    // goccia di sudore vicino al bordo
    if (isP && e.fall === 0 && S.mode === 'play' && len(e.x, e.y) > DISC - 40) {
      const k = (S.clock * 2) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#bfeaff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      const dx = x + r * 0.8, dy = y - r * 0.8 + k * 8;
      ctx.beginPath(); ctx.moveTo(dx, dy - 6); ctx.quadraticCurveTo(dx + 4, dy, dx, dy + 3); ctx.quadraticCurveTo(dx - 4, dy, dx, dy - 6); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }

  function drawDasherWarn(e, t) {
    if (e.kind !== 'dasher' || e.state !== 'aim' || e.drop > 0 || e.fall > 0) return;
    const L = (380 * e.sp) / baseDamp();
    const locked = e.stateT <= 0.22;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.dashDir);
    const w = e.r * 1.6;
    ctx.fillStyle = `rgba(255,77,109,${locked ? 0.38 : 0.14 + 0.1 * Math.sin(t * 24)})`;
    rr(0, -w / 2, L, w, w / 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,77,109,${locked ? 0.95 : 0.55})`; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    rr(0, -w / 2, L, w, w / 2); ctx.stroke(); ctx.setLineDash([]);
    // frecce che scorrono
    ctx.strokeStyle = `rgba(255,255,255,${locked ? 0.9 : 0.5})`; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 5; i++) {
      const px = ((t * 140 + i * (L / 5)) % L);
      if (px < e.r + 4) continue;
      ctx.beginPath(); ctx.moveTo(px - 6, -7); ctx.lineTo(px, 0); ctx.lineTo(px - 6, 7); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
    // fumetto "!"
    const bx = e.x, by = e.y - e.r - 20 - Math.abs(Math.sin(t * 10)) * 3;
    ctx.fillStyle = COL.danger; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    circ(bx, by, 10); ctx.fill(); ctx.stroke();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const s = w2s(bx, by);
    label('!', s.x, s.y + 1, Math.max(14, 17 * scale), '#ffffff', { outline: false, shadow: false });
    applyWorld();
  }

  function drawPlayerAim(t) {
    const P = S.player;
    if (!P || P.fall !== 0 || S.mode === 'dying' || S.mode === 'over') return;
    const fx = Math.cos(S.aim), fy = Math.sin(S.aim);
    const r = P.r;
    // binario circolare della freccia
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]);
    circ(P.x, P.y, r + 20); ctx.stroke(); ctx.setLineDash([]);
    if (S.charging) {
      const dist = currentPower() / playerDamp();
      const ex = P.x + fx * dist, ey = P.y + fy * dist;
      const out = len(ex, ey) > DISC - 2;
      const col = out ? COL.danger : '#ffffff';
      const n = Math.max(3, Math.floor(dist / 13));
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        ctx.fillStyle = col; ctx.globalAlpha = 0.35 + 0.6 * k;
        circ(P.x + fx * dist * k, P.y + fy * dist * k, 2 + k * 1.5); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // mirino finale
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(t * 3);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      circ(0, 0, r * 0.95); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(r * 0.95, 0); ctx.lineTo(r * 1.35, 0); ctx.stroke(); }
      ctx.restore();
      if (out) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const s = w2s(ex, ey);
        label('!', s.x, s.y, 20, COL.danger, {});
        applyWorld();
      }
      // anello di carica
      const perfect = S.charge >= 1 && S.chargeOver <= PERFECT_WIN;
      const ringR = r + 11;
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20,12,40,0.45)'; circ(P.x, P.y, ringR); ctx.stroke();
      ctx.strokeStyle = perfect ? COL.gold : S.recover > 0 ? 'rgba(200,210,230,0.6)' : `rgb(255,${(255 - 50 * S.charge) | 0},${(255 - 150 * S.charge) | 0})`;
      ctx.beginPath(); ctx.arc(P.x, P.y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * S.charge); ctx.stroke();
      ctx.lineCap = 'butt';
      if (perfect) {
        const k = S.chargeOver / PERFECT_WIN;
        ctx.strokeStyle = `rgba(255,209,102,${1 - k})`; ctx.lineWidth = 4;
        circ(P.x, P.y, ringR + 4 + k * 16); ctx.stroke();
      }
    }
    // freccia
    const ad = r + 20 + (S.charging ? 0 : Math.sin(t * 10) * 1.5);
    const ax = P.x + fx * ad, ay = P.y + fy * ad, z = 10;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(S.aim);
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    ctx.fillStyle = S.charging ? '#ffffff' : '#ffe0d6';
    ctx.beginPath(); ctx.moveTo(z * 1.1, 0); ctx.lineTo(-z * 0.6, z * 0.9); ctx.lineTo(-z * 0.2, 0); ctx.lineTo(-z * 0.6, -z * 0.9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawWorldFx() {
    // anelli d'urto
    for (const r of S.rings) {
      const k = r.life / r.max;
      ctx.strokeStyle = r.col; ctx.globalAlpha = k; ctx.lineWidth = r.w * k + 0.5;
      circ(r.x, r.y, r.r); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // particelle
    ctx.lineCap = 'round';
    for (const p of S.particles) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.col; ctx.globalAlpha = Math.min(1, k * 1.6); ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
      } else if (p.kind === 'dust') {
        ctx.fillStyle = p.col; ctx.globalAlpha = 0.55 * k;
        circ(p.x, p.y, p.size * (1 + (1 - k) * p.grow)); ctx.fill();
      } else if (p.kind === 'drop') {
        ctx.fillStyle = 'rgba(3,20,38,0.25)'; ctx.globalAlpha = 1;
        circ(p.x, p.y, p.size * 0.7); ctx.fill();
        ctx.fillStyle = p.col; circ(p.x, p.y - p.z, p.size); ctx.fill();
      } else if (p.kind === 'foam') {
        ctx.fillStyle = p.col; ctx.globalAlpha = 0.8 * k; circ(p.x, p.y, p.size * k); ctx.fill();
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = p.col; ctx.globalAlpha = k; ctx.lineWidth = 1.2; circ(p.x, p.y - p.z, p.size); ctx.stroke();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.col; ctx.globalAlpha = 0.6 * Math.sin(k * Math.PI); ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.1, p.y - p.vy * 0.1); ctx.stroke();
      } else if (p.kind === 'flame') {
        ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, k * 1.4);
        circ(p.x, p.y, p.size * (0.4 + 0.6 * k)); ctx.fill();
      } else if (p.kind === 'twinkle') {
        ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, k * 1.5);
        star(p.x, p.y, p.size * 1.6, p.size * 0.45, 4, p.rot); ctx.fill();
      } else {
        ctx.fillStyle = p.col; ctx.globalAlpha = k; circ(p.x, p.y, p.size); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    // stelle d'impatto
    for (const s of S.stars) {
      const k = s.life / s.max, sz = s.size * (1.2 - k * 0.4);
      ctx.fillStyle = s.col; ctx.globalAlpha = k;
      star(s.x, s.y, sz, sz * 0.38, 8, s.rot); ctx.fill();
      ctx.fillStyle = '#ffffff'; star(s.x, s.y, sz * 0.5, sz * 0.2, 8, s.rot + 0.2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const t of S.texts) {
      const age = t.max - t.life, a = clamp(t.life / (t.max * 0.35), 0, 1);
      const pop = age < 0.1 ? 0.4 + (age / 0.1) * 0.9 : age < 0.2 ? 1.3 - ((age - 0.1) / 0.1) * 0.3 : 1;
      const s = w2s(t.x, t.y);
      label(t.text, s.x, s.y, Math.max(14, t.size * 1.25 * Math.min(1.3, scale * 1.3)), t.col, { rot: t.rot, scale: pop, alpha: a });
    }
  }

  // --- HUD ---
  function trophy(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = COL.gold; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(5, 1); ctx.quadraticCurveTo(0, 5, -5, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(-1.5, 3, 3, 3); ctx.fillRect(-4.5, 6, 9, 2.5); ctx.strokeRect(-4.5, 6, 9, 2.5);
    ctx.restore();
  }
  function iconButton(b, draw) {
    ctx.fillStyle = 'rgba(6,20,40,0.35)'; circ(b.x, b.y, b.r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; circ(b.x, b.y, b.r); ctx.stroke();
    draw();
  }
  function drawHUD() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const pop = 1 + S.scorePop * 0.25;
    label(String(S.score), W / 2, hudTop * 0.42, Math.round(Math.min(50, hudTop * 0.52)), '#ffffff', { scale: pop, rot: S.scorePop * 0.05 });
    if (S.combo > 1 && S.mode === 'play') {
      const k = clamp(1 - (S.t - S.lastKO) / COMBO_WIN, 0, 1);
      const y = hudTop * 0.86, w = 120, h = 26;
      ctx.save(); ctx.translate(W / 2, y); ctx.rotate(Math.sin(S.clock * 8) * 0.03);
      rr(-w / 2, -h / 2 + 3, w, h, h / 2); ctx.fillStyle = 'rgba(8,18,36,0.4)'; ctx.fill();
      rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = INK; ctx.fill();
      rr(-w / 2 + 2.5, -h / 2 + 2.5, (w - 5) * k, h - 5, h / 2 - 2.5); ctx.fillStyle = COL.gold; ctx.fill();
      ctx.restore();
      label(`COMBO ×${S.combo}`, W / 2, y + 1, 16, '#ffffff', { ow: 0.22, shadow: false });
    }
    // record
    ctx.font = fontB(14);
    const bt = String(S.best), bw = ctx.measureText(bt).width + 42;
    rr(12, 20, bw, 28, 14); ctx.fillStyle = 'rgba(6,20,40,0.4)'; ctx.fill();
    trophy(29, 33, 1);
    label(bt, 42, 34.5, 14, '#ffffff', { align: 'left', body: true, outline: false, shadow: false });
    iconButton(pauseBtn, () => {
      ctx.fillStyle = '#ffffff';
      if (S.mode === 'paused') { ctx.beginPath(); ctx.moveTo(pauseBtn.x - 5, pauseBtn.y - 8); ctx.lineTo(pauseBtn.x + 8, pauseBtn.y); ctx.lineTo(pauseBtn.x - 5, pauseBtn.y + 8); ctx.fill(); }
      else { rr(pauseBtn.x - 7, pauseBtn.y - 8, 5, 16, 2); ctx.fill(); rr(pauseBtn.x + 2, pauseBtn.y - 8, 5, 16, 2); ctx.fill(); }
    });
    drawMute();
  }
  function drawMute() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    iconButton(muteBtn, () => {
      const { x, y } = muteBtn;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 8, y - 3); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x + 1, y - 8); ctx.lineTo(x + 1, y + 8); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x - 8, y + 3); ctx.closePath(); ctx.fill();
      if (Sound.muted) { ctx.beginPath(); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x + 10, y + 4); ctx.moveTo(x + 10, y - 4); ctx.lineTo(x + 4, y + 4); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x + 2, y, 5, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 2, y, 9, -0.8, 0.8); ctx.stroke(); }
      ctx.lineCap = 'butt';
    });
  }

  function hintPill(msg, col, y) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = fontB(17);
    const w = ctx.measureText(msg).width + 36, h = 36;
    const s = 1 + Math.sin(S.clock * 8) * 0.03;
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(s, s);
    rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(6,20,40,0.72)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    label(msg, W / 2, y + 1, 17 * s, col, { body: true, outline: false, shadow: false });
  }
  function drawWindHint() {
    if (!S.wind || S.mode !== 'play') return;
    hintPill(S.wind.warn > 0 ? 'GUST INCOMING!' : 'WIND!', '#bfeaff', Math.min(H - 30, cy + (DISC + 30) * scale));
  }
  function drawTutorialHint() {
    if (!S.tutorial || S.mode !== 'play' || S.wind) return;   // l'avviso del vento ha la precedenza
    const y = Math.min(H - 30, cy + (DISC + 30) * scale);
    const e = S.enemies.find(q => q.drop <= 0 && q.fall === 0);
    if (!e) return;
    let msg, col = '#ffffff';
    if (S.charging) {
      if (S.charge >= 1 && S.chargeOver <= PERFECT_WIN) { msg = 'RELEASE NOW!'; col = COL.gold; }
      else msg = 'charging… then release';
    } else {
      const toE = Math.atan2(e.y - S.player.y, e.x - S.player.x);
      const diff = Math.abs(Math.atan2(Math.sin(toE - S.aim), Math.cos(toE - S.aim)));
      if (diff < 0.6) { msg = 'HOLD NOW!'; col = COL.gold; } else msg = 'wait for the arrow to point at an enemy';
    }
    hintPill(msg, col, y);
  }

  function dim(alpha) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(6,20,36,${alpha})`; ctx.fillRect(0, 0, W, H); }

  // --- logo ---
  function logo(x, y, size, t) {
    const letters = 'TONFO'.split('');
    ctx.font = fontD(size);
    const widths = letters.map(l => ctx.measureText(l).width), sp = size * 0.02;
    const total = widths.reduce((a, b) => a + b, 0) + sp * (letters.length - 1);
    let lx = x - total / 2;
    letters.forEach((l, i) => {
      const w = widths[i], bx = lx + w / 2;
      const by = y + Math.sin(t * 3 + i * 0.7) * size * 0.05;
      const rot = Math.sin(t * 2 + i * 1.3) * 0.06;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rot);
      ctx.font = fontD(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.2; ctx.strokeStyle = 'rgba(8,18,36,0.5)'; ctx.strokeText(l, 0, size * 0.1);
      ctx.strokeStyle = INK; ctx.strokeText(l, 0, 0);
      const g = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.4);
      g.addColorStop(0, '#fff7e3'); g.addColorStop(0.5, '#ffd27a'); g.addColorStop(1, '#ff8a4c');
      ctx.fillStyle = g; ctx.fillText(l, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.rect(-w, -size, w * 2, size * 0.62); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(l, 0, 0); ctx.restore();
      ctx.restore();
      lx += w + sp;
    });
    // schizzi decorativi
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1, s = (Math.sin(a) * 0.5 + 0.5);
      ctx.fillStyle = '#bfeaff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      const dx = x + total * 0.55 + i * 10, dy = y - size * 0.35 - s * 12 + i * 8;
      circ(dx, dy, 3 + i); ctx.fill(); ctx.stroke();
    }
  }

  function drawTitle(t) {
    applyWorld();
    for (const e of S.titleEnts) { e.face = Math.atan2(S.player.y - e.y, S.player.x - e.x); drawShadow(e); }
    drawShadow(S.player);
    for (const e of S.titleEnts) drawBlob(e, t);
    S.player.face = S.aim;
    drawBlob(S.player, t);
    drawPlayerAim(t);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const tg = ctx.createLinearGradient(0, 0, 0, H);
    tg.addColorStop(0, 'rgba(6,20,36,0.55)'); tg.addColorStop(0.45, 'rgba(6,20,36,0.05)'); tg.addColorStop(0.62, 'rgba(6,20,36,0.05)'); tg.addColorStop(1, 'rgba(6,20,36,0.7)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
    const big = Math.min(110, W * 0.21), AR = DISC * scale;
    const roomy = cy - AR - hudTop * 0.4 > big * 1.2 && H - (cy + AR) > 170;
    const ty = roomy ? cy - AR - big * 0.5 : cy - AR * 0.62;
    const iy = roomy ? cy + AR + 34 : cy + AR * 0.3;
    if (S.best > 0) {
      ctx.font = fontB(15);
      const bt = `BEST ${S.best}`, bw = ctx.measureText(bt).width + 44;
      rr(W / 2 - bw / 2, ty - big * 0.95 - 14, bw, 28, 14); ctx.fillStyle = 'rgba(6,20,40,0.5)'; ctx.fill();
      trophy(W / 2 - bw / 2 + 17, ty - big * 0.95, 1);
      label(bt, W / 2 + 8, ty - big * 0.95 + 1, 15, COL.gold, { body: true, outline: false, shadow: false });
    }
    logo(W / 2, ty, big, t);
    const s = Math.min(17, W * 0.044);
    label('HOLD  →  plant your feet & charge', W / 2, iy, s, '#ffffff', { body: true, ow: 0.25 });
    label('RELEASE  →  dash where the arrow points', W / 2, iy + s * 1.6, s, '#ffffff', { body: true, ow: 0.25 });
    label("Knock everyone into the water. Don't fall in!", W / 2, iy + s * 3.2, s * 0.9, COL.gold, { body: true, ow: 0.25 });
    const bs = 1 + Math.sin(t * 5) * 0.04;
    pill(W / 2, iy + s * 5.6, 190, 58, '#ff8a6e', '#e8384f', 'PLAY', 30, bs);
    label('tap, click or press SPACE', W / 2, iy + s * 5.6 + 46, 13, 'rgba(255,255,255,0.75)', { body: true, outline: false, shadow: false });
    starsBadge(12, 34);
    drawWardrobe(t);
    uiBtns.privacy = null;
    if (Ads.privacy) {
      uiBtns.privacy = { x: 54, y: H - 30, w: 84, h: 30 };
      rr(12, H - 45, 84, 30, 15); ctx.fillStyle = 'rgba(6,20,40,0.55)'; ctx.fill();
      label('Privacy', 54, H - 29, 13, '#ffffff', { body: true, outline: false, shadow: false });
    }
    // missioni attive
    const recordTop = S.best > 0 ? ty - big * 0.95 - 16 : ty - big * 0.62;
    if (W >= 760) {
      rr(12, 60, 262, 118, 16); ctx.fillStyle = 'rgba(6,20,40,0.55)'; ctx.fill();
      missionList(22, 76, 242, 1, 'MISSIONS');
    } else if (recordTop - 60 >= 98) {
      const mw = Math.min(340, W - 32);
      missionList(W / 2 - mw / 2, 66, mw, 1, 'MISSIONS');
    }
  }

  function drawPanel(w, h, y, a) {
    const x = W / 2 - w / 2;
    ctx.globalAlpha = a;
    rr(x, y + 8, w, h, 24); ctx.fillStyle = 'rgba(4,12,26,0.5)'; ctx.fill();
    rr(x, y, w, h, 24); ctx.fillStyle = INK; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#2c5f86'); g.addColorStop(1, '#173a5c');
    rr(x + 4, y + 4, w - 8, h - 8, 20); ctx.fillStyle = g; ctx.fill();
    rr(x + 12, y + 10, w - 24, 26, 13); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawOver() {
    const a = clamp(S.overT * 3, 0, 1);
    dim(0.5 * a);
    const e = S.overT < 0.5 ? 1 - Math.pow(1 - S.overT / 0.5, 3) * Math.cos(S.overT * 9) : 1;
    const w = Math.min(380, W - 28);
    const fs = Math.min(14, Math.max(12, W * 0.035));
    const lines = wrapLines(S.tip, w - 48, fs);
    const offers = [];
    if (S.overT > 0.3 && Ads.rewardedOk && !Ads.busy) {
      if (canRevive()) offers.push('revive');
      if (canDoubleStars()) offers.push('dstars');
    }
    const h = 330 + lines.length * fs * 1.35 + 104 + (offers.length ? 82 : 0);
    const y = (H - h) / 2 + (1 - e) * 120;
    drawPanel(w, h, y, a);
    const c = W / 2;
    label('SPLASH!', c, y + 8, Math.min(52, W * 0.12), '#bfeaff', { rot: Math.sin(S.clock * 3) * 0.04, alpha: a });
    label('SCORE', c, y + 62, 13, 'rgba(255,255,255,0.6)', { body: true, outline: false, shadow: false, alpha: a });
    label(String(S.score), c, y + 102, Math.min(64, W * 0.15), '#ffffff', { alpha: a, scale: S.newRecord ? 1 + Math.sin(S.clock * 6) * 0.04 : 1 });
    if (S.newRecord) {
      pill(c, y + 152, 210, 34, '#ffe08a', '#f0a92e', '★ NEW BEST ★', 17, 1 + Math.sin(S.clock * 6) * 0.03);
    } else {
      const gap = S.best - S.score;
      ctx.font = fontB(15);
      const bt = `BEST ${S.best}` + (gap > 0 ? `  ·  ${gap} to go` : '');
      label(bt, c, y + 152, 15, COL.gold, { body: true, outline: false, shadow: false, alpha: a });
    }
    // statistiche
    const stats = [['DUNKED', S.kos], ['MAX COMBO', '×' + S.maxCombo], ['WAVE', S.wave], ['PERFECT', S.perfects], ['CAROMS', S.caroms], ['OLÉS', S.oles]];
    const cw = (w - 32) / 3;
    stats.forEach(([k, v], i) => {
      const sx = W / 2 - w / 2 + 16 + cw * (i % 3) + cw / 2, sy = y + 192 + Math.floor(i / 3) * 46;
      label(String(v), sx, sy, 22, '#ffffff', { alpha: a, ow: 0.18 });
      label(k, sx, sy + 19, 10.5, 'rgba(255,255,255,0.6)', { body: true, outline: false, shadow: false, alpha: a });
    });
    lines.forEach((l, i) => label(l, c, y + 292 + i * fs * 1.35, fs, '#ffe6a6', { body: true, outline: false, shadow: false, alpha: a }));
    missionList(W / 2 - w / 2 + 18, y + 292 + lines.length * fs * 1.35 + 6, w - 36, a, S.runStars ? `MISSIONS  ·  +${S.runStars}★ this run` : 'NEXT MISSIONS');
    if (S.overT > 0.3) {
      uiBtns.revive = uiBtns.dstars = null;
      if (offers.length) {
        const oy = y + h - 82, ow = offers.length === 2 ? (w - 48) / 2 : Math.min(260, w - 40);
        offers.forEach((o, i) => {
          const ox = offers.length === 2 ? c - w / 2 + 16 + ow / 2 + i * (ow + 16) : c;
          const pulse = 1 + Math.sin(S.clock * 6 + i) * 0.035;
          if (o === 'revive') { uiBtns.revive = { x: ox, y: oy, w: ow, h: 48 }; pill(ox, oy, ow, 48, '#ffe08a', '#f0a92e', '▶ CONTINUE', 20, pulse); }
          else { uiBtns.dstars = { x: ox, y: oy, w: ow, h: 48 }; pill(ox, oy, ow, 48, '#b79cff', '#6c4bd8', `▶ ★ ×2  (+${S.runStars})`, 18, pulse); }
        });
        label('watch a short video', c, oy + 34, 11, 'rgba(255,255,255,0.7)', { body: true, outline: false, shadow: false, alpha: a });
      }
      const mw = 120, rw = Math.min(190, w - mw - 40), by = y + h - 8;
      const mx = c - w / 2 + 16 + mw / 2, rx = c + w / 2 - 16 - rw / 2;
      uiBtns.menu = { x: mx, y: by, w: mw, h: 50 };
      uiBtns.retry = { x: rx, y: by, w: rw, h: 56 };
      pill(mx, by, mw, 50, '#6fa8d6', '#3a6f9e', 'MENU', 22, 1);
      pill(rx, by, rw, 56, '#ff8a6e', '#e8384f', 'RETRY', 28, 1 + Math.sin(S.clock * 5) * 0.04);
    }
    // coriandoli
    for (const cf of S.confetti) {
      ctx.save(); ctx.translate(cf.x, cf.y); ctx.rotate(cf.rot); ctx.scale(1, Math.cos(cf.rot * 2));
      ctx.fillStyle = cf.col; ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h); ctx.restore();
    }
  }

  // --- nuovi sistemi: grafica ---
  let iceImg = null;
  function renderIce() {
    const R = DISC, k = scale * DPR, size = Math.ceil(R * 2 * k);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2); g.scale(k, k);
    g.beginPath(); g.arc(0, 0, R - 3, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(190,235,255,0.42)'; g.fillRect(-R, -R, 2 * R, 2 * R);
    const rnd = mulberry(11);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(235,250,255,${0.15 + rnd() * 0.25})`;
      g.beginPath(); g.ellipse(-R + rnd() * 2 * R, -R + rnd() * 2 * R, 15 + rnd() * 40, 8 + rnd() * 22, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const x = -R + rnd() * 2 * R, y = -R + rnd() * 2 * R, l = 6 + rnd() * 16;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y - l * 0.6); g.stroke();
    }
    g.strokeStyle = 'rgba(120,190,230,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      let x = -R + rnd() * 2 * R, y = -R + rnd() * 2 * R;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += rnd() * 30 - 15; y += rnd() * 30 - 15; g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }
  function drawIce() {
    if (S.iceK <= 0) return;
    if (!iceImg) iceImg = renderIce();
    ctx.globalAlpha = S.iceK;
    ctx.drawImage(iceImg, -DISC, -DISC, DISC * 2, DISC * 2);
    ctx.globalAlpha = 1;
  }

  function powerIcon(type, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    if (type === 'chili') {
      ctx.rotate(-0.5);
      ctx.fillStyle = '#ff4d3d';
      ctx.beginPath(); ctx.moveTo(-3, -9); ctx.quadraticCurveTo(9, -7, 6, 4); ctx.quadraticCurveTo(3, 11, -5, 12); ctx.quadraticCurveTo(1, 4, -6, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(1, -3, 1.6, 4, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4fbf5a'; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.quadraticCurveTo(-4, -13, 0, -13); ctx.lineTo(-1, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (type === 'bubble') {
      ctx.fillStyle = 'rgba(127,216,255,0.45)'; circ(0, 0, 10); ctx.fill(); ctx.strokeStyle = '#e9fbff'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(-4, -4, 3, 1.8, -0.7, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI + t * 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -10, Math.sin(a) * -10); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.stroke(); }
      ctx.strokeStyle = '#dff7ff'; ctx.lineWidth = 2.6;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI + t * 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -10, Math.sin(a) * -10); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
    ctx.restore();
  }
  function drawPowerups(t) {
    for (const u of S.powerups) {
      if (u.life < 2 && Math.floor(u.life * 8) % 2 === 0) continue;
      const bob = Math.sin(t * 4 + u.ph) * 3;
      const col = POWERS[u.type].col;
      ctx.fillStyle = 'rgba(74,40,14,0.25)'; ctx.beginPath(); ctx.ellipse(u.x, u.y + 8, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
      const glow = ctx.createRadialGradient(u.x, u.y - 6 + bob, 2, u.x, u.y - 6 + bob, 26);
      glow.addColorStop(0, col); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.55; ctx.fillStyle = glow; circ(u.x, u.y - 6 + bob, 26); ctx.fill(); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(u.x, u.y - 6 + bob); ctx.rotate(t * 1.5);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); circ(0, 0, 17); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      // anello che si svuota = tempo rimasto
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(u.x, u.y - 6 + bob, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (u.life / u.max)); ctx.stroke(); ctx.lineCap = 'butt';
      powerIcon(u.type, u.x, u.y - 6 + bob, 1, t);
    }
  }

  function drawWindWarn(t) {
    if (!S.wind) return;
    const w = S.wind;
    if (w.warn > 0) {
      const a = 0.35 + 0.35 * Math.sin(t * 18);
      ctx.save(); ctx.rotate(w.a);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.strokeStyle = `rgba(36,23,58,${a})`; ctx.lineWidth = 4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-90, -16); ctx.lineTo(40, -16); ctx.lineTo(40, -40); ctx.lineTo(100, 0); ctx.lineTo(40, 40); ctx.lineTo(40, 16); ctx.lineTo(-90, 16); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawBossWarn(e, t) {
    if (e.kind !== 'boss' || e.state !== 'jump' || e.fall !== 0) return;
    const k = 1 - e.stateT / 0.95;
    ctx.fillStyle = `rgba(255,77,109,${0.08 + 0.18 * k})`; circ(e.x, e.y, SLAM_R); ctx.fill();
    ctx.strokeStyle = `rgba(255,77,109,${0.5 + 0.4 * Math.sin(t * 30)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    circ(e.x, e.y, SLAM_R); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    circ(e.x, e.y, SLAM_R * k); ctx.stroke();
  }

  function drawFrozen(e) {
    if (!(e.frozen > 0) || e.fall !== 0 || e.drop > 0) return;
    const r = e.r + 5, blink = e.frozen < 1 && Math.floor(e.frozen * 10) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 0.85;
    rr(e.x - r, e.y - r, r * 2, r * 2, r * 0.45);
    ctx.fillStyle = 'rgba(190,235,255,0.5)'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e.x - r * 0.6, e.y - r * 0.2); ctx.lineTo(e.x - r * 0.2, e.y - r * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x - r * 0.6, e.y + r * 0.15); ctx.lineTo(e.x + r * 0.15, e.y - r * 0.6); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
  }

  function drawPlayerPowers(t) {
    const P = S.player;
    if (!P || P.fall !== 0) return;
    if (S.bubble) {
      const r = P.r + 9 + Math.sin(t * 5) * 1.5;
      ctx.fillStyle = 'rgba(127,216,255,0.18)'; circ(P.x, P.y, r); ctx.fill();
      ctx.strokeStyle = 'rgba(233,251,255,0.8)'; ctx.lineWidth = 2; circ(P.x, P.y, r); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(P.x - r * 0.45, P.y - r * 0.5, r * 0.22, r * 0.1, -0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBanner() {
    const b = S.banner;
    if (!b || S.mode === 'over' || S.mode === 'title') return;
    const p = b.t / b.dur;
    if (p >= 1) return;
    const inK = clamp(b.t / 0.25, 0, 1), outK = clamp((b.dur - b.t) / 0.35, 0, 1);
    const pop = inK < 1 ? 0.3 + inK * 0.85 + Math.sin(inK * Math.PI) * 0.25 : 1;
    const a = Math.min(inK, outK);
    const y = cy - DISC * scale * 0.45;
    const size = Math.min(54, W * 0.12);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = a * 0.55;
    const g = ctx.createLinearGradient(0, y - size, 0, y + size * 1.4);
    g.addColorStop(0, 'rgba(6,20,36,0)'); g.addColorStop(0.5, 'rgba(6,20,36,0.8)'); g.addColorStop(1, 'rgba(6,20,36,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - size, W, size * 2.4);
    ctx.globalAlpha = 1;
    label(b.text, W / 2 + (1 - outK) * -60, y, size, '#ffffff', { scale: pop, alpha: a, rot: -0.03 });
    if (b.sub) label(b.sub, W / 2 + (1 - outK) * 60, y + size * 0.85, Math.min(22, W * 0.055), b.col, { scale: pop, alpha: a, body: false });
  }

  function drawFever(t) {
    if (S.fever <= 0 || S.mode !== 'play') return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const k = Math.min(1, S.fever / 1.2) * (0.55 + 0.25 * Math.sin(t * 10));
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,170,40,0)'); g.addColorStop(1, `rgba(255,150,40,${0.45 * k})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawHUD2() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.mode !== 'play' && S.mode !== 'paused') return;
    // ondata + nemici rimasti
    const left = S.waveQueue.length + S.enemies.filter(e => e.fall === 0).length;
    ctx.font = fontB(13);
    const txt = `WAVE ${S.wave}`, tw = ctx.measureText(txt).width + 24;
    rr(12, 54, tw, 24, 12); ctx.fillStyle = S.wave % 5 === 0 ? 'rgba(232,56,79,0.75)' : 'rgba(6,20,40,0.4)'; ctx.fill();
    label(txt, 24, 66.5, 13, '#ffffff', { align: 'left', body: true, outline: false, shadow: false });
    const maxDots = Math.min(left, 14);
    for (let i = 0; i < maxDots; i++) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; circ(18 + i * 9, 88, 3); ctx.fill(); }
    // barra febbre
    if (S.fever > 0) {
      const w = 150, h = 22, y = hudTop * 0.86 + (S.combo > 1 ? 30 : 0);
      rr(W / 2 - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = INK; ctx.fill();
      const g = ctx.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
      g.addColorStop(0, '#ff5a3c'); g.addColorStop(0.5, '#ffb238'); g.addColorStop(1, '#ffe08a');
      rr(W / 2 - w / 2 + 2.5, y - h / 2 + 2.5, (w - 5) * clamp(S.fever / FEVER_T, 0, 1), h - 5, h / 2 - 2.5); ctx.fillStyle = g; ctx.fill();
      label('FEVER  POINTS ×2', W / 2, y + 1, 14, '#ffffff', { ow: 0.22, shadow: false, scale: 1 + Math.sin(S.clock * 14) * 0.04 });
    }
    // potenziamenti attivi (in basso)
    const items = [];
    if (S.chili > 0) items.push(['chili', '×' + S.chili]);
    if (S.bubble) items.push(['bubble', '']);
    items.forEach(([type, n], i) => {
      const x = 34 + i * 62, y = H - 34;
      ctx.fillStyle = 'rgba(6,20,40,0.5)'; circ(x, y, 22); ctx.fill();
      ctx.strokeStyle = POWERS[type].col; ctx.lineWidth = 2.5; circ(x, y, 22); ctx.stroke();
      powerIcon(type, x, y, 1.15, S.clock);
      if (n) label(n, x + 20, y + 14, 15, '#ffffff', {});
    });
  }

  // --- cappelli, squalo, missioni: grafica ---
  function drawHat(id, r, face, t) {
    if (id === 'bandana') return;
    if (id === 'halo') {
      const y = -r * 1.2 + Math.sin(t * 3) * 2;
      ctx.strokeStyle = 'rgba(255,209,102,0.35)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.ellipse(0, y, r * 0.62, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COL.gold; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(0, y, r * 0.62, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    ctx.save(); ctx.rotate(face);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    // calotta sulla metà posteriore della testa (gli occhi restano liberi)
    const dome = (col, rad, cut) => {
      ctx.save(); ctx.beginPath(); ctx.rect(-r * 2, -r * 2, r * 2 + cut, r * 4); ctx.clip();
      ctx.fillStyle = col; circ(0, 0, rad); ctx.fill(); ctx.stroke(); ctx.restore();
      const hh = Math.sqrt(Math.max(0, rad * rad - cut * cut));
      ctx.beginPath(); ctx.moveTo(cut, -hh); ctx.lineTo(cut, hh); ctx.stroke();
    };
    if (id === 'cap') {
      ctx.fillStyle = '#2b5fae';
      ctx.beginPath(); ctx.ellipse(-r * 0.98, 0, r * 0.42, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      dome('#3b7dd8', r * 0.95, r * 0.08);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.8); ctx.lineTo(-r * 0.45, r * 0.8); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; circ(-r * 0.4, 0, r * 0.12); ctx.fill(); ctx.stroke();
    } else if (id === 'shades') {
      ctx.fillStyle = '#1b1428';
      for (const s of [-1, 1]) { rr(r * 0.16, s * r * 0.34 - r * 0.24, r * 0.5, r * 0.48, r * 0.16); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.1); ctx.lineTo(r * 0.4, r * 0.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.24, s * r * 0.34 - r * 0.12); ctx.lineTo(r * 0.38, s * r * 0.34 - r * 0.02); ctx.stroke(); }
    } else if (id === 'straw') {
      ctx.fillStyle = '#f2d27a';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.42, 0, Math.PI * 2); ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2, true); ctx.fill('evenodd');
      ctx.beginPath(); ctx.arc(0, 0, r * 1.42, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,110,40,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4); ctx.stroke(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
      ctx.fillStyle = '#e8bf55'; circ(-r * 0.48, 0, r * 0.46); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e8384f'; ctx.lineWidth = r * 0.13; circ(-r * 0.48, 0, r * 0.41); ctx.stroke();
    } else if (id === 'viking') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#f4e6c8';
        ctx.beginPath(); ctx.moveTo(-r * 0.5, s * r * 0.62); ctx.quadraticCurveTo(-r * 0.45, s * r * 1.7, r * 0.3, s * r * 1.75); ctx.quadraticCurveTo(-r * 0.05, s * r * 1.35, r * 0.05, s * r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      dome('#9aa7b8', r * 0.97, -r * 0.02);
      ctx.fillStyle = '#c9d2de'; ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 0.9); ctx.lineTo(-r * 0.05, r * 0.9); ctx.lineTo(-r * 0.25, r * 0.9); ctx.lineTo(-r * 0.25, -r * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5d6878'; for (const y of [-0.55, 0, 0.55]) { circ(-r * 0.15, y * r, r * 0.06); ctx.fill(); }
    } else if (id === 'pirate') {
      ctx.fillStyle = '#1e1a2b';
      ctx.beginPath(); ctx.moveTo(-r * 1.2, 0); ctx.quadraticCurveTo(-r * 0.4, -r * 1.35, r * 0.15, -r * 1.05); ctx.quadraticCurveTo(-r * 0.1, 0, r * 0.15, r * 1.05); ctx.quadraticCurveTo(-r * 0.4, r * 1.35, -r * 1.2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(r * 0.08, -r * 0.95); ctx.quadraticCurveTo(-r * 0.15, 0, r * 0.08, r * 0.95); ctx.stroke();
      ctx.fillStyle = '#ffffff'; circ(-r * 0.5, 0, r * 0.2); ctx.fill();
      ctx.fillStyle = '#1e1a2b'; circ(-r * 0.46, -r * 0.07, r * 0.05); ctx.fill(); circ(-r * 0.46, r * 0.07, r * 0.05); ctx.fill();
    } else if (id === 'swim') {
      dome('#ffd23f', r * 0.98, r * 0.16);
      ctx.save(); ctx.beginPath(); ctx.rect(-r * 2, -r * 2, r * 2 + r * 0.16, r * 4); ctx.clip();
      ctx.strokeStyle = '#e8384f'; ctx.lineWidth = r * 0.16;
      circ(0, 0, r * 0.7); ctx.stroke(); circ(0, 0, r * 0.4); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.45, r * 0.22, r * 0.1, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawShark(t) {
    if (S.mode === 'title' || S.wave < 2) return;
    if (shark.hidden <= 0) {
      const x = Math.cos(shark.a) * SHARK_R, y = Math.sin(shark.a) * SHARK_R;
      const dir = shark.a + (shark.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      // sagoma sott'acqua
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
      ctx.fillStyle = 'rgba(3,22,40,0.45)';
      ctx.beginPath(); ctx.ellipse(-6, 0, 34, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-50, -12 + Math.sin(t * 9) * 4); ctx.lineTo(-48, 10 + Math.sin(t * 9) * 4); ctx.closePath(); ctx.fill();
      // scia
      ctx.strokeStyle = 'rgba(233,251,255,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-22, -10); ctx.moveTo(8, 0); ctx.lineTo(-22, 10); ctx.stroke();
      ctx.restore();
      // pinna (sempre verso l'alto dello schermo)
      const bob = Math.sin(t * 4) * 1.5;
      const fl = shark.sp > 0 ? 1 : -1, sd = Math.cos(dir) >= 0 ? 1 : -1;
      ctx.fillStyle = '#5b6f86'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x - 11 * sd, y + 2 + bob); ctx.quadraticCurveTo(x - 4 * sd, y - 20 + bob, x + 9 * sd, y - 24 + bob); ctx.quadraticCurveTo(x + 4 * sd, y - 10 + bob, x + 11 * sd, y + 2 + bob); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(x - 6 * sd, y - 1 + bob); ctx.quadraticCurveTo(x - 1 * sd, y - 15 + bob, x + 6 * sd, y - 19 + bob); ctx.lineTo(x - 2 * sd, y - 1 + bob); ctx.fill();
      ctx.strokeStyle = 'rgba(233,251,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 3 + bob, 14, 4, 0, 0, Math.PI * 2); ctx.stroke();
      void fl;
    }
    if (shark.bite > 0) {
      // fauci che si chiudono
      const k = 1 - shark.bite / 0.6, open = k < 0.45 ? 1 - k / 0.45 * 0.2 : Math.max(0, 1 - (k - 0.45) / 0.15);
      const a = Math.atan2(shark.by, shark.bx);
      ctx.save(); ctx.translate(shark.bx, shark.by); ctx.rotate(a + Math.PI / 2);
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(0, s * (6 + 22 * open));
        ctx.fillStyle = '#5b6f86'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(0, s * 10, 34, 14, 0, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 9 - 4, 0); ctx.lineTo(i * 9, -s * 8); ctx.lineTo(i * 9 + 4, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function starIcon(x, y, s) {
    ctx.fillStyle = COL.gold; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    star(x, y, 8 * s, 3.6 * s, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
  }
  function starsBadge(x, y) {
    ctx.font = fontB(15);
    const txt = String(meta.stars), w = ctx.measureText(txt).width + 44;
    rr(x, y - 14, w, 28, 14); ctx.fillStyle = 'rgba(6,20,40,0.5)'; ctx.fill();
    starIcon(x + 17, y, 1);
    label(txt, x + 31, y + 1, 15, '#ffffff', { align: 'left', body: true, outline: false, shadow: false });
  }
  function missionList(x, y, w, alpha, title) {
    const ms = activeMissions();
    if (title) label(title, x + w / 2, y, 13, 'rgba(255,255,255,0.65)', { body: true, outline: false, shadow: false, alpha });
    ms.forEach((m, i) => {
      const yy = y + 22 + i * 24;
      ctx.globalAlpha = alpha;
      rr(x, yy - 10, w, 21, 10); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.globalAlpha = 1;
      const fs = 11.5;
      ctx.font = fontB(fs);
      let txt = m.text;
      while (ctx.measureText(txt).width > w - 56 && txt.length > 6) txt = txt.slice(0, -2);
      if (txt !== m.text) txt += '…';
      label(txt, x + 10, yy + 1, fs, '#ffffff', { align: 'left', body: true, outline: false, shadow: false, alpha });
      for (let s = 0; s < m.stars; s++) { ctx.globalAlpha = alpha; starIcon(x + w - 13 - s * 15, yy, 0.75); }
      ctx.globalAlpha = 1;
    });
    if (!ms.length) label('All missions complete!', x + w / 2, y + 24, 12, COL.gold, { body: true, outline: false, shadow: false, alpha });
    return 22 + Math.max(1, ms.length) * 24;
  }

  function drawToasts() {
    let row = 0;
    for (const t of S.toasts) {
      if (t.t < 0 || t.t > 2.8) continue;
      const inK = clamp(t.t / 0.25, 0, 1), outK = clamp((2.8 - t.t) / 0.3, 0, 1);
      const y = hudTop + 26 + row * 46 - (1 - inK) * 30;
      ctx.globalAlpha = Math.min(inK, outK);
      ctx.font = fontB(13);
      const head = t.head || (t.hat ? 'NEW HAT' : 'MISSION COMPLETE'), w = Math.min(W - 24, Math.max(ctx.measureText(t.text).width, 150) + 100);
      rr(W / 2 - w / 2, y - 18, w, 40, 14); ctx.fillStyle = INK; ctx.fill();
      rr(W / 2 - w / 2 + 2.5, y - 15.5, w - 5, 35, 12); ctx.fillStyle = t.info ? '#8a5a2c' : t.hat ? '#6c4bd8' : '#2c8a5a'; ctx.fill();
      ctx.globalAlpha = 1;
      const a = Math.min(inK, outK);
      label(head, W / 2 - w / 2 + 40, y - 6, 10, 'rgba(255,255,255,0.75)', { align: 'left', body: true, outline: false, shadow: false, alpha: a });
      label(t.text, W / 2 - w / 2 + 40, y + 9, 13, '#ffffff', { align: 'left', body: true, outline: false, shadow: false, alpha: a });
      ctx.globalAlpha = a; starIcon(W / 2 - w / 2 + 20, y + 1, 1.1); ctx.globalAlpha = 1;
      if (t.stars) label(`+${t.stars}`, W / 2 + w / 2 - 22, y + 2, 16, COL.gold, { alpha: a });
      row++;
    }
  }

  const hatArrows = { l: { x: 0, y: 0, r: 20 }, r: { x: 0, y: 0, r: 20 } };
  function drawWardrobe(t) {
    const p = w2s(0, 0), z = scale * cam.zoom;
    hatArrows.l.x = p.x - 72 * z; hatArrows.r.x = p.x + 72 * z; hatArrows.l.y = hatArrows.r.y = p.y;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const [b, d] of [[hatArrows.l, -1], [hatArrows.r, 1]]) {
      ctx.fillStyle = 'rgba(6,20,40,0.55)'; circ(b.x, b.y, b.r); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; circ(b.x, b.y, b.r); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(b.x + d * 7, b.y); ctx.lineTo(b.x - d * 4, b.y - 7); ctx.lineTo(b.x - d * 4, b.y + 7); ctx.closePath(); ctx.fill();
    }
    const hat = HATS.find(h => h.id === meta.hat);
    label(hat.name, p.x, p.y - 46 * z, 14 * (1 + S.hatPop * 0.2), '#ffffff', { body: true, ow: 0.3 });
    const nx = nextHat();
    if (nx) label(`next: ${nx.name} at ${nx.stars}★`, p.x, p.y - 46 * z - 19, 11.5, '#ffe6a6', { body: true, ow: 0.3 });
  }

  function render() {
    const t = S.clock;
    drawWater(t);
    drawRaft();
    drawShark(t);
    if (S.mode === 'title') {
      drawTitle(t);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
      drawMute();
      return;
    }
    const all = [S.player, ...S.enemies];
    // chi cade in acqua sta sotto, chi arriva dal cielo sta sopra
    for (const e of all) if (e.fall > 0) drawBlob(e, t);
    for (const e of all) drawDropMarker(e, t);
    drawIce();
    for (const e of all) if (e.fall === 0) drawShadow(e);
    drawPowerups(t);
    for (const e of S.enemies) { drawDasherWarn(e, t); drawBossWarn(e, t); }
    drawWindWarn(t);
    drawGhosts();
    drawPlayerAim(t);
    const ground = all.filter(e => e.fall === 0 && e.drop <= 0).sort((a, b) => a.y - b.y);
    for (const e of ground) { drawBlob(e, t); drawFrozen(e); }
    drawPlayerPowers(t);
    drawWorldFx();
    for (const e of all) if (e.drop > 0) { drawShadow(e); drawBlob(e, t); }
    drawTexts();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    if (S.flash > 0) { ctx.globalAlpha = S.flash * 0.4; ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    drawFever(t);
    drawHUD();
    drawHUD2();
    drawBanner();
    drawToasts();
    drawWindHint();
    drawTutorialHint();
    if (S.mode === 'paused') {
      dim(0.55);
      const pw = Math.min(340, W - 32);
      drawPanel(pw, 262, H / 2 - 135, 1);
      label('PAUSED', W / 2, H / 2 - 82, 44, '#ffffff');
      label('tap to resume', W / 2, H / 2 - 36, 15, 'rgba(255,255,255,0.75)', { body: true, outline: false, shadow: false });
      missionList(W / 2 - pw / 2 + 18, H / 2 - 6, pw - 36, 1, 'MISSIONS');
      uiBtns.pmenu = { x: W / 2, y: H / 2 + 127, w: 170, h: 50 };
      pill(W / 2, H / 2 + 127, 170, 50, '#6fa8d6', '#3a6f9e', 'MAIN MENU', 20, 1);
    }
    if (S.mode === 'over') { drawOver(); drawToasts(); }
  }

  const uiBtns = { menu: null, retry: null, pmenu: null, revive: null, dstars: null, privacy: null };
  // ---------- Pubblicità (solo nell'app Android con AdMob) ----------
  // Regole: niente banner; video con premio solo su scelta del giocatore (CONTINUE, stelle ×2);
  // interstitial solo passando da fine partita a RETRY/MENU, mai nelle prime partite e con un limite di frequenza.
  const INTER_MIN_GAMES = 3, INTER_EVERY = 3, INTER_GAP_MS = 150000;
  const Ads = {
    busy: false, pending: null, openTimer: 0, sessionGames: 0, gamesSinceAd: 0, lastAdAt: -1e12,
    readyT: 0, rewardedOk: false, privacyT: 0, privacy: false,
    on() { return !!(window.TonfoAndroid && window.TonfoAndroid.showRewarded); },
    rewardedReady() { try { return this.on() && !!window.TonfoAndroid.isRewardedReady(); } catch (e) { return false; } },
    interReady() { try { return this.on() && !!window.TonfoAndroid.isInterstitialReady(); } catch (e) { return false; } },
  };
  function adShow(kind, tag, onReward, then) {
    Ads.busy = true;
    Ads.pending = { kind, tag, onReward, then, rewarded: false, opened: false };
    Sound.chargeStop(); Sound.musicStop();
    clearTimeout(Ads.openTimer);
    Ads.openTimer = setTimeout(() => { if (Ads.pending && !Ads.pending.opened) adFinish(); }, 4000);
    try { if (kind === 'rewarded') window.TonfoAndroid.showRewarded(tag); else window.TonfoAndroid.showInterstitial(); }
    catch (e) { adFinish(); }
  }
  function adFinish() {
    const p = Ads.pending;
    Ads.pending = null; Ads.busy = false; clearTimeout(Ads.openTimer);
    if (!p) return;
    if (p.opened) { Ads.lastAdAt = Date.now(); Ads.gamesSinceAd = 0; }
    if (p.kind === 'rewarded') {
      if (p.rewarded) { S.rewardedThisRun = true; if (p.onReward) p.onReward(); }
      else if (!p.opened) S.toasts.push({ text: 'No video available right now', head: 'SORRY', stars: 0, t: 0, info: true });
    }
    if (p.then) p.then();
  }
  window.__TONFO_ad = (ev) => {
    const p = Ads.pending;
    if (!p) return;
    if (ev === 'opened') p.opened = true;
    else if (ev === 'reward') p.rewarded = true;
    else if (ev === 'closed' || ev === 'failed') adFinish();
  };
  function maybeInterstitial(then) {
    const ok = Ads.on() && !Ads.busy && Ads.sessionGames >= INTER_MIN_GAMES && Ads.gamesSinceAd >= INTER_EVERY
      && Date.now() - Ads.lastAdAt >= INTER_GAP_MS && !S.rewardedThisRun && Ads.interReady();
    if (ok) adShow('inter', 'inter', null, then); else then();
  }
  const canRevive = () => Ads.on() && !S.revived && S.wave >= 2;
  const canDoubleStars = () => Ads.on() && S.runStars > 0 && !S.starsDoubled;
  function revive() {
    S.revived = true;
    const P = makeEntity('player', 0, 0);
    S.player = P;
    for (const e of S.enemies) {
      const d = len(e.x, e.y) || 1;
      if (d < 115) { e.x = e.x / d * 125; e.y = e.y / d * 125; }
      e.vx = e.vy = 0; e.stun = Math.max(e.stun, 1.2);
      if (e.state === 'aim' || e.state === 'dash' || e.state === 'jump') { e.state = e.kind === 'boss' ? 'walk' : 'rest'; e.stateT = 2; }
    }
    S.bubble = true;
    S.mode = 'play'; S.overT = 0; S.confetti.length = 0; S.charging = false; S.recover = 0; S.dashT = 0;
    uiBtns.menu = uiBtns.retry = uiBtns.revive = uiBtns.dstars = null;
    banner('BACK IN!', 'with a bubble shield', COL.gold);
    S.rings.push({ x: 0, y: 0, r: 10, vr: 300, life: 0.5, max: 0.5, col: COL.gold, w: 8 });
    Sound.power();
    Sound.musicStart();
    Sound.musicSet(Math.min(3, Math.floor((S.wave - 1) / 2)), 100 + Math.min(40, (S.wave - 1) * 3.5), false);
  }
  function doubleStars() {
    const before = meta.stars;
    S.starsDoubled = true;
    meta.stars += S.runStars; saveMeta();
    S.toasts.push({ text: `+${S.runStars} bonus stars`, head: 'STARS DOUBLED', stars: S.runStars, t: 0 });
    S.runStars *= 2;
    const hat = HATS.find(h => h.stars > before && h.stars <= meta.stars);
    if (hat) S.toasts.push({ text: `Unlocked: ${hat.name}!`, stars: 0, t: -1.3, hat: hat.id });
    Sound.mission();
  }
  function overRetry() { maybeInterstitial(startGame); }
  function overMenu() { maybeInterstitial(goMenu); }

  // ---------- Torna al menu ----------
  const hitRect = (b, x, y) => b && Math.abs(x - b.x) <= b.w / 2 + 6 && Math.abs(y - b.y) <= b.h / 2 + 6;
  function goMenu() {
    if (S.mode === 'paused' && S.score > S.best) { S.best = S.score; store.set(LS_BEST, String(S.best)); }
    if (S.mode === 'paused') checkMissions();
    Sound.chargeStop(); Sound.musicStop();
    S.mode = 'title'; S.titleT = 0;
    S.charging = false; S.enemies.length = 0; S.powerups.length = 0; S.particles.length = 0; S.texts.length = 0;
    S.ripples.length = 0; S.rings.length = 0; S.stars.length = 0; S.ghosts.length = 0; S.confetti.length = 0; S.toasts.length = 0;
    S.banner = null; S.wind = null; S.iceK = 0; S.mod = ''; S.fever = 0; S.chili = 0; S.bubble = false; S.wave = 0; S.trauma = 0; S.slowmo = 0;
    S.player = makeEntity('player', 0, 0);
    uiBtns.menu = uiBtns.retry = uiBtns.pmenu = null;
    Sound.powerSpawn();
  }

  // ---------- Input ----------
  let pointerDown = false, activePointer = null;
  const hitBtn = (b, x, y) => (x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r + 8) ** 2;

  function onDown(x, y) {
    Sound.init();
    if (hitBtn(muteBtn, x, y)) { Sound.toggleMute(); return false; }
    if ((S.mode === 'play' || S.mode === 'paused') && hitBtn(pauseBtn, x, y)) { togglePause(); return false; }
    if (S.mode === 'title') {
      if (S.titleT < 0.3) return false;
      if (Ads.privacy && hitRect(uiBtns.privacy, x, y)) { try { window.TonfoAndroid.showPrivacyOptions(); } catch (e) { /* ignora */ } return false; }            // appena tornati al menu: niente avvio accidentale
      if (hitBtn(hatArrows.l, x, y)) { cycleHat(-1); return false; }
      if (hitBtn(hatArrows.r, x, y)) { cycleHat(1); return false; }
      startGame(); return false;
    }
    if (Ads.busy) return false;
    if (S.mode === 'over') {
      if (S.overT <= 0.3) return false;
      if (hitRect(uiBtns.revive, x, y)) { adShow('rewarded', 'revive', revive); return false; }
      if (hitRect(uiBtns.dstars, x, y)) { adShow('rewarded', 'stars', doubleStars); return false; }
      if (hitRect(uiBtns.menu, x, y)) overMenu();
      else if (hitRect(uiBtns.retry, x, y) || (!uiBtns.revive && !uiBtns.dstars)) overRetry();
      return false;
    }
    if (S.mode === 'paused') { if (hitRect(uiBtns.pmenu, x, y)) goMenu(); else togglePause(); return false; }
    if (S.mode === 'play') { press(); return true; }
    return false;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (activePointer !== null) return;
    canvas.focus({ preventScroll: true });
    if (onDown(e.clientX, e.clientY)) {
      activePointer = e.pointerId; pointerDown = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    }
  });
  const onUp = e => {
    if (e.pointerId !== activePointer) return;
    activePointer = null; pointerDown = false;
    release();
  };
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  let keyHeld = false;
  const ACTION_KEYS = ['Space', 'Enter', 'ArrowUp'];
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (ACTION_KEYS.includes(k)) {
      e.preventDefault();
      if (e.repeat || keyHeld) return;
      keyHeld = true;
      Sound.init();
      if (S.mode === 'title') startGame();
      else if (S.mode === 'over') { if (S.overT > 0.3 && !Ads.busy) overRetry(); }
      else if (S.mode === 'paused') togglePause();
      else if (S.mode === 'play') press();
    } else if (k === 'Escape' && S.mode === 'over') { if (!Ads.busy) overMenu(); }
    else if (k === 'KeyQ' && S.mode === 'paused') goMenu();
    else if (k === 'KeyQ' && S.mode === 'over') { if (!Ads.busy) overMenu(); }
    else if (k === 'KeyP' || k === 'Escape') togglePause();
    else if (k === 'KeyM') Sound.toggleMute();
    else if (k === 'KeyR' && S.mode === 'over') { if (!Ads.busy) overRetry(); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && S.mode === 'title') cycleHat(k === 'ArrowLeft' ? -1 : 1);
  });
  window.addEventListener('keyup', e => {
    if (ACTION_KEYS.includes(e.code)) { keyHeld = false; if (!pointerDown) release(); }
  });

  const autoPause = () => { keyHeld = false; pointerDown = false; activePointer = null; if (S.mode === 'play') togglePause(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  window.addEventListener('blur', autoPause);

  // ---------- Loop ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (S.hitstop > 0) { S.hitstop -= dt; dt *= 0.12; }
    if (S.mode === 'dying') dt *= 0.85;
    if (S.slowmo > 0) { S.slowmo -= dt; dt *= 0.35; }
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 24) { update(STEP); acc -= STEP; n++; }
    if (n >= 24) acc = 0;
    if (cachesDirty) { buildCaches(); cachesDirty = false; }
    updateCamera(dt);
    render();
    requestAnimationFrame(frame);
  }
  S.player = makeEntity('player', 0, 0);
  S.titleEnts = [makeEntity('brute', -160, -10), makeEntity('walker', 165, 40), makeEntity('dasher', 150, -60), makeEntity('mini', -165, 75)];
  if (document.fonts && document.fonts.load) {
    ['40px "Lilita One"', '600 20px Fredoka', '700 20px Fredoka'].forEach(f => document.fonts.load(f).catch(() => {}));
  }
  requestAnimationFrame(frame);

  // Agganci per l'app Android: tasto Indietro e pausa quando l'app va in background
  window.__TONFO_back = () => {
    if (S.mode === 'play') { togglePause(); return 'handled'; }
    if (S.mode === 'paused') { togglePause(); return 'handled'; }
    if (Ads.busy) return 'handled';
    if (S.mode === 'over') { overMenu(); return 'handled'; }
    if (S.mode === 'dying') return 'handled';
    return 'exit';
  };
  window.__TONFO_pause = () => { autoPause(); Sound.musicStop(); };

  // Hook per test automatici (non influisce sul gioco)
  window.__TONFO = { Ads, uiBtns, goMenu, meta, shark, checkMissions, cycleHat, startWave, spawnPower, collect, bossSlam, ease, POW_MIN, POW_MAX, S, update, press, release, startGame, STEP, DISC, DAMP, currentPower, spawn, TYPES };
})();
