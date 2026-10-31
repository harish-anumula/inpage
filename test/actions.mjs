// Custom actions: a pinned action runs from the toolbar, starters show as composer chips, actions are created,
// refined, renamed and deleted by chatting in the drawer (with Save / Discard), and Settings edits, exports and
// imports them, with open tabs picking up the change. Screenshots in test/out/actions/.
import { launch, C, D, drawerFrame, openDrawer } from './ext.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const out = path.resolve('test/out/actions'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const URL_ = 'http://127.0.0.1:8799/softmax.html';
await page.goto(URL_, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('inpage-root', { state: 'attached' });
const R = {};
const shot = n => page.screenshot({ path: `${out}/${n}.png` });
const select = async () => {
  await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.length > 120); p.scrollIntoView({ block: 'center' }); const t = [...p.childNodes].find(n => n.nodeType === 3 && n.data.trim().length > 10); const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(t.data.length, 30)); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom })); });
  await page.locator('.toolbar').waitFor({ timeout: 4000 });
};
const pinnedLabels = () => page.locator('.toolbar .pinned').allInnerTexts();
async function chat(text) {
  await D(page).locator('.dfoot textarea').fill(text);
  await D(page).locator('.dfoot textarea').press('Enter');
  const before = await D(page).locator('.card.proposal, .msg.ai[data-i], .msg.err').count();
  await (await drawerFrame(page)).waitForFunction(n => document.querySelectorAll('.card.proposal, .msg.ai[data-i], .msg.err').length > n && !document.querySelector('.msg.pending'), before, { timeout: 60000, polling: 100 });
}
const lastCard = () => D(page).locator('.card.proposal').last();

// 1. the pinned starter runs from the toolbar with one click
await select();
R.pinned = await pinnedLabels();
await page.waitForTimeout(200); await shot('01-toolbar-pinned');
await page.locator('.toolbar .pinned').first().dispatchEvent('mousedown');
await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
R.threadShowsLabel = (await D(page).locator('.msg.user .body').first().innerText()) === 'Explain like Karpathy';
R.karpathyAnswer = (await D(page).locator('.msg.ai[data-i] .body').first().innerText()).slice(0, 160);
await page.waitForTimeout(300); await shot('02-karpathy-answer');
await D(page).locator('[data-a="close"]').dispatchEvent('click');

// 2. composer chips: starters plus "+ New action"
await select();
await page.locator('.toolbar button', { hasText: 'Ask' }).dispatchEvent('mousedown');
await C(page).locator('.chip').first().waitFor();
R.askChips = await C(page).locator('.chip').allInnerTexts();
await page.waitForTimeout(300); await shot('03-composer-chips');
await C(page).locator('.chip.add').dispatchEvent('click');
await page.locator('iframe.dframe.open').waitFor();
R.draftPrefilled = await D(page).locator('.dfoot textarea').inputValue();

// 3. create by chatting, refine before saving, then save
await chat('Make an action that turns the selection into 3 flashcards (question and answer), and pin it to the toolbar');
R.created = { summary: await lastCard().locator('.ch').innerText(), rows: await lastCard().locator('.act').allInnerTexts() };
await page.waitForTimeout(300); await shot('04-proposal');
await chat('Call it just "Flashcards"');
R.refined = { cards: await D(page).locator('.card.proposal').count(), firstReplaced: (await D(page).locator('.card.proposal').first().innerText()).includes('Replaced'), label: await lastCard().locator('.act b').first().innerText() };
await lastCard().locator('[data-a="actions-save"]').dispatchEvent('click');
await page.waitForTimeout(500); await shot('05-saved');
await D(page).locator('[data-a="close"]').dispatchEvent('click');
await select();
R.pinnedAfterCreate = await pinnedLabels();
await page.keyboard.press('Escape');

