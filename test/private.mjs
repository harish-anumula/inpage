// What the reader types into a page (a form's text box, a comment or message editor) never reaches a prompt: the
// shipped src/core.js helpers on a page with a draft in a form. No extension, no key.
import { chromium } from 'playwright';
import { BROWSER } from './ext.mjs';
const b = await chromium.launch({ ...BROWSER, headless: true });
const p = await b.newPage();
await p.setContent(`<!doctype html><title>t</title><body><main>
<h2>Gradient descent</h2><p id="a">The update is \\(w \\leftarrow w - \\eta \\nabla L\\), a small step downhill.</p>
<form><h3 contenteditable="true">SECRET_HEADING</h3><div class="prose" contenteditable="true"><p id="d">SECRET_DRAFT in a reply box</p></div><textarea>SECRET_TEXTAREA</textarea></form>
<p id="z">After the form, the article goes on about learning rates.</p></main></body>`);
await p.evaluate(() => { window.chrome = { runtime: { sendMessage: async () => ({}), getURL: x => x, id: 'x', onMessage: { addListener() {} } } }; });
for (const f of ['lib/purify.min.js', 'lib/marked.min.js', 'lib/katex/katex.min.js', 'presets.js', 'prompts.js', 'src/render.js', 'src/core.js']) await p.addScriptTag({ path: `extension/${f}` });
const R = await p.evaluate(() => {
  const IP = window.__inpage, main = document.querySelector('main'), leak = s => /SECRET/.test(s);
  IP.renderMath(document.getElementById('a'), false);                     // real KaTeX, as on a page
  const rendered = !!document.querySelector('#a .katex');
  const r = document.createRange(); r.setStart(document.getElementById('a').firstChild, 0); r.setEnd(document.getElementById('z').firstChild, 9);
  const inside = document.createRange(); inside.selectNodeContents(document.getElementById('d'));
  return {
    textOf: !leak(IP.textOf(main)), blockHTML: !leak(IP.blockHTML(main)), heading: !leak(IP.headingFor(document.getElementById('z'))),
    acrossSelection: !leak(IP.rangeText(r)), keepsMaths: /\\eta/.test(IP.rangeText(r)), keepsText: /learning|After/.test(IP.rangeText(r)),
    ownSelectionInside: /SECRET_DRAFT/.test(IP.rangeText(inside)),       // selecting inside your own draft is your choice
    noMarksLeft: !document.querySelector('[data-inpage-private]'), rendered,
  };
});
await b.close();
const ok = Object.values(R).every(Boolean);
console.log(JSON.stringify({ ok, ...R }, null, 2));
process.exit(ok ? 0 : 1);
