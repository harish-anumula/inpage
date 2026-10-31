// Notes library: real notes on two pages (a thread, a rewrite, a page question), then the library lists them,
// searches, renders answers with maths, exports Markdown (one page and everything), backs up to JSON,
// deletes a page and restores it from the backup. The drawer's "All notes" link opens it on the current page.
import { launch, C, D, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/library'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const R = {};
// --- make some notes ---
const a = await ctx.newPage();
await a.goto('http://127.0.0.1:8799/softmax.html', { waitUntil: 'domcontentloaded' }); await a.waitForSelector('inpage-root', { state: 'attached' });
await a.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /cross-entropy loss/.test(x.textContent)); const t = p.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 21); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); });
await a.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(a).locator('textarea').fill('Why is the gradient p_i minus 1 for the correct class? Show the derivation with maths.');
await C(a).locator('textarea').press('Enter');
await D(a).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
await D(a).locator('[data-a="close"]').dispatchEvent('click');
await a.locator('p').first().click({ modifiers: ['Alt'] });
await C(a).locator('textarea').fill('Simpler, one sentence');
await C(a).locator('textarea').press('Enter');
await a.waitForFunction(() => document.querySelector('[data-inpage-edit]') && !document.querySelector('inpage-root').shadowRoot.querySelector('.status'), null, { timeout: 90000, polling: 200 });
const b = await ctx.newPage();
await b.goto('http://127.0.0.1:8799/injection.html', { waitUntil: 'domcontentloaded' }); await b.waitForSelector('inpage-root', { state: 'attached' });
await openDrawer(setup, 'injection.html');
await D(b).locator('.dfoot textarea').fill('What is this page about, in two sentences?');
await D(b).locator('.dfoot textarea').press('Enter');
await D(b).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
// the drawer link opens the library on this page
const [lib] = await Promise.all([ctx.waitForEvent('page'), D(b).locator('[data-a="library"]').first().dispatchEvent('click')]);
await lib.waitForLoadState(); await lib.waitForTimeout(800);
R.openedOn = new URL(lib.url()).searchParams.get('page');
R.selectedTitle = await lib.locator('.dh h2').innerText();
await lib.setViewportSize({ width: 1360, height: 860 });
await lib.locator('.item').filter({ hasText: 'Softmax' }).click(); await lib.waitForTimeout(400);
R.pages = await lib.locator('.item[data-key]').count();
R.katexInAnswers = await lib.locator('.a .katex').count();
R.sections = await lib.locator('h3').allInnerTexts();
await lib.screenshot({ path: `${out}/01-library.png` });
// search
await lib.locator('#q').fill('gradient'); await lib.waitForTimeout(200);
R.searchHits = await lib.locator('.item').count(); R.searchSnippet = await lib.locator('.item .hit').first().innerText().catch(() => '');
await lib.screenshot({ path: `${out}/02-search.png` });
await lib.locator('#q').fill('');
// one page as Markdown
await lib.locator('.item').filter({ hasText: 'Softmax' }).click();
const [d1] = await Promise.all([lib.waitForEvent('download'), lib.locator('[data-a="md"]').click()]);
const md = fs.readFileSync(await d1.path(), 'utf8'); fs.writeFileSync(`${out}/page.md`, md);
R.pageMd = { name: d1.suggestedFilename(), frontMatter: md.startsWith('---\ntitle:'), source: /source: http:\/\/127\.0\.0\.1:8799\/softmax\.html/.test(md), hasQuote: /^> /m.test(md), hasMath: /\$[^$]+\$/.test(md), hasRewrite: /\*\*Rewrote\*\*/.test(md) };
// everything as Markdown, and a JSON backup
await lib.locator('#exportBtn').click();
const [d2] = await Promise.all([lib.waitForEvent('download'), lib.locator('[data-x="md"]').click()]);
const allMd = fs.readFileSync(await d2.path(), 'utf8'); fs.writeFileSync(`${out}/all.md`, allMd);
R.allMd = { pages: (allMd.match(/^## (?!Glossary)/gm) || []).length };
await lib.locator('#exportBtn').click();
const [d3] = await Promise.all([lib.waitForEvent('download'), lib.locator('[data-x="json"]').click()]);
const backupPath = path.join(out, 'backup.json'); fs.copyFileSync(await d3.path(), backupPath);
R.backupPages = Object.keys(JSON.parse(fs.readFileSync(backupPath, 'utf8')).pages).length;
// delete a page, then restore it
lib.once('dialog', d => d.accept());
await lib.locator('.item').filter({ hasText: 'Softmax' }).click();
await lib.locator('[data-a="del"]').click(); await lib.waitForTimeout(600);
R.afterDelete = await lib.locator('.item[data-key]').count();
lib.once('dialog', d => d.accept());
await lib.locator('#exportBtn').click();
await lib.locator('#restoreFile').setInputFiles(backupPath);
await lib.waitForTimeout(900);
R.afterRestore = await lib.locator('.item[data-key]').count();
R.glossaryFromFragment = await lib.locator('[data-glossary]').count();   // "With the correct clas" is a fragment, not a term
// narrow window
await lib.setViewportSize({ width: 420, height: 860 }); await lib.waitForTimeout(300);
R.narrowOverflow = await lib.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
await lib.screenshot({ path: `${out}/03-narrow.png` });
const ok = R.openedOn?.includes('injection.html') && R.pages === 2 && R.katexInAnswers > 0 && R.searchHits >= 1 && Object.values(R.pageMd).every(v => v === true || typeof v === 'string')
  && R.allMd.pages === 2 && R.backupPages === 2 && R.afterDelete === 1 && R.afterRestore === 2 && R.glossaryFromFragment === 0 && !R.narrowOverflow;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
