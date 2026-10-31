// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Ask: a thread pinned to the selected text (or an image), shown in the side drawer. Answers stream in
// (Markdown + KaTeX); follow-ups keep context; any answer can be copied or inserted into the page.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  const hl = { all: new Highlight(), active: new Highlight() };
  CSS.highlights.set('inpage-thread', hl.all);
  CSS.highlights.set('inpage-thread-active', hl.active);
  let active = null, pins = [];

  function contextFor(range, image) {
    if (image) {
      const fig = image.closest('figure, .ltx_figure, .thumb') || image.parentElement;
      const caption = IP.textOf(fig?.querySelector('figcaption, .ltx_caption, .thumbcaption'));
      const near = IP.blockOf(fig) || fig;
      return `The reader is asking about the attached image.\n${IP.untrusted('page context', `Page title: ${document.title}\nSection: ${IP.headingFor(near)}\nAlt text: ${image.alt || '(none)'}\nCaption: ${caption || '(none)'}\nText before: ${IP.nearText(near, -1)}\nText after: ${IP.nearText(near, 1)}`)}`;
    }
    const b = IP.blockOf(range.commonAncestorContainer) || IP.blockOf(range.startContainer);
    const passage = b ? IP.textOf(b).slice(0, 3000) : '';
    return `${IP.untrusted('page context', `Page title: ${document.title}\nSection: ${IP.headingFor(b)}\n\nPassage:\n${passage}`)}\n\nThe reader selected:\n${IP.untrusted('page selection', IP.rangeText(range))}`;
  }
  function imageOf(t) { const n = t.range?.startContainer?.childNodes?.[t.range.startOffset]; return t.quote.image && n?.tagName === 'IMG' ? n : null; }

  function start(range, question, { think, web, image, shown } = {}) {
    const t = image
      ? { id: IP.uid(), quote: { exact: image.alt || 'Image', prefix: '', suffix: '', image: image.currentSrc || image.src }, messages: [], range: range.cloneRange(), ts: Date.now() }
      : { id: IP.uid(), quote: IP.quoteFor(range), messages: [], range: range.cloneRange(), ts: Date.now() };
    IP.state.threads.push(t);
    if (image) image.setAttribute('data-inpage-image-thread', ''); else hl.all.add(t.range);
    open(t);
    send(t, question, think, web, shown);
    IP.page?.checkPage();
  }

  // The answer starts at once. Jev decides in parallel (~0.4 s) whether the question needs careful reasoning or
  // the web; if so, and only the first sentence or so has arrived, the request restarts with those on.
  // A thread about a moment in a video: its context (captions, the frame) comes from video.js.
  function startVideo(v, question, { think, web, shown } = {}) {
    const t = { id: IP.uid(), quote: { exact: `▶ ${IP.mmss(v.t)} · ${v.title}`, prefix: '', suffix: '', video: { t: v.t, url: v.url } }, messages: [], range: null, ts: Date.now(), video: v };
    IP.state.threads.push(t);
    open(t);
    send(t, question, think, web, shown);
    IP.page?.checkPage();
  }

  function send(t, text, think, web = IP.prefs.web, shown) {
    const first = !t.messages.length;
    const img = imageOf(t), vid = first && t.video;
    t.messages.push({
      role: 'user', shown: shown || text,
      content: vid ? `${vid.context}\n\nQuestion: ${text}` : first && t.range ? `${contextFor(t.range, img)}\n\nQuestion: ${text}` : text,
      images: vid ? (vid.image ? [vid.image] : []) : first ? (img ? [img.currentSrc || img.src] : t.range ? IP.imagesFor(t.range.commonAncestorContainer) : []) : undefined,
      ...(first && img ? { needImage: true } : {}),                     // a question about this image is pointless without it
    });
    t.pending = { text: '', model: '' };
    render(t, { toLast: true });
    const parts = vid ? vid.parts : first ? (img ? ['the image', 'its caption and alt text', 'the page title and section', 'the text around it'] : ['the page title and section', 'the paragraph', 'your selection']) : [`this thread (${t.messages.length} messages)`];
    const go = (thinkOn, webOn) => {
      const attempt = t.attempt = (t.attempt || 0) + 1, mine = () => t.attempt === attempt && t.pending;
      const job = { system: t.quote.video ? INPAGE_PROMPTS.video : INPAGE_PROMPTS.ask, messages: t.messages.map(m => ({ role: m.role, content: m.content, images: m.images, needImage: m.needImage })), think: thinkOn, web: webOn };
      const call = IP.callModel(job, {
        onModel: label => { if (mine()) { t.pending.model = label; renderPending(t, true); } },
        onDelta: full => { if (mine()) { t.pending.text = full; renderPending(t); } },
      });
      t.cancel = call.cancel;
      call.promise.then(res => {
        if (!mine()) return;
        t.messages.push({ role: 'assistant', content: res.text, sources: res.sources?.length ? res.sources : undefined, meta: IP.metaFor(job, res, parts) });
        if (first) IP.memory?.remember(t, res.text);
        done();
      }).catch(e => {
        if (!mine()) return;
        t.messages.push({ role: 'assistant', content: e.code === 'cancel' ? 'Stopped.' : e.message, error: true, code: e.code });
        done();
      });
      return attempt;
    };
    const done = () => { t.pending = null; t.cancel = null; IP.save(); render(t, { toLast: true }); drawPins(); IP.page?.refreshIfHome(); };
    think = !!think; web = !!web;
    const started = go(think, web);
    if (think && web) return;
    IP.jev({ page_title: document.title, selected_text: IP.selectionText(t).slice(0, 600), reader_question: text }, ['depth', 'source']).then(j => {
      const thinkOn = think || IP.sure(j?.depth, 'careful'), webOn = web || IP.sure(j?.source, 'web');
      if ((thinkOn === think && webOn === web) || t.attempt !== started || !t.pending || t.pending.text.length > 240) return;
      const stale = t.cancel;
      t.pending.model = ''; t.pending.text = '';
      go(thinkOn, webOn);
      stale?.();
    });
  }

  // ---------- the thread view in the drawer (drawn by ui/frame.js from this data) ----------
  const pendingOf = t => ({ text: t.pending.text, label: t.pending.model ? `Asking ${t.pending.model}` : 'Thinking', stop: true });
  function viewOf(t, { scroll, focus }) {
    const nQ = t.messages.filter(m => m.role === 'user').length;
    return {
      kind: 'thread', key: `thread:${t.id}`, title: `Thread · ${nQ} question${nQ === 1 ? '' : 's'}`, back: true, del: true,
      quote: { text: t.quote.exact, image: t.quote.image || null, video: t.quote.video ? IP.mmss(t.quote.video.t) : null },
      messages: t.messages.map(m => m.role === 'user' ? { role: 'user', text: m.shown || m.content } : m.error ? { role: 'err', text: m.content, code: m.code } : { role: 'ai', text: m.content, sources: m.sources, meta: m.meta }),
      pending: t.pending ? pendingOf(t) : null,
      placeholder: t.pending ? 'Answering…' : 'Ask a follow-up…', disabled: !!t.pending, scroll, focus, warning: IP.page?.warning() || '',
    };
  }

  function open(t, { focus = true } = {}) {
    active = t;
    IP.page?.leaveHome();
    hl.active.clear();
    if (t.range && !t.quote.image) hl.active.add(t.range);
    render(t, { toLast: false, focus });
    drawPins();
    if (t.range) {
      const r = t.range.getBoundingClientRect();
      const node = t.range.startContainer.nodeType === 1 ? (t.range.startContainer.childNodes[t.range.startOffset] || t.range.startContainer) : t.range.startContainer.parentElement;
      if (r.top < 60 || r.bottom > innerHeight - 60) node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // A new answer is read from its start, not its end ("last" scrolls to the newest message's top).
  function render(t, { toLast, focus, scroll } = {}) {
    if (active !== t) return;
    ui.drawerView(viewOf(t, { scroll: scroll || (toLast ? 'last' : 'top'), focus }), m => {
      if (m.a === 'send' && typeof m.text === 'string' && m.text.trim() && !t.pending) send(t, m.text.trim().slice(0, 4000), !!m.think);
      if (m.a === 'del') remove(t);
      if (m.a === 'stop') t.cancel?.();
      if (m.a === 'insert') insert(t, t.messages[m.i]);
      if (m.a === 'settings') chrome.runtime.sendMessage({ type: 'open-options' });
      if (m.a === 'seek' && t.quote.video) IP.video.seek(Number.isFinite(m.s) ? m.s : t.quote.video.t);
      if (m.a === 'sent') ui.drawerSent(m.i, IP.sent.get(t.messages[m.i]?.meta?.sentId));
    });
  }

  let lastPending = 0;
  function renderPending(t, force) {
    if (active !== t) return;
    const now = performance.now();
    if (!force && t.pending.text && now - lastPending < 80) return;
    lastPending = now;
    ui.drawerPending(`thread:${t.id}`, pendingOf(t));
  }

  function insert(t, m) {
    if (m?.role !== 'assistant' || m.error) return;
    if (t.quote.video) return ui.toast('Video answers stay in the thread; copy them instead.');
    const block = t.range && IP.blockOf(t.range.commonAncestorContainer);
    if (!block) return ui.toast('The original paragraph is not on the page any more.');
    IP.edit.insertAfter(block, IP.markdown(m.content).replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g, '<p><strong>$1</strong></p>').replace(/\$\$([\s\S]+?)\$\$/g, '\\[$1\\]').replace(/\$([^$\n]+?)\$/g, '\\($1\\)'), `From a thread: ${t.messages.find(x => x.role === 'user')?.shown || ''}`);
    ui.toast('Added to the page, below the paragraph.');
  }

  function remove(t) {
    t.cancel?.();
    IP.state.threads = IP.state.threads.filter(x => x !== t);
    if (t.range) hl.all.delete(t.range);
    imageOf(t)?.removeAttribute('data-inpage-image-thread');
    clearActive(); IP.save(); drawPins(); IP.page?.show();
  }
  function clearActive() { active = null; hl.active.clear(); drawPins(); }

  // ---------- pins in the margin ----------
  function drawPins() {
    pins.forEach(p => p.remove()); pins = [];
    const vw = document.documentElement.clientWidth;
    IP.state.threads.forEach((t, i) => {
      if (!t.range) return;
      const rects = t.range.getClientRects(); if (!rects.length) return;
      const r = ui.doc(rects[0]);
      const p = ui.el('div', `pin${active === t ? ' active' : ''}`, String(i + 1));
      if (t.quote.image) { p.style.top = `${r.top + 10}px`; p.style.left = `${r.right - 34}px`; }
      else {
        const block = IP.blockOf(t.range.commonAncestorContainer);
        const colRight = block ? ui.doc(block.getBoundingClientRect()).right : r.right;
        p.style.top = `${r.top + (r.height - 22) / 2}px`;
        p.style.left = `${Math.min(colRight + 14, scrollX + vw - 30)}px`;
      }
      p.title = `Your question about “${t.quote.exact.slice(0, 100)}”`;          // the question itself stays in the panel, out of the page
      p.setAttribute('role', 'button'); p.setAttribute('aria-label', `Open thread ${i + 1}`);
      p.onclick = e => { if (IP.real(e)) open(t); };
      ui.layer.appendChild(p); pins.push(p);
    });
  }

  // ---------- anchoring: saved threads find their text (or image) again ----------
  function anchor(t) {
    if (t.quote.image) {
      const img = [...document.images].find(i => (i.currentSrc || i.src) === t.quote.image) || [...document.images].find(i => t.quote.exact !== 'Image' && i.alt === t.quote.exact);
      if (!img) return null;
      img.setAttribute('data-inpage-image-thread', '');
      const r = document.createRange(); r.selectNode(img); return r;
    }
    const r = IP.rangeFor(t.quote);
    if (r) return r;
    for (const rec of IP.state.edits) {                 // its text was rewritten: attach to the rewritten block
      if (rec.kind !== 'rewrite') continue;
      const orig = IP.norm(IP.fragment(rec.originalHTML || '').textContent);
      if (!orig.includes(IP.norm(t.quote.exact))) continue;
      const first = IP.edit.nodes(rec.id)[0];
      if (!first) continue;
      const rr = document.createRange(); rr.selectNodeContents(first);
      return rr;
    }
    return null;
  }
  function restore(saved) {
    let missing = 0;
    for (const s of saved || []) {
      const t = { ...s };
      t.range = t.quote.video ? null : anchor(t);
      if (!t.range && !t.quote.video) missing++;
      IP.state.threads.push(t);
      if (t.range && !t.quote.image) hl.all.add(t.range);
    }
    drawPins();
    return missing;
  }
  function reanchor() {
    hl.all.clear();
    for (const t of IP.state.threads) {
      if (t.quote.video) continue;
      if (!t.range || !t.range.startContainer.isConnected || t.range.collapsed) t.range = anchor(t);
      if (t.range && !t.quote.image) hl.all.add(t.range);
    }
    if (active?.range && !active.quote.image) { hl.active.clear(); hl.active.add(active.range); }
  }

  IP.threads = { start, startVideo, open, drawPins, restore, reanchor, clearActive, remove, get active() { return active; },
    rerender: () => { if (active && IP.drawerOpen) render(active, { scroll: 'keep' }); },
    focus: id => { const t = IP.state.threads.find(x => x.id === id); if (t) open(t); } };
})();
