// LONGSHADE — original 16-bit style pixel art.
// The game is laid out in logical units (180x320) and rendered at 2x (360x640 "hi-res" pixels):
// every sprite here is authored at hi-res and drawn at half size in logical units.

export const PAL = {
  ink: '#07040c',
  outline: '#150c26',
  star: '#fff6dc',
  starDim: '#8a7cb8',
  // stone ramp (dark → light)
  stone: ['#1b1330', '#2a1f45', '#3b2d5c', '#4f3f74', '#6a578f', '#8a76ab'],
  crack: '#100820',
  // warm light ramp on surfaces lit by the moth
  lit: ['#5e4466', '#8c5a66', '#c07a62', '#eca96a', '#ffd38c', '#fff0c4'],
  glow: '#ffcf7a',
  shadeEye: '#c69bff',
  shadeRim: '#5a3a9a',
  spike: ['#1f5a6e', '#2f8aa0', '#5cc6d8', '#a8f0fa', '#f0ffff'],
  danger: '#ff4f5e',
  dangerDim: '#8a1f3a',
  ui: '#fff2d6',
  uiDim: '#b3a6d6',
  gold: '#ffd166',
  vine: '#2b1d3c',
};

// Each phase of the night: 3 sky keys (top, middle, horizon), cloud tint, far/mid/near layers, mist, accent.
export const PHASE_PAL = [
  { sky: ['#140b2a', '#3a1a4e', '#8a3a5c'], cloud: '#c06a7a', far: '#3a1c4a', mid: '#25123a', near: '#150a24', mist: '#c0607a', accent: '#ffb56b' },
  { sky: ['#070a22', '#152052', '#33437e'], cloud: '#6a82c0', far: '#1c2650', mid: '#111838', near: '#0a0d24', mist: '#4a64aa', accent: '#9fc4ff' },
  { sky: ['#030308', '#0c0920', '#21163e'], cloud: '#4a3a7a', far: '#171030', mid: '#0e0a22', near: '#070514', mist: '#3a2a6a', accent: '#c69bff' },
  { sky: ['#0d0313', '#2a0a2c', '#5a1240'], cloud: '#a03a6a', far: '#2c0c30', mid: '#1c0720', near: '#100414', mist: '#8a1a50', accent: '#ff6b9a' },
  { sky: ['#000000', '#120804', '#3a1c06'], cloud: '#8a5a1a', far: '#1e1006', mid: '#140a04', near: '#0a0502', mist: '#7a4a10', accent: '#ffd166' },
];

const C = {
  // nightcap
  B: '#3d2a78', b: '#6a4cb8', c: '#9c80e4', w: '#fff4dc', W: '#cdbb9a',
  // skin
  S: '#b97a66', s: '#efc09a', h: '#ffe2c6', e: '#4a2436', r: '#f09090',
  // nightgown
  N: '#6a70a8', n: '#aab2e2', m: '#e6ebff',
  // moth
  y: '#fff6dc', Y: '#d8bc84', p: '#b48ad8', o: '#ff9a3c', O: '#c8641e', a: '#4a2a2a',
};

const pad = (rows, w) => rows.map((r) => (r + '.'.repeat(w)).slice(0, w));

