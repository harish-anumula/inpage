// Single-page-app navigation and the popup: an edit on page A disappears on client-side navigation to B and returns on Back.
import { launch, key, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const out = path.resolve('test/out/ux/spa'); fs.mkdirSync(out, { recursive: true });
const { ctx, extId, setup } = await launch({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://react.dev/learn/thinking-in-react', { waitUntil: 'networkidle' });
await page.waitForSelector('inpage-root', { state: 'attached' });
const p = page.locator('article p').nth(1);
await p.scrollIntoViewIfNeeded(); await p.click({ modifiers: ['Alt'] });
await C(page).locator('textarea').fill('Simpler, one sentence'); await C(page).locator('textarea').press('Enter');
await page.waitForFunction(() => document.querySelector('[data-inpage-edit]') && !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 60000 });
const R = { editsOnA: await page.locator('[data-inpage-edit]').count() };
await page.locator('a[href="/learn/describing-the-ui"]').first().click();
await page.waitForURL('**/describing-the-ui'); await page.waitForTimeout(1500);
R.editsOnB = await page.locator('[data-inpage-edit]').count(); R.guttersOnB = await page.locator('.gutter').count();
await page.goBack(); await page.waitForURL('**/thinking-in-react'); await page.waitForTimeout(2000);
R.editsBackOnA = await page.locator('[data-inpage-edit]').count(); R.guttersBackOnA = await page.locator('.gutter').count();
await page.screenshot({ path: `${out}/back-on-a.png` });
// popup, opened as a page next to the tab
const pop = await ctx.newPage(); await pop.setViewportSize({ width: 340, height: 520 });
await pop.goto(`chrome-extension://${extId}/popup.html`); await pop.waitForTimeout(800);
await pop.screenshot({ path: `${out}/popup.png` });
R.popupStatus = await pop.locator('#statusText').innerText();
console.log(JSON.stringify(R));
await ctx.close();
