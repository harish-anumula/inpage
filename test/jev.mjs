// Jev routing: page questions skip the planner, changes still get a plan, web search and careful reasoning switch
// on when a request needs them, and a page with text aimed at AI gets a warning. Same requests with Jev off as a baseline.
import { launch, D, drawerFrame, openDrawer } from './ext.mjs';
const { ctx, setup } = await launch({ viewport: { width: 1440, height: 900 } });
const R = {};
const firstText = async page => {
  const t = Date.now();
  await (await drawerFrame(page)).waitForFunction(() => { const b = document.querySelector('.msg.pending .body'); return b && !b.querySelector('.typing') && b.textContent.trim().length > 20; }, null, { timeout: 90000, polling: 30 });
  return Date.now() - t;
};
// the pending message's status line, once it has moved past "Reading the page"
const label = async page => (await drawerFrame(page)).waitForFunction(() => { const w = document.querySelector('.msg.pending .waiting'); return w && !/Reading the page/.test(w.textContent) && w.textContent.trim(); }, null, { timeout: 8000, polling: 50 }).then(h => h.jsonValue()).catch(() => '(none)');
async function pageAsk(page, text) {
  await D(page).locator('textarea').fill(text);
  await D(page).locator('textarea').press('Enter');
}
async function freshPage(url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('inpage-root', { state: 'attached' });
  await openDrawer(setup, new URL(url).pathname.split('/').pop()); await D(page).locator('textarea').waitFor();
  return page;
}
const local = 'http://127.0.0.1:8799/softmax.html';

// 1. a page question, Jev on vs off: time to the first words of the answer
for (const on of [true, false, true, false]) {
  await setup.evaluate(v => chrome.storage.local.set({ jev: v }), on);
  const page = await freshPage(local);
  await pageAsk(page, 'What is the main idea of this page?');
  (R[on ? 'questionFirstTextJevOn' : 'questionFirstTextJevOff'] ||= []).push(await firstText(page));
  await page.close();
}
await setup.evaluate(() => chrome.storage.local.set({ jev: true }));

// 2. a change still goes through the planner and edits the page
{
  const page = await freshPage(local);
  await pageAsk(page, 'Add a one-line takeaway under every heading');
  await D(page).locator('.card').waitFor({ timeout: 60000 });
  R.changeMadeCard = true;
  await page.close();
}
// 3. a page question that needs the web, with the Web toggle off
{
  const page = await freshPage(local);
  await pageAsk(page, 'What are newer alternatives to softmax attention published in the last year?');
  R.webLabel = await label(page);
  await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 120000 });
  R.webSources = await D(page).locator('.msg.ai[data-i] .sources a').count();
  await page.close();
}
// 4. an Ask thread that needs careful reasoning restarts with thinking on before any text arrives
{
  const page = await ctx.newPage();
  await page.goto(local, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('inpage-root', { state: 'attached' });
  await page.locator('p').nth(2).click({ modifiers: ['Alt'] });
  const cf = page.frameLocator('iframe.cframe');
  await cf.locator('[data-m="ask"]').dispatchEvent('click');
  await cf.locator('textarea').fill('Derive this gradient from scratch, step by step, and prove it');
  await cf.locator('textarea').press('Enter');
  await page.waitForTimeout(1500);
  R.carefulLabel = await label(page);
  await D(page).locator('.msg.ai[data-i]').first().waitFor({ timeout: 120000 });
  await page.close();
}
// 5. the injection page gets a warning; with Jev off it doesn't
for (const on of [true, false]) {
  await setup.evaluate(v => chrome.storage.local.set({ jev: v }), on);
  const page = await freshPage('http://127.0.0.1:8799/injection.html');
  await pageAsk(page, 'Summarize this page');
  await D(page).locator('.msg.ai[data-i], .msg.err').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  R[on ? 'injectionWarned' : 'injectionWarnedJevOff'] = await D(page).locator('.warn').count() > 0;
  if (on) await page.screenshot({ path: 'test/out/jev-warning.png' });
  await page.close();
}
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
R.summary = { jevOnMs: avg(R.questionFirstTextJevOn), jevOffMs: avg(R.questionFirstTextJevOff) };
const ok = R.changeMadeCard && /web/i.test(R.webLabel) && /think/i.test(R.carefulLabel) && R.injectionWarned && !R.injectionWarnedJevOff && R.summary.jevOnMs < R.summary.jevOffMs;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
