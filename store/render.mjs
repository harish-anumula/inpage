// Renders the Chrome Web Store images and the README screenshots: five 1280×800 screenshots (the page, with the
// side panel beside it where it's used) and the two promo tiles. Real model calls (a few cents in all).
// Needs the demo served on :8800 (python3 -m http.server 8800 from the repo root) and the test pages on :8799
// (npm run serve:test). The side panel can't be screenshotted directly, so its page (ui/frame.html?panel) is
// opened in its own window, bound to the page's window, and the two images are put side by side.
import { launch, C } from '../test/ext.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const out = path.resolve('store'), raw = path.join(out, 'raw'); fs.mkdirSync(raw, { recursive: true });
const W = 1280, H = 800, PANEL = 400, PAGE = W - PANEL, DSF = 2;
const { ctx, extId, setup } = await launch({ viewport: { width: PAGE, height: H }, deviceScaleFactor: DSF, storage: { drawerMode: 'panel' },
  // the stand-in panel window is the one in the pictures, so the composer mustn't open the browser's own panel
  patches: [['ui/frame.js', 'const openPanel = () => {', 'const openPanel = () => { return;']] });
const tab = async (u, vp = { width: PAGE, height: H }) => { const p = await ctx.newPage(); await p.setViewportSize(vp); await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('inpage-root', { state: 'attached' }); await p.waitForTimeout(600); return p; };
const front = p => setup.evaluate(u => chrome.tabs.query({}).then(ts => { const t = ts.find(x => x.url === u); return chrome.tabs.update(t.id, { active: true }); }), p.url());
let panel = null;
async function openPanel(page) {
  const win = await setup.evaluate(u => chrome.tabs.query({}).then(ts => ts.find(x => x.url === u).windowId), page.url());
  if (panel) await panel.close().catch(() => {});
  [panel] = await Promise.all([ctx.waitForEvent('page'), setup.evaluate(([id, w, width, height]) => chrome.windows.create({ url: `chrome-extension://${id}/ui/frame.html?panel&win=${w}`, width, height }), [extId, win, PANEL, H])]);
  await panel.setViewportSize({ width: PANEL, height: H }); await panel.waitForLoadState();
  await panel.waitForFunction(() => document.querySelector('.dhead .title span')?.textContent && !document.querySelector('textarea').disabled, null, { timeout: 15000 });
}
const settle = () => panel.waitForFunction(() => !document.querySelector('.msg.pending') && !document.querySelector('.card.check .typing'), null, { timeout: 180000, polling: 200 });
const ask = async text => { await panel.locator('.dfoot textarea').fill(text); await panel.locator('.dfoot textarea').press('Enter'); await panel.waitForTimeout(800); await settle(); };
const select = (page, para, from, len) => page.evaluate(([para, from, len]) => {
  const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes(para)); p.scrollIntoView({ block: 'center' });
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && !t.data.includes(from));
  const i = t.data.indexOf(from), r = document.createRange(); r.setStart(t, i); r.setEnd(t, Math.min(t.data.length, i + len));
  getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect();
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom }));
}, [para, from, len]);
// page + panel, side by side, scaled to exactly 1280×800
async function shot(name, page, withPanel = true) {
  await page.screenshot({ path: `${raw}/${name}-page.png` });
  if (withPanel) await panel.screenshot({ path: `${raw}/${name}-panel.png` });
  execFileSync('python3', ['-c', `
from PIL import Image
W,H,PANEL=${W},${H},${PANEL}
pg=Image.open('${raw}/${name}-page.png').convert('RGB')
canvas=Image.new('RGB',(W*2,H*2),'white')
canvas.paste(pg.resize(((W-PANEL)*2 if ${withPanel ? 'True' : 'False'} else W*2,H*2)),(0,0))
if ${withPanel ? 'True' : 'False'}:
  pn=Image.open('${raw}/${name}-panel.png').convert('RGB').resize((PANEL*2,H*2))
  canvas.paste(pn,((W-PANEL)*2,0))
  for y in range(H*2):
    canvas.putpixel(((W-PANEL)*2,y),(214,214,220)); canvas.putpixel(((W-PANEL)*2+1,y),(214,214,220))
canvas.resize((W,H),Image.LANCZOS).save('${out}/${name}.png')
canvas.save('${raw}/${name}@2x.png')
`]);
  console.log('wrote', name);
}

// 1. Select, then Ask, Rewrite or a one-click action (the composer open on the formula paragraph)
const demo = await tab('http://127.0.0.1:8800/demo/', { width: W, height: H });
await select(demo, 'Dividing by', 'Dividing by', 95);
await demo.waitForTimeout(300);
await demo.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(demo).locator('textarea').fill('Why does dividing by √d_k keep the softmax from saturating?');
await demo.waitForTimeout(500);
await shot('screenshot-1', demo, false);
await C(demo).locator('textarea').press('Escape');

