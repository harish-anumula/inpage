// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Fact-check: a model picks the claims on the page (or in a selection's block) worth checking, then each one is
// checked with web search, three at a time. Verdicts show in the page as tinted claims with a margin mark, and in
// the drawer as a card with notes and sources. Saved with the page.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  const VERDICTS = ['supported', 'disputed', 'unclear', 'run'];
  const hl = Object.fromEntries(VERDICTS.map(v => [v, new Highlight()]));
  VERDICTS.forEach(v => CSS.highlights.set(`inpage-check-${v}`, hl[v]));
  const ranges = new Map();               // item -> its Range on the page (this visit)
  let marks = [];

  const blocksText = list => {
    let budget = 24000;
    return list.map((e, i) => { const t = IP.textOf(e).slice(0, 900); budget -= t.length; return budget > 0 && t.length > 30 ? `b${i}: ${t}` : ''; }).filter(Boolean).join('\n');
  };
  function paint() {
    VERDICTS.forEach(v => hl[v].clear());
    for (const c of IP.state.checks) for (const it of c.items) {
      const r = ranges.get(it); if (!r) continue;
      const v = it.verdict === 'wait' ? 'run' : it.verdict;
      if (hl[v]) hl[v].add(r);
    }
    draw();
  }
  // A small mark in the right margin for each checked claim; click opens the card.
  function draw() {
    marks.forEach(m => m.remove()); marks = [];
    const vw = document.documentElement.clientWidth;
    for (const c of IP.state.checks) c.items.forEach((it, i) => {
      const r = ranges.get(it); if (!r || !['supported', 'disputed', 'unclear'].includes(it.verdict)) return;
      const rects = r.getClientRects(); if (!rects.length) return;
      const d = ui.doc(rects[0]), block = IP.blockOf(r.commonAncestorContainer);
      const right = block ? ui.doc(block.getBoundingClientRect()).right : d.right;
      const m = ui.el('div', `checkmark ${it.verdict}`, it.verdict === 'supported' ? '✓' : it.verdict === 'disputed' ? '!' : '?');
      m.style.top = `${d.top + (Math.min(d.height, 24) - 18) / 2}px`;
      m.style.left = `${Math.min(right + 40, scrollX + vw - 24)}px`;
      m.title = `${label(it.verdict)}: ${it.note || it.claim}`;
      m.setAttribute('role', 'button'); m.setAttribute('aria-label', `${label(it.verdict)} claim, open the fact-check`);
      m.onclick = e => { if (IP.real(e)) IP.page.show({ scroll: 'keep' }); };
      ui.layer.appendChild(m); marks.push(m);
    });
  }
  const label = v => ({ supported: 'Supported', disputed: 'Disputed', unclear: 'Unclear', run: 'Checking', wait: 'Waiting', stopped: 'Not checked', fail: 'Check failed' }[v] || v);

  // Check the claims in these blocks. `ask` is the reader's request as shown in the chat (added unless the caller did).
  async function run(list, { ask } = {}) {
    const c = { id: IP.uid(), ts: Date.now(), status: 'finding', items: [] };
    IP.state.checks.push(c);
    if (ask) IP.state.chat.push({ role: 'user', content: ask });
    IP.state.chat.push({ role: 'assistant', kind: 'check', check: c.id });
    IP.page.show();
    try {
      const res = await IP.callModel({ system: INPAGE_PROMPTS.claims, json: true, messages: [{ role: 'user', content: `Page title: ${IP.untrusted('page title', document.title)}\n\nBlocks:\n${IP.untrusted('page blocks', blocksText(list))}` }] }).promise;
      let found = []; try { found = JSON.parse(IP.stripFences(res.text)).claims || []; } catch {}
      c.items = found.filter(x => /^b\d+$/.test(x?.id) && list[+x.id.slice(1)] && x.claim).slice(0, 8).map(x => {
        const r = IP.rangeIn(list[+x.id.slice(1)], String(x.quote || ''));
        const it = { claim: String(x.claim).slice(0, 300), quote: r ? IP.quoteFor(r) : { exact: String(x.quote || '').slice(0, 200), prefix: '', suffix: '' }, verdict: 'wait' };
        if (r) ranges.set(it, r);
        return it;
      });
      c.status = c.items.length ? 'checking' : 'done';
      paint(); IP.save(); IP.page.refreshIfHome();
      let next = 0;
      const worker = async () => {
        while (next < c.items.length && !c.cancelled) {
          const it = c.items[next++];
          it.verdict = 'run'; paint(); IP.page.refreshIfHome();
          try {
            const v = await IP.callModel({ system: INPAGE_PROMPTS.verify, json: true, web: true, messages: [{ role: 'user', content: `Page: ${IP.untrusted('page title', document.title)}\nClaim: ${IP.untrusted('page claim', it.claim)}\nAs written on the page: ${IP.untrusted('page quote', it.quote.exact)}` }] }).promise;
            const d = JSON.parse(IP.stripFences(v.text));
            it.verdict = ['supported', 'disputed', 'unclear'].includes(d.verdict) ? d.verdict : 'unclear';
            it.note = String(d.note || '').slice(0, 400);
            it.sources = IP.dedupeSources(v.sources || []).slice(0, 4);
          } catch { it.verdict = c.cancelled ? 'stopped' : 'fail'; }
          paint(); IP.save(); IP.page.refreshIfHome();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      c.items.forEach(it => { if (it.verdict === 'wait' || it.verdict === 'run') it.verdict = 'stopped'; });
    } catch (e) {
      c.error = e.message;
    }
    c.status = 'done';
    paint(); IP.save(); IP.page.refreshIfHome();
  }

  // Disputed claims first, then unclear, then the rest, each in page order (indices kept for jumping to them).
  const RANK = { disputed: 0, unclear: 1, fail: 2, stopped: 2, run: 3, wait: 3, supported: 4 };
  const order = items => items.map((it, i) => [it, i]).sort((a, b) => (RANK[a[0].verdict] ?? 5) - (RANK[b[0].verdict] ?? 5) || a[1] - b[1]);
  // The drawer card's data.
  function cardOf(id) {
    const c = IP.state.checks.find(x => x.id === id); if (!c) return null;
    const n = v => c.items.filter(it => it.verdict === v).length;
    return { role: 'check', check: { id: c.id, status: c.status, error: c.error, counts: { supported: n('supported'), disputed: n('disputed'), unclear: n('unclear') }, items: order(c.items).map(([it, i]) => ({ i, claim: it.claim, verdict: it.verdict, label: label(it.verdict), note: it.note || '', sources: it.sources || [], found: ranges.has(it) })) } };
  }
  function act(m) {
    const c = IP.state.checks.find(x => x.id === m.check); if (!c) return;
    if (m.a === 'check-item') {
      const r = ranges.get(c.items[m.i]); if (!r) return ui.toast('That claim isn’t on the page any more.');
      IP.flashRange(r);
    }
    if (m.a === 'check-stop') { c.cancelled = true; ui.toast('Stopping after the checks already running.'); }
    if (m.a === 'check-clear') {
      c.cancelled = true;
      c.items.forEach(it => ranges.delete(it));
      IP.state.checks = IP.state.checks.filter(x => x !== c);
      IP.state.chat = IP.state.chat.filter(x => x.check !== c.id);
      paint(); IP.save(); IP.page.show({ scroll: 'keep' });
    }
  }

  function restore(saved) {
    IP.state.checks = (saved || []).map(c => ({ ...c, status: 'done', items: c.items.map(it => ({ ...it, verdict: it.verdict === 'run' || it.verdict === 'wait' ? 'stopped' : it.verdict })) }));
    reanchor();
  }
  function reanchor() {
    for (const c of IP.state.checks) for (const it of c.items) {
      const r = ranges.get(it);
      if (r && r.startContainer.isConnected && !r.collapsed) continue;
      const nr = IP.rangeFor(it.quote);
      if (nr) ranges.set(it, nr); else ranges.delete(it);
    }
    paint();
  }
  function clearAll() { IP.state.checks.forEach(c => { c.cancelled = true; }); IP.state.checks = []; ranges.clear(); paint(); }

  IP.check = { run, cardOf, act, restore, reanchor, draw, clearAll };
})();
