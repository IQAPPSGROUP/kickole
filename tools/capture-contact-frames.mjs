// Development tool: captures the footballer at clip times 0.25, 0.30 and 0.35 s (left and right kick) plus a stall pose,
// using the dev-only animation inspector (?inspect). Not a project dependency: needs puppeteer-core and a Chromium.
//
//   VITE_USE_GLB_CHARACTER=true npx vite --port 5173 &
//   CHROMIUM=/usr/bin/chromium PUPPETEER_DIR=/path/to/node_modules node tools/capture-contact-frames.mjs [outDir]
//
// Prints the ball and foot positions for every capture and writes PNGs to outDir (default ./inspect-shots, git-ignored).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire((process.env.PUPPETEER_DIR ?? process.cwd()) + '/');
const puppeteer = require('puppeteer-core');
const out = process.argv[2] ?? 'inspect-shots';
const url = process.env.URL ?? 'http://localhost:5173/?inspect';
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => localStorage.setItem('kicky.settings.v1', JSON.stringify({ sound: false, vibration: false, quality: 'medium', skinId: 'kicky-teal' })));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__inspect, { timeout: 30000 });
// The initial inspector pose is a left contact. Check it before changing states:
// switching away and back would hide the StrictMode mixer-cleanup regression.
await page.waitForFunction(() => window.__inspect.info().foot?.[1] > 0.5, { timeout: 30000 });
await page.screenshot({ path: `${out}/initial-contact.png` });

const shots = [
  ...['left', 'right'].flatMap((side) => [0.25, 0.3, 0.35].map((t) => ({ side, mode: 'kick', t, name: `kick-${side}-${t.toFixed(2)}` }))),
  ...['left', 'right'].flatMap((side) => [0.3, 0.5, 0.7].map((t) => ({ side, mode: 'stall', t, name: `stall-${side}-${t.toFixed(2)}` }))),
];
const heldFeet = new Map();
for (const s of shots) {
  await page.evaluate((o) => window.__inspect.set(o), s);
  await new Promise((r) => setTimeout(r, 700)); // let the 0.04 s crossfade finish
  const r = await page.evaluate(() => window.__inspect.info());
  await page.screenshot({ path: `${out}/${s.name}.png` });
  assert(r.foot, 'GLB foot must be loaded');
  if ((s.mode === 'kick' && s.t === 0.3) || (s.mode === 'stall' && s.t <= 0.5)) {
    assert(r.foot[1] > 0.5 && r.foot[2] > 0.35, 'Rendered foot must reach contact');
    assert.equal(Math.sign(r.foot[0]), s.side === 'left' ? -1 : 1);
  }
  if (s.mode === 'stall' && s.t === 0.3) heldFeet.set(s.side, r.foot);
  if (s.mode === 'stall' && s.t === 0.5) {
    assert.equal(r.ball.vy, 0);
    r.foot.forEach((v, i) => assert(Math.abs(v - heldFeet.get(s.side)[i]) < 1e-5));
  }
  if (s.mode === 'stall' && s.t === 0.7) assert(r.ball.vy > 0, 'Release must flick the ball');
  const f = (n) => n.toFixed(3);
  console.log(s.name, 'ball', f(r.ball.x), f(r.ball.y), f(r.ball.z), 'vy', f(r.ball.vy), 'foot', r.foot ? r.foot.map(f).join(',') : 'n/a', 'response', r.info.contactAt == null ? 'pending' : `${(r.info.contactAt * 1000).toFixed(0)}ms`);
}
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
assert.equal(errors.length, 0, errors.join(' | '));