// 2. Answers you can check: a page question in the side panel, with quote chips; one flashed on the page
await demo.setViewportSize({ width: PAGE, height: H }); await front(demo);
await openPanel(demo);
await ask('Why divide by the square root of d_k? Quote the page.');
const chip = panel.locator('.msg.ai[data-i] .cite.ok').first();
if (await chip.count()) { await chip.click(); await demo.waitForTimeout(900); }
await panel.evaluate(() => { const b = document.querySelector('.dbody'); b.scrollTop = 0; });
await shot('screenshot-2', demo);

// 3. Rewrite in place, in the site's own style, with real maths (and the edit's controls)
await demo.setViewportSize({ width: W, height: H });
const para = demo.locator('p').filter({ hasText: 'Dividing by' });
await para.scrollIntoViewIfNeeded(); await para.click({ modifiers: ['Alt'] });
await C(demo).locator('textarea').fill('Expand this step by step with a tiny numeric example');
await C(demo).locator('textarea').press('Enter');
await demo.waitForFunction(() => document.querySelector('[data-inpage-edit]') && !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 120000, polling: 200 });
await demo.waitForTimeout(1200);
await demo.evaluate(() => scrollBy(0, document.querySelector('[data-inpage-edit]').getBoundingClientRect().top - 150));
const box = await demo.evaluate(() => { const r = document.querySelector('[data-inpage-edit]').getBoundingClientRect(); return { x: r.left + 50, y: r.top + 12 }; });
await demo.mouse.move(box.x, box.y); await demo.mouse.move(box.x + 4, box.y + 4); await demo.waitForTimeout(500);
await shot('screenshot-3', demo, false);

// 4. Lecture companion: a question about the moment in a video, answered from the frame and the captions
const lec = await tab('http://127.0.0.1:8799/lecture.html');
await lec.evaluate(async () => { const v = document.querySelector('video'); const b = await (await fetch(v.currentSrc || v.src)).blob(); v.src = URL.createObjectURL(b); v.load(); });
await lec.waitForFunction(() => document.querySelector('video').readyState >= 2 && document.querySelector('video').duration > 50, null, { timeout: 15000 });
await lec.evaluate(() => { document.querySelector('video').currentTime = 49; }); await lec.waitForTimeout(800);
await front(lec); await openPanel(lec);
const vb = await lec.evaluate(() => { const r = document.querySelector('video').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; });
await lec.mouse.move(vb.x - 20, vb.y); await lec.mouse.move(vb.x, vb.y); await lec.waitForTimeout(400);
await lec.locator('.imgbtn').dispatchEvent('mousedown');
await C(lec).locator('textarea').waitFor();
await C(lec).locator('.chip', { hasText: "Explain what's on screen" }).dispatchEvent('click');
await panel.waitForFunction(() => document.querySelector('.msg.pending, .msg.ai'), null, { timeout: 30000 }).catch(async e => { await lec.screenshot({ path: `${raw}/fail-page.png` }); await panel.screenshot({ path: `${raw}/fail-panel.png` }); throw e; });
await settle(); await lec.waitForTimeout(600);
await shot('screenshot-4', lec);

// 5. Fact-check: claims tinted in place, verdicts with sources in the panel (disputed first)
const claims = await tab('http://127.0.0.1:8799/claims.html');
await front(claims); await openPanel(claims);
await panel.locator('.chip', { hasText: 'Fact-check this page' }).click();
await panel.waitForFunction(() => document.querySelector('.card.check .claim'), null, { timeout: 60000 });
await settle(); await claims.waitForTimeout(800);
await claims.evaluate(() => scrollTo(0, 120));
await shot('screenshot-5', claims);
await ctx.close();

// promo tiles
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage({ deviceScaleFactor: 2 });
const logo = fs.readFileSync('assets/logo.svg', 'utf8');
const tile = (w, h, big) => `<html><body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;gap:${big ? 40 : 22}px;padding:0 ${big ? 90 : 34}px;box-sizing:border-box;background:linear-gradient(135deg,#6d45c7,#4b2d97);font-family:system-ui,-apple-system,sans-serif;color:#fff">
  ${logo.replace('<svg ', `<svg width="${big ? 150 : 84}" height="${big ? 150 : 84}" style="flex:none;filter:drop-shadow(0 10px 24px rgba(0,0,0,.25))" `)}
  <div><div style="font-size:${big ? 64 : 38}px;font-weight:750;letter-spacing:-.02em">inpage</div>
  <div style="font-size:${big ? 30 : 17}px;line-height:1.3;opacity:.92;margin-top:${big ? 10 : 6}px;max-width:${big ? 820 : 280}px">Ask about anything on the page. Answers you can check.${big ? '<br><span style="opacity:.8;font-size:24px">Rewrite in place · lectures · your tabs · your own key</span>' : ''}</div></div></body></html>`;
for (const [name, w, h, big] of [['promo-small', 440, 280, false], ['promo-marquee', 1400, 560, true]]) {
  await p.setViewportSize({ width: w, height: h }); await p.setContent(tile(w, h, big));
  await p.screenshot({ path: `${raw}/${name}@2x.png` });
  execFileSync('python3', ['-c', `from PIL import Image; Image.open('${raw}/${name}@2x.png').convert('RGB').resize((${w},${h}),Image.LANCZOS).save('${out}/${name}.png')`]);
  console.log('wrote', name);
}
await b.close();
