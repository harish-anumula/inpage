// Renders the extension icons from the SVGs (small sizes use the simplified mark).
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();
for (const [size, file] of [[16, 'logo-small.svg'], [32, 'logo-small.svg'], [48, 'logo.svg'], [128, 'logo.svg']]) {
  const svg = fs.readFileSync(`assets/${file}`, 'utf8');
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: `extension/icons/icon-${size}.png`, omitBackground: true });
}
// A large preview sheet for the README.
await p.setViewportSize({ width: 560, height: 160 });
await p.setContent(`<html><body style="margin:0;display:flex;gap:28px;align-items:center;padding:20px;background:#fff;font:600 30px system-ui">${['logo.svg'].map(f => fs.readFileSync('assets/' + f, 'utf8').replace('<svg ', '<svg width="112" height="112" ')).join('')}<span style="color:#17171a;letter-spacing:-.02em">inpage</span>${fs.readFileSync('assets/logo-small.svg','utf8').replace('<svg ', '<svg width="32" height="32" ')}${fs.readFileSync('assets/logo-small.svg','utf8').replace('<svg ', '<svg width="16" height="16" ')}</body></html>`);
await p.screenshot({ path: 'assets/logo-preview.png' });
await b.close();
