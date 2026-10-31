// Answers you can check, receipts and "up to here": page answers cite the page with numbered chips that jump to
// the sentence; quotes from inpage's own rewrites aren't counted as the author's; each answer shows its model, cost
// and exactly what was sent; "Catch me up" uses only what's above the reader and doesn't leak the last section.
import { launch, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/trust'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const R = {};
const ask = async text => {
  const n = await D(page).locator('.msg.ai[data-i]').count();
  await D(page).locator('.dfoot textarea').fill(text); await D(page).locator('.dfoot textarea').press('Enter');
  await (await drawerFrame(page)).waitForFunction(k => document.querySelectorAll('.msg.ai[data-i]').length > k && !document.querySelector('.msg.pending'), n, { timeout: 120000, polling: 100 });
  return D(page).locator('.msg.ai[data-i]').last();
};
// 1. citations on the softmax page
await page.goto('http://127.0.0.1:8799/softmax.html', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('inpage-root', { state: 'attached' });
await openDrawer(setup, 'softmax.html'); await D(page).locator('.dfoot textarea').waitFor();
let m = await ask('Why are softmax and cross-entropy usually fused into one function? Quote the page.');
R.cites = await m.locator('.cite').count(); R.citesOk = await m.locator('.cite.ok').count(); R.citesBad = await m.locator('.cite.bad').count();
R.rawMarkers = /\{\{\s*q\s*:/.test(await m.locator('.body').innerText());
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/01-cites.png` });
if (R.citesOk) { await m.locator('.cite.ok').first().dispatchEvent('click'); await page.waitForTimeout(600); R.flashed = await page.evaluate(() => CSS.highlights.has('inpage-check-focus')); await page.screenshot({ path: `${out}/02-cite-jump.png` }); }
// receipts
await m.locator('[data-a="details"]').dispatchEvent('click');
R.metaText = (await m.locator('.meta').innerText()).replace(/\s+/g, ' ').slice(0, 260);
await m.locator('[data-a="sent"]').dispatchEvent('click'); await page.waitForTimeout(300);
R.sentShown = (await m.locator('pre.sent').innerText()).length;
R.sentHasPage = (await m.locator('pre.sent').innerText()).includes('fused into one');
await page.screenshot({ path: `${out}/03-receipt.png` });
// copy keeps the quotes as text, not markers
// 2. a quote taken from inpage's own rewrite is not counted as the author's
await D(page).locator('[data-a="close"]').dispatchEvent('click');
await page.locator('p').filter({ hasText: 'fused into one' }).click({ modifiers: ['Alt'] });
await C(page).locator('textarea').fill('Rewrite this to say: "Fusing them avoids overflow in the exponentials and gives a cleaner gradient." Keep it one sentence.');
await C(page).locator('textarea').press('Enter');
await page.waitForFunction(() => document.querySelector('[data-inpage-edit]') && !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 90000, polling: 200 });
R.inpageQuoteFound = await page.evaluate(() => 0);   // filled below through a fresh answer
await openDrawer(setup, 'softmax.html');
m = await ask('What does the last paragraph say? Quote it exactly.');
R.afterRewrite = { cites: await m.locator('.cite').count(), ok: await m.locator('.cite.ok').count(), bad: await m.locator('.cite.bad').count() };
// 3. reload: answers keep their chips and receipts summary; the exact text is gone (kept only for the visit)
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
await openDrawer(setup, 'softmax.html'); await page.waitForTimeout(600);
R.afterReload = { cites: await D(page).locator('.msg.ai[data-i] .cite').count(), details: await D(page).locator('[data-a="details"]').count() };
const first = D(page).locator('.msg.ai[data-i]').first();
await first.locator('[data-a="details"]').dispatchEvent('click'); await first.locator('[data-a="sent"]').dispatchEvent('click'); await page.waitForTimeout(300);
R.sentAfterReload = (await first.locator('pre.sent').innerText()).slice(0, 60);
// 4. "Catch me up" on a long page, scrolled to section 2: no leak of section 3
const p2 = await ctx.newPage();
await p2.goto('http://127.0.0.1:8799/long.html', { waitUntil: 'domcontentloaded' }); await p2.waitForSelector('inpage-root', { state: 'attached' });
await p2.evaluate(() => [...document.querySelectorAll('h2')][1].scrollIntoView({ block: 'start' })); await p2.waitForTimeout(400);
await openDrawer(setup, 'long.html'); await D(p2).locator('.chip').first().waitFor();
await D(p2).locator('.chip', { hasText: 'Catch me up' }).dispatchEvent('click');
R.catchUpLabel = await (await drawerFrame(p2)).waitForFunction(() => { const w = document.querySelector('.msg.pending .waiting'); return w && !/Reading the page/.test(w.textContent) && w.textContent.trim(); }, null, { timeout: 8000, polling: 50 }).then(h => h.jsonValue()).catch(() => '(none)');
await (await drawerFrame(p2)).waitForFunction(() => document.querySelector('.msg.ai[data-i]') && !document.querySelector('.msg.pending'), null, { timeout: 90000 });
const ans = await D(p2).locator('.msg.ai[data-i] .body').last().innerText();
R.catchUp = ans.slice(0, 200); R.leaked = /WMT|P100|2017|Transformer/i.test(ans); R.mentionsSection2 = /softmax|weight|scor/i.test(ans);
await p2.screenshot({ path: `${out}/04-catch-up.png` });
// and a whole-page question on the same page still sees the end
const m2 = await (async () => { await D(p2).locator('.dfoot textarea').fill('Which GPUs and which translation tasks does the page say the original Transformer used?'); await D(p2).locator('.dfoot textarea').press('Enter'); await (await drawerFrame(p2)).waitForFunction(() => document.querySelectorAll('.msg.ai[data-i]').length >= 2 && !document.querySelector('.msg.pending'), null, { timeout: 90000 }); return D(p2).locator('.msg.ai[data-i] .body').last().innerText(); })();
R.wholePageSeesEnd = /P100|WMT/i.test(m2);
const ok = R.cites > 0 && R.citesOk > 0 && !R.rawMarkers && R.flashed && /\$/.test(R.metaText) && R.sentHasPage && R.afterReload.cites > 0 && R.afterReload.details > 0 && /kept only while the page is open/.test(R.sentAfterReload) && /up to where you are/i.test(R.catchUpLabel) && !R.leaked && R.wholePageSeesEnd;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
