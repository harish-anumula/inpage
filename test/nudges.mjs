// Quiet suggestions: coming back to a paragraph a third time shows "Stuck? Explain this" by it (click opens the
// composer on that paragraph); the budget stops a second one soon after; rewinding the same part of a lecture twice
// shows "Recap a–b" (click explains that stretch); the Settings switch turns them off.
import { launch, C, D, drawerFrame } from './ext.mjs';
import fs from 'node:fs'; import path from 'node:path';
const out = path.resolve('test/out/nudges'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const { ctx, extId } = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const R = {};
const open = async u => { const p = await ctx.newPage(); await p.goto(`http://127.0.0.1:8799/${u}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('inpage-root', { state: 'attached' }); await p.waitForTimeout(3000); return p; };
// look at a paragraph, go further down, come back up to it after a while: twice
async function reread(p, text, times = 2) {
  const center = () => p.evaluate(t => [...document.querySelectorAll('p')].find(x => x.textContent.includes(t)).scrollIntoView({ block: 'center' }), text);
  await center(); await p.waitForTimeout(1200);
  for (let i = 0; i < times; i++) {
    await p.evaluate(() => scrollBy(0, innerHeight * 1.6)); await p.waitForTimeout(6600);
    await center(); await p.waitForTimeout(800);
  }
  await p.waitForTimeout(4600);                                   // stay on it
}
const p = await open('long.html');
await reread(p, 'Each decoder step scores');
R.chip = await p.locator('.nudge').innerText().catch(() => '');
R.chipNearParagraph = await p.evaluate(() => { const c = document.querySelector('inpage-root').shadowRoot.querySelector('.nudge'); const para = [...document.querySelectorAll('p')].find(x => x.textContent.includes('Each decoder step')); if (!c) return false; const a = c.getBoundingClientRect(), b = para.getBoundingClientRect(); return Math.abs(a.top - b.top) < 40 && (a.right <= b.left || a.left >= b.right); });
await p.screenshot({ path: `${out}/01-stuck.png` });
await p.locator('.nudge').dispatchEvent('mousedown');
await C(p).locator('textarea').waitFor();
R.composerQuote = await C(p).locator('.quote').innerText();
await C(p).locator('textarea').press('Escape');
// a second one right after: held back by the budget
await reread(p, 'The weights are learned end to end');
R.secondChip = await p.locator('.nudge').count();
// just scrolling down once: nothing
const q = await open('long.html?plain=1');
await q.evaluate(() => scrollBy(0, innerHeight * 2)); await q.waitForTimeout(5000);
R.chipWithoutRereading = await q.locator('.nudge').count();
// video: rewind the same part twice
const v = await open('lecture.html');
await v.evaluate(async () => { const el = document.querySelector('video'); const b = await (await fetch(el.currentSrc || el.src)).blob(); el.src = URL.createObjectURL(b); el.load(); });
await v.waitForFunction(() => document.querySelector('video').duration > 50, null, { timeout: 15000 });
const playTo = async s => { await v.evaluate(s => { const el = document.querySelector('video'); el.playbackRate = 4; el.play(); return new Promise(r => { const f = () => { if (el.currentTime >= s) { el.removeEventListener('timeupdate', f); r(); } }; el.addEventListener('timeupdate', f); }); }, s); };
await v.evaluate(() => { document.querySelector('video').currentTime = 18; });
await playTo(31); await v.evaluate(() => { document.querySelector('video').currentTime = 21; }); await v.waitForTimeout(400);
R.pillAfterOneRewind = await v.locator('.imgbtn').innerText().catch(() => '');
await playTo(33); await v.evaluate(() => { document.querySelector('video').currentTime = 22; }); await v.waitForTimeout(500);
await v.evaluate(() => document.querySelector('video').pause());
R.recapPill = await v.locator('.imgbtn').innerText().catch(() => '');
await v.screenshot({ path: `${out}/02-recap.png` });
if (R.recapPill) {
  await v.locator('.imgbtn').dispatchEvent('mousedown');
  const f = await drawerFrame(v); await f.waitForFunction(() => document.querySelector('.msg.ai[data-i], .msg.err') && !document.querySelector('.msg.pending'), null, { timeout: 120000, polling: 150 });
  R.recapQuestion = await D(v).locator('.msg.user .body').first().innerText();
  const full = await D(v).locator('.msg.ai[data-i] .body').first().innerText();
  R.recapAnswer = full.slice(0, 220); R.recapCoversIt = /scal|square root|softmax/i.test(full);
  await v.screenshot({ path: `${out}/03-recap-answer.png` });
}
// off switch
const opts = await ctx.newPage(); await opts.goto(`chrome-extension://${extId}/options.html`); await opts.waitForTimeout(400);
await opts.locator('#mem-nudges').uncheck(); await opts.waitForTimeout(600);
const w = await open('long.html?off=1');
await reread(w, 'Each decoder step scores');
R.chipWhenOff = await w.locator('.nudge').count();
const ok = /Stuck\? Explain this/.test(R.chip) && R.chipNearParagraph && /Each decoder step/.test(R.composerQuote) && R.secondChip === 0 && R.chipWithoutRereading === 0
  && !R.pillAfterOneRewind.startsWith('Recap') && /^Recap 0:2\d–0:3\d$/.test(R.recapPill) && /^Recap/.test(R.recapQuestion || '') && R.recapCoversIt && R.chipWhenOff === 0;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
