/* "More games" strip at the bottom of every game page.
 * Usage: <div class="more-games" data-current="latch"></div> + <script src="../more-games.js" defer></script>
 * The games come from site.js: add a new game there and every page shows it.
 * Each card keeps its own game's look (same styles as the home page cards). */
(() => {
'use strict';

// The list of games lives in site.js (loaded in <head>), shared with the footer.
const GAMES = window.MRCOSY_GAMES || [];

const CSS = `
@font-face { font-family: "MG Fredoka"; font-weight: 300 700; font-display: swap; src: url(/fonts/fredoka-latin.woff2) format("woff2"); }
@font-face { font-family: "MG Space Mono"; font-weight: 700; font-display: swap; src: url(/fonts/SpaceMono-Bold.woff2) format("woff2"); }
@font-face { font-family: "MG Space Mono"; font-weight: 400; font-display: swap; src: url(/fonts/SpaceMono-Regular.woff2) format("woff2"); }
@font-face { font-family: "MG Tilt Neon"; font-weight: 400; font-display: swap; src: url(/fonts/tilt-neon.woff) format("woff"); }
@font-face { font-family: "MG Lilita"; font-weight: 400; font-display: swap; src: url(/tonfo/fonts/lilita-one.woff2) format("woff2"); }
@font-face { font-family: "MG Press Start"; font-weight: 400; font-display: swap; src: url(/latch/play/fonts/press-start-2p-latin-400-normal.woff2) format("woff2"); }

.more-games { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.mg-card {
  display: flex; flex-direction: column; min-width: 0; border-radius: 22px; overflow: hidden; text-decoration: none; color: inherit;
  font: 400 15px/1.5 "MG Fredoka", ui-rounded, system-ui, sans-serif; text-align: left;
  box-shadow: 0 14px 34px rgba(0,0,0,.18); transition: transform .18s, box-shadow .18s;
}
.mg-card:hover { transform: translateY(-4px); box-shadow: 0 20px 44px rgba(0,0,0,.26); }
.mg-card:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
.mg-card .mg-cover { width: 100%; height: auto; aspect-ratio: 1024 / 500; object-fit: cover; display: block; }
.mg-card .mg-body { padding: 16px 18px 18px; display: flex; gap: 12px; align-items: flex-start; flex: 1; }
.mg-card .mg-icon { width: 44px; height: 44px; border-radius: 11px; flex: none; }
.mg-card h3 { margin: 0 0 4px; font-size: 19px; line-height: 1.15; font-weight: 700; }
.mg-card p { margin: 0 0 8px; }
.mg-card .mg-go { font-weight: 600; }

.mg-latch { background: linear-gradient(180deg, #0f0a2b 0 30%, #1b1145 30% 60%, #2b1960 60%); color: #f1ecff; border: 3px solid #120a26; box-shadow: 5px 5px 0 #ff4fa8, 0 14px 34px rgba(0,0,0,.18); }
.mg-latch:hover { box-shadow: 7px 7px 0 #ff4fa8, 0 20px 44px rgba(0,0,0,.26); }
.mg-latch h3 { font: 400 15px/1.3 "MG Press Start", ui-monospace, monospace; color: #ffcc33; text-shadow: 2px 2px 0 #120a26; margin-bottom: 8px; }
.mg-latch p { color: #b9addf; }
.mg-latch .mg-go { color: #33e0ff; }
.mg-latch .mg-icon, .mg-longshade .mg-icon { image-rendering: pixelated; }
.mg-echo { background: radial-gradient(ellipse 80% 60% at 70% 0%, rgba(157,123,255,.22), transparent 70%), #05060b; color: #e2efff; border: 1px solid rgba(157,123,255,.25); }
.mg-echo h3 { font: 400 22px/1.1 "MG Tilt Neon", "MG Fredoka", sans-serif; letter-spacing: .03em; background: linear-gradient(90deg, #5fd8ff, #9d7bff, #ff4fc3); -webkit-background-clip: text; background-clip: text; color: transparent; }
.mg-echo p { color: #9aa6c7; }
.mg-echo .mg-go { color: #5fd8ff; text-shadow: 0 0 12px rgba(95,216,255,.5); }
.mg-longshade { background: linear-gradient(180deg, #140b2a, #3a1a48); color: #fff2d6; border: 1px solid rgba(255,209,102,.18); }
.mg-longshade p { color: #b3a6d6; }
.mg-longshade .mg-go { color: #ffd166; }
.mg-dondo-dondo {
  background-color: #f4efe3; color: #211f1b; font-family: "MG Space Mono", ui-monospace, Menlo, monospace; font-size: 14px;
  background-image: linear-gradient(rgba(84,128,170,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(84,128,170,.14) 1px, transparent 1px);
  background-size: 24px 24px; border: 2px solid #211f1b;
}
.mg-dondo-dondo p { color: rgba(33,31,27,.7); }
.mg-dondo-dondo .mg-go { color: #e03a2a; font-weight: 700; }
.mg-tonfo { background: linear-gradient(180deg, #1f80ab, #0b3556); color: #fff8ec; border: 3px solid #24173a; box-shadow: 0 5px 0 #24173a, 0 14px 34px rgba(0,0,0,.18); }
.mg-tonfo:hover { box-shadow: 0 7px 0 #24173a, 0 20px 44px rgba(0,0,0,.26); }
.mg-tonfo h3 { font: 400 21px/1.1 "MG Lilita", "MG Fredoka", sans-serif; color: #ffd27a;
  text-shadow: 0 2px 0 #24173a, 0 -2px 0 #24173a, 2px 0 0 #24173a, -2px 0 0 #24173a, 0 4px 0 rgba(8,18,36,.45); }
.mg-tonfo p { color: #bfd9e6; }
.mg-tonfo .mg-go { color: #ffd166; }
.mg-tonfo .mg-icon { border: 2px solid #24173a; }
.mg-pip-and-pop { background: linear-gradient(180deg, #fff6ea, #ffe0d2); color: #2d2350; }
.mg-pip-and-pop p { color: #6b6385; }
.mg-pip-and-pop .mg-go { color: #ff6b3d; }

/* phones: a swipeable row instead of a tall stack */
@media (max-width: 760px) {
  .more-games { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 78%; overflow-x: auto;
    scroll-snap-type: x mandatory; padding: 4px 4px 18px; margin-inline: -4px; }
  .mg-card { scroll-snap-align: start; }
  .mg-card:hover { transform: none; }
}
@media (prefers-reduced-motion: reduce) { .mg-card { transition: none; } }
`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function render(box) {
  const current = box.dataset.current;
  box.innerHTML = GAMES.filter(g => g.id !== current).map(g => `
    <a class="mg-card mg-${g.id}" href="/${g.id}/">
      <img class="mg-cover" src="/${g.cover}" alt="${esc(g.name)}" width="1024" height="500" loading="lazy">
      <div class="mg-body">
        <img class="mg-icon" src="/${g.icon}" alt="" width="44" height="44" loading="lazy">
        <div>
          <h3>${esc(g.name)}</h3>
          <p>${esc(g.text)}</p>
          <span class="mg-go">Discover &rarr;</span>
        </div>
      </div>
    </a>`).join('');
}

const boxes = document.querySelectorAll('.more-games');
if (!boxes.length) return;
const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);
boxes.forEach(render);
})();
