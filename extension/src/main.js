// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Wiring: selection -> toolbar -> composer -> Ask or Rewrite; Alt-click; shortcuts; restore on load;
// single-page-app navigation; layout changes; messages from the popup.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  if (IP.started) return;
  IP.started = true;

  let enabled = true, lastRange = null;

  const editable = n => {
    const e = n?.nodeType === 1 ? n : n?.parentElement;
    return !!e?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .monaco-editor, .cm-editor, .CodeMirror');
  };
  const usableSelection = () => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (IP.norm(sel.toString()).length < 2 || editable(r.commonAncestorContainer) || ui.host.contains(r.commonAncestorContainer)) return null;
    return r.cloneRange();
  };

  // Ask about a selection (or image), or rewrite its block; from the composer or a pinned toolbar action.
  function runOn(range, mode, text, opts = {}, image) {
    getSelection()?.removeAllRanges();
    if (mode === 'ask' && opts.out !== 'check') return IP.threads.start(range, text, { ...opts, image });
    const block = IP.blockForRange(range);
    if (!block) return ui.toast('Select text inside a paragraph, list or table to rewrite it.');
    if (opts.out === 'check') return IP.check.run([block], { ask: `${opts.shown || 'Fact-check this'}: “${IP.rangeText(range).slice(0, 80)}”` });
    const gid = IP.edit.groupOf(block), rec = gid && IP.state.edits.find(x => x.id === gid);
    const run = { instruction: text, label: opts.shown, think: opts.think, web: opts.web ?? IP.prefs.web, range };
    const done = rec && rec.kind === 'rewrite' ? IP.edit.run({ rec, ...run }) : IP.edit.run({ block, ...run });   // refine an edit already there
    done.catch(() => {});                                                                  // errors show on the block itself
  }
  function compose(mode, range, rect, image) {
    lastRange = range;
    ui.openComposer({
      mode, rect: rect || range.getBoundingClientRect(), quote: image ? '' : IP.rangeText(range).slice(0, 160), image,
      onSubmit: (m, text, opts) => runOn(range, m, text, opts, image),
    });
  }

  document.addEventListener('mouseup', e => {
    if (!enabled || ui.contains(e) || e.button !== 0) return;
    setTimeout(() => {
      const r = usableSelection();
      if (!r) return;
      const memo = r.toString().length <= 80 ? IP.memory.recall(IP.rangeText(r)) : null;   // glossary terms are short; skip the work for long selections
      ui.showToolbar(r, { memo: memo && { term: memo.term, def: memo.def, where: IP.memory.where(memo), open: () => { ui.hideToolbar(); IP.memory.openEntry(memo); } }, onAsk: () => compose('ask', r), onEdit: () => compose('edit', r), onAction: a => { ui.hideToolbar(); runOn(r, a.on === 'rewrite' ? 'edit' : 'ask', a.prompt, { shown: a.label, out: a.out }); } });
    }, 10);
  });
  document.addEventListener('mousedown', e => { if (!ui.contains(e)) { ui.hideToolbar(); if (ui.composerOpen) ui.closeComposer(); } }, true);
  document.addEventListener('keydown', e => {
    // Esc closes the toolbar or composer, then the in-page drawer; the side panel stays (like the browser's own panels)
    if (e.key === 'Escape' && e.isTrusted) { if (ui.toolbarOpen || ui.composerOpen) { ui.hideToolbar(); ui.closeComposer(); } else if (IP.drawerOpen && !ui.inPanel) ui.closeDrawer(); IP.edit.hideBar(); }
  });
  document.addEventListener('selectionchange', () => { if (ui.toolbarOpen && !usableSelection()) ui.hideToolbar(); });

  // Images: a hover button, or Alt-click, asks about the image.
  const askImage = img => { const r = document.createRange(); r.selectNode(img); compose('ask', r, img.getBoundingClientRect(), img); };
  const bigImage = t => t?.tagName === 'IMG' && t.width >= 140 && t.height >= 90 && !t.closest('a[href]:not([href^="#"]) nav, header');
  document.addEventListener('mouseover', e => {
    if (!enabled || ui.contains(e)) return;
    if (bigImage(e.target)) ui.showImageButton(e.target, askImage);
  }, { passive: true });
  document.addEventListener('mouseout', e => { if (e.target?.tagName === 'IMG') ui.hideImageButton(); }, { passive: true });

  // Alt-click any block to rewrite all of it (or an image to ask about it).
  document.addEventListener('click', e => {
    if (!enabled || !e.altKey || ui.contains(e) || editable(e.target)) return;
    if (e.target.tagName === 'IMG') { e.preventDefault(); e.stopPropagation(); return askImage(e.target); }
    const v = IP.video.mainVideo(), vr = v?.getBoundingClientRect();
    if (v && e.clientX >= vr.left && e.clientX <= vr.right && e.clientY >= vr.top && e.clientY <= vr.bottom) { e.preventDefault(); e.stopPropagation(); return IP.video.ask(v); }
    const b = IP.blockOf(e.target);
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const r = document.createRange(); r.selectNodeContents(b);
    compose('edit', r, b.getBoundingClientRect());
  }, true);

  // Keyboard shortcuts come from the browser (manifest "commands"), so they work on any page.
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === 'command' && msg.command === 'panel') { if (IP.drawerOpen) ui.closeDrawer(); else IP.page.show({ focus: true }); return; }
    if (msg.type === 'open-drawer') IP.page.show({ focus: true });
    if (msg.type === 'page-text') reply({ title: document.title, url: location.href, text: IP.page.text() });
    if (msg.type === 'find-quote' || msg.type === 'flash-quote') {
      const r = IP.rangeIn(document.body, msg.quote, { strict: true, authorOnly: true });
      if (r && msg.type === 'flash-quote') setTimeout(() => IP.flashRange(r), 150);
      reply(!!r);
    }
    if (msg.type === 'actions-changed') IP.loadActions().then(() => IP.page.refreshIfHome());
    if (msg.type === 'memory-changed') { IP.memory.reload(); IP.nudges.reload(); }
    if (msg.type === 'command' && msg.command === 'ask' && !usableSelection() && enabled && IP.video.mainVideo()) return IP.video.ask();
    if (msg.type === 'command') {
      const r = usableSelection() || lastRange;
      if (r && enabled) compose(msg.command === 'ask' ? 'ask' : 'edit', r);
      else ui.toast('Select some text first.');
    }
    if (msg.type === 'page-items') reply({
      enabled, title: document.title,
      threads: IP.state.threads.map(t => ({ id: t.id, quote: t.quote.exact.slice(0, 120), question: t.messages.find(m => m.role === 'user')?.shown || '', answers: t.messages.filter(m => m.role === 'assistant' && !m.error).length, missing: !t.range && !t.quote.video })),
      edits: IP.state.edits.map(x => ({ id: x.id, kind: x.kind, instruction: x.instructions.at(-1), text: (x.originalText || x.anchorText || '').slice(0, 100), missing: !!x.missing })),
    });
    if (msg.type === 'focus-thread') IP.threads.focus(msg.id);
    if (msg.type === 'focus-edit') IP.edit.focus(msg.id);
    if (msg.type === 'undo-edit') IP.edit.undo(msg.id);
    if (msg.type === 'clear-page') { [...IP.state.edits].forEach(x => IP.edit.undo(x.id)); clearThreads(); IP.check.clearAll(); IP.state.chat = []; IP.state.batches = []; IP.save(); if (IP.drawerOpen) IP.page.show(); reply(true); }
    if (msg.type === 'set-enabled') { enabled = msg.enabled; if (!enabled) { ui.hideToolbar(); ui.closeComposer(); } }
  });
  function clearThreads() {
    IP.state.threads.forEach(t => t.cancel?.()); IP.state.threads = []; CSS.highlights.get('inpage-thread')?.clear(); document.querySelectorAll('[data-inpage-image-thread]').forEach(i => i.removeAttribute('data-inpage-image-thread')); IP.threads.clearActive(); IP.save();
  }

  // ---------- restore, and keep things in place as the page changes ----------
  async function restore() {
    IP.state.edits = []; IP.state.threads = []; IP.state.chat = []; IP.state.batches = []; IP.check.clearAll();
    const { disabledSites = {} } = (await IP.store.get(['disabledSites'])) || {};
    enabled = !disabledSites[IP.siteKey()];
    const saved = await IP.load();
    if (!saved) { IP.edit.draw(); IP.threads.drawPins(); setTimeout(() => IP.memory.offerReturn(), 1500); return; }
    IP.state.chat = saved.chat || []; IP.state.batches = (saved.batches || []).map(b => ({ ...b, items: b.items.map(it => ({ ...it, status: it.status === 'run' || it.status === 'wait' ? 'fail' : it.status })) }));
    setTimeout(() => IP.memory.offerReturn(), 1500);
    const missing = IP.edit.restore(saved.edits) + IP.threads.restore(saved.threads);
    IP.check.restore(saved.checks);
    if (missing) ui.toast(`${missing} saved note${missing === 1 ? '' : 's'} no longer match this page.`);
  }

  IP.onRelayout = () => { IP.edit.draw(); IP.threads.drawPins(); IP.check.draw(); };
  let mutTimer = 0;
  new MutationObserver(muts => {
    if (muts.every(m => ui.host.contains(m.target) || m.target === ui.host)) return;
    clearTimeout(mutTimer);
    mutTimer = setTimeout(() => { IP.edit.reapplyDropped(); IP.threads.reanchor(); IP.check.reanchor(); ui.relayout(); }, 250);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // Single-page apps change the URL without a reload: start over for the new page.
  let href = location.href;
  setInterval(() => {
    if (location.href === href) return;
    href = location.href;
    const panelOpen = ui.inPanel;
    ui.hideToolbar(); ui.closeComposer(); if (!panelOpen) ui.closeDrawer();
    IP.nudges?.reset();
    setTimeout(async () => { await restore(); IP.nudges?.rewatch(); if (panelOpen && ui.inPanel) IP.page.show(); }, 400);   // the panel shows the new page
  }, 500);

  restore();
})();
