// LONGSHADE — all sound is synthesised at runtime with WebAudio (original, no samples).

let ac = null, master = null, noiseBuf = null;
let muted = false;

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.03);
}

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(comp);
  comp.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
export function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

function env(g, t, a, peak, dcy) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}

function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol, freq, q = 1, type = 'bandpass', delay = 0, f1 = freq) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (f1 !== freq) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// --- Game sounds ------------------------------------------------------------
// D major pentatonic (original sequences, no melodies quoted).
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (i, base = 293.66) => base * Math.pow(2, SCALE[Math.min(SCALE.length - 1, i)] / 12);

export const sfx = {
  // Wing beat at the top of every orbit: the rhythm of the night.
  tick() { tone('sine', 2349, 2349, 0.03, 0.02); },
  // The shade swallows you and spits you out over there.
  teleport(dist) {
    const d = Math.min(1, dist / 160);
    noise(0.12, 0.12, 900 + d * 1600, 2, 'bandpass', 0, 300);
    tone('sine', 520 + d * 500, 180, 0.14, 0.11);
  },
  land(streak) {
    tone('triangle', 130, 90, 0.09, 0.14);
    tone('square', note(streak % 8, 587.33), note(streak % 8, 587.33), 0.05, 0.03, 0.01);
  },
  close() { tone('sine', 1760, 1760, 0.08, 0.06); tone('sine', 2349.3, 2349.3, 0.12, 0.05, 0.05); },
  long(n) { for (let i = 0; i < Math.min(5, n + 1); i++) tone('square', note(i + 3, 293.66), note(i + 3, 293.66), 0.06, 0.03, i * 0.045); },
  hop() { tone('triangle', 300, 420, 0.06, 0.06); },
  fizzle() { noise(0.06, 0.05, 300, 3, 'lowpass'); },
  reverseWarn() { tone('sine', 880, 1318.5, 0.1, 0.04); tone('sine', 1318.5, 880, 0.1, 0.04, 0.12); },
  crumbleWarn() { for (let i = 0; i < 4; i++) noise(0.04, 0.06, 1800, 6, 'bandpass', i * 0.07); },
  crumble() { noise(0.35, 0.12, 400, 1, 'lowpass', 0, 120); },
  death(cause) {
    if (cause === 'spike') { tone('square', 1200, 300, 0.08, 0.08); noise(0.12, 0.1, 3000, 4); }
    if (cause === 'wall') { tone('triangle', 160, 60, 0.12, 0.2); noise(0.1, 0.12, 600, 1, 'lowpass'); }
    tone('sawtooth', 240, 38, 0.6, 0.09, 0.05);
    noise(0.5, 0.08, 500, 0.7, 'lowpass', 0.05, 80);
  },
  phase() { [0, 2, 4, 7].forEach((n, i) => tone('triangle', note(n, 293.66), note(n, 293.66), 0.22, 0.06, i * 0.11)); },
  record() { [4, 5, 7, 9].forEach((n, i) => tone('square', note(n, 293.66), note(n, 293.66), 0.1, 0.035, i * 0.08)); },
  ui() { tone('square', 880, 880, 0.04, 0.025); },
};
