// Captures screenshots at chosen distances (warping the camera) for visual review.
// Usage: node tests/shots.mjs 40 100 150   (dev server must be running)
import { chromium } from 'playwright';
const BASE = process.env.URL || 'http://localhost:5173/';
const OUT = new URL('./shots/', import.meta.url).pathname;
const dists = process.argv.slice(2).map(Number);
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(BASE);
await p.waitForFunction(() => window.__game);
await p.click('#play-btn');
for (const d of dists) {
  await p.evaluate((d) => { __game.dist = d; __game.invuln = 1e9; }, d);
  await new Promise((r) => setTimeout(r, 900));
  await p.evaluate(() => { __game.invuln = 1e9; });
  await p.screenshot({ path: `${OUT}warp-${d}.png` });
  console.log('shot', d);
}
await b.close();
