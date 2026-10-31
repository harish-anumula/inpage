// UX run on one page: every state of Ask and Rewrite is screenshotted and timed.
// Usage: node test/ux.mjs <name> <url> <paragraph-selector> [--dark] [--model=<id>]
import { launch, key, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [name, url, sel] = process.argv.slice(2);
const dark = process.argv.includes('--dark');
const modelId = (process.argv.find(a => a.startsWith('--model=')) || '--model=deepseek-flash').split('=')[1];
const out = path.resolve('test/out/ux', name);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
;

const { ctx, extId, setup } = await launch({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light', modelId });

const page = await ctx.newPage();
const logs = [];
page.on('console', m => { if (/inpage|error/i.test(m.text())) logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForSelector('inpage-root', { state: 'attached' });
const groupText = () => page.evaluate(() => [...document.querySelectorAll('[data-inpage-edit]:not([data-inpage-kind])')].map(n => n.innerText).join('\n'));
const groupBox = () => page.evaluate(() => { const ns = [...document.querySelectorAll('[data-inpage-edit]:not([data-inpage-kind])')]; const b = ns[0].getBoundingClientRect(); return { x: b.left + 40, y: b.top + 12 }; });
const shot = async (n, full) => page.screenshot({ path: `${out}/${n}.png`, fullPage: !!full });
const R = { name, url, model: modelId, dark, steps: {} };
const time = async (label, fn) => { const t = Date.now(); try { await fn(); R.steps[label] = Date.now() - t; } catch (e) { R.steps[label] = `FAIL: ${e.message.split('\n')[0]}`; throw e; } };

// pick the paragraph (first match with real text), select its first sentence-ish
const target = await page.evaluateHandle(s => [...document.querySelectorAll(s)].find(x => x.innerText.trim().length > 120 && x.getBoundingClientRect().width > 200), sel);
await target.evaluate(e => { e.setAttribute('data-ux-target', ''); e.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(300);
async function selectWords(n) {
  await page.evaluate(n => {
    const e = document.querySelector('[data-ux-target]') || document.querySelector('[data-inpage-edit]');
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let t;
    while ((t = w.nextNode()) && t.data.trim().split(/\s+/).length < 4);
    const words = t.data.match(/\S+\s*/g); let end = 0; for (let i = 0; i < Math.min(n, words.length); i++) end += words[i].length;
    const start = t.data.indexOf(words[0]);
    const r = document.createRange(); r.setStart(t, start); r.setEnd(t, Math.min(t.data.length, start + end));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    const b = r.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom }));
  }, n);
  await page.locator('.toolbar').waitFor({ timeout: 4000 });
}

try {
  // ---- Ask ----
  await selectWords(6);
  await shot('01-toolbar');
  await page.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
  await C(page).locator('textarea').waitFor();
  await page.waitForTimeout(250);
  await shot('02-composer-ask');
  await time('ask_first_text', async () => {
    await C(page).locator('.chip', { hasText: 'Explain simply' }).dispatchEvent('click');
    await D(page).locator('.msg.pending').waitFor({ timeout: 8000 });
    await shot('03-ask-thinking');
    await (await drawerFrame(page)).waitForFunction(() => document.querySelector('.msg.pending .body:not(:has(.typing))')?.textContent.trim().length > 40, null, { timeout: 60000, polling: 50 });
  });
  await shot('04-ask-streaming');
  await time('ask_done', () => D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 }));
  await page.waitForTimeout(200);
  await shot('05-ask-answer');
  // follow-up with think harder (cmd+enter)
  await D(page).locator('.dfoot textarea').fill('Can you show it with actual numbers?');
  await time('followup_done', async () => {
    await D(page).locator('.dfoot textarea').press('Meta+Enter');
    await (await drawerFrame(page)).waitForFunction(() => document.querySelectorAll('.msg.ai[data-i]').length >= 2, null, { timeout: 120000, polling: 100 });
  });
  await shot('06-ask-followup');
  // insert the first answer into the page
  await D(page).locator('.msg.ai[data-i] [data-a="insert"]').first().dispatchEvent('click');
  await page.waitForSelector('[data-inpage-kind="insert"]', { state: 'attached' });
  await D(page).locator('[data-a="close"]').dispatchEvent('click');
  await page.evaluate(() => document.querySelector('[data-inpage-kind="insert"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await shot('07-inserted-answer');

  // ---- Rewrite ----
  await page.evaluate(() => document.querySelector('[data-ux-target]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await page.locator('[data-ux-target]').click({ modifiers: ['Alt'] });
  await C(page).locator('textarea').waitFor();
  await C(page).locator('textarea').fill('Expand this step by step with a tiny numeric example');
  await page.waitForTimeout(250);
  await shot('08-composer-rewrite');
  await time('rewrite_first_preview', async () => {
    await C(page).locator('textarea').press('Enter');
    await page.locator('.status').waitFor({ timeout: 4000 });
    await shot('09-rewrite-waiting');
    await page.waitForSelector('[data-inpage-edit]:not([data-inpage-kind])', { state: 'attached', timeout: 60000 });
  });
  await page.waitForTimeout(250);
  await shot('10-rewrite-streaming');
  await time('rewrite_done', () => page.waitForFunction(() => !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 90000, polling: 100 }));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-inpage-edit]:not([data-inpage-kind])').scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, -80));
  await page.waitForTimeout(300);
  await shot('11-rewrite-done');
  // hover controls
  const box = await groupBox();
  await page.mouse.move(box.x, box.y); await page.mouse.move(box.x + 5, box.y + 5);
  await page.locator('.editbar').waitFor({ timeout: 3000 });
  await page.waitForTimeout(250);
  await shot('12-hover-controls');
  await page.locator('.editbar [data-a="orig"]').click();
  await page.waitForTimeout(200);
  await shot('13-showing-original');
  await page.locator('.editbar [data-a="orig"]').click();
  // Again
  await page.locator('.editbar [data-a="again"]').click();
  await C(page).locator('.composer').waitFor();
  await time('again_done', async () => {
    await C(page).locator('.chip', { hasText: 'Shorter' }).dispatchEvent('click');
    await page.locator('.status').waitFor({ timeout: 4000 });
    await page.waitForFunction(() => !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 90000, polling: 100 });
  });
  await page.waitForTimeout(300);
  await shot('14-after-again');
  const edit = await page.evaluate(() => { const ns = [...document.querySelectorAll('[data-inpage-edit]:not([data-inpage-kind])')]; const t = ns.map(n => n.textContent).join(' '); return { katex: ns.reduce((k, n) => k + n.querySelectorAll('.katex').length, 0), rawTex: (t.match(/\\\(|\\\[/g) || []).length, tags: ns.map(c => c.tagName).join(','), widthOk: ns.every(n => Math.abs(n.getBoundingClientRect().width - (n.previousElementSibling || n.nextElementSibling || n).getBoundingClientRect().width) < 120 || n.tagName !== 'P') }; });
  R.edit = edit;

  // ---- Cancel mid-rewrite ----
  await page.evaluate(() => document.querySelector('[data-inpage-edit]:not([data-inpage-kind])').scrollIntoView({ block: 'center' }));
  const before = await groupText();
  const b2 = await groupBox();
  await page.mouse.move(b2.x, b2.y); await page.mouse.move(b2.x + 3, b2.y + 3);
  await page.locator('.editbar [data-a="again"]').click();
  await C(page).locator('textarea').fill('Rewrite this as a long table');
  await C(page).locator('textarea').press('Enter');
  await page.locator('.status button', { hasText: 'Cancel' }).click({ timeout: 4000 });
  await page.waitForTimeout(500);
  R.cancelRestored = (await groupText()) === before;
  await shot('15-after-cancel');

  // ---- Reload: everything comes back ----
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  R.afterReload = { edits: await page.locator('[data-inpage-edit]').count(), pins: await page.locator('.pin').count(), gutters: await page.locator('.gutter').count() };
  await page.evaluate(() => document.querySelector('[data-inpage-edit]')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('16-after-reload');

  // ---- Error: wrong key ----
  await setup.evaluate(() => chrome.storage.local.set({ apiKey: 'sk-or-wrong' }));
  await page.evaluate(() => document.querySelector('[data-inpage-edit]')?.scrollIntoView({ block: 'center' }));
  await selectWords(4).catch(() => {});
  if (await page.locator('.toolbar').count()) {
    await page.locator('.toolbar button', { hasText: 'Rewrite' }).dispatchEvent('mousedown');
    await C(page).locator('textarea').fill('Simpler');
    await C(page).locator('textarea').press('Enter');
    await page.locator('.status.error').waitFor({ timeout: 8000 });
    await page.waitForTimeout(200);
    await shot('17-error');
    R.errorText = await page.locator('.status.error').innerText();
  }
  await setup.evaluate(t => chrome.storage.local.set({ apiKey: t }), key());
} catch (e) {
  R.error = e.message.split('\n')[0];
  await shot('99-failure');
}
R.logs = logs.slice(0, 8);
fs.writeFileSync(`${out}/result.json`, JSON.stringify(R, null, 2));
const ok = !R.error && !!R.errorText;          // every step ran, through the bad-key error at the end
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
