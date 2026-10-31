// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Page helpers: model calls, page text and math, blocks, text anchors, storage (rendering is in render.js).
// Every content-script file adds to the one namespace below (content scripts share an isolated world).
const IP = (window.__inpage = window.__inpage || {});

IP.norm = s => (s || '').replace(/\s+/g, ' ').trim();
IP.uid = () => Math.random().toString(36).slice(2, 10);
IP.pageKey = () => 'inpage:' + location.origin + location.pathname + location.search;
IP.siteKey = () => location.hostname;

// ---------- model calls (streamed through the background worker; cancel = disconnect) ----------
IP.callModel = (job, { onDelta, onModel } = {}) => {
  let port, settled = false, rejectFn;
  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    port = chrome.runtime.connect({ name: 'inpage-run' });
    let text = '';
    port.onMessage.addListener(m => {
      if (m.type === 'model') onModel?.(m.label);
      if (m.type === 'delta') { text += m.text; onDelta?.(text, m.text); }
      if (m.type === 'done') { settled = true; resolve({ text: m.text || text, ms: m.ms, sources: m.sources || [], usage: m.usage, model: m.model }); port.disconnect(); }
      if (m.type === 'error') { settled = true; const e = new Error(m.message); e.code = m.code; reject(e); port.disconnect(); }
    });
    port.onDisconnect.addListener(() => { if (!settled) { settled = true; const e = new Error('Cancelled'); e.code = 'cancel'; reject(e); } });
    port.postMessage(job);
  });
  return { promise, cancel: () => { if (settled) return; settled = true; port?.disconnect(); rejectFn(Object.assign(new Error('Cancelled'), { code: 'cancel' })); } };
};

// ---------- Jev: fast typed judgments (~0.4 s) for routing; null when off or failing, so callers keep their usual path ----------
IP.jev = (state, ids) => chrome.runtime.sendMessage({ type: 'jev', state, ids }).catch(() => null);
IP.sure = (a, option, min = 0.7) => !!a && a.choice === option && (a.p?.[option] ?? 0) >= min;

// What a call sent and what it cost, for the "Details" line under an answer: the parts of the page (with their
// sizes), images, web search, the model, tokens and the exact charge.
// The exact text sent is kept for this visit only (IP.sent), so saved notes don't fill up with copies of pages.
IP.sent = new Map();
IP.metaFor = (job, res, parts) => {
  const sentId = IP.uid();
  IP.sent.set(sentId, `${job.messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n')}`.slice(0, 60000));
  return { model: res.model || '', cost: res.usage?.cost ?? null, input: res.usage?.input ?? null, output: res.usage?.output ?? null, ms: res.ms,
    web: !!job.web, images: job.messages.reduce((n, m) => n + (m.images?.length || 0), 0), parts: parts || [], sentId };
};

// ---------- settings the UI reads synchronously (kept in sync with storage) ----------
IP.prefs = { web: false };
// Content scripts can't read extension storage (the API key lives there); they go through the service worker.
IP.store = {
  get: keys => chrome.runtime.sendMessage({ type: 'store-get', keys }),
  set: items => chrome.runtime.sendMessage({ type: 'store-set', items }),
};
IP.store.get(['webSearch']).then(v => { IP.prefs.web = !!v?.webSearch; });
IP.setWeb = on => { IP.prefs.web = on; IP.store.set({ webSearch: on }); };

// ---------- actions: one-click prompts (presets.js); the worker tells us when the list changes ----------
IP.actions = INPAGE_cleanActions(INPAGE_DEFAULT_ACTIONS);
IP.loadActions = () => IP.store.get(['actions']).then(v => { IP.actions = INPAGE_cleanActions(v?.actions) || INPAGE_cleanActions(INPAGE_DEFAULT_ACTIONS); }).catch(() => {});
IP.loadActions();
IP.actionsFor = on => IP.actions.filter(a => a.on === on && !a.hidden);
IP.chipsFor = on => IP.actionsFor(on).map(a => ({ label: a.label, prompt: a.prompt, ...(a.out ? { out: a.out } : {}) }));

