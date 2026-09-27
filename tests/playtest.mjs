// Automated playtest: drives the game in headless Chromium, checks the core loop
// and saves screenshots to tests/shots/. Needs the dev server running (npm run dev).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.URL || 'http://localhost:5173/';
const OUT = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function newPage(query = '', viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.__game);
  return page;
}
const G = (page, fn) => page.evaluate(fn);

// ---- 1. Title + manual shooting -------------------------------------------
{
  const page = await newPage();
  await sleep(1200);
  await page.screenshot({ path: OUT + '01-title.png' });
  check('title visible', await page.isVisible('#title'));
  await page.click('#play-btn');
  await sleep(500);
  check('state playing', (await G(page, () => __game.state)) === 'playing');
  check('HUD visible', await page.isVisible('#hud'));
  const au = await G(page, () => ({ state: __game.audio.ctx?.state, bpm: __game.audio.track?.bpm }));
  check('audio context running + sector track', au.state === 'running' && au.bpm === 96, JSON.stringify(au));
  const a0 = await G(page, () => __game.ammo);
  await page.mouse.click(640, 360);
  await sleep(100);
  const a1 = await G(page, () => __game.ammo);
  check('throw costs 1 ammo', a1 === a0 - 1, `${a0}→${a1}`);
  check('ball spawned', (await G(page, () => __game.balls.length)) >= 1);
  check('HUD shows ammo', (await page.textContent('#ammo')).trim() === String(a1));
  await page.screenshot({ path: OUT + '02-throw.png' });

  // Wait until the first crystal is in range, then aim at it via projection.
  await page.waitForFunction(() => {
    const e = __game.entities.find((e) => e.part?.kind === 'crystal' && e.part.alive);
    return e && __game.camera.position.z - e.part.wpos.z < 16;
  }, null, { timeout: 15000 });
  const scr = await G(page, () => {
    const e = __game.entities.find((e) => e.part?.kind === 'crystal' && e.part.alive);
    const p = e.part.wpos.clone().project(__game.camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  });
  const before = await G(page, () => ({ ammo: __game.ammo, c: __game.stats.crystals }));
  await page.mouse.click(scr.x, scr.y);
  await sleep(700);
  const after = await G(page, () => ({ ammo: __game.ammo, c: __game.stats.crystals, streak: __game.streak }));
  check('crystal hit by aimed click', after.c === before.c + 1, JSON.stringify({ before, after }));
  check('crystal restores ammo (+3, -1 throw)', after.ammo === before.ammo + 2, `${before.ammo}→${after.ammo}`);
  await page.screenshot({ path: OUT + '03-crystal.png' });

  // Let the next crystals pass unshot → streak should reset.
  await page.waitForFunction(() => __game.stats.crystalsMissed > 0, null, { timeout: 15000 });
  { const st = await G(page, () => ({ s: __game.streak, m: __game.stats.crystalsMissed, c: __game.stats.crystals })); check('missed crystal resets streak', st.s === 0, JSON.stringify(st)); }

  // Don't shoot the first pane: expect a crash (-10).
  const pre = await G(page, () => __game.ammo);
  await page.waitForFunction(() => __game.stats.crashes > 0, null, { timeout: 15000 });
  await sleep(150);
  const post = await G(page, () => __game.ammo);
  check('crash costs 10', pre - post === 10, `${pre}→${post}`);
  await page.screenshot({ path: OUT + '04-crash.png' });

  // Pause / resume
  await page.keyboard.press('Escape');
  check('pause works', (await G(page, () => __game.state)) === 'paused' && await page.isVisible('#pause'));
  const d0 = await G(page, () => __game.dist); await sleep(300);
  check('world frozen while paused', (await G(page, () => __game.dist)) === d0);
  await page.click('#resume-btn');
  check('resume works', (await G(page, () => __game.state)) === 'playing');

  // Idle until game over (crashing drains ammo).
  await page.waitForFunction(() => __game.state === 'results', null, { timeout: 60000 });
  check('game over at 0 ammo', (await G(page, () => __game.ammo)) === 0);
  check('results screen shown', await page.isVisible('#results'));
  await page.screenshot({ path: OUT + '05-gameover.png' });
  await page.click('#retry-btn');
  await sleep(300);
  check('retry restarts run', (await G(page, () => __game.state === 'playing' && __game.ammo === 25)));
  await page.close();
}

// ---- 2. Bot plays the full run (fast-forward) ------------------------------
{
  const page = await newPage('?bot&ff=3');
  await page.click('#play-btn');
  const seen = new Set();
  let maxCalls = 0;
  const shotAt = {};
  const t0 = Date.now();
  let lastLog = 0;
  while (Date.now() - t0 < 240000) {
    const s = await G(page, () => ({ bpm: __game.audio.track?.bpm, calls: __game.renderer.info.render.calls, st: __game.state, d: Math.floor(__game.dist), room: __game.roomIndex, ammo: __game.ammo, multi: __game.multi, power: __game.power?.kind, fps: __game.fps, glass: __game.stats.glass, stats: __game.stats }));
    if (s.power) seen.add('power:' + s.power);
    seen.add('bpm' + s.bpm);
    maxCalls = Math.max(maxCalls, s.calls || 0);
    if (s.multi > 1) seen.add('multi' + s.multi);
    if (!shotAt['room' + s.room]) {
      shotAt['room' + s.room] = true;
      await sleep(1500);
      await page.screenshot({ path: OUT + `10-room${s.room + 1}.png` });
    }
    if (s.power && !shotAt[s.power]) { shotAt[s.power] = true; await page.screenshot({ path: OUT + `20-power-${s.power}.png` }); }
    if (Date.now() - lastLog > 10000) { lastLog = Date.now(); console.log('   bot:', JSON.stringify({ calls: s.calls, d: s.d, room: s.room, ammo: s.ammo, multi: s.multi, fps: s.fps && s.fps.toFixed(0) })); }
    if (s.st === 'results') break;
    await sleep(250);
  }
  const fin = await G(page, () => ({ st: __game.state, d: Math.floor(__game.dist), stats: __game.stats, ammo: __game.ammo, victory: document.getElementById('res-title').textContent }));
  console.log('   bot final:', JSON.stringify(fin));
  check('bot run reaches results', fin.st === 'results');
  check('bot reached the Core Lens', /core reached/i.test(fin.victory), fin.victory);
  check('switches were activated', fin.stats.switches >= 5, 'switches=' + fin.stats.switches);
  check('multiball reached', fin.stats.bestMulti >= 2, 'best=' + fin.stats.bestMulti);
  check('music changes per sector', ['bpm96', 'bpm108', 'bpm120', 'bpm126'].every((b) => seen.has(b)), [...seen].filter((x) => x.startsWith('bpm')).join(','));
  console.log('   max draw calls/frame:', maxCalls);
  check('power-ups collected', fin.stats.powerups >= 2, [...seen].join(','));
  await page.screenshot({ path: OUT + '30-results.png' });
  await page.close();
}

// ---- 3. Mobile viewport + touch ---------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__game);
  await sleep(800);
  await page.screenshot({ path: OUT + '40-mobile-title.png' });
  await page.tap('#play-btn');
  await sleep(600);
  const a0 = await G(page, () => __game.ammo);
  await page.touchscreen.tap(195, 420);
  await sleep(150);
  check('touch tap throws', (await G(page, () => __game.ammo)) === a0 - 1);
  await sleep(2500);
  await page.screenshot({ path: OUT + '41-mobile-play.png' });
  await ctx.close();
}

check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
