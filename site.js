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

const SOCIAL = [
  { name: 'TikTok', url: 'https://www.tiktok.com/@mrcosy.m',
    icon: 'M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z' },
  { name: 'Instagram', url: 'https://www.instagram.com/mrcosygames/',
    icon: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.12-1.38 5.88 5.88 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.12A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z' },
  { name: 'YouTube', url: 'https://www.youtube.com/@mrcosy-games',
    icon: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z' },
];

// Fixed colours and font, so header and footer look the same on every game's theme.
const CSS = `
@font-face { font-family: "Site Fredoka"; font-weight: 300 700; font-display: swap; src: url(/fonts/fredoka-latin.woff2) format("woff2"); }
site-header, site-footer {
  display: block; background: #1d1b18; color: #f7f3ec; text-align: left;
  font: 400 15px/1.5 "Site Fredoka", ui-rounded, system-ui, sans-serif; letter-spacing: normal; text-transform: none;
}
site-header .s-in, site-footer .s-in { box-sizing: border-box; max-width: 1040px; margin: 0 auto; padding-inline: 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 20px; }
site-header .s-in { min-height: 56px; padding-block: 8px; }
site-header .s-brand { font-weight: 700; font-size: 20px; color: #f7f3ec; text-decoration: none; }
site-header nav { display: flex; align-items: center; gap: 6px; }
site-header .s-games { color: #f7f3ec; text-decoration: none; font-weight: 600; margin-right: 8px; }
site-header .s-icon { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 50%; color: #f7f3ec; }
site-header .s-icon:hover { background: rgba(247,243,236,.12); }
site-header svg { width: 19px; height: 19px; fill: currentColor; }
site-footer { margin-top: 48px; }
site-footer .s-in { padding-block: 22px 28px; color: #b8b0a3; }
site-footer a { color: #f7f3ec; }
site-header a:focus-visible, site-footer a:focus-visible { outline: 2px solid #ffd166; outline-offset: 2px; }
`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="s-in">
      <a class="s-brand" href="/">${BRAND}</a>
      <nav aria-label="${BRAND}">
        <a class="s-games" href="/">All games</a>
        ${SOCIAL.map(s => `<a class="s-icon" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.name}" title="${s.name}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.icon}"/></svg></a>`).join('')}
      </nav>
    </div>`;
  }
}

class SiteFooter extends HTMLElement {
  connectedCallback() {
    const game = GAMES.find(g => g.id === this.getAttribute('game'));
    const privacy = game
      ? `<a href="/${game.id}/privacy/">Privacy policy</a>`
      : `Privacy: ${GAMES.map(g => `<a href="/${g.id}/privacy/">${esc(g.short)}</a>`).join(' · ')}`;
    this.innerHTML = `<div class="s-in">
      <span>© 2026 ${BRAND}</span>
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
