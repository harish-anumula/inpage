// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// The UI layer: a closed shadow root holding the selection toolbar, status chips, edit controls, pins and toasts,
// plus two extension frames for the composer and the side drawer, where your questions and answers live.
// Light or dark to match the page.
(() => {
  const IP = window.__inpage;
  const katexHref = chrome.runtime.getURL('lib/katex/katex.min.css');
  const icon = IP.icon;
  const SHADOW = 'closed';
  // A click or key from the reader, not from a script (the page's, or another extension's that can reach our controls
  // even when one is taken out of the shadow root). Every control that does anything checks it.
  IP.real = e => SHADOW !== 'closed' || !!e?.isTrusted;             // test/ext.mjs opens it in a test copy so the end-to-end tests can see these controls
  const FRAME_URL = chrome.runtime.getURL('ui/frame.html');                       // a per-session address, so pages can't detect inpage
  const FRAME_SENDER = `chrome-extension://${chrome.runtime.id}/ui/frame.html`;

  const CSS = `
  :host { all: initial; }
  :host { --bg:#ffffff; --bg2:#fafafa; --surface:#f4f4f5; --text:#111114; --text2:#3f3f46; --muted:#71717a; --border:#e7e7ea; --border2:#d4d4d8;
    --accent:#6d45c7; --accent2:#5a36ad; --accent-soft:#f3effc; --accent-ink:#ffffff; --danger:#c2410c; --ok:#15803d;
    --shadow:0 18px 40px -12px rgba(17,17,26,.22), 0 0 0 1px rgba(17,17,26,.06); --shadow-sm:0 4px 14px -4px rgba(17,17,26,.18), 0 0 0 1px rgba(17,17,26,.05); }
  :host([data-theme=dark]) { --bg:#1a1a1e; --bg2:#1f1f24; --surface:#27272c; --text:#f4f4f5; --text2:#d4d4d8; --muted:#a1a1aa; --border:#2f2f35; --border2:#3f3f46;
    --accent:#a78bfa; --accent2:#c4b5fd; --accent-soft:rgba(167,139,250,.14); --accent-ink:#17171a; --danger:#fb923c; --ok:#4ade80;
    --shadow:0 18px 40px -12px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.07); --shadow-sm:0 4px 14px -4px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06); }
  * { box-sizing:border-box; font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
  button { font: inherit; }
  [hidden] { display:none !important; }
  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  @keyframes pop { from { opacity:0; transform: translateY(4px) scale(.985); } to { opacity:1; transform:none; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes dots { 0%,80%,100% { opacity:.25 } 40% { opacity:1 } }
  @keyframes sheen { from { background-position: -200% 0; } to { background-position: 200% 0; } }
  @media (prefers-reduced-motion: reduce) { * { animation-duration:0s !important; transition:none !important; } }

  /* selection toolbar */
  .toolbar { position:absolute; display:flex; gap:2px; padding:4px; background:#17171b; border-radius:12px; box-shadow:0 10px 24px -8px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06); animation:pop .14s ease-out; }
  .toolbar button { all:unset; display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:500; padding:6px 11px 6px 9px; border-radius:8px; color:#f4f4f5; white-space:nowrap; }
  .toolbar button:hover, .toolbar button:focus-visible { background:rgba(255,255,255,.12); }
  .memo { all:unset; position:absolute; box-sizing:border-box; max-width:380px; cursor:pointer; background:#17171b; color:#e4e4e7; border-radius:12px; padding:8px 12px 9px; box-shadow:0 10px 24px -8px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06); animation:pop .14s ease-out; font-size:12.5px; line-height:1.45; }
  .memo:hover { background:#1f1f25; }
  .memo .mt { display:flex; align-items:center; gap:6px; color:#c4b5fd; font-size:11.5px; margin-bottom:3px; white-space:nowrap; min-width:0; }
  .memo .mt svg { flex:none; } .memo .mt b { color:#f4f4f5; font-weight:600; flex:none; max-width:55%; overflow:hidden; text-overflow:ellipsis; }
  .memo .mw { color:#a1a1aa; overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .memo .md { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .toolbar .sep { width:1px; margin:6px 2px; background:rgba(255,255,255,.16); }
  .toolbar .pinned { color:#ddd6fe; } .toolbar .pinned span { max-width:170px; overflow:hidden; text-overflow:ellipsis; }

  /* the composer and the drawer are extension frames (ui/frame.html); these style their boxes */
  .cframe { position:absolute; display:none; width:420px; max-width:calc(100vw - 24px); height:180px; border:0; border-radius:14px; background:var(--bg); box-shadow:var(--shadow); animation:pop .14s ease-out; color-scheme:normal; }
  .dframe { position:fixed; top:0; right:0; width:420px; max-width:94vw; height:100vh; border:0; background:var(--bg); color-scheme:normal;
    box-shadow:-20px 0 48px -24px rgba(0,0,0,.35), -1px 0 0 var(--border); transform:translateX(102%); visibility:hidden;
    transition:transform .24s cubic-bezier(.2,.8,.2,1), visibility 0s linear .24s; }
  .dframe.open { transform:none; visibility:visible; transition:transform .24s cubic-bezier(.2,.8,.2,1); }

  /* status chip + shimmer for a block being rewritten */
  .status { position:absolute; display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text); background:var(--bg); border-radius:999px; padding:4px 5px 4px 11px; box-shadow:var(--shadow-sm); animation:pop .14s ease-out; white-space:nowrap; }
  .status .spin { width:12px; height:12px; border:2px solid var(--accent-soft); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; }
  .status .muted { color:var(--muted); font-variant-numeric: tabular-nums; }
  .status button { all:unset; cursor:pointer; font-size:12px; font-weight:500; color:var(--accent); padding:3px 9px; border-radius:999px; }
  .status button:hover { background:var(--accent-soft); }
  .status.error .msg { color:var(--danger); max-width:340px; overflow:hidden; text-overflow:ellipsis; }
  .shimmer { position:absolute; pointer-events:none; border-radius:8px; outline:1.5px solid color-mix(in srgb, var(--accent) 50%, transparent); outline-offset:5px;
    background: linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--accent) 9%, transparent) 50%, transparent 80%); background-size:200% 100%; animation: sheen 1.3s linear infinite; }
  .streaming { position:absolute; pointer-events:none; border-radius:8px; outline:1.5px dashed color-mix(in srgb, var(--accent) 45%, transparent); outline-offset:6px; }

  /* edited blocks */
  .gutter { position:absolute; width:3px; border-radius:3px; background:var(--accent); cursor:pointer; opacity:.4; transition:opacity .15s; }
  .gutter:hover, .gutter.hot { opacity:1; }
  .editbar { position:absolute; display:flex; gap:2px; align-items:center; background:var(--bg); border-radius:10px; padding:3px; box-shadow:var(--shadow-sm); animation:pop .12s ease-out; }
  .editbar .label { font-size:11.5px; font-weight:500; color:var(--accent); padding:0 6px 0 5px; display:flex; gap:4px; align-items:center; white-space:nowrap; }
  .editbar button { all:unset; cursor:pointer; font-size:12.5px; color:var(--text2); padding:5px 9px; border-radius:7px; white-space:nowrap; }
  .editbar button:hover { background:var(--surface); color:var(--text); }
  .editbar button[aria-pressed=true] { background:var(--accent-soft); color:var(--accent); }
  .editbar.side { flex-direction:column; align-items:stretch; }
  .editbar.side .label { padding:4px 8px 3px; }
  .editbar.side button { text-align:left; }
  .editbar .sources { display:flex; flex-wrap:wrap; gap:6px; margin:4px; max-width:220px; }
  .editbar .sources a { display:inline-flex; max-width:190px; font-size:11.5px; color:var(--text2); text-decoration:none; background:var(--surface); border-radius:999px; padding:3px 10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .editbar .sources a:hover { color:var(--accent); background:var(--accent-soft); }

  /* pins */
  .pin { position:absolute; display:grid; place-items:center; min-width:22px; height:22px; padding:0 6px; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-size:11px; font-weight:700; cursor:pointer; box-shadow:0 3px 8px -2px rgba(0,0,0,.3); transition:transform .12s; }
  .pin:hover, .pin.active { transform:scale(1.12); }

  /* quiet suggestions */
  .nudge { all:unset; position:absolute; display:inline-flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap; font-size:12px; font-weight:500; color:var(--accent); background:var(--bg); border-radius:999px; padding:4px 6px 4px 10px; box-shadow:var(--shadow-sm); animation:pop .2s ease-out; }
  .nudge:hover { background:var(--accent-soft); }
  .nudge .x { display:grid; place-items:center; width:16px; height:16px; border-radius:50%; color:var(--muted); font-size:13px; }
  .nudge .x:hover { background:var(--surface); color:var(--text); }

  /* fact-check marks in the margin */
  .checkmark { position:absolute; display:grid; place-items:center; width:18px; height:18px; border-radius:50%; font-size:11px; font-weight:800; color:#fff; cursor:pointer; box-shadow:0 2px 6px -2px rgba(0,0,0,.35); }
  .checkmark.supported { background:#16a34a; } .checkmark.disputed { background:#dc2626; } .checkmark.unclear { background:#d97706; }

  /* image button */
  .imgbtn { position:absolute; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; height:30px; padding:0 12px 0 10px; border-radius:999px;
    background:rgba(17,17,21,.8); color:#fff; border:1px solid rgba(255,255,255,.14); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    font-size:12.5px; font-weight:500; line-height:1; cursor:pointer; box-shadow:0 6px 18px -6px rgba(0,0,0,.4); animation:pop .12s ease-out; }
  .imgbtn:hover { background:rgba(17,17,21,.94); }

  .toast { position:fixed; left:50%; bottom:20px; transform:translateX(-50%); display:flex; gap:12px; align-items:center; max-width:480px; background:#17171b; color:#f4f4f5; padding:10px 14px; border-radius:12px; font-size:13px; box-shadow:0 12px 30px -10px rgba(0,0,0,.5); animation:pop .15s ease-out; }
  .toast button { all:unset; cursor:pointer; font-weight:600; color:#c4b5fd; }
  `;

  const host = document.createElement('inpage-root');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: SHADOW });
  // Clicks and keys made by scripts (the page's, or another extension's that can open closed shadow roots) don't
  // reach inpage's controls, so nothing can run a paid action without the reader. (Tests open the root and drive it.)
  if (SHADOW === 'closed') for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown']) root.addEventListener(t, e => { if (!e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  root.innerHTML = `<style>${CSS}</style><div id="layer"></div><div id="fixed"></div>`;
  const layer = root.getElementById('layer'), fixed = root.getElementById('fixed');
  // Rewritten math in the page needs KaTeX's styles and fonts.
  (document.head || document.documentElement).appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: katexHref }));

  let dark = null;
  const setTheme = () => {
    const d = IP.pageIsDark(); if (d === dark) return;
    dark = d; host.setAttribute('data-theme', d ? 'dark' : 'light');
    frames.forEach(f => f.post({ t: 'theme', dark })); panel?.post({ t: 'theme', dark });
  };

  // ---------- frames: extension pages for the composer and the drawer, on a private port ----------
  const frames = new Map();                 // "kind:nonce" -> frame
  let panel = null;                         // the browser side panel's connection, while it shows this tab
  function makeFrame(kind, cls, parent, onMessage) {
    const nonce = IP.uid(), f = { el: document.createElement('iframe'), port: null, queue: [], onMessage };
    f.post = m => { if (f.port) { try { f.port.postMessage(m); } catch {} } else f.queue.push(m); };
    f.el.className = cls; f.el.title = 'inpage'; f.el.setAttribute('allow', 'clipboard-write');
    f.el.src = `${FRAME_URL}#${kind}:${nonce}`;
    f.key = `${kind}:${nonce}`;
    frames.set(f.key, f);
    parent.appendChild(f.el);
    return f;
  }
  // Frames exist only while open: Chrome won't let other extensions (Claude in Chrome, automation and accessibility
  // tools that use the debugger) attach to a tab that holds another extension's frame.
  function dropFrame(f) { if (!f) return; try { f.port?.disconnect(); } catch {} f.el.remove(); frames.delete(f.key); }
  // Only our own frame pages can open this port (pages can't call chrome.tabs.connect); each frame connects once.
  chrome.runtime.onConnect.addListener(port => {
    const [pre, kind, nonce] = port.name.split(':');
    // The side panel isn't in a tab; a frame page loaded inside a web page is, and can't claim to be the panel.
    if (pre === 'inpage-ui' && kind === 'panel' && port.sender?.id === chrome.runtime.id && port.sender.url?.startsWith(FRAME_SENDER) && (!port.sender.tab || port.sender.frameId === 0)) return panelConnected(port);
    const f = frames.get(`${kind}:${nonce}`);
    if (pre !== 'inpage-ui' || !f || f.port || port.sender?.id !== chrome.runtime.id || !port.sender.url?.startsWith(FRAME_SENDER)) return;
    f.port = port;
    port.onMessage.addListener(m => { if (m && typeof m.t === 'string') f.onMessage(m); });
    port.onDisconnect.addListener(() => { f.port = null; });
    port.postMessage({ t: 'init', dark, web: IP.prefs.web, panel: usePanel && !dframe });
    f.queue.splice(0).forEach(m => port.postMessage(m));
  });
  const setWeb = on => { IP.setWeb(on); frames.forEach(f => f.post({ t: 'web', on })); panel?.post({ t: 'web', on }); };
  setTheme();

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const doc = r => ({ top: r.top + scrollY, left: r.left + scrollX, bottom: r.bottom + scrollY, right: r.right + scrollX, width: r.width, height: r.height });
  const vw = () => document.documentElement.clientWidth, vh = () => innerHeight;
  const clampX = (x, w) => Math.max(scrollX + 8, Math.min(x, scrollX + vw() - w - 8));

  const anchored = new Set();
  const track = (node, place) => { const item = { node, place }; anchored.add(item); place(); return () => { anchored.delete(item); node.remove(); }; };
  let raf = 0;
  const relayout = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; setTheme(); anchored.forEach(a => { if (!a.node.isConnected) anchored.delete(a); else a.place(); }); IP.onRelayout?.(); }); };
  addEventListener('resize', relayout);
  new ResizeObserver(relayout).observe(document.documentElement);
  const contains = e => e && (e === host || e.composedPath?.().includes(host));

  // Place a floating box next to a page rectangle: below if it fits in the viewport, else above, else pinned inside it.
  function placeNear(node, rect, { gap = 10, align = 'left' } = {}) {
    const w = node.offsetWidth, h = node.offsetHeight;
    const below = vh() - rect.bottom - gap, above = rect.top - gap;
    let top;
    if (below >= h || below >= above) top = Math.min(rect.bottom + gap, vh() - h - 12);
    else top = Math.max(12, rect.top - gap - h);
    top = Math.max(12, top);
    const x = align === 'center' ? rect.left + rect.width / 2 - w / 2 : rect.left;
    node.style.top = `${top + scrollY}px`;
    node.style.left = `${clampX(x + scrollX, w)}px`;
  }

  // ---------- selection toolbar ----------
  let toolbar = null;
  // Ask, Rewrite, then the pinned actions (one click runs them on the selection).
  // memo: a glossary entry for the selected term, shown as one line above the toolbar.
  function showToolbar(range, { onAsk, onEdit, onAction, memo }) {
    hideToolbar();
    toolbar = el('div', 'toolbar');
    toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'inpage');
    const b1 = el('button', null, `${icon.ask}Ask`), b2 = el('button', null, `${icon.edit}Rewrite`);
    b1.title = 'Ask about this (Alt+Shift+A)'; b2.title = 'Rewrite this in place (Alt+Shift+R)';
    toolbar.append(b1, b2);
    b1.addEventListener('mousedown', e => { e.preventDefault(); if (IP.real(e)) onAsk(); });
    b2.addEventListener('mousedown', e => { e.preventDefault(); if (IP.real(e)) onEdit(); });
    const pins = IP.actions.filter(a => a.pin && !a.hidden && (a.on === 'ask' || a.on === 'rewrite')).slice(0, 3);
    if (pins.length) toolbar.append(el('span', 'sep'));
    for (const a of pins) {
      const b = el('button', 'pinned', `${icon.spark}<span></span>`);
      b.querySelector('span').textContent = a.label;
      b.title = a.prompt;
      b.addEventListener('mousedown', e => { e.preventDefault(); if (IP.real(e)) onAction(a); });
      toolbar.append(b);
    }
    layer.appendChild(toolbar);
    const r = range.getBoundingClientRect(), w = toolbar.offsetWidth, h = toolbar.offsetHeight;
    const top = r.top - h - 8 > 4 ? r.top - h - 8 : r.bottom + 8;
    toolbar.style.top = `${top + scrollY}px`;
    toolbar.style.left = `${clampX(r.left + r.width / 2 - w / 2 + scrollX, w)}px`;
    if (memo) {
      memoEl = el('button', 'memo', `<span class="mt">${icon.spark}<b></b><span class="mw"></span></span><span class="md"></span>`);
      memoEl.querySelector('b').textContent = memo.term;
      memoEl.querySelector('.mw').textContent = `· you asked ${memo.where === 'here, earlier' ? 'here, earlier' : `on ${memo.where}`}`;
      memoEl.querySelector('.md').textContent = memo.def;
      memoEl.title = 'Open that note';
      memoEl.addEventListener('mousedown', e => { e.preventDefault(); if (IP.real(e)) memo.open(); });
      memoEl.style.width = `${Math.max(300, Math.min(400, w))}px`;
      layer.appendChild(memoEl);
      const mw = memoEl.offsetWidth, mh = memoEl.offsetHeight, above = top + scrollY - mh - 6;
      memoEl.style.top = `${above > scrollY + 4 ? above : top + scrollY + h + 6}px`;
      memoEl.style.left = `${clampX(parseFloat(toolbar.style.left), mw)}px`;   // lined up with the toolbar
    }
  }
  let memoEl = null;
  function hideToolbar() { toolbar?.remove(); toolbar = null; memoEl?.remove(); memoEl = null; }

  // ---------- composer (a frame placed next to the selection; it reports its height) ----------
  let cframe = null, composer = null;               // composer: { rect, onSubmit } while open
  function composerFrame() {
    return cframe ||= makeFrame('composer', 'cframe', layer, m => {
      if (m.t === 'web') return setWeb(!!m.on);
      if (!composer) return;
      if (m.t === 'size' && m.h > 0) { cframe.el.style.height = `${Math.min(m.h, 600)}px`; placeNear(cframe.el, composer.rect); cframe.el.style.visibility = ''; }
      if (m.t === 'close') closeComposer();
      if (m.t === 'new-action') { closeComposer(); IP.page?.show({ draft: 'Make an action that ' }); }
      if (m.t === 'submit' && typeof m.text === 'string' && m.text.trim()) {
        const c = composer; closeComposer({ submitted: true });
        c.onSubmit(m.mode === 'edit' ? 'edit' : 'ask', m.text.trim().slice(0, 4000), { think: !!m.think, web: !!m.web, shown: typeof m.shown === 'string' ? m.shown.slice(0, 80) : undefined, out: m.out === 'check' ? m.out : undefined });
      }
    });
  }
  // video: { at, title } asks about a moment of a video; onCancel runs when it closes without a request.
  function openComposer({ mode, rect, quote, image, video, onSubmit, onCancel }) {
    closeComposer(); hideToolbar();
    const f = composerFrame();
    composer = { rect, onSubmit, onCancel };
    Object.assign(f.el.style, { display: 'block', visibility: 'hidden', width: `${Math.min(420, vw() - 24)}px` });
    placeNear(f.el, rect);
    f.post({ t: 'compose', mode, quote, image: image ? { src: image.currentSrc || image.src, alt: image.alt || '' } : null, video: video || null, actions: { ask: IP.chipsFor('ask'), edit: IP.chipsFor('rewrite'), image: IP.chipsFor('image'), video: IP.chipsFor('video') } });
    f.el.focus();                                   // keyboard focus into the frame; it focuses its textarea
  }
  // Hidden at once; the frame goes a moment later, once the key or click that closed it has finished.
  function closeComposer({ submitted = false } = {}) {
    if (!composer) return;
    const c = composer, f = cframe; composer = null; cframe = null;
    f.el.style.display = 'none'; setTimeout(() => dropFrame(f), 400);
    if (!submitted) c.onCancel?.();
  }

  // ---------- status chip + shimmer over a block being rewritten ----------
  function status(getRect, { onCancel, label: startLabel = 'Rewriting' }) {
    const node = el('div', 'status'), shimmer = el('div', 'shimmer');
    layer.append(shimmer, node);
    const t0 = performance.now();
    let label = startLabel, model = '', streaming = false;
    const paint = () => {
      if (node.classList.contains('error')) return;
      node.innerHTML = `<span class="spin"></span><span>${label}${model ? ` <span class="muted">· ${IP.escapeHTML(model)}</span>` : ''}</span><span class="muted">${((performance.now() - t0) / 1000).toFixed(1)}s</span><button>Cancel</button>`;
      node.querySelector('button').onclick = e => { if (IP.real(e)) onCancel(); };
    };
    const timer = setInterval(paint, 100); paint();
    const place = () => {
      const r = getRect(); if (!r) return;
      const d = doc(r);
      Object.assign(shimmer.style, { top: `${d.top}px`, left: `${d.left}px`, width: `${d.width}px`, height: `${d.height}px` });
      shimmer.className = streaming ? 'streaming' : 'shimmer';
      node.style.top = `${d.top - node.offsetHeight - 12}px`;
      node.style.left = `${clampX(d.right - node.offsetWidth, node.offsetWidth)}px`;
    };
    const untrack = track(node, place);
    return {
      model: m => { model = m; paint(); place(); },
      streaming: () => { streaming = true; label = 'Writing'; paint(); place(); },
      place,
      error: (msg, retry, action) => {
        clearInterval(timer); shimmer.remove();
        node.classList.add('error');
        node.innerHTML = `<span class="msg"></span>${retry ? '<button data-a="retry">Retry</button>' : ''}${action ? '<button data-a="act"></button>' : ''}<button data-a="x" aria-label="Dismiss">${icon.close}</button>`;
        node.querySelector('.msg').textContent = msg;
        node.querySelector('[data-a="x"]').onclick = e => { if (IP.real(e)) untrack(); };
        if (action) { const b = node.querySelector('[data-a="act"]'); b.textContent = action.label; b.onclick = e => { if (IP.real(e)) { untrack(); action.run(); } }; }
        if (retry) node.querySelector('[data-a="retry"]').onclick = e => { if (IP.real(e)) { untrack(); retry(); } };
        place();
      },
      done: () => { clearInterval(timer); shimmer.remove(); untrack(); },
    };
  }

  // ---------- "Ask about this" on images ----------
  let imgBtn = null, imgFor = null, imgHide = 0;
  function showImageButton(img, onClick, { label = 'Ask about this', title = 'Ask about this image (or Alt-click it)' } = {}) {
    clearTimeout(imgHide);
    if (imgFor === img && imgBtn) return;
    imgBtn?.remove(); imgFor = img;
    imgBtn = el('div', 'imgbtn', `${icon.spark}<span></span>`);
    imgBtn.querySelector('span').textContent = label;
    imgBtn.setAttribute('role', 'button'); imgBtn.title = title;
    imgBtn.addEventListener('mouseenter', () => clearTimeout(imgHide));
    imgBtn.addEventListener('mouseleave', () => hideImageButton(250));
    imgBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); if (!IP.real(e)) return; const i = imgFor; hideImageButton(0); onClick(i); });
    layer.appendChild(imgBtn);
    const r = doc(img.getBoundingClientRect());
    imgBtn.style.top = `${r.top + 10}px`; imgBtn.style.left = `${r.right - imgBtn.offsetWidth - 10}px`;
  }
  function hideImageButton(delay = 250) { clearTimeout(imgHide); imgHide = setTimeout(() => { imgBtn?.remove(); imgBtn = null; imgFor = null; }, delay); }

  // ---------- the drawer: the browser's side panel when it has one (the page really makes room), else a frame inside
  // the page. Either way page.js and threads.js send it views (plain data) and handle its actions. ----------
  let dframe = null, onAction = null, viewId = 0;
  let usePanel = false, waitingView = null, panelTimer = 0, panelAsked = false;
  chrome.runtime.sendMessage({ type: 'panel-mode' }).then(v => { usePanel = !!v; }).catch(() => {});
  function handle(m) {
    if (m.t === 'web') return setWeb(!!m.on);
    if (m.t === 'close') return closeDrawer();
    if (m.t !== 'act' || m.view !== viewId) return;       // an action from a view that has since been replaced
    if (m.a === 'close') return closeDrawer();
    if (m.a === 'back') return IP.page?.show();
    onAction?.(m);
  }
  // The side panel follows the active tab; while it's connected to this tab, this tab's drawer is open.
  function panelConnected(port) {
    if (panel) { panel.post({ t: 'replaced' }); try { panel.port.disconnect(); } catch {} }   // the newest panel wins; the old one stops
    const me = panel = { port, post: m => { try { port.postMessage(m); } catch {} } };
    port.onMessage.addListener(m => { if (panel === me && m && typeof m.t === 'string') handle(m); });
    port.onDisconnect.addListener(() => { if (panel !== me) return; panel = null; IP.drawerOpen = false; IP.threads?.clearActive?.(); });
    port.postMessage({ t: 'init', dark, web: IP.prefs.web });
    clearTimeout(panelTimer); panelAsked = false;
    if (dframe) { dropFrame(dframe); dframe = null; makeRoom(false); }   // the panel takes over from an in-page fallback
    IP.drawerOpen = true;
    if (waitingView) { me.post({ t: 'view', view: waitingView }); waitingView = null; }
    else IP.page?.show();
  }
  // Ask the browser to open the panel (works inside a click or a shortcut). If it doesn't connect soon, the drawer
  // opens inside the page instead, so a request never goes nowhere.
  function openPanel() {
    if (!panelAsked) { panelAsked = true; chrome.runtime.sendMessage({ type: 'panel-open' }).catch(() => {}); }
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => { panelAsked = false; if (!panel && waitingView) { const v = waitingView; waitingView = null; showInPage(v); } }, 1500);
  }
  function drawerFrame() { return dframe ||= makeFrame('drawer', 'dframe', fixed, handle); }
  // On wide windows the page makes room for the in-page drawer; on narrow ones it overlays.
  let pushed = null;
  function makeRoom(on) {
    const html = document.documentElement;
    if (on && !pushed && innerWidth >= 1100) {
      pushed = { mr: html.style.getPropertyValue('margin-right'), pr: html.style.getPropertyPriority('margin-right'), tr: html.style.transition };
      html.style.transition = 'margin-right .24s cubic-bezier(.2,.8,.2,1)';
      html.style.setProperty('margin-right', `${Math.min(420, innerWidth * .94)}px`, 'important');
    } else if (!on && pushed) {
      if (pushed.mr) html.style.setProperty('margin-right', pushed.mr, pushed.pr); else html.style.removeProperty('margin-right');
      setTimeout(() => { if (!pushed) html.style.transition = ''; }, 300);
      pushed = null;
    }
    setTimeout(relayout, 260);
  }
  let dropTimer = 0;
  function openInPage() {
    clearTimeout(dropTimer);
    const fresh = !dframe, f = drawerFrame();
    if (!IP.drawerOpen) makeRoom(true);
    if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => f.el.classList.add('open')));   // slide in
    else f.el.classList.add('open');
    IP.drawerOpen = true;
  }
  function showInPage(view) {
    const f = drawerFrame();
    f.post({ t: 'view', view });
    openInPage();
    if (view.focus) f.el.focus();
  }
  function openDrawer() { if (usePanel && !dframe) { if (!panel) openPanel(); } else openInPage(); }
  function closeDrawer() {
    if (panel) { panel.post({ t: 'close-panel' }); return; }      // the panel closes itself; its port then disconnects
    waitingView = null; clearTimeout(panelTimer); panelAsked = false;
    dframe?.el.classList.remove('open'); IP.drawerOpen = false; makeRoom(false); IP.threads?.clearActive?.();
    clearTimeout(dropTimer);
    dropTimer = setTimeout(() => { if (!IP.drawerOpen) { dropFrame(dframe); dframe = null; } }, 320);   // after it slides out
  }
  // A view is plain data (see ui/frame.js); actions come back to `handler` while the view is current.
  function drawerView(view, handler) {
    onAction = handler;
    const v = { ...view, id: ++viewId };
    if (panel) { panel.post({ t: 'view', view: v }); IP.drawerOpen = true; return; }
    if (usePanel && !dframe) { waitingView = v; openPanel(); return; }
    showInPage(v);
  }
  const drawerPending = (key, pending) => (panel || dframe)?.post({ t: 'pending', key, pending });
  const drawerSent = (i, text) => (panel || dframe)?.post({ t: 'sent', i, text: text || null });

  // ---------- toasts ----------
  function toast(msg, actions = []) {
    fixed.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el('div', 'toast'); t.setAttribute('role', 'status');
    const span = el('span'); span.textContent = msg; t.appendChild(span);
    for (const a of actions) { const b = el('button'); b.textContent = a.label; b.onclick = e => { if (IP.real(e)) { t.remove(); a.run(); } }; t.appendChild(b); }
    fixed.appendChild(t);
    setTimeout(() => t.remove(), actions.length ? 9000 : 4500);
  }

  IP.ui = { root, host, layer, fixed, el, icon, doc, clampX, track, relayout, contains, placeNear, showToolbar, hideToolbar, openComposer, closeComposer,
    status, toast, setTheme, showImageButton, hideImageButton, drawerView, drawerPending, drawerSent, openDrawer, closeDrawer,
    get composerOpen() { return !!composer; }, get inPanel() { return !!panel; }, get toolbarOpen() { return !!toolbar; } };
})();
