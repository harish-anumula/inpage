// Fact-check: the page chip finds the checkable claims and checks them with web search; known false claims come back
// disputed, true ones supported; verdicts tint the claims and mark the margin; a selection can be checked on its own;
// verdicts come back after a reload; Clear removes them.
import { launch, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/check'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8799/claims.html', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('inpage-root', { state: 'attached' });
const R = {};
await openDrawer(setup, 'claims.html'); await D(page).locator('.chip').first().waitFor();
R.chip = await D(page).locator('.chip', { hasText: 'Fact-check this page' }).count();
const t0 = Date.now();
await D(page).locator('.chip', { hasText: 'Fact-check this page' }).dispatchEvent('click');
await D(page).locator('.card.check').waitFor({ timeout: 10000 });
await page.waitForTimeout(600); await page.screenshot({ path: `${out}/01-finding.png` });
await (await drawerFrame(page)).waitForFunction(() => document.querySelector('.card.check .claim'), null, { timeout: 60000 });
R.claimsMs = Date.now() - t0;
await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/02-checking.png` });
await (await drawerFrame(page)).waitForFunction(() => { const c = document.querySelector('.card.check'); return c && !c.querySelector('.typing'); }, null, { timeout: 180000, polling: 300 });
R.totalMs = Date.now() - t0;
R.claims = await D(page).locator('.card.check .claim').evaluateAll(bs => bs.map(b => `${b.querySelector('.pill').textContent} | ${b.querySelector('.ct').textContent}`));
const find = re => R.claims.find(c => re.test(c)) || '';
R.gpt3 = find(/GPT-3/); R.bert = find(/BERT/); R.alexnet = find(/AlexNet|ImageNet/); R.alphago = find(/AlphaGo|Lee Sedol/);
R.marks = await page.locator('.checkmark').count();
R.sources = await D(page).locator('.card.check .csrc a').count();
await page.screenshot({ path: `${out}/03-done.png` });
// jump to a claim from the card
await D(page).locator('.card.check .claim').filter({ hasText: 'GPT-3' }).first().dispatchEvent('click');
await page.waitForTimeout(900); await page.screenshot({ path: `${out}/04-jump.png` });
// reload: verdicts and marks come back
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000);
R.marksAfterReload = await page.locator('.checkmark').count();
await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05-after-reload.png` });
// check one selection on its own
await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /AlphaGo/.test(x.textContent)); p.scrollIntoView({ block: 'center' }); const t = p.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 40); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); });
await page.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(page).locator('.chip', { hasText: 'Fact-check this' }).dispatchEvent('click');
await D(page).locator('.card.check').nth(1).waitFor({ timeout: 10000 });
await (await drawerFrame(page)).waitForFunction(() => { const c = document.querySelectorAll('.card.check')[1]; return c && c.querySelector('.claim') && !c.querySelector('.typing'); }, null, { timeout: 120000, polling: 300 });
R.selectionClaims = await D(page).locator('.card.check').nth(1).locator('.claim .ct').allInnerTexts();
// clear
await D(page).locator('.card.check').first().locator('[data-a="clear"]').dispatchEvent('click');
await page.waitForTimeout(500);
R.cardsAfterClear = await D(page).locator('.card.check').count();
const ok = R.chip === 1 && R.claims.length >= 4 && /^Disputed/.test(R.gpt3) && /^Disputed/.test(R.bert) && /^Supported/.test(R.alphago) && R.marks >= 4 && R.sources > 0 && R.marksAfterReload >= 4 && R.selectionClaims.length >= 1 && R.selectionClaims.every(c => /AlphaGo|Lee Sedol|Fan Hui|DeepMind/i.test(c)) && R.cardsAfterClear === 1;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
