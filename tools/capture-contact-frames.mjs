// Development tool: captures the footballer at clip times 0.25, 0.30 and 0.35 s (left and right kick) plus a stall pose,
// using the dev-only animation inspector (?inspect). Not a project dependency: needs puppeteer-core and a Chromium.
//
//   VITE_USE_GLB_CHARACTER=true npx vite --port 5173 &
//   CHROMIUM=/usr/bin/chromium PUPPETEER_DIR=/path/to/node_modules node tools/capture-contact-frames.mjs [outDir]
//
// Prints the ball and foot positions for every capture and writes PNGs to outDir (default ./inspect-shots, git-ignored).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

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
await new Promise((r) => setTimeout(r, 4000));

const shots = [
  ...['left', 'right'].flatMap((side) => [0.25, 0.3, 0.35].map((t) => ({ side, mode: 'kick', t, name: `kick-${side}-${t.toFixed(2)}` }))),
  { side: 'left', mode: 'stall', t: 0.3, name: 'stall-enter-0.30' },
  { side: 'left', mode: 'stall', t: 0.5, name: 'stall-hold-0.50' },
  { side: 'left', mode: 'stall', t: 0.7, name: 'stall-exit-0.70' },
];
for (const s of shots) {
  await page.evaluate((o) => window.__inspect.set(o), s);
  await new Promise((r) => setTimeout(r, 700)); // let the 0.04 s crossfade finish
  const r = await page.evaluate(() => window.__inspect.info());
  await page.screenshot({ path: `${out}/${s.name}.png` });
  const f = (n) => n.toFixed(3);
  console.log(s.name, 'ball', f(r.ball.x), f(r.ball.y), f(r.ball.z), 'vy', f(r.ball.vy), 'foot', r.foot ? r.foot.map(f).join(',') : 'n/a', 'response', r.info.contactAt == null ? 'pending' : `${(r.info.contactAt * 1000).toFixed(0)}ms`);
}
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
