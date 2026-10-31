// UI isolation, on the shipped extension (closed shadow root): the page can't see the toolbar or reach the
// composer and drawer frames, doesn't receive the keys typed into them, and can't load the frame page itself.
import { launch, frameOf, openDrawer } from './ext.mjs';
const { ctx, extId, setup } = await launch({ shipped: true });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8799/softmax.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('inpage-root', { state: 'attached' });
// a spy in the page's own world: records every key event and every message it can see
await page.evaluate(() => {
  window.__keys = []; window.__msgs = [];
  for (const t of ['keydown', 'keypress', 'keyup', 'input', 'beforeinput']) addEventListener(t, e => window.__keys.push(`${t}:${e.key || e.data || ''}`), true);
  addEventListener('message', e => window.__msgs.push(String(e.data).slice(0, 80)), true);
});
const R = {};
R.shadowRootVisible = await page.evaluate(() => document.querySelector('inpage-root').shadowRoot !== null);
// Rewrite composer via Alt-click, type into it
await page.locator('p').nth(1).click({ modifiers: ['Alt'] });
const cf = await frameOf(page, 'composer');
await cf.locator('textarea').waitFor();
await page.waitForTimeout(300);
await page.keyboard.type('secret question 42');
R.typedInComposer = await cf.locator('textarea').inputValue();
R.pageSawKeys = await page.evaluate(() => window.__keys.filter(k => !k.startsWith('keydown:Alt') && !k.startsWith('keyup:Alt')));
R.pageCanReadFrame = await page.evaluate(() => { try { return !!window.frames[0].document.body.innerText; } catch { return false; } });
R.pageSeesQuestionInDOM = await page.evaluate(() => document.documentElement.outerHTML.includes('secret question'));
await page.keyboard.press('Escape');
// Drawer with a page question: the answer stays out of the page DOM
await openDrawer(setup, '127.0.0.1:8799');
const df = await frameOf(page, 'drawer');
await df.locator('textarea').waitFor();
await df.locator('textarea').fill('What is the gradient of the loss? Answer with the word ZEBRA first.');
await df.locator('textarea').press('Enter');
await df.locator('.msg.ai[data-i]').first().waitFor({ timeout: 90000 });
R.answerStart = (await df.locator('.msg.ai[data-i] .body').first().innerText()).slice(0, 60);
R.pageSeesAnswer = await page.evaluate(() => /ZEBRA/.test(document.documentElement.outerHTML) || /ZEBRA/.test(document.body.innerText));
R.pageSawMessages = await page.evaluate(() => window.__msgs);
// closed UI leaves no frames behind (other extensions, e.g. Claude in Chrome, can't attach to a tab that holds one)
const ours = () => page.frames().filter(f => f.url().includes('/ui/frame.html')).length;
R.framesWhileOpen = ours();
await df.locator('textarea').press('Escape'); await page.waitForTimeout(800);
R.framesAfterClose = ours();
// fingerprinting: the static extension address doesn't load from a page
R.staticURLBlocked = await page.evaluate(async id => { try { await fetch(`chrome-extension://${id}/ui/frame.html`); return false; } catch { return true; } }, extId);
const ok = !R.shadowRootVisible && R.typedInComposer === 'secret question 42' && !R.pageSawKeys.length && !R.pageCanReadFrame && !R.pageSeesQuestionInDOM && !R.pageSeesAnswer && !R.pageSawMessages.length && R.staticURLBlocked && R.framesWhileOpen >= 1 && R.framesAfterClose === 0;
console.log(JSON.stringify({ ok, ...R }, null, 2));
await ctx.close();
process.exit(ok ? 0 : 1);