// 4. rename and delete by chatting
await openDrawer(setup, 'softmax.html'); await D(page).locator('.dfoot textarea').waitFor();
await chat('Rename the Shorter rewrite action to Tighten');
R.rename = await lastCard().locator('.act').allInnerTexts();
await lastCard().locator('[data-a="actions-save"]').dispatchEvent('click');
await chat('Delete the Critique this claim action');
R.del = await lastCard().locator('.act').allInnerTexts();
await page.waitForTimeout(300); await shot('06-delete-proposal');
await lastCard().locator('[data-a="actions-save"]').dispatchEvent('click');
await page.waitForTimeout(400);
await D(page).locator('[data-a="close"]').dispatchEvent('click');
await select();
await page.locator('.toolbar button', { hasText: 'Rewrite' }).dispatchEvent('mousedown');
await C(page).locator('.chip').first().waitFor();
R.rewriteChips = await C(page).locator('.chip').allInnerTexts();
await C(page).locator('[data-m="ask"]').dispatchEvent('click'); await page.waitForTimeout(150);
R.askChipsAfterDelete = await C(page).locator('.chip').allInnerTexts();
await page.keyboard.press('Escape');

// 5. Settings: list, a fourth pin is refused, export, import; the open page picks up the import
const opts = await ctx.newPage(); await opts.setViewportSize({ width: 900, height: 1000 });
await opts.goto(`chrome-extension://${extId}/options.html#actions`); await opts.waitForTimeout(600);
R.settingsRows = await opts.locator('.act').count();   // the defaults (the earlier chat changes added one and removed one)
await opts.screenshot({ path: `${out}/07-settings.png`, fullPage: true });
const unpinned = opts.locator('.act:has([data-k="pin"]:not(:checked)) [data-k="pin"]');
while (await opts.locator('[data-k="pin"]:checked').count() < 3) { await unpinned.nth(0).check(); await opts.waitForTimeout(150); }
await unpinned.nth(0).click();                                                          // a fourth is refused
await opts.waitForTimeout(600);
R.pinsAfterTrying = await opts.locator('[data-k="pin"]:checked').count();
R.pinRefusal = await opts.locator('#astatus').innerText();
const [dl] = await Promise.all([opts.waitForEvent('download'), opts.locator('#export').click()]);
const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
R.exported = { kind: exported.kind, count: exported.actions.length };
const file = path.join(os.tmpdir(), 'inpage-import.json');
fs.writeFileSync(file, JSON.stringify({ actions: [{ on: 'ask', label: 'ELI5', prompt: 'Explain this like I am five.', pin: true }, { on: 'page', label: 'Five-question quiz', prompt: 'Give me a five-question quiz on this page, answers at the end.' }, { on: 'bogus', label: 'x', prompt: 'y' }] }));
opts.once('dialog', d => d.accept());
await opts.locator('#import-file').setInputFiles(file);
await opts.waitForTimeout(800);
R.settingsRowsAfterImport = await opts.locator('.act').count();
await page.bringToFront(); await page.waitForTimeout(600);
for (let i = 0; i < 10 && !(R.pinnedAfterImport || []).includes('ELI5'); i++) {      // the toolbar redraws on the next selection
  await page.mouse.click(5, 5); await page.waitForTimeout(150);
  await select(); R.pinnedAfterImport = await pinnedLabels();
}
await page.keyboard.press('Escape');
await openDrawer(setup, 'softmax.html'); await page.waitForTimeout(500);
R.pageChipsAfterImport = await D(page).locator('.dchips .chip, .empty .chip').allInnerTexts();
// 6. reset brings the defaults back
opts.once('dialog', d => d.accept());
await opts.locator('#reset').click(); await opts.waitForTimeout(800);
R.settingsRowsAfterReset = await opts.locator('.act').count();

const ok = R.pinned.includes('Explain like Karpathy') && R.threadShowsLabel && R.askChips.includes('Turn into code') && R.askChips.includes('+ New action')
  && R.draftPrefilled.startsWith('Make an action') && R.refined.firstReplaced && /flashcards/i.test(R.refined.label) && R.pinnedAfterCreate.some(l => /flashcards/i.test(l))
  && R.rewriteChips.includes('Tighten') && !R.rewriteChips.includes('Shorter') && !R.askChipsAfterDelete.includes('Critique this claim')
  && R.pinsAfterTrying === 3 && R.exported.count > 10 && R.settingsRowsAfterImport === 2 && R.pinnedAfterImport.includes('ELI5')
  && R.pageChipsAfterImport.includes('Five-question quiz') && R.settingsRowsAfterReset === R.settingsRows;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
