// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// The UI frame: the composer or the drawer, drawn from what the content script sends over a private extension
// port (chrome.tabs.connect). It lives in an extension page, so the page can't read, type into or click it.
(() => {
  const IP = window.__inpage, icon = IP.icon;
  // In the browser's side panel this page is opened as ui/frame.html?panel and follows the active tab.
  // (?tab=<id> or ?win=<id> bind it to a tab or window; the tests use them.)
  const params = new URLSearchParams(location.search), panelMode = params.has('panel');
  // Tests (and the store screenshots) open the panel page in a window bound to a tab with ?win= or ?tab=; test/ext.mjs
  // turns this on in its test copy. The shipped extension ignores those parameters.
  const TEST_BINDING = false, bind = k => TEST_BINDING ? params.get(k) : null;
  const [kind, nonce] = panelMode ? ['drawer', `p${Math.random().toString(36).slice(2, 9)}`] : location.hash.slice(1).split(':');
  let usePanel = false, closing = false, replaced = false;   // replaced: a newer panel took this tab; don't fight it
  const root = document.getElementById('root');
  document.documentElement.dataset.kind = kind;
  const mac = navigator.platform.includes('Mac');
  let port = null, web = false;
  const send = m => { try { port?.postMessage(m); } catch {} };
  const $ = s => root.querySelector(s);

  const hintHTML = () => `<span class="hint"><kbd>↵</kbd> send · <kbd>${mac ? '⌘' : 'Ctrl'}↵</kbd> think harder</span>`;
  const webToggleHTML = () => `<button class="webtoggle" aria-pressed="${web}" title="Always search the web (about $0.005 a search). When off, inpage still searches when a question needs it.">${icon.globe}<span>Web</span></button>`;
  const paintWeb = () => root.querySelectorAll('.webtoggle:not(.tabsbtn)').forEach(b => b.setAttribute('aria-pressed', String(web)));
  const setTheme = dark => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; };

  // A textarea that grows and sends on Enter (Cmd/Ctrl+Enter = think harder).
  function wireInput(ta, sendBtn, onSend, { max = 160 } = {}) {
    const sync = () => { sendBtn.disabled = !ta.value.trim() || ta.disabled; ta.style.height = 'auto'; ta.style.height = `${Math.min(max, ta.scrollHeight)}px`; };
    ta.addEventListener('input', sync);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (ta.value.trim()) onSend(ta.value.trim(), e.metaKey || e.ctrlKey); }
    });
    sendBtn.addEventListener('click', () => { if (ta.value.trim()) onSend(ta.value.trim(), false); });
    sync();
    return sync;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return; } catch {}
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  const links = n => n.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });

  document.addEventListener('mousedown', e => { if (e.target.closest('.webtoggle')) e.preventDefault(); });   // keep the textarea focused
  document.addEventListener('click', e => { const b = e.target.closest('.webtoggle'); if (!b || b.classList.contains('tabsbtn')) return; web = !web; paintWeb(); send({ t: 'web', on: web }); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panelMode) { e.preventDefault(); send({ t: 'close' }); } });   // the side panel stays until you close it

  // ---------- composer ----------
  let mode = 'ask', cur = null;
  function compose(m) {
    cur = m;
    root.innerHTML = `<div class="composer" role="dialog" aria-label="Ask or rewrite">
      <div class="head" role="tablist"><button class="tab" data-m="ask" role="tab">${icon.ask}Ask</button>${m.image || m.video ? '' : `<button class="tab" data-m="edit" role="tab">${icon.edit}Rewrite in place</button>`}</div>
      ${m.quote || m.image || m.video ? `<div class="quote${m.image ? ' img' : ''}${m.video ? ' vid' : ''}"></div>` : ''}
      <textarea rows="2" aria-label="Your request"></textarea>
      <div class="chips"></div>
      <div class="bar">${hintHTML()}<span class="right">${webToggleHTML()}<button class="send" title="Send" aria-label="Send" disabled>${icon.send}</button></span></div></div>`;
    if (m.video) { $('.quote').innerHTML = `<b>▶ ${IP.escapeHTML(m.video.at)}</b> <span></span>`; $('.quote span').textContent = m.video.title; }
    else if (m.image) { const im = document.createElement('img'); preview(im, m.image.src); im.alt = m.image.alt || ''; $('.quote').append(im); }
    else if (m.quote) { $('.quote').textContent = m.quote; IP.renderMath($('.quote'), false); }
    const ta = $('textarea');
    root.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { setMode(t.dataset.m); ta.focus(); }));
    wireInput(ta, $('.send'), submit, { max: 180 });
    setMode(m.mode);
    ta.focus();
    send({ t: 'size', h: root.offsetHeight });
  }
  function setMode(m) {
    mode = m;
    root.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.m === m)));
    $('textarea').placeholder = cur.video ? 'Ask about this moment…' : cur.image ? 'Ask anything about this image…' : m === 'ask' ? 'Ask anything about this…' : 'How should this be rewritten?';
    const add = document.createElement('button'); add.className = 'chip add'; add.textContent = '+ New action'; add.title = 'Make your own one-click action';
    add.addEventListener('click', () => { if (usePanel) openPanel(); send({ t: 'new-action' }); });
    $('.chips').replaceChildren(...cur.actions[cur.video ? 'video' : cur.image ? 'image' : m].map(a => {
      const c = document.createElement('button'); c.className = 'chip'; c.textContent = a.label;
      if (a.prompt !== a.label) c.title = a.prompt;
      c.addEventListener('click', () => submit(a.prompt, false, a.label, a.out));
      return c;
    }), add);
    send({ t: 'size', h: root.offsetHeight });
  }
  // Never let opening the panel get in the way of the request (it can throw where there's no side panel).
  const openPanel = () => { try { chrome.sidePanel?.open({ windowId: myTab?.windowId })?.catch?.(() => {}); } catch {} };
  const submit = (text, think, shown, out) => {
    // an answer goes to the drawer: open the side panel now, inside this click or key press (the browser requires it)
    if (usePanel && (mode === 'ask' || out === 'check')) openPanel();
    send({ t: 'submit', mode, text, think, web, ...(shown && shown !== text ? { shown } : {}), ...(out ? { out } : {}) });
  };

  // ---------- drawer ----------
  let view = null, ta = null, sync = null;
  function shell() {
    root.innerHTML = `<div class="drawer" role="complementary" aria-label="inpage">
      <div class="dhead"><button class="iconbtn" data-a="back" aria-label="Back to the page" hidden>${icon.back}</button><div class="title">${icon.logo}<span></span></div><button class="iconbtn" data-a="close" aria-label="Close (Esc)" title="Close (Esc)">${icon.close}</button></div>
      <div class="dbody" style="position:relative"></div>
      <div class="dfoot"><div class="tabpick" hidden role="dialog" aria-label="Choose tabs to include"></div><div class="dchips" hidden></div><div class="tabchips" hidden></div><textarea rows="1"></textarea><div class="bar">${hintHTML()}<span class="right"><button class="iconbtn" data-a="del" title="Delete this thread" aria-label="Delete this thread" hidden>${icon.trash}</button><button class="webtoggle tabsbtn" data-a="tabs" title="Include your other open tabs" hidden>${icon.tabs}<span>Tabs</span></button>${webToggleHTML()}<button class="send" aria-label="Send" disabled>${icon.send}</button></span></div></div></div>`;
    ta = $('.dfoot textarea');
    sync = wireInput(ta, $('.dfoot .send'), (text, think) => { act({ a: 'send', text, think, ...(picked.size && view?.kind === 'home' ? { tabs: [...picked.keys()] } : {}) }); ta.value = ''; sync(); });
    root.addEventListener('click', onClick);
    $('.dchips').addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
  const act = m => send({ t: 'act', view: view?.id, ...m });

  // ---------- other open tabs as sources (home view): a picker and chips; kept until cleared ----------
  const picked = new Map();                      // tab id -> title
  let myTab = null;
  async function openPicker() {
    const box = $('.tabpick');
    if (!box.hidden) { box.hidden = true; return; }
    const tabs = (await chrome.tabs.query({ windowId: myTab?.windowId })).filter(t => t.id !== myTab?.id && /^https?:/.test(t.url || ''));
    box.innerHTML = tabs.length ? `<div class="th">Include tabs <span>up to 5</span></div>${tabs.map(t => `<label class="trow"><input type="checkbox" value="${t.id}"${picked.has(t.id) ? ' checked' : ''}><img alt=""><span class="tt"></span><span class="th2">${IP.escapeHTML(IP.host(t.url))}${t.discarded ? ' · asleep' : ''}</span></label>`).join('')}`
      : '<div class="th">No other tabs open in this window</div>';
    box.querySelectorAll('.trow').forEach((row, i) => {
      row.querySelector('.tt').textContent = tabs[i].title || IP.host(tabs[i].url);
      const img = row.querySelector('img');
      if (/^https:/.test(tabs[i].favIconUrl || '')) { img.style.visibility = 'hidden'; img.onload = () => { img.style.visibility = ''; }; preview(img, tabs[i].favIconUrl); } else img.remove();
      row.querySelector('input').onchange = e => {
        if (e.target.checked && picked.size >= 5) { e.target.checked = false; return; }
        if (e.target.checked) picked.set(tabs[i].id, tabs[i].title || IP.host(tabs[i].url)); else picked.delete(tabs[i].id);
        paintPicked();
      };
    });
    box.hidden = false;
  }
  function paintPicked() {
    const strip = $('.tabchips');
    strip.hidden = !picked.size || view?.kind !== 'home';
    strip.innerHTML = picked.size ? `<span class="lbl">With</span>${[...picked].map(([id, title]) => `<span class="tchip" data-id="${num(id)}"><span></span><button aria-label="Remove">×</button></span>`).join('')}` : '';
    strip.querySelectorAll('.tchip').forEach(c => { c.querySelector('span').textContent = picked.get(+c.dataset.id); c.querySelector('button').onclick = () => { picked.delete(+c.dataset.id); const box = $('.tabpick input[value="' + c.dataset.id + '"]'); if (box) box.checked = false; paintPicked(); }; });
    $('.tabsbtn').setAttribute('aria-pressed', String(!!picked.size));
    $('.tabsbtn span').textContent = picked.size ? `Tabs · ${picked.size}` : 'Tabs';
  }

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b || !view) return;
    const a = b.dataset.a, card = b.closest('.card[data-batch]'), prop = b.closest('[data-proposal]'), chk = b.closest('.card[data-check]');
    if (chk && b.classList.contains('claim')) return act({ a: 'check-item', check: chk.dataset.check, i: +b.dataset.i });
    if (chk && (a === 'stop' || a === 'clear')) return act({ a: `check-${a}`, check: chk.dataset.check });
    if (prop && (a === 'actions-save' || a === 'actions-discard')) return act({ a, id: prop.dataset.proposal });
    if (a === 'manage-actions' || a === 'library') return act({ a });
    if (card && b.classList.contains('it')) return act({ a: 'batch-item', batch: card.dataset.batch, i: +b.dataset.i });
    if (card && a) return act({ a: `batch-${a}`, batch: card.dataset.batch });
    if (a === 'tabs') return openPicker();
    if (a === 'close' && panelMode && !port) return closePanel();
    if (a === 'close' || a === 'back' || a === 'del' || a === 'stop' || a === 'settings') return act({ a });
    if (b.classList.contains('ts')) return act({ a: 'seek', s: Number(b.dataset.s) });
    if (b.dataset.cite != null) { const msg = b.closest('.msg'); return act({ a: 'cite', chat: msg.dataset.chat != null ? +msg.dataset.chat : undefined, i: +msg.dataset.i, n: +b.dataset.cite }); }
    if (a === 'copy') { await copy(IP.citesToText(view.messages[+b.closest('[data-i]').dataset.i]?.text || '')); b.querySelector('span').textContent = 'Copied'; return; }
    if (a === 'insert') return act({ a, i: +b.closest('[data-i]').dataset.i });
    if (a === 'details') { const meta = b.closest('.msg').querySelector('.meta'); meta.hidden = !meta.hidden; b.setAttribute('aria-expanded', String(!meta.hidden)); return; }
    if (a === 'sent') { const msg = b.closest('.msg'); const pre = msg.querySelector('pre.sent'); if (!pre.hidden) { pre.hidden = true; b.textContent = 'Show exactly what was sent'; return; } return act({ a, i: +msg.dataset.i, chat: msg.dataset.chat != null ? +msg.dataset.chat : undefined }); }
    if (b.classList.contains('chip') && b.dataset.new != null) { ta.value = 'Make an action that '; sync(); ta.focus(); return; }
    if (b.classList.contains('chip')) { const c = view.chips?.[+b.dataset.c]; return c && act({ a: 'ask', text: c.prompt, shown: c.label, out: c.out }); }
    if (b.dataset.thread) return act({ a: 'thread', id: b.dataset.thread });
    if (b.dataset.edit) return act({ a: 'edit', id: b.dataset.edit });
  }

  const userHTML = m => `<div class="msg user"><div class="who">You${m.tabs?.length > 1 ? ` <span class="with">· with ${m.tabs.length - 1} other tab${m.tabs.length > 2 ? 's' : ''}</span>` : ''}</div><div class="body">${IP.escapeHTML(m.text)}</div></div>`;
  const errHTML = m => `<div class="msg err"><div class="who">inpage</div><div class="body">${IP.escapeHTML(m.text)}</div>${m.code === 'key' || m.code === 'credits' ? `<div class="tools"><button data-a="settings"><span>${m.code === 'key' ? 'Open settings' : 'Check credits'}</span></button></div>` : ''}</div>`;
  // Views are built from saved records too (which a restored backup can carry), so numbers and class names are forced
  // to safe values here, and every string is escaped.
  const preview = (im, src) => { if (/^data:image\//.test(src)) im.src = src; else chrome.runtime.sendMessage({ type: 'image-preview', src }).then(u => { if (u) im.src = u; }).catch(() => {}); };
  const num = v => Number.isFinite(+v) ? +v : 0, cls = v => String(v ?? '').replace(/[^\w-]/g, '');
  const money = c => c == null || !Number.isFinite(+c) ? '' : +c < 0.0001 ? '<$0.0001' : `$${+c < 0.01 ? (+c).toFixed(4) : (+c).toFixed(3)}`;
  const metaHTML = m => !m ? '' : `<div class="meta" hidden><div>${[IP.escapeHTML(m.model), money(m.cost), m.routing ? `routing ${money(m.routing)}` : '', m.input != null ? `${num(m.input).toLocaleString()} tokens in · ${num(m.output).toLocaleString()} out` : '', num(m.ms) ? `${(num(m.ms) / 1000).toFixed(1)} s` : ''].filter(Boolean).join(' · ')}</div>
    <div>Sent: ${(Array.isArray(m.parts) ? m.parts : []).map(IP.escapeHTML).join(', ')}${num(m.images) ? `, ${num(m.images)} image${num(m.images) === 1 ? '' : 's'}` : ''}${m.web ? '; the web was searched' : ''}. Nothing else from the page or your browser.</div>
    <button class="btn link small" data-a="sent">Show exactly what was sent</button><pre class="sent" hidden></pre></div>`;
  const aiHTML = (m, i, insert) => `<div class="msg ai" data-i="${num(i)}"${m.chat != null ? ` data-chat="${num(m.chat)}"` : ''}><div class="who">${icon.spark}inpage</div><div class="body">${IP.citeHTML(m.text, m.cites, m.names)}</div>${IP.sourcesHTML(m.sources)}
    <div class="tools"><button data-a="copy">${icon.copy}<span>Copy</span></button>${insert ? `<button data-a="insert">${icon.insert}<span>Insert into page</span></button>` : ''}${m.meta ? `<button data-a="details" title="What was sent, the model and the cost"><span>${money(m.meta.cost) || 'Details'}</span></button>` : ''}</div>${metaHTML(m.meta)}</div>`;
  const msgHTML = (m, i, insert) => m.role === 'user' ? userHTML(m) : m.role === 'err' ? errHTML(m) : m.role === 'batch' ? cardHTML(m.batch) : m.role === 'actions' ? proposalHTML(m) : m.role === 'check' ? checkHTML(m.check) : aiHTML(m, i, insert);
  function checkHTML(c) {
    const head = c.status === 'finding' ? 'Finding the claims worth checking…' : c.error ? IP.escapeHTML(c.error) : !c.items.length ? 'No specific claims to check here.'
      : `${c.items.length} claim${c.items.length === 1 ? '' : 's'} · <span class="v supported">${num(c.counts.supported)} supported</span> · <span class="v disputed">${num(c.counts.disputed)} disputed</span> · <span class="v unclear">${num(c.counts.unclear)} unclear</span>`;
    const running = c.status !== 'done';
    return `<div class="card check" data-check="${IP.escapeHTML(c.id)}"><div class="ch">${icon.check}<span style="flex:1">Fact-check</span>${running ? '<span class="typing"><span></span><span></span><span></span></span>' : ''}</div>
      <div class="chead">${head}</div>
      ${c.items.length ? `<div class="items">${c.items.map(it => `<button class="it claim" data-i="${num(it.i)}"><span class="pill ${cls(it.verdict)}">${IP.escapeHTML(it.label)}</span><span><span class="ct">${IP.escapeHTML(it.claim)}</span>${it.note ? `<span class="cn">${IP.escapeHTML(it.note)}</span>` : ''}${it.found ? '' : '<span class="cn">Not found on the page</span>'}</span></button>${it.sources?.length ? `<div class="csrc">${IP.sourcesHTML(it.sources)}</div>` : ''}`).join('')}</div>` : ''}
      <div class="acts">${running ? '<button class="btn" data-a="stop">Stop</button>' : '<button class="btn" data-a="clear">Clear highlights</button>'}<span class="hint2">Web search, about $0.005 a claim</span></div></div>`;
  }
  const PLACE = { ask: 'Ask chip', rewrite: 'Rewrite chip', image: 'Image chip', page: 'Page chip' };
  function proposalHTML(m) {
    const row = it => {
      const where = `${PLACE[it.on] || ''}${it.pin ? ' · in the toolbar' : ''}${it.hidden ? ' · hidden' : ''}`;
      const head = it.kind === 'add' ? 'New' : it.kind === 'delete' ? 'Remove' : 'Change';
      return `<div class="act ${cls(it.kind)}"><div class="ah"><span class="tag">${head}</span><b>${IP.escapeHTML(it.label || '')}</b>${it.kind === 'update' && it.was && it.was !== it.label ? `<span class="was">was “${IP.escapeHTML(it.was)}”</span>` : ''}</div>
        <div class="where">${IP.escapeHTML(where)}</div>${it.kind !== 'delete' && it.prompt ? `<div class="prompt">${IP.escapeHTML(it.prompt)}</div>` : ''}</div>`;
    };
    const foot = m.status === 'pending' ? `<button class="btn primary" data-a="actions-save">Save</button><button class="btn" data-a="actions-discard">Discard</button><span class="hint2">or reply to change it</span>`
      : m.status === 'saved' ? `<span class="done">${icon.check} Saved</span><button class="btn link" data-a="manage-actions">Manage actions</button>`
      : `<span class="hint2">${m.status === 'replaced' ? 'Replaced by the version below' : 'Discarded'}</span>`;
    return `<div class="card proposal${m.status === 'pending' ? '' : ' settled'}" data-proposal="${IP.escapeHTML(m.id)}"><div class="ch">${icon.spark}<span style="flex:1">${IP.escapeHTML(m.summary)}</span></div>
      <div class="acts-list">${m.items.map(row).join('')}</div><div class="acts">${foot}</div></div>`;
  }
  const pendingHTML = `<div class="msg ai pending"><div class="who">${icon.spark}inpage</div><div class="body"></div></div>`;
  function cardHTML(b) {
    const done = b.items.filter(i => i.status === 'done').length, failed = b.items.filter(i => i.status === 'fail').length;
    return `<div class="card" data-batch="${IP.escapeHTML(b.id)}"><div class="ch">${icon.edit}<span style="flex:1">${IP.escapeHTML(b.summary)}</span><span class="n">${num(done)}/${num(b.items.length)}${failed ? ` · ${num(failed)} failed` : ''}</span></div>
      <div class="items">${b.items.map((it, i) => `<button class="it" data-i="${i}"><span class="dot ${cls(it.status)}"></span><span>${IP.escapeHTML(it.instruction)}<br><span class="sub">${IP.escapeHTML(it.label)}</span></span></button>`).join('')}</div>
      <div class="acts">${b.running ? `<button class="btn" data-a="stop">Stop</button>` : `<button class="btn" data-a="review">Review</button><button class="btn" data-a="undo">Undo all</button>`}</div></div>`;
  }
  const noteHTML = n => `<button class="note" ${n.thread ? `data-thread="${IP.escapeHTML(n.thread)}"` : `data-edit="${IP.escapeHTML(n.edit)}"`}><span class="k">${IP.escapeHTML(n.k)}</span><span><div class="t">${IP.escapeHTML(n.title)}</div>${n.sub ? `<div class="s">${IP.escapeHTML(n.sub)}</div>` : ''}</span></button>`;

  const chipsHTML = list => `${list.map((c, i) => `<button class="chip" data-c="${i}"${c.prompt !== c.label ? ` title="${IP.escapeHTML(c.prompt)}"` : ''}>${IP.escapeHTML(c.label)}</button>`).join('')}<button class="chip add" data-new>+ New action</button>`;
  function show(v) {
    if (!ta) shell();
    $('.dfoot').hidden = false;
    const body = $('.dbody'), prevTop = body.scrollTop, same = view?.key === v.key;
    view = v;
    $('.dhead .title span').textContent = v.title;
    $('[data-a="back"]').hidden = !v.back;
    $('[data-a="del"]').hidden = !v.del;
    if (v.kind === 'thread') {
      body.innerHTML = `<div class="threadquote${v.quote.image ? ' img' : ''}"></div>${v.messages.map((m, i) => msgHTML(m, i, !v.quote.video)).join('')}${v.pending ? pendingHTML : ''}`;
      const q = $('.threadquote');
      if (v.quote.video) { q.classList.add('vid'); q.innerHTML = `<button class="ts big" data-s="${num(secs(v.quote.video))}" title="Jump back to this moment">▶ ${IP.escapeHTML(v.quote.video)}</button> <span></span>`; q.querySelector('span').textContent = v.quote.text.replace(/^▶\s*[\d:]+\s*·\s*/, ''); }
      else if (v.quote.image) { const im = document.createElement('img'); preview(im, v.quote.image); im.alt = v.quote.text; q.append(im); } else { q.textContent = v.quote.text; IP.renderMath(q, false); }
    } else {
      body.innerHTML = `${v.empty ? `<div class="empty"><h3>Learn from this page</h3><p>Ask about the whole page, or ask for changes across it. Select any text for a focused question or a rewrite.</p><div class="chips">${chipsHTML(v.chips)}</div><button class="btn link manage" data-a="manage-actions">Manage your actions</button></div>` : ''}
        ${v.messages.map((m, i) => msgHTML(m, i, false)).join('')}${v.pending ? pendingHTML : ''}
        ${v.notes.length ? `<div class="section"><span>On this page · ${v.notes.length}</span><button class="btn link small" data-a="library">All notes</button></div>${v.notes.map(noteHTML).join('')}` : `<div class="section"><span></span><button class="btn link small" data-a="library">All notes</button></div>`}`;
    }
    if (v.warning) { const w = document.createElement('div'); w.className = 'warn'; w.setAttribute('role', 'note'); w.textContent = v.warning; body.prepend(w); }
    body.querySelectorAll('.msg.ai[data-i] .body').forEach(n => IP.renderMath(n, true));
    if (v.kind === 'thread' && v.quote.video) body.querySelectorAll('.msg.ai[data-i] .body').forEach(timestamps);
    links(body);
    paintPending();
    ta.placeholder = v.placeholder; ta.setAttribute('aria-label', v.placeholder);
    ta.disabled = !!v.disabled;
    if (!same) ta.value = '';
    if (v.draft) ta.value = v.draft;
    $('.tabsbtn').hidden = v.kind !== 'home';
    if (v.kind !== 'home') $('.tabpick').hidden = true;
    paintPicked();
    const strip = $('.dchips');                      // page chips stay one tap away once the chat has started
    strip.hidden = !(v.kind === 'home' && !v.empty && v.chips?.length);
    if (!strip.hidden) strip.innerHTML = chipsHTML(v.chips);
    sync();
    const msgs = body.querySelectorAll('.msg');
    if (v.scroll === 'keep') body.scrollTop = prevTop;
    else if (v.scroll === 'last') { const t = v.pending ? msgs[msgs.length - 2] : msgs[msgs.length - 1]; body.scrollTop = t ? Math.max(0, t.offsetTop - 12) : 0; }
    else if (v.scroll === 'end') { const last = [...body.querySelectorAll('.msg.user')].at(-1); body.scrollTop = last ? last.offsetTop - 12 : 0; }
    else body.scrollTop = 0;
    if (v.focus) setTimeout(() => ta.focus({ preventScroll: true }), 60);
  }
  // Timestamps in a video answer ([12:34] or 1:02:03) become buttons that jump the video there.
  const secs = s => String(s).split(':').reduce((a, x) => a * 60 + Number(x), 0);
  function timestamps(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('code, pre, .katex, button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const hits = []; let t; while ((t = walker.nextNode())) if (/\b\d{1,2}:\d{2}\b/.test(t.data)) hits.push(t);
    for (const textNode of hits) {
      const frag = document.createDocumentFragment(); let last = 0;
      for (const m of textNode.data.matchAll(/\[?\b((?:\d{1,2}:)?\d{1,2}:\d{2})\b\]?/g)) {
        frag.append(textNode.data.slice(last, m.index));
        const b = document.createElement('button'); b.className = 'ts'; b.dataset.s = secs(m[1]); b.textContent = m[1]; b.title = `Jump to ${m[1]}`;
        frag.append(b); last = m.index + m[0].length;
      }
      frag.append(textNode.data.slice(last)); textNode.replaceWith(frag);
    }
  }
  function paintPending() {
    const n = $('.msg.pending .body'), p = view?.pending; if (!n || !p) return;
    if (p.text) { n.innerHTML = IP.citeHTML(p.text); IP.renderMath(n, true); links(n); }
    else n.innerHTML = `<span class="waiting"><span class="typing"><span></span><span></span><span></span></span> ${IP.escapeHTML(p.label)}${p.stop ? ' <button class="btn" data-a="stop">Stop</button>' : ''}</span>`;
  }

  // ---------- messages from the content script ----------
  function onMessage(m) {
    if (m.t === 'init') { setTheme(m.dark); web = m.web; paintWeb(); usePanel = !!m.panel; }
    if (m.t === 'close-panel' && panelMode) closePanel();
    if (m.t === 'replaced' && panelMode) { replaced = true; idle('inpage is showing this tab in another panel.'); }
    if (m.t === 'theme') setTheme(m.dark);
    if (m.t === 'web') { web = m.on; paintWeb(); }
    if (m.t === 'compose') compose(m);
    if (m.t === 'view') show(m.view);
    if (m.t === 'pending' && view?.key === m.key) { view.pending = m.pending; paintPending(); }
    if (m.t === 'sent') {
      const msg = view?.kind === 'home' ? root.querySelector(`.msg.ai[data-chat="${m.i}"]`) : root.querySelector(`.msg.ai[data-i="${m.i}"]`);
      const pre = msg?.querySelector('pre.sent'), b = msg?.querySelector('[data-a="sent"]');
      if (pre) { pre.textContent = m.text || 'The exact text is kept only while the page is open; it was sent before this page was reloaded.'; pre.hidden = false; b.textContent = 'Hide'; }
    }
    if (m.t === 'focus') (kind === 'composer' ? $('textarea') : ta)?.focus({ preventScroll: true });
  }

  // Connect to the content script of the tab this frame sits in (top frame only).
  // ---------- connecting: a frame to the tab it sits in; the side panel to its window's active tab ----------
  let fails = 0;
  function connectTo(tab) {
    try { port?.disconnect(); } catch {}
    port = null; myTab = tab || null;
    if (!tab) return idle('inpage isn’t available here.');
    const p = chrome.tabs.connect(tab.id, { name: panelMode ? `inpage-ui:panel:${nonce}` : `inpage-ui:${kind}:${nonce}`, frameId: 0 });
    port = p;
    p.onMessage.addListener(m => { if (port === p) { fails = 0; onMessage(m); } });
    p.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (port !== p || !panelMode || closing || replaced) return;
      port = null;
      // no inpage on this page (the browser's own pages, the extension store), or it's still loading: try a few times
      if (++fails > 3) return idle('inpage can’t run on this page. Open a web page to ask about it.');
      setTimeout(() => { if (!port && myTab?.id === tab.id) connectTo(tab); }, 500 * fails);
    });
  }
  async function activeTab() {
    if (bind('tab')) return chrome.tabs.get(+bind('tab')).catch(() => null);
    const [t] = await chrome.tabs.query(bind('win') ? { active: true, windowId: +bind('win') } : { active: true, currentWindow: true });
    return t || null;
  }
  // A real side panel closes through the API (window.close() doesn't close one); a bound test window just closes.
  function closePanel() {
    closing = true;
    const bound = bind('win') || bind('tab');
    if (!bound && chrome.sidePanel?.close && myTab) chrome.sidePanel.close({ windowId: myTab.windowId }).catch(() => window.close());
    else window.close();
  }
  // The side panel's empty state, for pages inpage can't see.
  function idle(message) {
    if (!panelMode) return;
    if (!ta) shell();
    view = null;
    $('.dhead .title span').textContent = 'inpage';
    $('[data-a="back"]').hidden = true; $('[data-a="del"]').hidden = true; $('.tabsbtn').hidden = true; $('.dchips').hidden = true; $('.tabchips').hidden = true;
    $('.dbody').innerHTML = `<div class="empty"><p></p></div>`; $('.dbody .empty p').textContent = message;
    ta.disabled = true; ta.placeholder = ''; sync();
    $('.dfoot').hidden = true;
  }
  if (panelMode) {
    document.documentElement.dataset.panel = '';
    idle('Connecting to this page…');
    // Only the browser's own side panel (a top-level page that isn't in a tab) may act as the panel: a copy of this
    // page loaded inside a web page, or opened as a tab, can't take a page's conversation over.
    (window.top === window ? new Promise(r => chrome.tabs.getCurrent(r)) : Promise.resolve('framed')).then(inTab => {
      if (inTab && !TEST_BINDING) return idle('Open inpage from the toolbar or with Alt+Shift+I.');
      activeTab().then(connectTo);
    });
    chrome.tabs.onActivated.addListener(info => { if (!bind('tab') && myTab && info.windowId === myTab.windowId) { fails = 0; replaced = false; idle('Connecting to this page…'); activeTab().then(connectTo); } });
    chrome.tabs.onUpdated.addListener((id, info) => { if (id === myTab?.id && info.status === 'complete' && !port && !closing && !replaced) { fails = 0; connectTo(myTab); } });
  } else chrome.tabs.getCurrent(connectTo);
  if (kind === 'composer') new ResizeObserver(() => send({ t: 'size', h: root.offsetHeight })).observe(root);
})();
