// Ask across open tabs: the picker lists the other tabs, picked tabs show as chips, the answer cites each tab and
// every quote is checked in its own tab; clicking one switches to that tab and flashes it; "my open tabs" picks them
// automatically; a sleeping tab is reported, not skipped; a closed tab's quote says so; reload keeps it all.
import { launch, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/tabs'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const R = {};
const open = async u => { const p = await ctx.newPage(); await p.goto(`http://127.0.0.1:8799/${u}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('inpage-root', { state: 'attached' }); return p; };
const claims = await open('claims.html'), long = await open('long.html'), page = await open('softmax.html');
await page.bringToFront();
const activeUrl = () => setup.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url || '');
const answer = async () => { const f = await drawerFrame(page); await f.waitForFunction(() => document.querySelector('.msg.pending'), null, { timeout: 15000, polling: 50 }).catch(() => {}); await f.waitForFunction(() => !document.querySelector('.msg.pending'), null, { timeout: 120000, polling: 150 }); return D(page).locator('.msg.ai[data-i], .msg.err').last(); };
await openDrawer(setup, 'softmax.html'); await D(page).locator('.dfoot textarea').waitFor();
// picker
await D(page).locator('.tabsbtn').dispatchEvent('click');
await D(page).locator('.tabpick .trow').first().waitFor();
R.pickerRows = await D(page).locator('.tabpick .trow .tt').allInnerTexts();
// clicked from inside the frame (headless Chrome doesn't route real clicks to this low part of the frame)
await D(page).locator('.tabpick .trow', { hasText: 'deep learning' }).locator('input').evaluate(i => i.click());
await D(page).locator('.tabpick .trow', { hasText: 'attention mechanism' }).locator('input').evaluate(i => i.click());
R.chips = await D(page).locator('.tabchips .tchip').allInnerTexts();
R.tabsLabel = await D(page).locator('.tabsbtn').innerText();
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/01-picker.png` });
await D(page).locator('.tabsbtn').dispatchEvent('click');   // close the picker
await D(page).locator('.dfoot textarea').fill('Compare how these three pages describe attention and the softmax. Where do they overlap?');
await D(page).locator('.dfoot textarea').press('Enter');
let m = await answer();
R.answer = (await m.locator('.body').innerText()).slice(0, 260);
R.userLine = await D(page).locator('.msg.user .who').last().innerText();
R.cites = await m.locator('.cite').count(); R.tabCites = await m.locator('.cite.tab').count(); R.citesOk = await m.locator('.cite.ok').count(); R.citesBad = await m.locator('.cite.bad').count();
await m.locator('[data-a="details"]').dispatchEvent('click');
R.receipt = (await m.locator('.meta').innerText()).replace(/\s+/g, ' ').slice(0, 300);
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/02-answer.png` });
// click a quote from another tab: that tab comes forward and flashes it
const tabCite = m.locator('.cite.tab.ok').first();
if (await tabCite.count()) {
  await tabCite.dispatchEvent('click'); await page.waitForTimeout(900);
  R.activeAfterCite = await activeUrl();
  const other = R.activeAfterCite.includes('claims') ? claims : long;
  R.flashInOtherTab = await other.evaluate(() => CSS.highlights.has('inpage-check-focus'));
  await other.screenshot({ path: `${out}/03-other-tab.png` });
  await page.bringToFront(); await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('softmax')); await chrome.tabs.update(t.id, { active: true }); });
}
// a picked tab that was closed before asking is reported as not read (never silently dropped)
const extra = await open('long.html?again=1'); await page.bringToFront();
await D(page).locator('.tabsbtn').dispatchEvent('click');
await D(page).locator('.tabpick .trow').first().waitFor();
await D(page).locator('.tabpick .trow').filter({ hasText: 'attention mechanism' }).last().locator('input').evaluate(i => i.click());
await D(page).locator('.tabsbtn').dispatchEvent('click');
await extra.close(); await page.waitForTimeout(300);
await D(page).locator('.dfoot textarea').fill('Summarise what these tabs are about in one line each.');
await D(page).locator('.dfoot textarea').press('Enter');
m = await answer();
await m.locator('[data-a="details"]').dispatchEvent('click');
R.closedReceipt = (await m.locator('.meta').innerText()).replace(/\s+/g, ' ').slice(0, 300);
// "my open tabs" with the picked tabs cleared
while (await D(page).locator('.tabchips .tchip button').count()) await D(page).locator('.tabchips .tchip button').first().dispatchEvent('click');
R.chipsCleared = await D(page).locator('.tabchips .tchip').count();
await D(page).locator('.dfoot textarea').fill('Across my open tabs, which page mentions GPT-3, and what does it claim?');
await D(page).locator('.dfoot textarea').press('Enter');
m = await answer();
R.autoAnswer = (await m.locator('.body').innerText()).slice(0, 260);
R.autoFoundGpt3 = /GPT-3|1\.5 billion/i.test(await m.locator('.body').innerText());
await m.locator('[data-a="details"]').dispatchEvent('click');
R.autoReceipt = (await m.locator('.meta').innerText()).replace(/\s+/g, ' ').slice(0, 300);
await page.screenshot({ path: `${out}/04-my-tabs.png` });
// close the claims tab, then click its quote
const claimsCite = D(page).locator('.msg.ai[data-i]').last().locator('.cite.tab').first();
await claims.close(); await page.waitForTimeout(300);
if (await claimsCite.count()) { await claimsCite.dispatchEvent('click'); await page.waitForTimeout(800); R.closedTabToast = await page.locator('.toast').innerText().catch(() => ''); }
// reload: the chat and its tab answers come back
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
await openDrawer(setup, 'softmax.html'); await page.waitForTimeout(600);
R.afterReload = { answers: await D(page).locator('.msg.ai[data-i]').count(), cites: await D(page).locator('.msg.ai .cite').count(), withTabs: await D(page).locator('.msg.user .with').count() };
const ok = R.pickerRows.length >= 2 && R.chips.length === 2 && /Tabs · 2/.test(R.tabsLabel) && /with 2 other tabs/.test(R.userLine) && R.tabCites > 0 && R.citesOk > 0
  && /deep learning|attention mechanism/i.test(R.receipt) && R.activeAfterCite && !R.activeAfterCite.includes('softmax') && R.flashInOtherTab && R.chipsCleared === 0
  && R.autoFoundGpt3 && /not read/i.test(R.closedReceipt) && R.afterReload.answers === 3 && R.afterReload.withTabs >= 1;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
