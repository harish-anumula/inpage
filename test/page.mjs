// Drawer + page level: open the drawer, ask about the whole page, then ask for page-wide changes (multi-edit),
// review, scroll around, reload, undo all. Screenshots of every state. Usage: node test/page.mjs <name> <url> [--dark]
import { launch, key, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [name, url] = process.argv.slice(2), dark = process.argv.includes('--dark');
const out = path.resolve('test/out/page', name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
;
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && /inpage|chrome-extension/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForSelector('inpage-root', { state: 'attached' });
const shot = n => page.screenshot({ path: `${out}/${n}.png` });
const R = { name };
const sr = fn => page.evaluate(fn);
// open the drawer the way the popup does
await setup.evaluate(async u => { const tabs = await chrome.tabs.query({}); const t = tabs.find(x => x.url && x.url.startsWith(u)); await chrome.tabs.sendMessage(t.id, { type: 'open-drawer' }); }, url.slice(0, 30));
await page.locator('iframe.dframe.open').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await shot('01-drawer-empty');
// page question
let t = Date.now();
await D(page).locator('.chip', { hasText: 'Summarize the key ideas' }).dispatchEvent('click');
await D(page).locator('.msg.pending').waitFor({ timeout: 8000 });
await page.waitForTimeout(700); await shot('02-page-thinking');
await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 120000 });
R.pageAnswerMs = Date.now() - t;
await page.waitForTimeout(300); await shot('03-page-answer');
// page-wide changes
await D(page).locator('.dfoot textarea').fill('Add a one-line check-your-understanding question after each of the first three sections');
t = Date.now();
await D(page).locator('.dfoot textarea').press('Enter');
await D(page).locator('.card').waitFor({ timeout: 60000 });
R.planMs = Date.now() - t;
await page.waitForTimeout(800); await shot('04-changes-running');
await (await drawerFrame(page)).waitForFunction(() => { const c = document.querySelector('.card'); return c && !c.querySelector('.dot.run, .dot.wait'); }, null, { timeout: 180000, polling: 250 });
R.changesMs = Date.now() - t;
R.card = await (await drawerFrame(page)).evaluate(() => document.querySelector('.card .ch').innerText.replace(/\s+/g, ' '));
R.inserted = await page.locator('[data-inpage-kind="insert"]').count();
await shot('05-changes-done');
// review: jump to each change
await D(page).locator('.card [data-a="review"]').dispatchEvent('click'); await page.waitForTimeout(900); await shot('06-review-1');
await D(page).locator('.card [data-a="review"]').dispatchEvent('click'); await page.waitForTimeout(900); await shot('07-review-2');
// close the drawer, scroll the page, hover a change, reopen
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
R.drawerClosedByEsc = !(await page.locator('iframe.dframe.open').count());
await page.mouse.wheel(0, 900); await page.waitForTimeout(400); await shot('08-scrolled');
// reload: chat, card and changes come back
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
R.afterReloadInserted = await page.locator('[data-inpage-kind="insert"]').count();
await setup.evaluate(async u => { const tabs = await chrome.tabs.query({}); const t = tabs.find(x => x.url && x.url.startsWith(u)); await chrome.tabs.sendMessage(t.id, { type: 'open-drawer' }); }, url.slice(0, 30));
await page.locator('iframe.dframe.open').waitFor(); await page.waitForTimeout(400);
R.afterReloadCards = await D(page).locator('.card').count();
await shot('09-after-reload');
// undo all
await D(page).locator('.card [data-a="undo"]').dispatchEvent('click'); await page.waitForTimeout(500);
R.afterUndoInserted = await page.locator('[data-inpage-kind="insert"]').count();
await shot('10-after-undo-all');
// popup
const pop = await ctx.newPage(); await pop.setViewportSize({ width: 340, height: 560 });
await pop.goto(`chrome-extension://${extId}/popup.html`); await pop.waitForTimeout(800);
await pop.screenshot({ path: `${out}/11-popup.png` });
R.errors = errors.slice(0, 5);
console.log(JSON.stringify(R, null, 2));
await ctx.close();