// The sleepwalker, 18x24 hi-res: floppy nightcap, closed eyes, arms stretched forward. Feet on row 23.
const HERO_TOP = [
  '.......bbbb',
  '.....bbccbbb',
  '....bccbbbbbb',
  '...bcbbbbbbbbB',
  '..bbbbbbbbbbbbB',
  'wwbbbbbbbbbbbbbB',
  'wWW.BBBBBBBBBBBB',
  '....SShhhhhhhs',
  '....Sshhhhhhhhs',
  '....Ssshhhhheehs',
  '....SSsshhhhhrhs',
  '.....SSsssssss',
  '......SSsssS',
];
const HERO_WALK_A = pad([
  ...HERO_TOP,
  '.....NnnmmmmN',
  '....NnnmmmmmnnnSsh',
  '....NnnmmmmnnnnSSs',
  '....Nnnnmmmmn',
  '...NNnnnmmmmn',
  '...NNnnnnmmmnn',
  '...NNNnnnnmmnn',
  '..NNNNnnnnnnnnn',
  '..NNNNNNNNNNNNN',
  '.....SS....SS',
  '....SSs....Ssh',
], 18);
const HERO_WALK_B = pad([
  ...HERO_TOP,
  '.....NnnmmmmN',
  '....NnnmmmmmnnnSsh',
  '....NnnmmmmnnnnSSs',
  '....Nnnnmmmmn',
  '...NNnnnmmmmn',
  '...NNnnnnmmmnn',
  '...NNNnnnnmmnn',
  '..NNNNnnnnnnnnn',
  '...NNNNNNNNNNN',
  '.......SSSS',
  '......SSsSsh',
], 18);
// Teetering at an edge: arms thrown up, wobbling.
const HERO_TEETER = pad([
  '.......bbbb.....hs',
  '.....bbccbbb....sS',
  '....bccbbbbbb...nN',
  '...bcbbbbbbbbB..nN',
  '..bbbbbbbbbbbbB.nN',
  'wwbbbbbbbbbbbbbBnN',
  'wWW.BBBBBBBBBBBBnN',
  '....SShhhhhhhs..nN',
  '....Sshhhhhhhhs.nN',
  '....Ssshhhhheehs.n',
  '....SSsshhhhhrhs.n',
  '.....SSsssssss..nN',
  '......SSsssS...nN',
  '.....NnnmmmmNnnN',
  '....NnnmmmmmnnN',
  '....Nnnmmmmmn',
  '....Nnnnmmmmn',
  '...NNnnnmmmmn',
  '...NNnnnnmmmnn',
  '...NNNnnnnmmnn',
  '..NNNNnnnnnnnnn',
  '..NNNNNNNNNNNNN',
  '.....SS....SS',
  '....SSs....Ssh',
], 18);

const MOTH_A = pad([
  'y............y',
  'yy...a..a...yy',
  'yYy...aa...yYy',
  'yYpy..oo..ypYy',
  '.yYYy.oO.yYYy',
  '..yyyyoOyyyy',
  '......oO',
  '.......O',
], 14);
const MOTH_B = pad([
  '',
  '.....a..a',
  '......aa',
  '......oo',
  '..yyyyoOyyyy',
  '.yYYpyoOypYYy',
  'yYYyy.oO.yyYYy',
  'yy.....O....yy',
], 14);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Build a sprite canvas with a 1px automatic outline. colorOf(ch) returns a colour or null.
function buildSprite(rows, colorOf, outline) {
  const h = rows.length, w = rows[0].length;
  const cv = makeCanvas(w + 2, h + 2);
  const cx = cv.getContext('2d');
  const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== '.';
  if (outline) {
    cx.fillStyle = outline;
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) cx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    const col = colorOf(ch, x, y);
    if (!col) continue;
    cx.fillStyle = col;
    cx.fillRect(x + 1, y + 1, 1, 1);
  }
  return cv;
}

export const SPR = {};
// Hero anchor in logical units: feet centre (sprite is 20x26 hi-res incl. outline).
export const HERO_AX = 4.5, HERO_AY = 12.5;

export function buildArt() {
  const normal = (ch) => C[ch];
  const shade = (ch) => (ch === 'e' ? PAL.shadeEye : PAL.ink);
  const ghost = (ch) => (ch === 'e' ? PAL.ui : PAL.dangerDim);
  SPR.heroA = buildSprite(HERO_WALK_A, normal, PAL.outline);
  SPR.heroB = buildSprite(HERO_WALK_B, normal, PAL.outline);
  SPR.heroT = buildSprite(HERO_TEETER, normal, PAL.outline);
  SPR.shade = buildSprite(HERO_WALK_A, shade, PAL.shadeRim);
  SPR.shadeBad = buildSprite(HERO_WALK_A, ghost, PAL.danger);
  SPR.mothA = buildSprite(MOTH_A, normal, PAL.outline);
  SPR.mothB = buildSprite(MOTH_B, normal, PAL.outline);
  SPR.mothFlashA = buildSprite(MOTH_A, () => '#ffffff', PAL.glow);
  SPR.mothFlashB = buildSprite(MOTH_B, () => '#ffffff', PAL.glow);
  SPR.glow = buildGlow(76, PAL.glow);
  SPR.glowWhite = buildGlow(84, '#ffffff');
  SPR.aura = buildGlow(14, PAL.shadeEye);
  SPR.spikeGlow = buildGlow(10, '#5cc6d8');
}

