/* Shared header and footer, identical on every page of the site.
 * Usage, in <head>:  <script src="/site.js"></script>
 * then in <body>:    <site-header></site-header> ... <site-footer game="latch"></site-footer>
 * The footer's privacy link follows the `game` attribute: a game page (or its privacy page)
 * links its own policy, the home page (no attribute) lists every game's policy.
 * GAMES is the single list of games: more-games.js reads it too. */
(() => {
'use strict';

const BRAND = 'Mrcosy Games';

const GAMES = [
  { id: 'tonfo', name: 'TONFO: Raft Brawl', short: 'TONFO', cover: 'tonfo/img/og.jpg', icon: 'tonfo/img/icon.png',
    text: 'Hold to charge, release to dash. Knock them into the water, and don\'t fall in.' },
  { id: 'latch', name: 'LATCH', short: 'LATCH', cover: 'latch/img/og.jpg', icon: 'latch/img/icon.png',
    text: 'Tap to let go, tap to latch. Hug the core for PERFECT combos.' },
  { id: 'echo', name: 'ECHO Lightrunner', short: 'ECHO', cover: 'echo/img/og.png', icon: 'echo/img/icon.png',
    text: 'Every tap turns you and lights the way. Hit the corners in total darkness.' },
  { id: 'longshade', name: 'Longshade', short: 'Longshade', cover: 'longshade/img/og.png', icon: 'longshade/img/icon.png',
    text: 'Tap to become your shadow and leap across islands floating in the night.' },
  { id: 'dondo-dondo', name: 'Dondo Dondo', short: 'Dondo Dondo', cover: 'dondo-dondo/img/og.png', icon: 'dondo-dondo/img/icon.png',
    text: 'Tap to swap the pivot and climb before the tide catches you.' },
  { id: 'pip-and-pop', name: 'Pip & Pop', short: 'Pip & Pop', cover: 'pip-and-pop/img/og.jpg', icon: 'pip-and-pop/img/icon.png',
    text: 'Hold to open, release to close. Guide two lights through an endless rush.' },
];
window.MRCOSY_GAMES = GAMES;

// Non-game apps: not listed among the games, but their privacy policy is
// linked from the footer like a game's.
const APPS = [
  { id: 'fittape', short: 'FitTape' },
];

const SOCIAL = [
  { name: 'TikTok', url: 'https://www.tiktok.com/@mrcosy.m',
    icon: 'M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z' },
  { name: 'Instagram', url: 'https://www.instagram.com/mrcosygames/',
    icon: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.12-1.38 5.88 5.88 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.12A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z' },
  { name: 'YouTube', url: 'https://www.youtube.com/@mrcosy-games',
    icon: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z' },
];

// One playful look for every page: sticker style (thick ink outlines, solid drop shadows)
// and a stripe made of each game's colour. Fixed colours, so it reads the same on any page theme.
const INK = '#2d2350';
const STRIPE = 'linear-gradient(90deg, #e8384f 0 16.66%, #ff9a3d 0 33.33%, #ffd23f 0 50%, #46d9a8 0 66.66%, #5fd8ff 0 83.33%, #9d7bff 0)';
const CSS = `
@font-face { font-family: "S Fredoka"; font-weight: 300 700; font-display: swap; src: url(/fonts/fredoka-latin.woff2) format("woff2"); }
@font-face { font-family: "S Lilita"; font-weight: 400; font-display: swap; src: url(/tonfo/fonts/lilita-one.woff2) format("woff2"); }

site-header, site-footer {
  display: block; position: relative; padding-inline: 24px; text-align: left; letter-spacing: normal; text-transform: none;
  font: 500 15px/1.5 "S Fredoka", ui-rounded, system-ui, sans-serif;
}
site-header .s-in, site-footer .s-in { max-width: 992px; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; }

site-header { background: #fff6ea; color: ${INK}; border-bottom: 4px solid ${INK}; padding-bottom: 11px; }
site-header::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: ${STRIPE}; border-top: 3px solid ${INK}; }
site-header .s-in { padding-block: 14px 16px; }

site-header .s-brand { display: inline-flex; align-items: baseline; gap: 8px; text-decoration: none; font: 400 28px/1 "S Lilita", "S Fredoka", sans-serif; }
site-header .s-brand b { font-weight: 400; display: inline-block; transition: transform .2s cubic-bezier(.3,1.8,.5,1);
  text-shadow: 0 2px 0 ${INK}, 0 -2px 0 ${INK}, 2px 0 0 ${INK}, -2px 0 0 ${INK}, 2px 2px 0 ${INK}, -2px 2px 0 ${INK}, 2px -2px 0 ${INK}, -2px -2px 0 ${INK}, 0 5px 0 ${INK}; }
site-header .s-word { display: inline-flex; }
site-header .s-brand .s-games-word { color: ${INK}; font-size: 22px; }
site-header .s-brand:hover b { transform: translateY(-5px) rotate(-6deg); }
site-header .s-brand:hover b:nth-child(even) { transform: translateY(-3px) rotate(6deg); }
site-header .s-brand b:nth-child(2) { transition-delay: .03s; } site-header .s-brand b:nth-child(3) { transition-delay: .06s; }
site-header .s-brand b:nth-child(4) { transition-delay: .09s; } site-header .s-brand b:nth-child(5) { transition-delay: .12s; }
site-header .s-brand b:nth-child(6) { transition-delay: .15s; }

site-header nav { display: flex; align-items: center; gap: 10px; }
site-header .s-games, site-header .s-icon {
  display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
  border: 3px solid ${INK}; box-shadow: 0 4px 0 ${INK}; transition: transform .15s cubic-bezier(.3,1.8,.5,1), box-shadow .15s;
}
site-header .s-games { height: 42px; padding: 0 16px; border-radius: 999px; background: #ffd23f; color: ${INK}; font: 400 17px/1 "S Lilita", "S Fredoka", sans-serif; letter-spacing: .02em; margin-right: 4px; }
site-header .s-icon { width: 42px; height: 42px; border-radius: 50%; color: #fff; }
site-header .s-tiktok { background: #111; } site-header .s-tiktok svg { filter: drop-shadow(-1.5px -1px 0 #25f4ee) drop-shadow(1.5px 1px 0 #fe2c55); }
site-header .s-instagram { background: radial-gradient(circle at 30% 107%, #fdf497 0 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%); }
site-header .s-youtube { background: #ff0033; }
site-header .s-games:hover, site-header .s-icon:hover { transform: translateY(-3px) rotate(-4deg); box-shadow: 0 7px 0 ${INK}; }
site-header .s-icon:nth-of-type(odd):hover { transform: translateY(-3px) rotate(4deg); }
site-header .s-games:active, site-header .s-icon:active { transform: translateY(3px); box-shadow: 0 1px 0 ${INK}; }
site-header svg { width: 19px; height: 19px; fill: currentColor; }

site-footer { margin-top: 40px; background: ${INK}; color: #c9c0ea; border-top: 4px solid ${INK}; padding-top: 11px; }
site-footer::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 8px; background: ${STRIPE}; border-bottom: 3px solid ${INK}; }
site-footer .s-in { padding-block: 26px 34px; }
site-footer .s-copy { font: 400 18px/1 "S Lilita", "S Fredoka", sans-serif; color: #fff6ea; letter-spacing: .02em; }
site-footer a { color: #ffd23f; text-decoration-thickness: 2px; text-underline-offset: 3px; font-weight: 600; }
site-footer a:hover { color: #fff6ea; }

site-header a:focus-visible, site-footer a:focus-visible { outline: 3px solid #5fd8ff; outline-offset: 3px; }
@media (max-width: 520px) {
  site-header .s-brand { font-size: 24px; } site-header .s-brand .s-games-word { font-size: 19px; }
  site-header .s-games { height: 38px; padding: 0 12px; font-size: 15px; } site-header .s-icon { width: 38px; height: 38px; }
}
@media (prefers-reduced-motion: reduce) { site-header *, site-footer * { transition: none !important; } }
`;

const COLORS = ['#e8384f', '#ff9a3d', '#ffd23f', '#46d9a8', '#5fd8ff', '#9d7bff'];
const LETTERS = [...'Mrcosy'].map((c, i) => `<b style="color:${COLORS[i]}">${c}</b>`).join('');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="s-in">
      <a class="s-brand" href="/" aria-label="${BRAND}"><span class="s-word" aria-hidden="true">${LETTERS}</span><span class="s-games-word" aria-hidden="true">Games</span></a>
      <nav aria-label="${BRAND}">
        <a class="s-games" href="/">All games</a>
        ${SOCIAL.map(s => `<a class="s-icon s-${s.name.toLowerCase()}" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.name}" title="${s.name}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.icon}"/></svg></a>`).join('')}
      </nav>
    </div>`;
  }
}

class SiteFooter extends HTMLElement {
  connectedCallback() {
    const all = [...GAMES, ...APPS];
    const game = all.find(g => g.id === this.getAttribute('game'));
    const privacy = game
      ? `<a href="/${game.id}/privacy/">Privacy policy</a>`
      : `Privacy: ${all.map(g => `<a href="/${g.id}/privacy/">${esc(g.short)}</a>`).join(' · ')}`;
    this.innerHTML = `<div class="s-in">
      <span class="s-copy">© 2026 ${BRAND}</span>
      <span>Follow: ${SOCIAL.map(s => ext(s.url, s.name)).join(' · ')}</span>
      <span>${privacy}</span>
    </div>`;
  }
}

const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);
customElements.define('site-header', SiteHeader);
customElements.define('site-footer', SiteFooter);
})();
