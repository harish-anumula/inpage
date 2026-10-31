// Lecture companion on a test lecture (3 slides: title, a formula, code; WebVTT captions), on a course-style page
// (HTML5 text track) and on a YouTube-style page (live caption segments under an overlay): the pill, pausing and
// resuming, answers that read the frame and the captions, jumping back from the thread, the keyboard shortcut,
// reload, and frames kept out of storage.
import { launch, C, D, drawerFrame } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/video'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, extId, setup } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const R = {};
const errors = [];
const at = async (page, s) => { await page.evaluate(s => { const v = document.querySelector('video'); v.currentTime = s; }, s); await page.waitForTimeout(500); };
const hoverVideo = async page => { const b = await page.evaluate(() => { const r = document.querySelector('video').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }); await page.mouse.move(b.x - 30, b.y); await page.waitForTimeout(200); await page.mouse.move(b.x, b.y); await page.waitForTimeout(300); };
// the next answer: wait for a request to start (a pending message), then for it to finish
const answer = async page => { const f = await drawerFrame(page); await f.waitForFunction(() => document.querySelector('.msg.pending'), null, { timeout: 15000, polling: 50 }).catch(() => {}); await f.waitForFunction(() => document.querySelector('.msg.ai[data-i], .msg.err') && !document.querySelector('.msg.pending'), null, { timeout: 120000, polling: 150 }); return D(page).locator('.msg.ai[data-i], .msg.err').last(); };

// ---------- 1. course-style page: the video's own caption track ----------
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:8799/lecture.html', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('inpage-root', { state: 'attached' });
// the test server can't serve byte ranges, so load the video as a blob to make it seekable
await page.evaluate(async () => { const v = document.querySelector('video'); const b = await (await fetch(v.currentSrc || v.src)).blob(); v.src = URL.createObjectURL(b); v.load(); });
await page.waitForFunction(() => document.querySelector('video').readyState >= 2 && document.querySelector('video').duration > 50, null, { timeout: 15000 });
await at(page, 31); await page.evaluate(() => document.querySelector('video').play());
await page.waitForTimeout(800);
await hoverVideo(page);
R.pill = await page.locator('.imgbtn').innerText().catch(() => '');
await page.screenshot({ path: `${out}/01-pill.png` });
// open, then cancel: the video resumes
await page.locator('.imgbtn').dispatchEvent('mousedown');
await C(page).locator('textarea').waitFor();
R.pausedWhileAsking = await page.evaluate(() => document.querySelector('video').paused);
R.composerQuote = await C(page).locator('.quote').innerText();
R.videoChips = await C(page).locator('.chip').allInnerTexts();
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/02-composer.png` });
await C(page).locator('textarea').press('Escape'); await page.waitForTimeout(400);
R.resumedAfterCancel = await page.evaluate(() => !document.querySelector('video').paused);
// ask about the formula slide
await page.evaluate(() => document.querySelector('video').pause()); await at(page, 33);
await hoverVideo(page);
await page.locator('.imgbtn').dispatchEvent('mousedown');
await C(page).locator('.chip', { hasText: "Explain what's on screen" }).dispatchEvent('click');
let m = await answer(page);
R.screenAnswer = (await m.locator('.body').innerText()).slice(0, 300);
R.readsFormula = /sqrt|√|d_k|softmax|QK|K\^?T/i.test(R.screenAnswer);
await m.locator('[data-a="details"]').dispatchEvent('click');
R.receipt = (await m.locator('.meta').innerText()).replace(/\s+/g, ' ').slice(0, 260);
R.insertHidden = !(await m.locator('[data-a="insert"]').count());
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/03-answer.png` });
// jump back from the thread
await at(page, 2);
await D(page).locator('.threadquote .ts').dispatchEvent('click'); await page.waitForTimeout(600);
R.jumpedTo = Math.round(await page.evaluate(() => document.querySelector('video').currentTime));
// follow-up on the same moment
await D(page).locator('.dfoot textarea').fill('And what did the speaker say just before this?');
await D(page).locator('.dfoot textarea').press('Enter');
await page.waitForTimeout(500);
m = await answer(page);
R.followUp = (await m.locator('.body').innerText()).slice(0, 240);
R.tsButtons = await D(page).locator('.msg.ai .ts').count();
// the code slide, through the keyboard shortcut (no selection)
await D(page).locator('[data-a="close"]').dispatchEvent('click');
await at(page, 50);
await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('lecture.html')); await chrome.tabs.sendMessage(t.id, { type: 'command', command: 'ask' }); });
await C(page).locator('textarea').waitFor();
await C(page).locator('.chip', { hasText: 'What did they just say?' }).dispatchEvent('click');
m = await answer(page);
const codeFull = await m.locator('.body').innerText();
R.codeAnswer = codeFull.slice(0, 300);
R.readsCode = /mask|tril|-inf|infinity|masked_fill/i.test(codeFull);
// reload: both threads come back, no "missing" warning, and no frames in storage
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
R.toastAfterReload = await page.locator('.toast').count();
const saved = await setup.evaluate(async () => { const all = await chrome.storage.local.get(null); const k = Object.keys(all).find(x => x.includes('lecture.html')); return all[k]; });
R.savedThreads = saved?.threads?.length; R.savedDataImages = JSON.stringify(saved).includes('data:image');
await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes('lecture.html')); await chrome.tabs.sendMessage(t.id, { type: 'open-drawer' }); });
await page.waitForTimeout(600);
R.notesAfterReload = await D(page).locator('.note').allInnerTexts();
await page.screenshot({ path: `${out}/04-after-reload.png` });

// ---------- 2. YouTube-style page: live caption segments only ----------
const yt = await ctx.newPage();
yt.on('pageerror', e => errors.push(e.message));
await yt.goto('http://127.0.0.1:8799/yt-like.html', { waitUntil: 'domcontentloaded' }); await yt.waitForSelector('inpage-root', { state: 'attached' });
await yt.waitForFunction(() => document.querySelector('video').readyState >= 2, null, { timeout: 15000 });
await yt.evaluate(() => { const v = document.querySelector('video'); v.playbackRate = 4; v.play(); });
await yt.waitForFunction(() => document.querySelector('video').currentTime > 30, null, { timeout: 30000 });
await yt.evaluate(() => document.querySelector('video').pause());
await hoverVideo(yt);
R.ytPill = await yt.locator('.imgbtn').count();
await yt.locator('.imgbtn').dispatchEvent('mousedown');
await C(yt).locator('textarea').fill('What did they just say about the scaling?');
await C(yt).locator('textarea').press('Enter');
m = await answer(yt);
R.ytAnswer = (await m.locator('.body').innerText()).slice(0, 260);
await m.locator('[data-a="details"]').dispatchEvent('click');
R.ytReceipt = (await m.locator('.meta').innerText()).replace(/\s+/g, ' ').slice(0, 200);
R.ytUsedCaptions = /captions from/i.test(R.ytReceipt);
await yt.screenshot({ path: `${out}/05-yt-like.png` });
R.errors = errors.slice(0, 5);
const ok = R.pill === 'Ask about this moment' && R.pausedWhileAsking && R.resumedAfterCancel && /▶ 0:3\d/.test(R.composerQuote) && R.videoChips.includes("Explain what's on screen")
  && R.readsFormula && /current frame/.test(R.receipt) && /captions from/.test(R.receipt) && R.insertHidden && R.jumpedTo === 33 && R.readsCode
  && R.toastAfterReload === 0 && R.savedThreads === 2 && !R.savedDataImages && R.notesAfterReload.length === 2 && R.ytUsedCaptions && !R.errors.length;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
