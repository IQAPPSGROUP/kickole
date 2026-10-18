// Development tool: layout regression check in mobile emulation (not a project dependency: needs puppeteer-core + Chromium).
//   npx vite --port 5173 &
//   CHROMIUM=/usr/bin/chromium PUPPETEER_DIR=/path/to/node_modules node tools/check-layout.mjs [outDir]
// For 320x568, 390x844 and 844x390 at Low/Medium/High it asserts: no page overflow, settings DONE reachable,
// game-over card fully on screen without internal scrolling, score panel clear of the back-wall sign (portrait). Saves PNGs.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire((process.env.PUPPETEER_DIR ?? process.cwd()) + '/');
const puppeteer = require('puppeteer-core');
const out = process.argv[2] ?? 'layout-shots';
const url = process.env.URL ?? 'http://localhost:5173';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const click = (p, re) => p.evaluate((s) => [...document.querySelectorAll('button')].find((x) => new RegExp(s).test(x.textContent)).click(), re);
let failures = 0;
for (const q of ['low', 'medium', 'high']) for (const [w, h] of [[320, 568], [390, 844], [844, 390]]) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: w, height: h, hasTouch: true, isMobile: true });
  await page.evaluateOnNewDocument((quality) => localStorage.setItem('kicky.settings.v1', JSON.stringify({ sound: false, vibration: false, quality, skinId: 'kicky-teal' })), q);
  await page.goto(url); await sleep(5000);
  const name = `${out}/${q}-${w}x${h}`;
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1);
  try {
    await page.screenshot({ path: `${name}-home.png` });
    assert.equal(await overflow(), false, 'home overflow');
    await click(page, 'SETTINGS'); await sleep(400);
    await page.screenshot({ path: `${name}-settings.png` });
    const done = await page.evaluate(() => { const r = [...document.querySelectorAll('button')].find((x) => /DONE/.test(x.textContent)).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
    assert.ok(done, 'DONE not reachable');
    await click(page, 'DONE'); await sleep(300);
    await click(page, 'PLAY'); await sleep(600);
    await page.evaluate(() => { const c = window.__kicky; c.press('left'); c.release('left'); });
    await sleep(700);
    await page.screenshot({ path: `${name}-game.png` });
    if (h > w) {
      const bottom = await page.evaluate(() => document.querySelector('.hud-top').getBoundingClientRect().bottom + 6);
      assert.ok(bottom <= (h <= 700 ? 84 : 140), `score panel too tall (${bottom})`);
    }
    for (let i = 0; i < 300 && (await page.evaluate(() => window.__kicky.engine.phase)) !== 'over'; i++) await sleep(100);
    await sleep(900);
    await page.screenshot({ path: `${name}-over.png` });
    const card = await page.evaluate(() => { const c = document.querySelector('.screen.over .card'); const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, scrolls: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 }; });
    assert.ok(card.top >= 0 && card.bottom <= h && card.left >= 0 && card.right <= w, 'game-over card off screen');
    assert.equal(card.scrolls, false, 'game-over card scrolls');
    assert.equal(await overflow(), false, 'over overflow');
    assert.deepEqual(errors, [], 'page errors');
    console.log('PASS', q, `${w}x${h}`);
  } catch (e) { failures++; console.log('FAIL', q, `${w}x${h}`, e.message); }
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
