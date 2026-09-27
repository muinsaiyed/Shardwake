// Regenerates the README screenshots in docs/images/ (dev server must be running).
// Usage: node tests/readme-shots.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.URL || 'http://localhost:5173/';
const OUT = new URL('../docs/images/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });

async function save(page, name) {
  const png = `${OUT}${name}.png`;
  await page.screenshot({ path: png });
  // macOS: convert to a compact JPEG; elsewhere keep the PNG.
  try { execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', `${OUT}${name}.jpg`], { stdio: 'ignore' }); fs.unlinkSync(png); }
  catch { /* sips unavailable */ }
  console.log('saved', name);
}

// Title (desktop + phone)
for (const [vp, name] of [[{ width: 1440, height: 810 }, 'title'], [{ width: 390, height: 844 }, 'title-mobile']]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1 });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__game);
  await sleep(5000);
  await save(page, name);
  await page.close();
}

// One gameplay frame per sector (camera warped; HUD overlays that animate are hidden).
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__game);
  await page.click('#play-btn');
  await page.addStyleTag({ content: '#sector-card, #toast { display: none !important; }' });
  for (const [d, name] of [[92, 'sector1-vestibule'], [238, 'sector2-orrery'], [425, 'sector3-foundry'], [705, 'sector4-atrium']]) {
    await page.evaluate((d) => { __game.dist = d; __game.invuln = 1e9; __game.ammo = 25; }, d);
    await sleep(1400);
    await save(page, name);
  }
  await page.close();
}

// Results screen after an autoplayed run.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  await page.goto(BASE + '?bot&ff=4');
  await page.waitForFunction(() => window.__game);
  await page.click('#play-btn');
  await page.waitForFunction(() => __game.state === 'results', null, { timeout: 180000 });
  await sleep(2500);
  await save(page, 'results');
  await page.close();
}
await browser.close();
