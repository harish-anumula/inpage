// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Lecture companion: ask about the moment you're at in a video. The answer gets the captions from the minutes
// before that moment and a picture of the current frame (slide, formula, code). Captions come from the video's own
// text track when it has one (course sites), or are collected as they show on screen (YouTube), this visit only.
(() => {
  const IP = window.__inpage, ui = IP.ui;
  let lines = [], keys = new Set(), seenFor = '', watcher = null, watched = null;
  const imported = new WeakMap();                          // text track -> how many cues we've taken

  const mmss = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  IP.mmss = mmss;

  // The video someone is watching: the biggest visible one that is long enough to be a lecture or talk.
  function mainVideo() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect(), a = r.width * r.height;
      if (r.width >= 320 && r.height >= 180 && (v.duration || 0) >= 20 && a > area) { best = v; area = a; }
    }
    return best;
  }

  // Caption lines (start time + text). HTML5 text tracks give the whole transcript; YouTube-style live captions
  // are recorded as they appear.
  const add = (t, text, live) => { const k = `${Math.round(t * 10)}|${text}`; if (!text || keys.has(k)) return; keys.add(k); lines.push({ t, text, ...(live ? { live } : {}) }); };
  function collect(v) {
    if (seenFor !== location.href) { lines = []; keys = new Set(); seenFor = location.href; }
    for (const tt of v.textTracks || []) {
      if (!/captions|subtitles/.test(tt.kind)) continue;
      if (tt.mode === 'disabled') tt.mode = 'hidden';                 // cues load without showing them
      const cues = tt.cues; if (!cues || imported.get(tt) === cues.length) continue;
      for (const c of cues) add(c.startTime, IP.norm(c.text.replace(/<[^>]+>/g, '')));
      imported.set(tt, cues.length);
    }
    const player = v.closest('#movie_player, .html5-video-player') || v.parentElement;
    if (watched !== player) {
      watcher?.disconnect(); watched = player;
      let last = '';
      watcher = new MutationObserver(() => {
        const text = IP.norm([...player.querySelectorAll('.ytp-caption-segment, .captions-text, .vjs-text-track-display')].map(s => s.textContent).join(' '));
        if (!text || text === last) return;
        // live captions roll: keep only what's new when a line continues the previous one
        const fresh = text.startsWith(last) ? text.slice(last.length).trim() : text;
        last = text;
        if (fresh && seenFor === location.href) add(v.currentTime, fresh, true);
        if (lines.length > 6000) lines.splice(0, 2000);
      });
      watcher.observe(player, { childList: true, subtree: true, characterData: true });
    }
    lines.sort((a, b) => a.t - b.t);
  }
  // The captions from the last few minutes, with the last ~30 seconds marked as "just now".
  function captionsBefore(t, secs = 180) {
    const fmt = l => `[${mmss(l.t)}] ${l.text}`;
    const before = lines.filter(l => l.t >= t - secs && l.t < t - 30), recent = lines.filter(l => l.t >= t - 30 && l.t <= t + 0.5);
    if (!before.length && !recent.length) return '';
    return `${before.length ? `Earlier:\n${before.map(fmt).join('\n')}\n\n` : ''}Just now (the last 30 seconds):\n${recent.length ? recent.map(fmt).join('\n') : '(nothing was said)'}`;
  }

  // The current frame, cropped to the player, as a JPEG data URL. inpage's own UI is hidden for the moment of capture.
  async function frame(v) {
    const r = v.getBoundingClientRect();
    ui.host.style.visibility = 'hidden';
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    let shot = null;
    try { shot = await chrome.runtime.sendMessage({ type: 'capture' }); } catch {}
    ui.host.style.visibility = '';
    if (!shot) return null;
    const img = new Image(); img.src = shot; await img.decode();
    const k = img.width / innerWidth;
    const x = Math.max(0, r.left * k), y = Math.max(0, r.top * k), w = Math.min(img.width - x, r.width * k), h = Math.min(img.height - y, r.height * k);
    if (w < 50 || h < 50) return null;
    const scale = Math.min(1, 1280 / w), c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  // "Ask about this moment": the composer, with the video's chips; the moment is fixed when it opens.
  function ask(v = mainVideo()) {
    if (!v) return ui.toast('No video to ask about here.');
    collect(v);
    const t = v.currentTime, wasPlaying = !v.paused;
    v.pause();
    ui.openComposer({
      mode: 'ask', rect: v.getBoundingClientRect(), video: { at: mmss(t), title: document.title.replace(/ - YouTube$/, '') },
      onSubmit: (_m, text, opts) => start(v, t, text, opts).catch(e => ui.toast(e.message)),
      onCancel: () => { if (wasPlaying) v.play().catch(() => {}); },
    });
  }
  async function start(v, t, question, { think, web, shown, span } = {}) {
    collect(v);
    const caps = captionsBefore(t, span || 180), shot = await frame(v);
    const title = document.title.replace(/ - YouTube$/, '');
    const parts = [`the video title`, caps ? `captions from ${mmss(Math.max(0, t - 180))} to ${mmss(t)}` : 'no captions (none were available)', ...(shot ? ['a picture of the current frame'] : [])];
    const context = `The viewer is at ${mmss(t)} in the video.\n${IP.untrusted('video', `Title: ${title}\nPage: ${location.hostname}\n\nCaptions before this moment:\n${caps || '(No captions were available. Turn on captions (CC) so inpage can follow what is said.)'}`)}`;
    IP.threads.startVideo({ t, title, url: location.href, context, image: shot, parts }, question, { think, web, shown });
  }
  // Jump the video to a time (from a thread or a timestamp in an answer).
  function seek(s) {
    const v = mainVideo(); if (!v || !isFinite(s)) return;
    v.currentTime = Math.max(0, s); v.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // The hover pill over a playing or paused video.
  let pillFor = null, lastMove = 0;
  document.addEventListener('mousemove', e => {
    const now = performance.now(); if (now - lastMove < 120) return; lastMove = now;
    if (ui.contains(e)) return;
    const v = mainVideo(); if (!v) { if (pillFor) { ui.hideImageButton(0); pillFor = null; } return; }
    const r = v.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) { ui.showImageButton(v, () => ask(v), { label: 'Ask about this moment' }); pillFor = v; }
    else if (pillFor) { ui.hideImageButton(); pillFor = null; }
  }, { passive: true });

  // Keep collecting while a video is on the page (cheap: a few element checks every few seconds; nothing leaves the page).
  setInterval(() => { if (document.hidden) return; const v = mainVideo(); if (v) collect(v); }, 3000);

  // "Recap" from a rewind: explain the stretch from a to b again, with its captions.
  const recap = (v, a, b, label) => { v.pause(); return start(v, b, `Explain the part from ${mmss(a)} to ${mmss(b)} again, step by step: I rewound it twice.`, { shown: label, span: Math.min(300, b - a + 60) }).catch(e => ui.toast(e.message)); };

  IP.video = { mainVideo, ask, seek, collect, recap, get lines() { return lines; } };
})();
