// The drawer in the browser's side panel. Playwright can't open the real side panel, so the panel page
// (ui/frame.html?panel) is opened in its own window, bound to the test window with ?win=: it then behaves as the
// side panel does, following that window's active tab. Checks: the page isn't pushed and holds no drawer frame;
// questions from the panel and from the composer land in the panel; it follows tab switches and reloads; it says so
// on pages inpage can't see; its X closes it; and with no panel, the drawer falls back to the page.
import { launch, C } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/panel'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, extId, setup } = await launch({ viewport: { width: 1200, height: 860 }, storage: { drawerMode: 'panel' } });
const R = {};
const a = await ctx.newPage();
await a.goto('http://127.0.0.1:8799/softmax.html', { waitUntil: 'domcontentloaded' }); await a.waitForSelector('inpage-root', { state: 'attached' }); await a.waitForTimeout(500);
const winId = await setup.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url?.includes('softmax')).windowId);
await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('softmax')); await chrome.tabs.update(t.id, { active: true }); });
// the "side panel": the panel page in its own window, following the test window's active tab
const [panel] = await Promise.all([ctx.waitForEvent('page'), setup.evaluate(([id, w]) => chrome.windows.create({ url: `chrome-extension://${id}/ui/frame.html?panel&win=${w}`, width: 420, height: 860 }), [extId, winId])]);
await panel.waitForLoadState(); await panel.setViewportSize({ width: 400, height: 860 });
await panel.waitForFunction(() => document.querySelector('.dhead .title span')?.textContent === 'This page', null, { timeout: 15000 });
R.home = await panel.locator('.empty h3').innerText().catch(() => '');
R.notPushed = await a.evaluate(() => !document.documentElement.style.marginRight);
R.noDrawerFrameInPage = !a.frames().some(f => f.url().includes('frame.html#drawer'));
await panel.screenshot({ path: `${out}/01-home.png` });
// a page question from the panel
await panel.locator('.dfoot textarea').fill('In one sentence, what is this page about?'); await panel.locator('.dfoot textarea').press('Enter');
await panel.waitForFunction(() => document.querySelector('.msg.ai[data-i]') && !document.querySelector('.msg.pending'), null, { timeout: 90000, polling: 150 });
R.pageAnswer = (await panel.locator('.msg.ai[data-i] .body').last().innerText()).slice(0, 140);
// a selection question from the composer lands in the panel, not in the page
await a.bringToFront();
await a.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /cross-entropy loss/.test(x.textContent)); const t = p.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 22); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); });
await a.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(a).locator('textarea').fill('Explain simply'); await C(a).locator('textarea').press('Enter');
// The composer opened the browser's real side panel from the click (headless Chrome has one). Playwright can't see
// inside it, but the test panel shows it was replaced (no fight), and the thread exists. Close the real panel with
// the shortcut's toggle, then carry on with the test panel.
R.realSidePanelOpened = await panel.waitForFunction(() => /another panel/.test(document.querySelector('.dbody')?.textContent || ''), null, { timeout: 6000 }).then(() => true).catch(() => false);
const items = async () => setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('softmax')); return chrome.tabs.sendMessage(t.id, { type: 'page-items' }); });
for (let i = 0; i < 60 && !(await items()).threads.some(t => t.answers); i++) await a.waitForTimeout(1000);
R.threadAnswered = (await items()).threads.some(t => t.answers && /correct class/.test(t.quote));
await a.waitForTimeout(2500);
R.noPingPong = (await panel.locator('.dbody').innerText()).includes('another panel') || /Thread/.test(await panel.locator('.dhead .title span').innerText());
await setup.evaluate(w => chrome.sidePanel.close({ windowId: w }).catch(() => {}), winId);   // close the real one; the test panel carries on
await a.waitForTimeout(800);
R.noFallbackDrawer = !a.frames().some(f => f.url().includes('frame.html#drawer'));
await panel.screenshot({ path: `${out}/02-replaced.png` });
// switch tabs: the panel follows (a tab switch also wakes a panel that was replaced)
const [b] = await Promise.all([ctx.waitForEvent('page'), setup.evaluate(w => chrome.tabs.create({ windowId: w, url: 'http://127.0.0.1:8799/claims.html', active: true }), winId)]);   // a new tab in the same window
await b.waitForLoadState('domcontentloaded'); await b.waitForSelector('inpage-root', { state: 'attached' });
await panel.waitForFunction(() => document.querySelector('.dhead .title span')?.textContent === 'This page' && document.querySelector('.empty h3'), null, { timeout: 15000 });
R.followedToB = true;
R.aClosedWhenSwitched = await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('softmax')); return chrome.tabs.sendMessage(t.id, { type: 'page-items' }).then(() => true); });
// back to A: its chat is there
await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('softmax')); await chrome.tabs.update(t.id, { active: true }); });
await panel.waitForFunction(() => [...document.querySelectorAll('.msg.user .body')].some(x => /one sentence/.test(x.textContent)), null, { timeout: 15000 });
R.backToAShowsChat = true;
// reload A: the panel reconnects
await a.reload({ waitUntil: 'domcontentloaded' });
await panel.waitForFunction(() => [...document.querySelectorAll('.msg.user .body')].some(x => /one sentence/.test(x.textContent)) && !document.querySelector('textarea').disabled, null, { timeout: 20000 });
R.reconnectedAfterReload = true;
// a page inpage can't see
await setup.evaluate(([w, id]) => chrome.tabs.create({ windowId: w, url: `chrome-extension://${id}/library.html`, active: true }), [winId, extId]);
await panel.waitForFunction(() => /can’t run on this page|isn’t available/.test(document.querySelector('.dbody')?.textContent || ''), null, { timeout: 15000 });
R.unavailableMessage = (await panel.locator('.dbody').innerText()).trim();
await panel.screenshot({ path: `${out}/03-unavailable.png` });
// back to A, then close with X: the panel closes itself
await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('softmax')); await chrome.tabs.update(t.id, { active: true }); });
await panel.waitForFunction(() => !document.querySelector('textarea').disabled, null, { timeout: 15000 });
const closed = panel.waitForEvent('close', { timeout: 8000 }).then(() => true).catch(() => false);
await panel.locator('[data-a="close"]').click();
R.closedByX = await closed;
// With no panel open, asking from the composer opens the real side panel again (no in-page drawer). Then a copy of
// inpage where the browser refuses to open the panel: the drawer falls back to the page instead of going nowhere.
await a.bringToFront();
const askOn = async page => {
  await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /cross-entropy loss/.test(x.textContent)); const t = p.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 22); getSelection().removeAllRanges(); getSelection().addRange(r); const bb = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: bb.right, clientY: bb.bottom })); });
  await page.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
  await C(page).locator('textarea').fill('Why?'); await C(page).locator('textarea').press('Enter');
  await page.waitForTimeout(2500);
};
await askOn(a);
R.reopenedWithoutFallback = !(await a.locator('iframe.dframe').count());
const refuse = await launch({ storage: { drawerMode: 'panel' }, patches: [
  ['ui/frame.js', "chrome.sidePanel?.open({ windowId: myTab?.windowId })?.catch?.(() => {});", "void 0;"],
  ['background.js', "chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => reply(true), () => reply(false));", "reply(false);"],
] });
const f = await refuse.ctx.newPage();
await f.goto('http://127.0.0.1:8799/softmax.html', { waitUntil: 'domcontentloaded' }); await f.waitForSelector('inpage-root', { state: 'attached' }); await f.waitForTimeout(500);
await askOn(f);
await f.locator('iframe.dframe.open').waitFor({ timeout: 8000 }).catch(() => {});   // the drawer opens once the panel has had 1.5 s to connect
R.fallbackDrawer = await f.locator('iframe.dframe.open').count();
R.fallbackShowsThread = R.fallbackDrawer ? /Thread/.test(await f.frameLocator('iframe.dframe').locator('.dhead .title span').innerText()) : false;
await f.screenshot({ path: `${out}/04-fallback.png` });
await refuse.ctx.close();
const ok = /Learn from this page/.test(R.home) && R.notPushed && R.noDrawerFrameInPage && R.pageAnswer && R.threadAnswered && R.noFallbackDrawer
  && R.noPingPong && R.followedToB && R.backToAShowsChat && R.reconnectedAfterReload && /can’t run on this page/.test(R.unavailableMessage) && R.closedByX && R.reopenedWithoutFallback && R.fallbackDrawer === 1 && R.fallbackShowsThread;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
