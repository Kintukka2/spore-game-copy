// Screenshot helper for development and agents.
// Usage: node scripts/shot.mjs "<query-string>" [out.png] [--wait=ms] [--actions=file.json] [--w=390 --h=844]
// Starts against an already-running dev server at http://localhost:5173 unless --url is passed.
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const pos = args.filter((a) => !a.startsWith('--'));
const query = pos[0] ?? '';
const out = pos[1] ?? 'shots/shot.png';
const base = flags.url ?? 'http://localhost:5173/';
const W = Number(flags.w ?? 390), H = Number(flags.h ?? 844);
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
await page.goto(base + (query ? (query.startsWith('?') ? query : '?' + query) : ''), { waitUntil: 'load' });
await page.waitForTimeout(Number(flags.wait ?? 1500));
if (flags.actions) {
  const actions = JSON.parse(fs.readFileSync(flags.actions, 'utf8'));
  for (const a of actions) {
    if (a.tap) await page.touchscreen.tap(a.tap[0], a.tap[1]);
    if (a.click) await page.mouse.click(a.click[0], a.click[1]);
    if (a.text) {
      try { await page.getByText(a.text, { exact: !!a.exact }).first().click({ timeout: a.timeout ?? 4000, force: true }); logs.push('[click] ' + a.text); }
      catch { logs.push('[miss] ' + a.text); }
    }
    if (a.role) {
      try { await page.getByRole('button', { name: a.role }).first().click({ timeout: a.timeout ?? 4000, force: true }); logs.push('[click] ' + a.role); }
      catch { logs.push('[miss] ' + a.role); }
    }
    if (a.eval) logs.push('[eval] ' + JSON.stringify(await page.evaluate(a.eval)));
    if (a.key) await page.keyboard.press(a.key);
    if (a.drag) {
      const [x1, y1, x2, y2] = a.drag;
      await page.mouse.move(x1, y1); await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12);
      await page.mouse.up();
    }
    if (a.hold) { await page.keyboard.down(a.hold); await page.waitForTimeout(a.ms ?? 500); await page.keyboard.up(a.hold); }
    if (a.wait) await page.waitForTimeout(a.wait);
    if (a.shot) await page.screenshot({ path: a.shot });
  }
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
console.log('saved', out);
await browser.close();
