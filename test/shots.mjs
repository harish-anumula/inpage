// README screenshots on the demo page (2x): toolbar + composer, rewrite with controls, thread, page changes,
// image question, dark page, popup, settings. Serve the repo root on 8800 first.
import { launch, key, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const out = path.resolve('docs/screenshots'); fs.mkdirSync(out, { recursive: true });
;
const URL_ = 'http://127.0.0.1:8800/demo/';
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await setup.waitForTimeout(800);
await setup.setViewportSize({ width: 900, height: 760 }); await setup.reload(); await setup.waitForTimeout(1200);
await setup.screenshot({ path: `${out}/settings.png` });
const page = await ctx.newPage();
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForSelector('inpage-root', { state: 'attached' });
const shot = (n, clip) => page.screenshot({ path: `${out}/${n}.png`, ...(clip ? { clip } : {}) });
const select = async (sel, from, len) => {
  await page.evaluate(([s, f, l]) => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center' }); const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && !t.data.includes(f)); const i = t.data.indexOf(f); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, Math.min(t.data.length, i + l)); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); }, [sel, from, len]);
  await page.waitForTimeout(400);
};
// 1. toolbar, then the composer
await page.evaluate(() => [...document.querySelectorAll('main p')].find(p => p.textContent.includes('Dividing by')).id = 'scale');
const scale = '#scale';
await select(scale, 'Dividing by', 120);
await shot('1-toolbar');
await page.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(page).locator('textarea').fill('Why does dividing by √d_k stop the softmax from saturating? Show a tiny example.');
await page.waitForTimeout(300);
await shot('2-composer');
await C(page).locator('textarea').press('Enter');
await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
await page.waitForTimeout(700);
await shot('3-thread');
await D(page).locator('[data-a="close"]').dispatchEvent('click'); await page.waitForTimeout(400);
// 2. rewrite in place
await page.locator(scale).click({ modifiers: ['Alt'] });
await C(page).locator('textarea').fill('Expand this step by step with a tiny numeric example');
await C(page).locator('textarea').press('Enter');
await page.locator('.status').waitFor();
await page.waitForTimeout(1300);
await shot('4-rewrite-streaming');
await page.waitForFunction(() => !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 90000, polling: 100 });
await page.waitForTimeout(2000);
const b = await page.evaluate(() => { const r = document.querySelector('[data-inpage-edit]').getBoundingClientRect(); return { x: r.left + 60, y: r.top + 14 }; });
await page.evaluate(() => scrollBy(0, document.querySelector('[data-inpage-edit]').getBoundingClientRect().top - 160));
await page.waitForTimeout(300);
const b2 = await page.evaluate(() => { const r = document.querySelector('[data-inpage-edit]').getBoundingClientRect(); return { x: r.left + 60, y: r.top + 14 }; });
await page.mouse.move(b2.x, b2.y); await page.mouse.move(b2.x + 4, b2.y + 4); await page.waitForTimeout(400);
await shot('5-rewrite-done');
// 3. image question
await page.mouse.move(5, 5);
const img = page.locator('figure img'); await img.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await img.hover(); await page.waitForTimeout(400);
await shot('6-image-button');
await page.locator('.imgbtn').dispatchEvent('mousedown');
await C(page).locator('.chip', { hasText: 'Explain this figure' }).dispatchEvent('click');
await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 }); await page.waitForTimeout(600);
await shot('7-image-answer');
await D(page).locator('[data-a="close"]').dispatchEvent('click'); await page.waitForTimeout(400);
// 4. page-level changes
await setup.evaluate(async () => { const tabs = await chrome.tabs.query({}); const t = tabs.find(x => x.url && x.url.includes('/demo/')); await chrome.tabs.sendMessage(t.id, { type: 'open-drawer' }); });
await page.locator('iframe.dframe.open').waitFor(); await page.waitForTimeout(500);
await shot('8-drawer-home');
await D(page).locator('.chip', { hasText: 'Add a check-your-understanding question after each section' }).dispatchEvent('click');
await D(page).locator('.card').waitFor({ timeout: 60000 });
await (await drawerFrame(page)).waitForFunction(() => { const c = document.querySelector('.card'); return c && !c.querySelector('.dot.run, .dot.wait'); }, null, { timeout: 180000, polling: 250 });
await D(page).locator('.card [data-a="review"]').dispatchEvent('click'); await page.waitForTimeout(1200);
await shot('9-page-changes');
// 5. popup
const pop = await ctx.newPage(); await pop.setViewportSize({ width: 340, height: 520 });
await pop.goto(`chrome-extension://${extId}/popup.html`); await pop.waitForTimeout(800);
await pop.screenshot({ path: `${out}/popup.png` });
console.log(fs.readdirSync(out).join(' '));
await ctx.close();