// ---------- theme: match the page (dark pages get the dark UI) ----------
IP.pageIsDark = () => {
  for (const e of [document.body, document.documentElement]) {
    if (!e) continue;
    const c = getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
    if (!c || (c.length === 4 && +c[3] === 0)) continue;
    const [r, g, b] = c.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches && getComputedStyle(document.documentElement).colorScheme.includes('dark');
};

// ---------- math: page math -> LaTeX for prompts (render.js turns LaTeX back into KaTeX) ----------
const MATH_SEL = '.katex-display, .katex, .mwe-math-element, mjx-container, .MathJax, math';
function texOf(node) {
  const ann = node.querySelector?.('annotation[encoding="application/x-tex"]');
  if (ann) return ann.textContent;
  const m = node.matches?.('math[alttext]') ? node : node.querySelector?.('math[alttext]');
  if (m) return m.getAttribute('alttext');
  const img = node.querySelector?.('img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display');
  return img ? img.getAttribute('alt') : null;
}
IP.mathToTex = root => {
  for (const m of [...root.querySelectorAll(MATH_SEL)]) {
    if (!root.contains(m) || m.parentElement?.closest(MATH_SEL)) continue;
    const tex = texOf(m);
    const display = m.matches('.katex-display, .mwe-math-element-block, [display="block"]') || !!m.querySelector?.('math[display="block"]');
    const text = tex ? tex.replace(/^\s*\{\\displaystyle\s*/, '').replace(/\}\s*$/, '').trim() : IP.norm(m.textContent);
    m.replaceWith(document.createTextNode(display ? `\\[${text}\\]` : `\\(${text}\\)`));
  }
  return root;
};
IP.stripFences = s => s.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

// ---------- blocks: what a rewrite replaces ----------
const BLOCK_TAGS = new Set(['P', 'LI', 'UL', 'OL', 'DL', 'BLOCKQUOTE', 'PRE', 'TABLE', 'FIGURE', 'SECTION', 'ARTICLE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DD', 'DT', 'TD', 'TH']);
IP.blockOf = node => {
  let e = node?.nodeType === 1 ? node : node?.parentElement;
  while (e && e !== document.body && e !== document.documentElement) {
    if (e.hasAttribute?.('data-inpage-edit')) return e;                       // a node we wrote counts as its own block
    if (BLOCK_TAGS.has(e.tagName) && getComputedStyle(e).display !== 'inline' && !e.closest(MATH_SEL)) return e;
    e = e.parentElement;
  }
  return null;
};
IP.blockForRange = range => {
  const a = IP.blockOf(range.startContainer), b = IP.blockOf(range.endContainer);
  if (a && a === b) return a;
  const common = IP.blockOf(range.commonAncestorContainer);
  return common && common.textContent.length <= 6000 ? common : a || common;
};
IP.describeLook = e => {
  const cs = getComputedStyle(e);
  return `<${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? ` class="${e.className}"` : ''}>; font ${cs.fontFamily.split(',')[0]} ${cs.fontSize}/${cs.lineHeight}, colour ${cs.color}`;
};
// What the reader types into the page (form fields, comment and message boxes) never goes to the model, on any path:
// every piece of page text sent is read through IP.textOf, and blocks inside such fields are skipped.
IP.PRIVATE = 'textarea, input, select, [role="textbox"], form [contenteditable]:not([contenteditable="false"])';
IP.isPrivate = n => !!(n?.nodeType === 1 ? n : n?.parentElement)?.closest(IP.PRIVATE);
// A copy of e without the private fields inside it. Each field is judged in the page, not in the copy, because the form
// that makes an editable box private may sit outside e. With mark, fields are only marked (data-inpage-private).
const FIELD_LIKE = 'textarea, input, select, [role="textbox"], [contenteditable]';
IP.cleanClone = (e, mark) => {
  const c = e.cloneNode(true);
  if (e.nodeType !== 1) return c;
  const orig = e.querySelectorAll('*'), copy = c.querySelectorAll('*');
  for (let i = 0; i < orig.length; i++) if (orig[i].matches(FIELD_LIKE) && IP.isPrivate(orig[i])) { if (mark) copy[i].setAttribute('data-inpage-private', ''); else copy[i].remove(); }
  return c;
};
IP.textOf = e => (!e || IP.isPrivate(e) ? '' : IP.norm(IP.mathToTex(IP.cleanClone(e)).textContent));
IP.nearText = (e, dir) => {
  let s = e, out = '';
  while (out.length < 500 && (s = dir < 0 ? s.previousElementSibling : s.nextElementSibling)) {
    const t = IP.textOf(s);
    out = dir < 0 ? `${t} ${out}` : `${out} ${t}`;
  }
  return dir < 0 ? out.trim().slice(-500) : out.trim().slice(0, 500);
};
IP.blockHTML = e => {
  return [e].map(n => {
    if (n.nodeType !== 1) return n.textContent;
    if (IP.isPrivate(n)) return '';
    const c = IP.mathToTex(IP.cleanClone(n));
    c.querySelectorAll('script, style, noscript, svg, button').forEach(x => x.remove());
    c.querySelectorAll('img').forEach(img => { if (img.src) img.setAttribute('src', img.src); });   // absolute, so the model can keep it
    for (const x of [c, ...c.querySelectorAll('*')]) for (const a of [...x.attributes]) if (!['class', 'href', 'alt', 'src', 'width', 'height', 'colspan', 'rowspan', 'start', 'type'].includes(a.name)) x.removeAttribute(a.name);
    return c.outerHTML;
  }).join('').slice(0, 14000);
};
IP.headingFor = b => {
  for (let e = b; e && e !== document.body; e = e.parentElement) {
    for (let s = e.previousElementSibling; s; s = s.previousElementSibling) {
      if (/^H[1-4]$/.test(s.tagName) && !IP.isPrivate(s)) return IP.textOf(s);
      const h = [...(s.querySelectorAll?.('h1,h2,h3,h4') || [])].find(x => !IP.isPrivate(x));
      if (h) return IP.textOf(h);
    }
  }
  return IP.textOf([...document.querySelectorAll('h1')].find(x => !IP.isPrivate(x)));
};
// Images that belong with a block or selection: inside it, or the figure it sits in.
IP.imagesFor = node => {
  const e = node?.nodeType === 1 ? node : node?.parentElement;
  const scope = e?.closest('figure, .ltx_figure, .thumb, .gallery') || e;
  return [...(scope?.querySelectorAll?.('img') || [])].filter(i => i.currentSrc || i.src).filter(i => i.naturalWidth >= 60 || i.width >= 60).map(i => i.currentSrc || i.src).slice(0, 2);
};
// Readable text for labels: formulas become "(math)" so a cut-off label never shows half a LaTeX string.
IP.labelText = el => { const c = el.cloneNode(true); for (const m of [...c.querySelectorAll(MATH_SEL)]) if (c.contains(m)) m.replaceWith(document.createTextNode(' (math) ')); return IP.norm(c.textContent).replace(/\\[([][\s\S]*?\\[)\]]/g, '(math)'); };
// A selection made inside one private field is the reader's own choice and is sent as is; a selection that only
// spans past fields leaves them out. The fields are marked for the moment of copying, so the copy can drop them.
IP.rangeText = range => {
  const fields = IP.isPrivate(range.commonAncestorContainer) ? [] : [...document.querySelectorAll(FIELD_LIKE)].filter(f => IP.isPrivate(f) && range.intersectsNode(f));
  fields.forEach(f => f.setAttribute('data-inpage-private', ''));
  const d = document.createElement('div');
  try { d.appendChild(range.cloneContents()); } finally { fields.forEach(f => f.removeAttribute('data-inpage-private')); }
  d.querySelectorAll('[data-inpage-private]').forEach(x => x.remove());
  return IP.norm(IP.mathToTex(d).textContent);
};
// The text of a thread's selection as it may be sent (raw quotes stay local, for finding the passage again).
IP.selectionText = t => (t.range ? IP.rangeText(t.range) : t.quote.exact);

// ---------- text anchors: exact text plus a little before and after (as Hypothesis does) ----------
function textIndex() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest('script, style, noscript, inpage-root, [data-inpage-hidden]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = []; let text = '', n;
  while ((n = walker.nextNode())) { nodes.push({ node: n, start: text.length }); text += n.data; }
  return { text, nodes };
}
IP.quoteFor = range => {
  const { text, nodes } = textIndex();
  const pos = (node, off) => { const h = nodes.find(x => x.node === node); return h ? h.start + off : -1; };
  const s = pos(range.startContainer, range.startOffset), e = pos(range.endContainer, range.endOffset);
  if (s < 0 || e < 0) return { exact: range.toString(), prefix: '', suffix: '' };
  return { exact: text.slice(s, e), prefix: text.slice(Math.max(0, s - 32), s), suffix: text.slice(e, e + 32) };
};
IP.rangeFor = q => {
  if (!q?.exact) return null;
  const { text, nodes } = textIndex();
  let best = -1, bestScore = -1;
  for (let i = text.indexOf(q.exact); i >= 0; i = text.indexOf(q.exact, i + 1)) {
    const score = (text.slice(Math.max(0, i - q.prefix.length), i) === q.prefix ? 2 : 0) + (text.slice(i + q.exact.length, i + q.exact.length + q.suffix.length) === q.suffix ? 1 : 0);
    if (score > bestScore) { best = i; bestScore = score; }
  }
  if (best < 0) return null;
  const at = off => { let k = nodes.length - 1; while (k > 0 && nodes[k].start > off) k--; return [nodes[k].node, Math.min(off - nodes[k].start, nodes[k].node.length)]; };
  const r = document.createRange();
  r.setStart(...at(best)); r.setEnd(...at(best + q.exact.length));
  return r;
};

// Find a quote inside an element (case- and whitespace-insensitive, curly quotes and dashes folded), as a Range;
// unless strict, falls back to its first 60 characters. Used to check citations and to anchor fact-check claims.
IP.rangeIn = (block, quote, { strict = false, authorOnly = false } = {}) => {
  if (!block || !quote) return null;
  const skip = `script, style, noscript, textarea, inpage-root, [data-inpage-hidden], .katex-mathml${authorOnly ? ', [data-inpage-edit]' : ''}`;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  }), nodes = []; let text = '', n;
  while ((n = walker.nextNode())) { nodes.push({ n, start: text.length }); text += n.data; }
  const fold = c => ({ '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u00A0': ' ' }[c] || c);
  const norm = s => [...s].map(fold).join('').replace(/\s+/g, ' ').trim().toLowerCase();
  const flat = [], map = [];                                  // normalised text and its offsets in `text`
  for (let i = 0; i < text.length; i++) { const c = /\s/.test(text[i]) ? ' ' : fold(text[i]).toLowerCase(); if (c === ' ' && flat.at(-1) === ' ') continue; flat.push(c); map.push(i); }
  const hay = flat.join(''), q = norm(quote);
  let at = hay.indexOf(q), len = q.length;
  if (at < 0 && !strict) { const head = q.slice(0, 60); at = hay.indexOf(head); len = head.length; }
  if (at < 0) return null;
  const pos = off => { let k = nodes.length - 1; while (k > 0 && nodes[k].start > off) k--; return [nodes[k].n, Math.min(off - nodes[k].start, nodes[k].n.length)]; };
  const r = document.createRange();
  r.setStart(...pos(map[at])); r.setEnd(...pos(map[at + len - 1] + 1));
  return r;
};

