// Staged freestyle stills from movement-preview (not device timing proof).
// URL=http://127.0.0.1:5191 CHROMIUM=... node tools/check-freestyle-browser.mjs
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../.validation/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const shots = new URL('../movement-shots/', import.meta.url);
const docs = new URL('../docs/images/', import.meta.url);
mkdirSync(shots, { recursive: true });
mkdirSync(docs, { recursive: true });

const url = process.env.URL ?? 'http://127.0.0.1:5191';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const scenarios = [
  ['headerOk', 0.45],
  ['headerFail', 0.2],
  ['neckHold', 0.5],
  ['neckRelease', 0.35],
  ['atwLeft', 0.55],
  ['atwRight', 0.55],
  ['atwFail', 0.2],
  ['thighLeft', 0.3],
  ['thighRight', 0.3],
  ['flickLeft', 0.2],
  ['flickRight', 0.2],
];

const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/tools/movement-preview.html`);
  await page.waitForFunction(() => window.__movementReview?.ready);
  for (const [scenario, time] of scenarios) {
    await page.getByLabel('Character renderer').selectOption('glb');
    await page.getByLabel('Movement', { exact: true }).selectOption(scenario);
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.evaluate((t) => window.__movementReview.set({ time: t, playing: false }), time);
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => ({
      error: window.__movementReview.error,
      scenario: window.__movementReview.scenario,
      poseLock: window.__movementReview.poseLock,
      joints: window.__movementReview.joints,
      ...window.__movementReview.sample(),
    }));
    assert.equal(info.error, '');
    assert.equal(info.scenario, scenario);
    const shot = `freestyle-${scenario}.png`;
    const shotPath = fileURLToPath(new URL(shot, shots));
    await page.screenshot({ path: shotPath });
    copyFileSync(shotPath, fileURLToPath(new URL(shot, docs)));
    results.push({
      scenario,
      time,
      poseLock: info.poseLock,
      ball: info.ball,
      pose: {
        headPitch: info.pose?.headPitch,
        neckPitch: info.pose?.neckPitch,
        torsoPitch: info.pose?.torsoPitch,
        lockMotion: info.pose?.lockMotion,
      },
      jointsExpressive: info.joints?.expressive?.slice(0, 6),
    });
    console.log('PASS freestyle', scenario);
  }
  assert.deepEqual(errors, []);

  // Narrow portrait game shell with trick bar visible.
  for (const [width, height] of [[375, 667], [390, 844], [430, 932]]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      localStorage.setItem('kicky.settings.v1', JSON.stringify({
        sound: false, vibration: false, quality: 'medium', skinId: 'kicky-teal',
      }));
    });
    const game = await context.newPage();
    await game.goto(`${url}/?environment=beach`, { waitUntil: 'domcontentloaded' });
    // Prefer an immediate skip; fall back to waiting out the pan.
    for (let i = 0; i < 40; i++) {
      const play = game.getByRole('button', { name: /LET.?S PLAY/i });
      if (await play.count()) break;
      const skip = game.getByRole('button', { name: /SKIP INTRO/i });
      if (await skip.count()) {
        await skip.click();
        break;
      }
      await game.waitForTimeout(250);
    }
    try {
      await game.getByRole('button', { name: /LET.?S PLAY/i }).waitFor({ timeout: 15000 });
    } catch (err) {
      await game.screenshot({ path: fileURLToPath(new URL(`freestyle-ui-fail-${width}x${height}.png`, shots)) });
      const body = await game.locator('body').innerText().catch(() => '');
      throw new Error(`Play button missing at ${width}x${height}: ${body.slice(0, 400)}\n${err}`);
    }
    await game.waitForTimeout(300);
    await game.getByRole('button', { name: /LET.?S PLAY/i }).click();
    await game.waitForTimeout(500);
    assert.equal(await game.locator('.trick-bar').count(), 1);
    assert.equal(await game.locator('.foot-btn').count(), 2);
    const name = `freestyle-ui-${width}x${height}.png`;
    const path = fileURLToPath(new URL(name, shots));
    await game.screenshot({ path });
    copyFileSync(path, fileURLToPath(new URL(name, docs)));
    results.push({ viewport: `${width}x${height}`, ui: true });
    console.log('PASS ui', width, height);
    await context.close();
  }

  writeFileSync(fileURLToPath(new URL('../docs/freestyle-validation.json', import.meta.url)), JSON.stringify({
    kind: 'staged-browser-captures',
    note: 'Movement-preview poses and narrow UI shells. Not physical-device timing proof.',
    results,
  }, null, 2));
  console.log('Wrote docs/freestyle-validation.json and docs/images/freestyle-*.png');
} finally {
  await browser.close();
}
