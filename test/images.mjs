// Images: hover a figure -> "Ask about image" -> answer about the picture; reload keeps the image thread;
// a rewrite of a block that holds an image keeps the image.
// Usage: node test/images.mjs <name> <url> <image-selector> [<block-with-image-selector>]
import { launch, key, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [name, url, imgSel, blockSel] = process.argv.slice(2);
const out = path.resolve('test/out/images', name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
;
const { ctx, extId, setup } = await launch({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForSelector('inpage-root', { state: 'attached' });
const R = { name };
const idx = await page.evaluate(s => { const all = [...document.querySelectorAll(s)]; let best = 0; all.forEach((x, i) => { if (x.width * x.height > all[best].width * all[best].height) best = i; }); return best; }, imgSel);
const img = page.locator(imgSel).nth(idx);   // the largest matching image
await img.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
await img.hover();
await page.locator('.imgbtn').waitFor({ timeout: 4000 });
await page.screenshot({ path: `${out}/1-image-button.png` });
await page.locator('.imgbtn').dispatchEvent('mousedown');
await C(page).locator('.composer').waitFor();
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/2-image-composer.png` });
let t = Date.now();
await C(page).locator('.chip', { hasText: 'Explain this figure' }).dispatchEvent('click');
await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
R.imageAskMs = Date.now() - t;
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/3-image-answer.png` });
R.answer = (await D(page).locator('.msg.ai[data-i]').first().innerText()).slice(0, 300);
R.model = await page.evaluate(() => 0);
await D(page).locator('[data-a="close"]').dispatchEvent('click');
if (blockSel) {
  const b = page.locator(blockSel).first();
  await b.scrollIntoViewIfNeeded();
  const imgsBefore = await b.locator('img').count();
  await b.locator('figcaption, .ltx_caption').first().click({ modifiers: ['Alt'] });   // the caption, so Alt-click rewrites rather than asks about the image
  await C(page).locator('textarea').fill('Explain this step by step for a beginner, keeping the figure');
  t = Date.now();
  await C(page).locator('textarea').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-inpage-edit]') && !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 90000, polling: 100 });
  R.rewriteMs = Date.now() - t;
  R.imagesKept = `${await page.locator('[data-inpage-edit] img').count()} of ${imgsBefore}`;
  await page.evaluate(() => document.querySelector('[data-inpage-edit]')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/4-rewrite-with-image.png` });
}
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
R.afterReload = { pins: await page.locator('.pin').count(), outlined: await page.locator('[data-inpage-image-thread]').count(), edits: await page.locator('[data-inpage-edit]').count() };
console.log(JSON.stringify(R, null, 2));
await ctx.close();