// Scroll a range into view and flash it.
IP.flashRange = r => {
  const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  CSS.highlights.set('inpage-check-focus', new Highlight(r));
  clearTimeout(IP.flashRange.t); IP.flashRange.t = setTimeout(() => CSS.highlights.delete('inpage-check-focus'), 1800);
};

// ---------- storage, one record per URL ----------
IP.state = { edits: [], threads: [], chat: [], batches: [], checks: [] };
IP.save = () => {
  const { edits, threads, chat, batches, checks } = IP.state;
  // Video frame captures (data: images) stay out of storage; follow-ups after a reload go without the frame.
  const keep = m => m.images?.some(i => i.startsWith('data:')) ? { ...m, images: m.images.filter(i => !i.startsWith('data:')) } : m;
  const data = { edits: edits.map(({ showingOriginal, ...e }) => e), threads: threads.map(t => ({ id: t.id, quote: t.quote, ts: t.ts, messages: t.messages.map(keep) })), chat, batches, checks: checks.map(({ cancelled, ...c }) => c) };
  return IP.store.set({ [IP.pageKey()]: { ...data, title: document.title, updated: Date.now() } });
};
IP.load = async () => INPAGE_cleanRecord((await IP.store.get([IP.pageKey()]))?.[IP.pageKey()]);

// Page content goes to the model between random markers, as data; anything that imitates a marker is removed.
IP.untrusted = (label, text) => {
  const nonce = Math.random().toString(36).slice(2, 10);
  const clean = String(text || '').replace(/<<<\/?page[^<>]{0,40}>>>/gi, '').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  return `<<<${label} ${nonce}>>>\n${clean}\n<<</${label} ${nonce}>>>`;
};
