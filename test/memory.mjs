// Quiet memory: asking about a short term saves a one-line definition; selecting it again (here or on another page,
// singular or plural) shows your explanation above the toolbar, and clicking opens the note; sentences and unknown
// terms show nothing; the switch in Settings turns it off; the library lists and forgets terms. The return bookmark
// offers once to go back on a long page you left part-way, and forgets pages you finished.
import { launch, C, D, drawerFrame } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/memory'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const R = {};
const open = async u => { const p = await ctx.newPage(); await p.goto(`http://127.0.0.1:8799/${u}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('inpage-root', { state: 'attached' }); await p.waitForTimeout(400); return p; };
// select the n-th occurrence of a word (or a phrase) and lift the mouse
const select = async (page, text, nth = 0) => {
  const ok = await page.evaluate(([text, nth]) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t, seen = 0;
    while ((t = w.nextNode())) { let i = -1; while ((i = t.data.indexOf(text, i + 1)) >= 0) { if (seen++ === nth) { t.parentElement.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + text.length); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); return true; } } }
    return false;
  }, [text, nth]);
  await page.waitForTimeout(450);
  return ok;
};
const memo = page => page.locator('.memo').innerText().catch(() => '');
// 1. ask about "softmax" on the softmax page
const a = await open('softmax.html');
await select(a, 'softmax');
await a.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(a).locator('textarea').fill('What is this, in plain words?'); await C(a).locator('textarea').press('Enter');
await D(a).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
const t0 = Date.now(); let g = null;
while (Date.now() - t0 < 30000 && !(g = (await setup.evaluate(() => chrome.storage.local.get('glossary'))).glossary?.softmax)) await a.waitForTimeout(400);
R.saved = g ? { term: g.term, def: g.def } : null;
await D(a).locator('[data-a="close"]').dispatchEvent('click');
// 2. same page: "here, earlier"; click opens the thread
await a.mouse.click(5, 5); await select(a, 'softmax', 1);
R.memoHere = await memo(a);
await a.screenshot({ path: `${out}/01-memo-here.png` });
await a.locator('.memo').dispatchEvent('mousedown'); await a.waitForTimeout(600);
R.openedThread = await D(a).locator('.threadquote').innerText().catch(() => '');
await D(a).locator('[data-a="close"]').dispatchEvent('click');
// 3. another page, plural and a sentence and an unknown term
const b = await open('long.html');
await select(b, 'softmax');
R.memoOther = await memo(b);
await b.screenshot({ path: `${out}/02-memo-other-page.png` });
await b.mouse.click(5, 5); await select(b, 'turns the scores into weights with a softmax');
R.memoSentence = await memo(b);
await b.mouse.click(5, 5); await select(b, 'decoder');
R.memoUnknown = await memo(b);
await b.mouse.click(5, 5); await select(b, 'softmax');
const [lib] = await Promise.all([ctx.waitForEvent('page'), b.locator('.memo').dispatchEvent('mousedown')]);
await lib.waitForLoadState(); await lib.waitForTimeout(700);
R.libraryOpenedOn = await lib.locator('.dh h2').innerText();
// 4. the switch in Settings
const opts = await ctx.newPage(); await opts.goto(`chrome-extension://${extId}/options.html`); await opts.waitForTimeout(400);
await opts.locator('#mem-glossary').uncheck(); await opts.waitForTimeout(500);
await b.bringToFront(); await b.mouse.click(5, 5); await select(b, 'softmax');
R.memoWhenOff = await memo(b);
await opts.locator('#mem-glossary').check(); await opts.waitForTimeout(500);
// 5. library: the glossary, forget
await lib.bringToFront(); await lib.reload(); await lib.waitForTimeout(700);
await lib.locator('[data-glossary]').click(); await lib.waitForTimeout(300);
R.libTerms = await lib.locator('.edit.gl .i').allInnerTexts();
await lib.screenshot({ path: `${out}/03-library-glossary.png` });
await lib.locator('[data-del]').first().click(); await lib.waitForTimeout(500);
R.libTermsAfterForget = await lib.locator('.edit.gl').count();
// 6. return bookmark on the long page
const c = await open('long.html?read=1');
R.longEnough = await c.evaluate(() => document.documentElement.scrollHeight / innerHeight);
await c.waitForTimeout(20500);                                        // reading time before a position counts
await c.evaluate(() => [...document.querySelectorAll('h2')][1].scrollIntoView({ block: 'start' }));
await c.mouse.wheel(0, 50); await c.waitForTimeout(2500);
const key = 'inpage:http://127.0.0.1:8799/long.html?read=1';
R.readingSaved = (await setup.evaluate(k => chrome.storage.local.get('reading').then(v => v.reading?.[k]), key)) || null;
await setup.evaluate(k => chrome.storage.local.get('reading').then(v => { v.reading[k].ts -= 10 * 60000; return chrome.storage.local.set({ reading: v.reading }); }), key);   // as if you left 10 minutes ago
await c.evaluate(() => scrollTo(0, 0)); await c.reload({ waitUntil: 'domcontentloaded' }); await c.waitForTimeout(2500);
R.offer = await c.locator('.toast').innerText().catch(() => '');
await c.screenshot({ path: `${out}/04-return-offer.png` });
await c.locator('.toast button', { hasText: 'Pick up there' }).dispatchEvent('click').catch(() => {}); await c.waitForTimeout(900);
R.jumped = await c.evaluate(() => scrollY > 400);
// finishing the page forgets it (after the reading time)
await c.waitForTimeout(20500); await c.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await c.mouse.wheel(0, 100); await c.waitForTimeout(2500);
R.forgottenWhenFinished = !(await setup.evaluate(k => chrome.storage.local.get('reading').then(v => v.reading?.[k]), key));
const ok = R.saved?.def && /here, earlier/.test(R.memoHere) && /softmax/i.test(R.openedThread) && /softmax/i.test(R.memoOther) && /Softmax and cross-entropy/.test(R.memoOther)
  && !R.memoSentence && !R.memoUnknown && /Softmax/.test(R.libraryOpenedOn) && !R.memoWhenOff && R.libTerms.includes('softmax') && R.libTermsAfterForget === R.libTerms.length - 1
  && R.longEnough > 2.5 && R.readingSaved?.pct > 0.1 && /stopped about/.test(R.offer) && R.jumped && R.forgottenWhenFinished;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
