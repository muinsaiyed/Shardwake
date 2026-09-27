import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import './style.css';
import { Game } from './game.js';
import { Audio } from './audio.js';
import { ROOMS } from './rooms.js';

const $ = (id) => document.getElementById(id);
const audio = new Audio();
try { audio.muted = localStorage.getItem('shardwake.muted') === '1'; } catch { /* ignore */ }
$('mute-chk').checked = audio.muted;

let last = {};
let toastTimer = 0;

const ui = {
  hud(s, force) {
    const ammoEl = $('ammo');
    const txt = s.infinite ? '∞' : String(s.ammo);
    if (force || last.txt !== txt) { ammoEl.textContent = txt; last.txt = txt; }
    ammoEl.classList.toggle('low', !s.infinite && s.ammo <= 5);
    ammoEl.classList.toggle('infinite', !!s.infinite);
    if (force || last.multi !== s.multi) {
      $('multi-n').textContent = s.multi;
      if (last.multi !== undefined && s.multi > last.multi) { const m = $('multi'); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
      last.multi = s.multi;
    }
    const pipKey = s.streak + '/' + s.tierSize + (s.maxed ? 'M' : '');
    if (force || last.pip !== pipKey) {
      const pips = $('pips'); pips.innerHTML = '';
      for (let i = 0; i < s.tierSize; i++) { const d = document.createElement('div'); d.className = 'pip' + (s.maxed || i < s.streak ? ' on' : ''); pips.appendChild(d); }
      last.pip = pipKey;
    }
    if (force || last.dist !== s.dist) { $('distance').innerHTML = `${s.dist}<small> m</small>`; last.dist = s.dist; }
    if (force || last.room !== s.room) { $('sector-name').textContent = s.room; last.room = s.room; }
    const pw = $('power');
    if (s.power) {
      pw.classList.remove('hidden');
      pw.style.color = s.power.color;
      $('power-name').textContent = s.power.name;
      $('power-fill').style.width = (s.power.frac * 100).toFixed(1) + '%';
    } else pw.classList.add('hidden');
  },
  toast(text, color) {
    const t = $('toast');
    t.textContent = text; t.style.color = color || '#fff';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 900);
  },
  gain() {
    const a = $('ammo'); a.classList.add('gain');
    setTimeout(() => a.classList.remove('gain'), 220);
  },
  streakBroken(reason) {
    const s = $('streak'); s.classList.add('broken');
    setTimeout(() => s.classList.remove('broken'), 500);
    if (reason === 'miss') ui.toast('STREAK LOST', '#ff8a96');
  },
  hurt() {
    const f = $('hit-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    if (navigator.vibrate) try { navigator.vibrate(80); } catch { /* ignore */ }
  },
  sector(i, name) {
    const c = $('sector-card');
    c.querySelector('.sc-num').innerHTML = `Sector ${String(i + 1).padStart(2, '0')} <i></i> ${String(ROOMS.length).padStart(2, '0')}`;
    c.querySelector('.sc-name').textContent = name;
    c.classList.remove('hidden');
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    clearTimeout(ui._sc); ui._sc = setTimeout(() => c.classList.add('hidden'), 2700);
  },
  pause() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    audio.muffle(0.8, 0.1);
    show('pause');
  },
  results(r) {
    $('hud').classList.add('hidden');
    const st = r.stats;
    const acc = st.throws ? Math.round((st.throwHits / st.throws) * 100) : 0;
    const rank = r.victory
      ? (st.crashes === 0 && acc >= 70 ? 'S' : st.crashes <= 1 ? 'A' : 'B')
      : (r.room >= 2 ? 'C' : 'D');
    const rk = $('rank'); rk.className = 'rank ' + rank; rk.querySelector('span').textContent = rank;
    $('res-eyebrow').textContent = r.victory ? 'Core Lens relit' : `Lost in sector ${String(Math.max(0, r.room) + 1).padStart(2, '0')}`;
    $('res-title').textContent = r.victory ? 'Core reached' : 'Signal lost';
    $('res-sub').textContent = r.victory
      ? `${r.ammo} iron left in reserve.`
      : `Out of iron in ${ROOMS[Math.max(0, r.room)].name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}.`;
    $('res-best').textContent = r.newBest ? '★ New best distance' : `Best ${r.best} m`;
    countUp($('res-dist'), r.dist);
    const items = [
      ['Glass', st.glass], ['Prisms', st.crystals], ['Best multi', `${st.bestMulti}×`], ['Accuracy', `${acc}%`],
      ['Switches', st.switches], ['Crashes', st.crashes], ['Power-ups', st.powerups], ['Time', `${Math.floor(st.time / 60)}:${String(Math.floor(st.time % 60)).padStart(2, '0')}`],
    ];
    $('res-stats').innerHTML = items.map(([k, v], i) => `<div class="stat" style="animation-delay:${0.35 + i * 0.05}s"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const cp = Math.max(0, r.room);
    $('retry-btn').querySelector('span').textContent = r.victory ? 'Run again' : `Retry sector ${String(cp + 1).padStart(2, '0')}`;
    $('retry-btn').dataset.room = r.victory ? 0 : cp;
    $('restart-btn').classList.toggle('hidden', r.victory || cp === 0);
    show('results');
  },
};

function countUp(el, target) {
  const t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    el.textContent = Math.round(target * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Expanding ring where the player tapped (amber when multi-throw is active).
$('view').addEventListener('pointerdown', (e) => {
  if (game.state !== 'playing') return;
  const d = document.createElement('div');
  d.className = 'tap-ring' + (game.multi > 1 ? ' multi' : '');
  d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
  $('fx-layer').appendChild(d);
  setTimeout(() => d.remove(), 450);
});

function show(id) {
  for (const s of ['title', 'pause', 'results']) $(s).classList.toggle('hidden', s !== id);
}

function renderTitle() {
  const p = game.progress;
  const cps = $('checkpoints'); cps.innerHTML = '';
  if ((p.unlocked || 0) > 0) {
    for (let i = 0; i <= p.unlocked && i < ROOMS.length; i++) {
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = `${i + 1} · ${ROOMS[i].name}`;
      b.onclick = () => begin(i);
      cps.appendChild(b);
    }
  }
  $('best').textContent = p.best ? `BEST DISTANCE ${p.best} m` : '';
}

function begin(room = 0) {
  audio.init();
  show(null);
  $('hud').classList.remove('hidden');
  last = {};
  game.start(room);
}

const game = new Game($('view'), audio, ui);
renderTitle();

$('play-btn').onclick = () => begin(0);
$('pause-btn').onclick = (e) => { e.stopPropagation(); ui.pause(); };
$('resume-btn').onclick = () => { show(null); game.state = 'playing'; game.last = performance.now(); audio.muffle(game.power?.kind === 'stasis' ? 0.55 : 0); };
$('quit-btn').onclick = () => { $('hud').classList.add('hidden'); game.setupTitle(); renderTitle(); show('title'); audio.muffle(0); };
$('retry-btn').onclick = () => begin(Number($('retry-btn').dataset.room || 0));
$('restart-btn').onclick = () => begin(0);
$('title-btn').onclick = () => { game.setupTitle(); renderTitle(); show('title'); audio.muffle(0); };
$('mute-chk').onchange = (e) => { audio.setMuted(e.target.checked); try { localStorage.setItem('shardwake.muted', e.target.checked ? '1' : '0'); } catch { /* ignore */ } };
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') {
    if (game.state === 'playing') ui.pause();
    else if (game.state === 'paused') $('resume-btn').click();
  }
});
// Start title music on first interaction anywhere.
addEventListener('pointerdown', () => audio.init(), { once: true });
