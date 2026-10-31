// Web search: toggle Web in the composer, ask and rewrite with sources; screenshots of the toggle, answer chips,
// the new image pill and where the edit bar lands. Usage: node test/web.mjs <name> <url> <paragraph-selector>
import { launch, key, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [name, url, sel] = process.argv.slice(2);
const out = path.resolve('test/out/web', name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
;
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForSelector('inpage-root', { state: 'attached' });
const R = { name };
const pi = await page.evaluate(s => [...document.querySelectorAll(s)].findIndex((x, i) => i > 0 && x.innerText.trim().length > 150 && x.getBoundingClientRect().width > 300), sel);
const p = page.locator(sel).nth(pi);
await p.scrollIntoViewIfNeeded();
await p.evaluate(e => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && t.data.trim().length < 30); const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(40, t.data.length)); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); });
await page.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(page).locator('.webtoggle').dispatchEvent('click');
R.toggleOn = await C(page).locator('.webtoggle').getAttribute('aria-pressed');
await C(page).locator('textarea').fill('What is the latest news about this, and who else does something similar?');
await page.screenshot({ path: `${out}/1-composer-web.png` });
let t = Date.now();
await C(page).locator('textarea').press('Enter');
await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 120000 });
R.askWebMs = Date.now() - t;
await page.waitForTimeout(300);
R.sources = await D(page).locator('.sources a').count();
await page.screenshot({ path: `${out}/2-answer-sources.png` });
await D(page).locator('[data-a="close"]').dispatchEvent('click');
// rewrite with web
await p.click({ modifiers: ['Alt'] });
R.toggleRemembered = await C(page).locator('.webtoggle').getAttribute('aria-pressed');
await C(page).locator('textarea').fill('Add one sentence of current context from the web, with a source link');
t = Date.now();
await C(page).locator('textarea').press('Enter');
await page.waitForFunction(() => document.querySelector('[data-inpage-edit]') && !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 120000, polling: 100 });
R.rewriteWebMs = Date.now() - t;
R.linksInRewrite = await page.locator('[data-inpage-edit] a[href^="http"]').count();
const box = await page.evaluate(() => { const b = document.querySelector('[data-inpage-edit]').getBoundingClientRect(); return { x: b.left + 40, y: b.top + 10 }; });
await page.mouse.move(box.x, box.y); await page.mouse.move(box.x + 4, box.y + 4);
await page.locator('.editbar').waitFor({ timeout: 4000 });
R.barSide = await page.evaluate(() => { const bar = document.querySelector('inpage-root').shadowRoot.querySelector('.editbar').getBoundingClientRect(); const b = document.querySelector('[data-inpage-edit]').getBoundingClientRect(); return bar.left >= b.right ? 'right' : bar.right <= b.left ? 'left' : 'above'; });
await page.screenshot({ path: `${out}/3-rewrite-bar.png` });
// image pill
const img = page.locator('img').filter({ hasNot: page.locator('xx') });
const big = await page.evaluate(() => [...document.images].findIndex(i => i.width > 300 && i.height > 150));
if (big >= 0) { const im = page.locator('img').nth(big); await im.scrollIntoViewIfNeeded(); await im.hover(); await page.locator('.imgbtn').waitFor({ timeout: 3000 }).catch(() => {}); await page.screenshot({ path: `${out}/4-image-pill.png` }); R.imagePill = await page.locator('.imgbtn').count(); }
console.log(JSON.stringify(R, null, 2));
await ctx.close();
