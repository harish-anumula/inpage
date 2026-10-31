// Edge cases: a phone-width window, keyboard only, no API key, OpenRouter unreachable, selecting inside a text box,
// inpage switched off for a site, a huge selection, and a dark site. Screenshots in test/out/edges/.
import { launch, C, D, drawerFrame, openDrawer, key } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/edges'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, setup } = await launch({ viewport: { width: 1360, height: 900 } });
const R = {};
const errors = [];
const open = async (u, vp) => { const p = await ctx.newPage(); if (vp) await p.setViewportSize(vp); p.on('pageerror', e => errors.push(`${u}: ${e.message}`)); await p.goto(u.startsWith('http') ? u : `http://127.0.0.1:8799/${u}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('inpage-root', { state: 'attached' }); await p.waitForTimeout(600); return p; };
const selectIn = (p, sel, n = 40) => p.evaluate(([sel, n]) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && t.data.trim().length < 10); const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(n, t.data.length)); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); }, [sel, n]);
const tabId = u => setup.evaluate(u => chrome.tabs.query({}).then(ts => ts.find(t => t.url?.includes(u))?.id), u);
const send = (u, msg) => setup.evaluate(async ([u, msg]) => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes(u)); return chrome.tabs.sendMessage(t.id, msg); }, [u, msg]);

// 1. phone width: composer and drawer fit, no sideways scroll
const phone = await open('softmax.html', { width: 390, height: 800 });
await selectIn(phone, 'p', 30); await phone.waitForTimeout(400);
await phone.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(phone).locator('textarea').waitFor(); await phone.waitForTimeout(400);
R.phone = await phone.evaluate(() => { const f = document.querySelector('inpage-root').shadowRoot.querySelector('iframe.cframe').getBoundingClientRect(); return { composerFits: f.left >= 0 && f.right <= innerWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
await phone.screenshot({ path: `${out}/01-phone-composer.png` });
await C(phone).locator('textarea').fill('Explain simply'); await C(phone).locator('textarea').press('Enter');
await D(phone).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
R.phone.drawer = await phone.evaluate(() => { const f = document.querySelector('inpage-root').shadowRoot.querySelector('iframe.dframe').getBoundingClientRect(); return { width: Math.round(f.width), fits: f.left >= 0 && f.right <= innerWidth + 1, notPushed: !document.documentElement.style.marginRight }; });
await phone.screenshot({ path: `${out}/02-phone-drawer.png` });
await phone.close();
// 2. keyboard only: the drawer toggles with the shortcut (sent as the browser would), Esc closes it
const kb = await open('softmax.html');
await send('softmax.html', { type: 'command', command: 'panel' }); await kb.waitForTimeout(500);
R.kbOpen = await kb.locator('iframe.dframe.open').count();
R.kbFocusInDrawer = await (await drawerFrame(kb)).evaluate(() => document.hasFocus());
await kb.keyboard.press('Escape'); await kb.waitForTimeout(400);
R.kbClosedByEsc = !(await kb.locator('iframe.dframe.open').count());
await send('softmax.html', { type: 'command', command: 'ask' }); await kb.waitForTimeout(500);
R.askWithoutSelection = await kb.locator('.toast').innerText().catch(() => '');
// 3. no API key: a clear message with a way to fix it
await setup.evaluate(() => chrome.storage.local.remove('apiKey'));
await selectIn(kb, 'p'); await kb.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(kb).locator('textarea').fill('What is this?'); await C(kb).locator('textarea').press('Enter');
await D(kb).locator('.msg.err').first().waitFor({ timeout: 20000 });
R.noKey = await D(kb).locator('.msg.err .body').first().innerText();
R.noKeyButton = await D(kb).locator('.msg.err [data-a="settings"]').innerText().catch(() => '');
await kb.screenshot({ path: `${out}/03-no-key.png` });
await setup.evaluate(k => chrome.storage.local.set({ apiKey: k }), key());
// 4. OpenRouter unreachable: a separate copy of the extension whose worker calls an address that refuses connections
{
  const net = await launch({ patches: [['background.js', "const API = 'https://openrouter.ai/api/v1';", "const API = 'https://127.0.0.1:9/api/v1';"]] });
  const off = await net.ctx.newPage();
  await off.goto('http://127.0.0.1:8799/long.html', { waitUntil: 'domcontentloaded' }); await off.waitForSelector('inpage-root', { state: 'attached' });
  await openDrawer(net.setup, 'long.html'); await D(off).locator('.dfoot textarea').waitFor();
  await D(off).locator('.dfoot textarea').fill('Summarise this page'); await D(off).locator('.dfoot textarea').press('Enter');
  await (await drawerFrame(off)).waitForFunction(() => document.querySelector('.msg.err') && !document.querySelector('.msg.pending'), null, { timeout: 40000 }).catch(() => {});
  R.offline = await D(off).locator('.msg.err .body').last().innerText().catch(() => '(nothing)');
  R.offlineInputUsable = await D(off).locator('.dfoot textarea').isEnabled();
  await off.screenshot({ path: `${out}/05-offline.png` });
  // a rewrite fails cleanly too: the paragraph comes back and the status offers Retry
  await D(off).locator('[data-a="close"]').dispatchEvent('click');
  await off.locator('p').first().click({ modifiers: ['Alt'] });
  await C(off).locator('textarea').fill('Simpler'); await C(off).locator('textarea').press('Enter');
  await off.locator('.status.error').waitFor({ timeout: 30000 }).catch(() => {});
  R.rewriteOffline = { status: await off.locator('.status.error').innerText().catch(() => ''), paragraphBack: await off.evaluate(() => !document.querySelector('[data-inpage-hidden]') && !document.querySelector('[data-inpage-edit]')) };
  await net.ctx.close();
}
// 5. selecting inside a text box: no toolbar
const form = await open('injection.html');
await form.evaluate(() => { const t = document.createElement('textarea'); t.value = 'Some words typed into a form field by the reader.'; document.body.prepend(t); t.focus(); t.setSelectionRange(0, 20); const b = t.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.left + 30, clientY: b.top + 10 })); });
await form.waitForTimeout(400);
R.toolbarInTextarea = await form.locator('.toolbar').count();
// 6. switched off for the site: no toolbar, no image pill
await send('injection.html', { type: 'set-enabled', enabled: false });
await selectIn(form, '#p1'); await form.waitForTimeout(400);
R.toolbarWhenOff = await form.locator('.toolbar').count();
await send('injection.html', { type: 'set-enabled', enabled: true });
await selectIn(form, '#p1'); await form.waitForTimeout(400);
R.toolbarWhenOnAgain = await form.locator('.toolbar').count();
// 7. a huge selection (the whole article): Ask still works and stays bounded
const big = await open('https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)');
await big.evaluate(() => { const c = document.querySelector('#mw-content-text'); const r = document.createRange(); r.selectNodeContents(c); getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 300, clientY: 300 })); });
await big.waitForTimeout(500);
R.bigToolbar = await big.locator('.toolbar').count();
if (R.bigToolbar) {
  await big.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
  await C(big).locator('textarea').fill('One-sentence summary'); await C(big).locator('textarea').press('Enter');
  await (await drawerFrame(big)).waitForFunction(() => document.querySelector('.msg.ai[data-i], .msg.err') && !document.querySelector('.msg.pending'), null, { timeout: 90000 });
  R.bigAnswer = (await D(big).locator('.msg.ai[data-i] .body, .msg.err .body').last().innerText()).slice(0, 160);
}
// 8. a dark site: dark UI, readable
const dark = await open('https://github.com/karpathy/micrograd', null);
await dark.emulateMedia({ colorScheme: 'dark' }); await dark.reload({ waitUntil: 'domcontentloaded' }); await dark.waitForSelector('inpage-root', { state: 'attached' }); await dark.waitForTimeout(1500);
await openDrawer(setup, 'github.com/karpathy/micrograd'); await dark.waitForTimeout(600);
R.darkTheme = await (await drawerFrame(dark)).evaluate(() => document.documentElement.dataset.theme);
await dark.screenshot({ path: `${out}/04-dark.png` });
R.errors = errors.slice(0, 5);
const ok = R.phone.composerFits && !R.phone.pageOverflow && R.phone.drawer.fits && R.phone.drawer.notPushed && R.kbOpen === 1 && R.kbClosedByEsc && /Select some text/.test(R.askWithoutSelection)
  && /key/i.test(R.noKey) && /Open settings/.test(R.noKeyButton) && R.kbFocusInDrawer && /reach OpenRouter|connection/i.test(R.offline) && R.offlineInputUsable && /reach OpenRouter/.test(R.rewriteOffline.status) && /Retry/.test(R.rewriteOffline.status) && R.rewriteOffline.paragraphBack && R.toolbarInTextarea === 0 && R.toolbarWhenOff === 0 && R.toolbarWhenOnAgain === 1
  && R.bigToolbar === 1 && R.bigAnswer && R.darkTheme === 'dark' && !R.errors.length;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
