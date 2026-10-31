// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Quiet suggestions, from what you do (nothing is sent until you click):
// - you scroll back to the same paragraph a third time and stay on it: a small "Stuck? Explain this" by it;
// - you rewind over the same part of a video twice: "Recap 12:10–12:40" on the player.
// At most a couple per page, never twice for the same spot; Settings → "Quiet suggestions" turns them off.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  let on = true, shown = 0, lastShown = 0;
  const MAX = 2, GAP = 90000;                                  // per page visit; at least 90 s apart
  const load = () => IP.store.get(['memory']).then(v => { on = v?.memory?.nudges !== false; }).catch(() => {});
  load();
  const allowed = () => on && shown < MAX && Date.now() - lastShown > GAP && !ui.composerOpen && !(IP.drawerOpen && !ui.inPanel);   // the side panel doesn't cover the page
  const spent = () => { shown++; lastShown = Date.now(); };

  // ---------- re-reading a paragraph ----------
  const seen = new WeakMap();               // block -> { left: when it last left view, returns, done }
  let io = null, watching = new Set(), chip = null;
  function watch() {
    io?.disconnect(); watching = new Set();
    io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const s = seen.get(e.target) || { left: 0, leftY: 0, returns: 0, done: false };
        if (e.isIntersecting) {
          // back in view after a while away, and you went back up the page to reach it (wheel, keys or a link)
          if (s.left && Date.now() - s.left > 6000 && scrollY < s.leftY - 40) s.returns++;
          if (s.returns >= 2 && !s.done) { clearTimeout(s.timer); s.timer = setTimeout(() => offerExplain(e.target, s), 4000); }   // and you stay on it
        } else { s.left = Date.now(); s.leftY = scrollY; clearTimeout(s.timer); if (chip?.for === e.target) hideChip(); }
        seen.set(e.target, s);
      }
    }, { threshold: 0.6 });
    for (const b of IP.page.blocks().filter(b => b.tagName === 'P' || b.tagName === 'LI').slice(0, 300)) { io.observe(b); watching.add(b); }
  }
  function offerExplain(block, s) {
    const r = block.getBoundingClientRect();
    if (!allowed() || r.bottom < 0 || r.top > innerHeight || s.done) return;
    s.done = true; spent();
    hideChip();
    const el = ui.el('button', 'nudge', `${ui.icon.spark}<span>Stuck? Explain this</span><span class="x" aria-label="Dismiss">×</span>`);
    el.title = 'You came back to this paragraph a few times. Ask about it?';
    el.addEventListener('mousedown', e => {
      if (!IP.real(e)) return;
      e.preventDefault(); e.stopPropagation();
      hideChip();
      if (e.target.closest('.x')) return;
      const range = document.createRange(); range.selectNodeContents(block);
      ui.openComposer({ mode: 'ask', rect: block.getBoundingClientRect(), quote: IP.rangeText(range).slice(0, 160), onSubmit: (_m, text, opts) => IP.threads.start(range, text, opts) });
    });
    ui.layer.appendChild(el);
    // in the margin beside the paragraph's first line: left if there's room, else right, else just above it
    const d = ui.doc(r), w = el.offsetWidth, h = el.offsetHeight, vw = document.documentElement.clientWidth;
    const line = parseFloat(getComputedStyle(block).lineHeight) || 24;
    if (r.left - w - 16 > 8) { el.style.left = `${d.left - w - 16}px`; el.style.top = `${d.top + (line - h) / 2}px`; }
    else if (r.right + w + 16 < vw - 8) { el.style.left = `${d.right + 16}px`; el.style.top = `${d.top + (line - h) / 2}px`; }
    else { el.style.left = `${Math.max(scrollX + 8, d.left)}px`; el.style.top = `${d.top - h - 6}px`; }
    chip = { el, for: block };
    setTimeout(() => { if (chip?.el === el) hideChip(); }, 12000);
  }
  function hideChip() { chip?.el.remove(); chip = null; }

  // ---------- rewinding a video ----------
  let lastT = 0, rewinds = [], vidFor = null;
  function watchVideo(v) {
    if (vidFor === v) return; vidFor = v; rewinds = [];
    v.addEventListener('timeupdate', () => { if (!v.seeking) lastT = v.currentTime; });
    v.addEventListener('seeking', () => {
      const from = lastT, to = v.currentTime, back = from - to;
      if (back < 4 || back > 150 || from >= (v.duration || Infinity) - 1) return;       // not a rewind: a tiny nudge, a jump, or restarting at the end
      const now = Date.now();
      rewinds = rewinds.filter(x => now - x.at < 5 * 60000);
      const again = rewinds.find(x => to < x.from + 5 && from > x.to - 5);       // overlaps a part you already rewound
      rewinds.push({ from, to, at: now });
      if (again && on && shown < MAX && Date.now() - lastShown > GAP) {       // fine with the drawer open: you may be watching beside it
        spent();
        // the stretch you went over again: both rewinds together, or just their overlap when that would be long
        let a = Math.min(to, again.to), b = Math.max(from, again.from);
        if (b - a > 90) { a = Math.max(to, again.to); b = Math.min(from, again.from); }
        a = Math.max(0, a);
        const label = `Recap ${IP.mmss(a)}–${IP.mmss(b)}`;
        ui.showImageButton(v, () => IP.video.recap(v, a, b, label), { label, title: 'You rewound this part twice. Have it explained again?' });
        setTimeout(() => ui.hideImageButton(0), 10000);
      }
    });
  }

  // Start once the page has settled; restart after single-page navigation; check for videos now and then.
  setTimeout(() => { try { watch(); } catch {} }, 2500);
  IP.nudges = { rewatch: () => { try { watch(); } catch {} }, reload: load, watchVideo, get shown() { return shown; }, reset: () => { shown = 0; lastShown = 0; } };
  setInterval(() => { const v = IP.video?.mainVideo(); if (v) watchVideo(v); }, 3000);
})();