// Banded radial glow (translucent bands, like SNES colour math). Size is in hi-res pixels.
function buildGlow(r, color) {
  const d = r * 2 + 1;
  const cv = makeCanvas(d, d);
  const cx = cv.getContext('2d');
  cx.fillStyle = color;
  const bands = [[1, 0.03], [0.86, 0.035], [0.72, 0.04], [0.6, 0.045], [0.48, 0.05], [0.37, 0.06], [0.27, 0.07], [0.18, 0.08]];
  for (const [f, a] of bands) {
    cx.globalAlpha = a;
    const rr = r * f;
    for (let y = -Math.floor(rr); y <= rr; y++) {
      const hw = Math.floor(Math.sqrt(rr * rr - y * y));
      cx.fillRect(r - hw, r + y, hw * 2 + 1, 1);
    }
  }
  return cv;
}

// ---------------------------------------------------------------------------
// Colour helpers
export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// 5x7 proportional pixel font, rendered with a vertical gradient, outline and drop shadow.
const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '##', '.#', '#.'],
  ':': ['..', '##', '##', '..', '##', '##', '..'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
};
const SPACE_W = 3;

function glyph(ch) { return G[ch] || G['?']; }

export function textWidthPx(str) {
  // width in font pixels
  let w = 0;
  for (const ch of str) w += (ch === ' ' ? SPACE_W : glyph(ch)[0].length) + 1;
  return Math.max(0, w - 1);
}

const textCache = new Map();
function textCanvas(str, scale, color, shadowCol) {
  const key = str + '|' + scale + '|' + color + '|' + shadowCol;
  let cv = textCache.get(key);
  if (cv) return cv;
  const fw = textWidthPx(str), fh = 7;
  const pad = 2; // outline + shadow room (hi-res px)
  const W = fw * scale + pad * 2, H = fh * scale + pad * 2 + 1;
  // mask at hi-res
  const mask = new Uint8Array(W * H);
  let cx = 0;
  for (const ch of str) {
    if (ch === ' ') { cx += SPACE_W + 1; continue; }
    const g = glyph(ch);
    for (let y = 0; y < 7; y++) for (let x = 0; x < g[y].length; x++) {
      if (g[y][x] !== '#') continue;
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) mask[(pad + y * scale + yy) * W + pad + (cx + x) * scale + xx] = 1;
    }
    cx += g[0].length + 1;
  }
  cv = makeCanvas(W, H);
  const c = cv.getContext('2d');
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  const outlined = (x, y) => at(x, y) || at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
  // drop shadow: outline shape shifted down 1px
  if (shadowCol) {
    c.fillStyle = shadowCol;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (outlined(x, y - 1)) c.fillRect(x, y, 1, 1);
    c.fillStyle = PAL.outline;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (outlined(x, y)) c.fillRect(x, y, 1, 1);
  }
  // gradient fill by row: light on top, base, darker at the bottom
  const top = mix(color, '#ffffff', 0.45), bot = mix(color, '#000000', 0.25);
  for (let y = 0; y < H; y++) {
    const fy = (y - pad) / (fh * scale);
    c.fillStyle = fy < 0.3 ? top : fy < 0.72 ? color : bot;
    for (let x = 0; x < W; x++) if (at(x, y)) c.fillRect(x, y, 1, 1);
  }
  if (textCache.size > 400) textCache.clear();
  textCache.set(key, cv);
  return cv;
}

// Draw text at logical (x, y); scale is in hi-res pixels per font pixel (2 = normal UI text).
export function drawText(ctx, str, x, y, color, scale = 2, align = 'left', shadowCol = PAL.ink) {
  str = String(str).toUpperCase();
  const cv = textCanvas(str, scale, color, shadowCol);
  const w = cv.width / 2, h = cv.height / 2;
  let dx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  dx = Math.round(dx * 2) / 2 - 1;
  const dy = Math.round(y * 2) / 2 - 1;
  ctx.drawImage(cv, dx, dy, w, h);
}

// Logical width of a string at a given scale.
export function textWidth(str, scale = 2) { return (textWidthPx(String(str).toUpperCase()) * scale) / 2; }
