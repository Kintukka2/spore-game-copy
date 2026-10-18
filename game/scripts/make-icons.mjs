// Renders the app icon (a smiling cell on a deep-sea gradient) to PNGs for the PWA manifest.
import { chromium } from 'playwright';
import fs from 'node:fs';

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c" width="1024" height="1024"></canvas>
<script>
const c = document.getElementById('c'), g = c.getContext('2d');
const S = 1024;
const bg = g.createLinearGradient(0, 0, 0, S);
bg.addColorStop(0, '#0f5a6b'); bg.addColorStop(0.6, '#08304a'); bg.addColorStop(1, '#041826');
g.fillStyle = bg; g.fillRect(0, 0, S, S);
// light rays
g.globalCompositeOperation = 'lighter';
for (let i = 0; i < 4; i++) {
  const x = 180 + i * 220;
  const r = g.createLinearGradient(x, 0, x + 200, S);
  r.addColorStop(0, 'rgba(120,255,230,0.10)'); r.addColorStop(1, 'rgba(120,255,230,0)');
  g.fillStyle = r; g.beginPath(); g.moveTo(x - 60, 0); g.lineTo(x + 60, 0); g.lineTo(x + 260, S); g.lineTo(x + 60, S); g.fill();
}
g.globalCompositeOperation = 'source-over';
// bubbles
for (const [x, y, r] of [[170,260,26],[820,210,18],[860,700,30],[220,820,20],[760,860,14],[140,560,12]]) {
  g.strokeStyle = 'rgba(200,255,250,0.35)'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
}
// flagellum
g.strokeStyle = '#0b3a33'; g.lineWidth = 46; g.lineCap = 'round'; g.beginPath(); g.moveTo(330, 640);
for (let i = 1; i <= 10; i++) g.lineTo(330 - i * 26, 640 + Math.sin(i * 0.9) * i * 7 + i * 10); g.stroke();
g.strokeStyle = '#2fd0a8'; g.lineWidth = 26; g.beginPath(); g.moveTo(330, 640);
for (let i = 1; i <= 10; i++) g.lineTo(330 - i * 26, 640 + Math.sin(i * 0.9) * i * 7 + i * 10); g.stroke();
// body
g.save(); g.translate(540, 520); g.rotate(-0.35);
g.fillStyle = '#0b3a33'; g.beginPath(); g.ellipse(0, 0, 300, 230, 0, 0, 7); g.fill();
const bd = g.createRadialGradient(-90, -110, 20, 0, 0, 300);
bd.addColorStop(0, '#c9fff0'); bd.addColorStop(0.45, '#4ff0c8'); bd.addColorStop(1, '#13a688');
g.fillStyle = bd; g.beginPath(); g.ellipse(0, 0, 278, 208, 0, 0, 7); g.fill();
// spots
g.fillStyle = 'rgba(14,120,98,0.55)';
for (const [x, y, r] of [[-150,40,34],[-60,110,24],[30,-120,20],[-190,-60,22],[90,120,18]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
// nucleus
g.fillStyle = 'rgba(155,123,255,0.85)'; g.beginPath(); g.arc(-40, 20, 60, 0, 7); g.fill();
// gloss
g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-60, -140, 130, 36, -0.1, 0, 7); g.fill();
// eyes
for (const [x, y] of [[120,-60],[205,-20]]) {
  g.fillStyle = '#1a1410'; g.beginPath(); g.arc(x, y, 58, 0, 7); g.fill();
  g.fillStyle = '#fbfaf5'; g.beginPath(); g.arc(x, y, 50, 0, 7); g.fill();
  g.fillStyle = '#1d1210'; g.beginPath(); g.arc(x + 16, y + 4, 24, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, y - 14, 10, 0, 7); g.fill();
}
// smile
g.strokeStyle = '#0b3a33'; g.lineWidth = 16; g.beginPath(); g.arc(200, 70, 48, 0.3, 1.9); g.stroke();
g.restore();
// tiny star sparkle
g.fillStyle = '#ffd166'; g.beginPath();
const sx = 820, sy = 360; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 14 : 44; g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } g.fill();
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(html);
const el = await page.$('#c');
fs.mkdirSync('public', { recursive: true });
await el.screenshot({ path: 'public/icon-1024.png' });
for (const s of [512, 192, 180]) {
  const p2 = await browser.newPage({ viewport: { width: s, height: s } });
  await p2.setContent(`<img src="data:image/png;base64,${fs.readFileSync('public/icon-1024.png').toString('base64')}" style="width:${s}px;height:${s}px;display:block">`);
  await p2.screenshot({ path: s === 180 ? 'public/apple-touch-icon.png' : `public/icon-${s}.png`, clip: { x: 0, y: 0, width: s, height: s } });
}
fs.unlinkSync('public/icon-1024.png');
await browser.close();
console.log('icons written');
