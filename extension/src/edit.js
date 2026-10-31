// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Rewrite in place: the block streams into a live preview, then is sanitised, math-rendered and saved.
// The new nodes go straight into the page (no wrapper element), each marked data-inpage-edit="<id>",
// so site CSS that targets direct children (".prose > p") still applies. A comment node marks where a group starts.
// Edited blocks get a thin gutter mark; hovering shows Again / Original / Undo.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  const originals = new Map();                 // edit id -> the page's original node (this visit)
  const markers = new Map();                   // edit id -> comment node where the group starts
  const nodes = id => [...document.querySelectorAll(`[data-inpage-edit="${id}"]`)];
  const rectOf = id => {
    let t = Infinity, l = Infinity, b = -Infinity, r = -Infinity;
    for (const n of nodes(id)) { const x = n.getBoundingClientRect(); if (!x.width && !x.height) continue; t = Math.min(t, x.top); l = Math.min(l, x.left); b = Math.max(b, x.bottom); r = Math.max(r, x.right); }
    return t === Infinity ? null : new DOMRect(l, t, r - l, b - t);
  };
  const groupOf = el => el?.closest?.('[data-inpage-edit]')?.getAttribute('data-inpage-edit') || null;

  // Put html into the page as the group's nodes (replacing whatever the group had).
  function setGroup(id, html, srcs, kind, rawNodes) {
    const marker = markers.get(id); if (!marker?.isConnected) return [];
    nodes(id).forEach(n => n.remove());
    const frag = rawNodes ? (() => { const f = document.createDocumentFragment(); f.append(...rawNodes); return f; })() : IP.fragment(IP.clean(html, srcs));
    for (const n of [...frag.childNodes]) {                 // stray top-level text becomes a paragraph; whitespace goes
      if (n.nodeType === 3) { if (n.data.trim()) { const p = document.createElement('p'); n.replaceWith(p); p.append(n); } else n.remove(); }
      else if (n.nodeType !== 1) n.remove();
    }
    const els = [...frag.children];
    for (const e of els) { e.setAttribute('data-inpage-edit', id); if (kind === 'insert') e.setAttribute('data-inpage-kind', kind); }
    marker.after(frag);
    if (!rawNodes) els.forEach(e => IP.renderMath(e, false));
    return els;
  }
  function newMarker(id, place) { const m = document.createComment(`inpage ${id}`); place(m); markers.set(id, m); return m; }
  function dropGroup(id) { nodes(id).forEach(n => n.remove()); markers.get(id)?.remove(); markers.delete(id); }

  function promptFor(els, instruction, range, existing) {
    const first = els[0], last = els[els.length - 1];
    const whole = IP.norm(els.map(e => e.textContent).join(' '));
    const part = range ? IP.rangeText(range) : '';
    const focus = part && part.length < whole.length * 0.8 ? `\nThe reader selected this part (focus the change there, but return the whole block):\n${part}\n` : '';
    return `Page title: ${IP.untrusted('page title', document.title)}
Section: ${IP.untrusted('page section', IP.headingFor(first))}
Look of the block: ${existing ? 'same as the original block' : IP.describeLook(first)}

Text before:
${IP.untrusted('page text', IP.nearText(first, -1))}

Block HTML:
${IP.untrusted('page block', els.map(e => IP.blockHTML(e)).join('\n').slice(0, 14000))}
${focus ? IP.untrusted('page selection', focus) : ''}
Text after:
${IP.untrusted('page text', IP.nearText(last, 1))}

Reader's instruction: ${instruction}`;
  }
  const srcsIn = els => els.flatMap(n => [...(n.tagName === 'IMG' ? [n] : n.querySelectorAll?.('img') || [])].map(i => i.src)).filter(Boolean);

  // Returns a promise for the edit id (rejects on error or cancel), so page-level batches can track each change.
  function run({ block, instruction, label, think, web = IP.prefs.web, range, rec, batch }) {
    const existing = !!rec;
    const els = existing ? nodes(rec.id) : [block];
    if (!els.length || !els[0]) return Promise.reject(new Error('Nothing to rewrite here.'));
    const id = existing ? rec.id : IP.uid();
    const before = existing ? rec.html : null;
    const srcs = existing ? rec.srcs || [] : srcsIn(els);
    const images = IP.imagesFor(els[0]);
    let lastPaint = 0, started = false;
    const getRect = () => rectOf(id) || els[0].getBoundingClientRect();
    const cleanup = () => {
      if (existing) setGroup(id, before, srcs);
      else { dropGroup(id); block.removeAttribute('data-inpage-hidden'); }
      draw();
    };
    const begin = () => {
      if (started) return; started = true;
      if (!existing) { newMarker(id, m => block.before(m)); block.setAttribute('data-inpage-hidden', ''); }
    };
    const call = IP.callModel({ system: INPAGE_PROMPTS.edit, messages: [{ role: 'user', content: promptFor(els, instruction, range, existing), images }], think, web }, {
      onModel: label => st.model(label),
      onDelta: text => {
        if (!started) { begin(); st.streaming(); }
        const now = performance.now();
        if (now - lastPaint > 90) { lastPaint = now; setGroup(id, IP.stripFences(text), srcs); st.place(); }
      },
    });
    const st = ui.status(getRect, { onCancel: () => call.cancel() });
    return call.promise.then(({ text, sources }) => {
      const html = IP.clean(IP.stripFences(text), srcs);
      if (!IP.norm(IP.fragment(html).textContent)) throw Object.assign(new Error('The model returned nothing usable. Try again.'), { code: 'empty' });
      begin();
      const made = setGroup(id, html, srcs);
      if (existing) { rec.html = html; rec.instructions.push(label || instruction); rec.ts = Date.now(); delete rec.showingOriginal; if (sources?.length) rec.sources = sources; }
      else {
        block.removeAttribute('data-inpage-hidden');
        originals.set(id, block);
        block.remove();
        IP.state.edits.push({ id, kind: 'rewrite', srcs, tag: block.tagName, originalText: IP.norm(block.textContent).slice(0, 300), originalHTML: block.outerHTML.slice(0, 80000), html, instructions: [label || instruction], ts: Date.now(), ...(sources?.length ? { sources } : {}), ...(batch ? { batch } : {}) });
      }
      st.done();
      flash(made);
      IP.save(); draw(); IP.page?.refreshIfHome();
      return id;
    }).catch(e => {
      cleanup();
      if (e.code === 'cancel') { st.done(); throw e; }
      const retry = () => run({ block, instruction, label, think, web, range, rec, batch });
      st.error(e.message, e.code === 'key' || batch ? null : retry, e.code === 'key' ? { label: 'Open settings', run: () => chrome.runtime.sendMessage({ type: 'open-options' }) } : null);
      throw e;
    });
  }

  // A new block written after an existing one (page-level "add a question after each section").
  function generateAfter({ anchor, instruction, think, web = IP.prefs.web, batch }) {
    const after = groupOf(anchor) ? nodes(groupOf(anchor)).at(-1) : anchor;
    const id = IP.uid();
    let started = false, lastPaint = 0;
    const user = `Page title: ${IP.untrusted('page title', document.title)}
Section: ${IP.untrusted('page section', IP.headingFor(after))}

Text before:
${IP.untrusted('page text', IP.nearText(after, -1))}

The block the new one goes after:
${IP.untrusted('page block', IP.blockHTML(after))}

Text after:
${IP.untrusted('page text', IP.nearText(after, 1))}

Reader's instruction: ${instruction}`;
    const begin = () => { if (started) return; started = true; newMarker(id, m => after.after(m)); };
    const call = IP.callModel({ system: INPAGE_PROMPTS.insert, messages: [{ role: 'user', content: user }], think, web }, {
      onModel: label => st.model(label),
      onDelta: text => { begin(); st.streaming(); const now = performance.now(); if (now - lastPaint > 90) { lastPaint = now; setGroup(id, IP.stripFences(text), [], 'insert'); st.place(); } },
    });
    const st = ui.status(() => rectOf(id) || after.getBoundingClientRect(), { onCancel: () => call.cancel(), label: 'Adding' });
    return call.promise.then(({ text, sources }) => {
      const html = IP.clean(IP.stripFences(text));
      if (!IP.norm(IP.fragment(html).textContent)) throw Object.assign(new Error('The model returned nothing usable.'), { code: 'empty' });
      begin();
      const made = setGroup(id, html, [], 'insert');
      const base = groupOf(anchor) && IP.state.edits.find(x => x.id === groupOf(anchor));
      IP.state.edits.push({ id, kind: 'insert', tag: base ? base.tag : after.tagName, anchorText: base ? base.originalText || base.anchorText : IP.norm(after.textContent).slice(0, 300), html, instructions: [instruction], ts: Date.now(), ...(sources?.length ? { sources } : {}), ...(batch ? { batch } : {}) });
      st.done(); flash(made); IP.save(); draw(); IP.page?.refreshIfHome();
      return id;
    }).catch(e => { dropGroup(id); st.done(); throw e; });
  }

  function flash(els) {
    for (const c of els) { c.classList.remove('inpage-flash'); void c.offsetWidth; c.classList.add('inpage-flash'); }
  }

  // ---------- inserted blocks (an answer placed into the page below its paragraph) ----------
  function insertAfter(anchorEl, html, meta) {
    const id = IP.uid();
    const anchorGroup = groupOf(anchorEl);
    const after = anchorGroup ? nodes(anchorGroup).at(-1) : anchorEl;           // below the whole edited group
    newMarker(id, m => after.after(m));
    const made = setGroup(id, html, [], 'insert');
    const base = anchorGroup ? (IP.state.edits.find(x => x.id === anchorGroup) || {}) : null;
    IP.state.edits.push({ id, kind: 'insert', tag: base ? base.tag : anchorEl.tagName, anchorText: base ? base.originalText || base.anchorText : IP.norm(anchorEl.textContent).slice(0, 300), html, instructions: [meta || 'Inserted from a thread'], ts: Date.now() });
    flash(made); IP.save(); draw(); IP.page?.refreshIfHome();
    made[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function undo(id) {
    const rec = IP.state.edits.find(x => x.id === id);
    if (rec && rec.kind === 'rewrite') {
      const m = markers.get(id);
      if (m?.isConnected) m.after(originals.get(id) || IP.fragment(IP.clean(rec.originalHTML, rec.srcs, { original: true })));
    }
    dropGroup(id);
    IP.state.edits = IP.state.edits.filter(x => x.id !== id);
    originals.delete(id);
    IP.save(); draw(); IP.page?.refreshIfHome();
  }

  function toggleOriginal(rec, btn) {
    if (rec.showingOriginal) { setGroup(rec.id, rec.html, rec.srcs); delete rec.showingOriginal; }
    else {
      const o = originals.get(rec.id);
      const copy = o ? [o.cloneNode(true)] : [...IP.fragment(IP.clean(rec.originalHTML, rec.srcs, { original: true })).childNodes];
      setGroup(rec.id, null, null, null, copy);
      rec.showingOriginal = true;
    }
    btn?.setAttribute('aria-pressed', String(!!rec.showingOriginal));
    draw();
  }

  // ---------- gutter marks and the hover bar ----------
  let gutters = [], bar = null, barFor = null, hideTimer = 0;
  function draw() {
    gutters.forEach(g => g.remove()); gutters = [];
    for (const rec of IP.state.edits) {
      const r = rectOf(rec.id);
      if (!r) continue;
      const d = ui.doc(r);
      const g = ui.el('div', 'gutter');
      Object.assign(g.style, { top: `${d.top}px`, left: `${d.left - 14}px`, height: `${d.height}px` });
      g.dataset.id = rec.id;
      g.title = rec.instructions.at(-1);
      g.addEventListener('mouseenter', () => showBar(rec));
      ui.layer.appendChild(g); gutters.push(g);
      if (barFor === rec.id) g.classList.add('hot');
    }
    if (bar && barFor) placeBar();
  }

  // Is a viewport rectangle empty page background (not text, images or the site's own panels)?
  function emptyAt(x, y, w, h, groupId) {
    const vw = document.documentElement.clientWidth;
    if (x < 4 || x + w > vw - 4 || y < 0) return false;
    const first = nodes(groupId)[0];
    const layoutOnly = e => {
      if (!e || e === document.body || e === document.documentElement || (first && e.contains(first))) return true;
      if (/^(IMG|VIDEO|CANVAS|SVG|PICTURE|IFRAME|INPUT|BUTTON|SELECT|TEXTAREA|A|LABEL|LI|P|H[1-6]|CODE|PRE|TD|TH|SPAN|STRONG|EM)$/i.test(e.tagName)) return false;
      if ([...e.childNodes].some(n => n.nodeType === 3 && n.data.trim())) return false;            // has its own text
      const r = e.getBoundingClientRect();
      return r.width > 320 || r.height > 320;                                                     // a big container
    };
    for (const [px, py] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + w / 2, y + h / 2], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) {
      const top = document.elementsFromPoint(px, py).find(e => e !== ui.host && !ui.host.contains(e));
      if (!layoutOnly(top)) return false;
    }
    return true;
  }
  function placeBar() {
    const r = rectOf(barFor);
    if (!r) return hideBar();
    // Try, in order: the right margin, the left margin (both as a small column), then a row above the block.
    bar.classList.add('side');
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const spots = [[r.right + 46, r.top], [r.left - 26 - w, r.top]];   // right of the pin lane, else the left margin
    const free = spots.find(([x, y]) => emptyAt(x, Math.max(0, y), w, h, barFor));
    if (free) { bar.style.left = `${free[0] + scrollX}px`; bar.style.top = `${free[1] + scrollY}px`; return; }
    bar.classList.remove('side');
    const d = ui.doc(r), w2 = bar.offsetWidth;
    bar.style.top = `${Math.max(scrollY + 4, d.top - bar.offsetHeight - 6)}px`;
    bar.style.left = `${ui.clampX(d.right - w2, w2)}px`;
  }
  function showBar(rec) {
    clearTimeout(hideTimer); hideTimer = 0;
    if (barFor === rec.id && bar) return;
    bar?.remove();
    barFor = rec.id;
    const isInsert = rec.kind !== 'rewrite';
    bar = ui.el('div', 'editbar', `<span>${ui.icon.spark}${isInsert ? 'Added' : 'Rewritten'}</span><button data-a="again">Again</button>${isInsert ? '' : `<button data-a="orig" aria-pressed="${!!rec.showingOriginal}">Original</button>`}<button data-a="undo">${isInsert ? 'Remove' : 'Undo'}</button>${rec.sources?.length ? `<div class="sources">${rec.sources.map(s => `<a href="${IP.escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer" title="${IP.escapeHTML(s.title || s.url)}">${IP.escapeHTML(IP.host(s.url))}</a>`).join('')}</div>` : ''}`);
    bar.title = `“${rec.instructions.join('” → “')}”`;
    bar.addEventListener('mouseenter', () => { clearTimeout(hideTimer); hideTimer = 0; });
    bar.addEventListener('mouseleave', () => { hideTimer = setTimeout(hideBar, 350); });
    bar.addEventListener('click', ev => {
      if (!IP.real(ev)) return;
      const a = ev.target.closest('button')?.dataset.a;
      if (a === 'undo') { hideBar(); undo(rec.id); }
      if (a === 'orig') toggleOriginal(rec, ev.target.closest('button'));
      if (a === 'again') {
        hideBar();
        if (rec.showingOriginal) toggleOriginal(rec);
        const r = rectOf(rec.id); if (!r) return;
        ui.openComposer({ mode: 'edit', rect: r, quote: rec.instructions.at(-1), onSubmit: (_m, text, o) => run({ instruction: text, think: o.think, web: o.web, rec }).catch(() => {}) });
      }
    });
    ui.layer.appendChild(bar);
    placeBar();
    gutters.forEach(g => g.classList.toggle('hot', g.dataset.id === rec.id));
  }
  function hideBar() { clearTimeout(hideTimer); hideTimer = 0; bar?.remove(); bar = null; barFor = null; gutters.forEach(g => g.classList.remove('hot')); }

  // Hovering an edited block shows its bar; moving towards the bar keeps it.
  let lastMove = 0;
  document.addEventListener('mousemove', e => {
    const now = performance.now(); if (now - lastMove < 60 || !IP.state.edits.length) return; lastMove = now;
    if (ui.contains(e)) return;
    for (const rec of IP.state.edits) {
      const r = rectOf(rec.id);
      if (r && e.clientX >= r.left - 18 && e.clientX <= r.right + 8 && e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4) return showBar(rec);
    }
    if (bar) {
      const b = bar.getBoundingClientRect(), r = rectOf(barFor);
      if (r) {                                              // the corridor between the block and its bar
        const x0 = Math.min(b.left, r.left) - 10, x1 = Math.max(b.right, r.right) + 10, y0 = Math.min(b.top, r.top) - 10, y1 = Math.max(b.bottom, r.top + 40);
        if (e.clientX >= x0 && e.clientX <= x1 && e.clientY >= y0 && e.clientY <= y1) return;
      }
      if (!hideTimer) hideTimer = setTimeout(() => { hideTimer = 0; hideBar(); }, 350);
    }
  }, { passive: true });

  // ---------- restore saved edits on load, and after a page re-render drops them ----------
  function findTarget(rec) {
    const want = rec.kind === 'rewrite' ? rec.originalText : rec.anchorText;
    return [...document.getElementsByTagName(rec.tag)].find(e => !e.closest('[data-inpage-edit]') && !e.closest('inpage-root') && IP.norm(e.textContent).slice(0, 300) === want);
  }
  function apply(rec, target) {
    if (rec.kind !== 'rewrite') newMarker(rec.id, m => target.after(m));
    else { newMarker(rec.id, m => target.before(m)); originals.set(rec.id, target); target.remove(); }
    setGroup(rec.id, rec.html, rec.srcs, rec.kind);
  }
  function restore(saved) {
    let missing = 0;
    for (const rec of saved || []) {
      const target = findTarget(rec);
      if (!target) { missing++; IP.state.edits.push({ ...rec, missing: true }); continue; }
      apply(rec, target);
      IP.state.edits.push(rec);
    }
    draw();
    return missing;
  }
  function reapplyDropped() {
    for (const rec of IP.state.edits) {
      if (rec.missing || nodes(rec.id).length) continue;
      const target = findTarget(rec);
      if (target) apply(rec, target);
    }
  }

  function focus(id) { const n = nodes(id); if (!n.length) return; n[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => flash(n), 350); }

  IP.edit = { run, generateAfter, undo, draw, restore, insertAfter, reapplyDropped, nodes, rectOf, groupOf, hideBar, focus, records: () => IP.state.edits };
})();
