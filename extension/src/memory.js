// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Quiet memory, in this browser only. Your glossary: when you ask about a short term, inpage keeps a one-line
// definition, and selecting that term again on any page shows your earlier explanation above the toolbar.
// The return bookmark: on a long page you left part-way through, inpage offers once to take you back.
// Both can be turned off in Settings.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  let glossary = {}, reading = {}, on = { glossary: true, bookmark: true }, loaded = null;
  const load = () => (loaded = IP.store.get(['glossary', 'reading', 'memory']).then(v => {
    glossary = INPAGE_cleanGlossary(v?.glossary) || {};
    reading = INPAGE_cleanReading(v?.reading) || {};
    on = { glossary: v?.memory?.glossary !== false, bookmark: v?.memory?.bookmark !== false };
  }).catch(() => {}));
  load();

  // ---------- glossary ----------
  const key = s => IP.norm(String(s || '')).toLowerCase().replace(/[“”"'’‘.,:;!?()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
  const looksLikeTerm = s => { const t = IP.norm(s); return t.length >= 2 && t.length <= 60 && t.split(' ').length <= 6 && !/[.!?]\s/.test(t); };
  // Stricter, for saving: Jev judges whether it's a concept's name; without Jev, short phrases that don't start with a
  // function word and aren't cut off mid-word.
  const STOP = /^(with|the|a|an|and|or|of|to|in|on|for|by|is|are|was|this|that|it|as|at|from|we|you|so|but|if)\b/i;
  async function isTerm(text, range) {
    const t = IP.norm(text);
    if (!looksLikeTerm(t)) return false;
    // cut off mid-word: a letter right outside the selection touches a letter inside it
    const charAt = (node, i) => node?.nodeType === 3 && i >= 0 && i < node.data.length ? node.data[i] : '';
    const cut = !!range && ((/\w/.test(charAt(range.startContainer, range.startOffset - 1)) && /^\w/.test(t)) || (/\w/.test(charAt(range.endContainer, range.endOffset)) && /\w$/.test(t)));
    const j = await IP.jev({ selection: t, page_title: document.title }, ['term']);
    if (j?.term) return IP.sure(j.term, 'term', 0.7) && !cut;
    return t.split(' ').length <= 4 && !STOP.test(t) && !cut;
  }
  // After the first answer in a thread about a short term: one plain sentence for the glossary (a tiny model call).
  async function remember(t, answer) {
    await loaded;
    if (!on.glossary || t.quote.image || t.quote.video || !(await isTerm(IP.selectionText(t), t.range))) return;
    const term = IP.norm(IP.selectionText(t)), k = key(term);
    try {
      const res = await IP.callModel({ system: INPAGE_PROMPTS.define, messages: [{ role: 'user', content: `Term: ${IP.untrusted('page term', term)}\nPage: ${IP.untrusted('page title', document.title)}\n\nThe explanation they got:\n${answer.slice(0, 2500)}` }] }).promise;
      const def = IP.norm(res.text).replace(/^["“]|["”]$/g, '').slice(0, 300);
      if (!def) return;
      await load();                                            // another tab may have added terms meanwhile
      glossary[k] = { term, def, url: location.href, title: document.title, thread: t.id, ts: Date.now(), n: (glossary[k]?.n || 0) + 1 };
      IP.store.set({ glossary });
    } catch {}
  }
  // A glossary entry for a selection: the same term, or its singular/plural.
  function recall(text) {
    if (!on.glossary || !looksLikeTerm(text)) return null;
    const k = key(text);
    return glossary[k] || glossary[k.replace(/s$/, '')] || glossary[`${k}s`] || null;
  }
  const short = t => t.length > 42 ? `${t.slice(0, 40).trim()}…` : t;
  const where = e => e.url && e.url.split('#')[0] === location.href.split('#')[0] ? 'here, earlier' : `“${short(IP.norm(e.title) || IP.host(e.url))}”`;
  function openEntry(e) {
    if (e.url.split('#')[0] === location.href.split('#')[0] && e.thread) return IP.threads.focus(e.thread);
    chrome.runtime.sendMessage({ type: 'open-library', page: e.url.split('#')[0] });
  }

  // ---------- return bookmark ----------
  const longPage = () => document.documentElement.scrollHeight > innerHeight * 2.5;
  const arrived = Date.now();
  let saveTimer = 0, offered = false;
  // The paragraph at the top of the window, as a short quote that can be found again.
  function topBlock() {
    const x = Math.min(innerWidth / 2, document.documentElement.clientWidth - 40);
    for (const y of [90, 140, 200, 260]) {
      const b = IP.blockOf(document.elementFromPoint(x, y));
      if (b && !ui.host.contains(b) && IP.norm(b.textContent).length > 40) return b;
    }
    return null;
  }
  addEventListener('scroll', () => {
    if (!on.bookmark) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (Date.now() - arrived < 20000 || !longPage()) return;
      const max = document.documentElement.scrollHeight - innerHeight, pct = max > 0 ? scrollY / max : 0;
      const k = IP.pageKey();
      await load();
      if (pct > 0.95) { if (reading[k]) { delete reading[k]; IP.store.set({ reading }); } return; }   // finished: nothing to come back to
      const b = topBlock(); if (!b) return;
      reading[k] = { quote: IP.norm(b.textContent).slice(0, 120), pct, ts: Date.now() };
      IP.store.set({ reading });
    }, 1500);
  }, { passive: true });
  // On arrival: if you stopped part-way more than a few minutes ago and you're at the top, offer to go back.
  async function offerReturn() {
    await loaded;
    const r = reading[IP.pageKey()];
    if (offered || !on.bookmark || !r || r.pct < 0.12 || r.pct > 0.92 || Date.now() - r.ts < 3 * 60000 || scrollY > 200 || !longPage()) return;
    const range = IP.rangeFor({ exact: r.quote.slice(0, 80), prefix: '', suffix: '' });
    if (!range) return;
    offered = true;
    ui.toast(`You stopped about ${Math.round(r.pct * 100)}% of the way through.`, [{ label: 'Pick up there', run: () => IP.flashRange(range) }]);
  }

  IP.memory = { remember, recall, where, openEntry, offerReturn, reload: load, get glossary() { return glossary; } };
})();
