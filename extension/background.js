// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Calls OpenRouter straight from the extension (streaming, cancellable), checks the key for the popup and
// settings, and forwards keyboard shortcuts. The key lives in chrome.storage.local on this device only.
importScripts('presets.js', 'prompts.js');
const API = 'https://openrouter.ai/api/v1';
const JEV_URL = 'https://openrouter.ai/api/alpha/decisions';

// Only extension pages and this worker can read storage; content scripts ask the worker (and never get the key).
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
const ours = sender => sender?.id === chrome.runtime.id;
const PRIVATE_KEYS = new Set(['apiKey']);
// A content script reads and writes only its own site's records (inpage:<origin><path><query>); extension pages, all.
const ownRecord = (sender, k) => {
  if (!k.startsWith('inpage:') || sender.url?.startsWith(chrome.runtime.getURL(''))) return true;
  try { return k.startsWith(`inpage:${new URL(sender.url).origin}/`); } catch { return false; }   // the same site (sender.url can lag a single-page app's route)
};

let switches = 0;
chrome.tabs.onActivated.addListener(() => { switches++; });
chrome.runtime.onInstalled.addListener(({ reason }) => { if (reason === 'install') chrome.runtime.openOptionsPage(); });

async function settings() {
  const s = await chrome.storage.local.get(['apiKey', 'modelId']);
  return { apiKey: s.apiKey, preset: INPAGE_MODELS.find(m => m.id === s.modelId) || INPAGE_MODELS[0] };
}

// Images go to the model as data URLs when we can fetch them, otherwise as their web address. Only public http(s)
// images: no localhost, private or link-local addresses in any spelling, no other schemes (a page could otherwise point
// us at an intranet). Fetched without cookies and without following redirects, and only up to 4 MB.
function publicImageURL(src) {
  try {
    const u = new URL(src);
    if (u.protocol === 'data:') return /^data:image\//.test(src);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (u.username || u.password) return false;
    const h = u.hostname.toLowerCase().replace(/\.+$/, '');                     // 'localhost.' is localhost
    if (h.startsWith('[')) return false;                                    // IPv6 literals (::1, ::ffff:127.0.0.1, fc00::…)
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa') || !h.includes('.')) return false;
    const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);                      // the URL parser already turns 0x7f.1 and 2130706433 into this form
    if (ip) { const [a, b] = [+ip[1], +ip[2]]; if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) return false; }
    return true;
  } catch { return false; }
}
const MAX_IMAGE = 4_000_000;
async function imagePart(src) {
  if (!publicImageURL(src)) return null;
  if (src.startsWith('data:')) return src.length < MAX_IMAGE * 1.4 ? { type: 'image_url', image_url: { url: src } } : null;
  try {
    const r = await fetch(src, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (r.ok && /^image\/[\w.+-]+$/.test(type) && !(Number(r.headers.get('content-length')) > MAX_IMAGE)) {
      const reader = r.body.getReader(), parts = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > MAX_IMAGE) { reader.cancel(); throw new Error('too big'); }
        parts.push(value);
      }
      const buf = new Uint8Array(size); let at = 0; for (const p of parts) { buf.set(p, at); at += p.length; }
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { type: 'image_url', image_url: { url: `data:${type};base64,${btoa(bin)}` } };
    }
  } catch {}
  return null;                                                              // couldn't load it safely: the model doesn't get it
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'inpage-run' || !ours(port.sender)) return;
  const abort = new AbortController();
  port.onDisconnect.addListener(() => abort.abort());          // the page cancelled or closed
  const post = m => { try { port.postMessage(m); } catch {} };
  port.onMessage.addListener(async job => {
    if (!job || typeof job.system !== 'string' || !Array.isArray(job.messages) || !job.messages.length) return post({ type: 'error', message: 'Something went wrong with that request.' });
    // A long thread keeps its first message (it carries the passage) and the latest exchanges, in turn order.
    if (job.messages.length > 60) job.messages = [job.messages[0], ...job.messages.slice(-58)];
    const { apiKey } = await settings();
    let { preset } = await settings();
    if (!apiKey) return post({ type: 'error', code: 'key', message: 'Add your OpenRouter key in inpage settings.' });
    const hasImages = job.messages.some(m => m.images?.length);
    if (hasImages && !preset.vision) preset = INPAGE_MODELS.find(m => m.id === INPAGE_VISION_FALLBACK);
    const think = !!(preset.think || job.think);
    post({ type: 'model', label: preset.label + (job.think && !preset.think ? ', thinking' : '') + (job.web ? ' + web' : '') });

    const messages = [{ role: 'system', content: job.system }];
    for (const m of job.messages) {
      if (!m.images?.length) { messages.push({ role: m.role, content: m.content }); continue; }
      const parts = (await Promise.all(m.images.slice(0, 3).map(imagePart))).filter(Boolean);
      if (!parts.length && m.needImage) return post({ type: 'error', code: 'image', message: 'inpage couldn’t load that image (it may need a login, sit on a private address, or be over 4 MB), so nothing was sent.' });
      messages.push({ role: m.role, content: [{ type: 'text', text: m.content }, ...parts] });
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${API}/chat/completions`, {
        method: 'POST', signal: abort.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'inpage' },
        body: JSON.stringify({
          model: preset.model, stream: true, messages, usage: { include: true },   // the last chunk reports tokens and the exact cost
          // Reasoning off by default: DeepSeek Flash answers in ~1-2 s without it, ~5-8 s with it. The router picks its own.
          ...(preset.router ? {} : { reasoning: think ? { effort: 'medium' } : { enabled: false } }),
          // Web search: the Parallel engine was fastest in tests (~3.5 s to first text, ~$0.005 a search).
          ...(job.web ? { plugins: [{ id: 'web', engine: 'parallel', max_results: 5 }] } : {}),
          ...(job.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (res.status === 401) return post({ type: 'error', code: 'key', message: 'OpenRouter rejected the key. Check it in inpage settings.' });
      if (res.status === 402) return post({ type: 'error', code: 'credits', message: 'Your OpenRouter credits have run out.' });
      if (!res.ok) return post({ type: 'error', message: `OpenRouter error ${res.status}: ${(await res.text()).slice(0, 160)}` });
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', text = '', usage = null;
      const sources = new Map();
      const addSources = list => { for (const a of list || []) { const c = a.url_citation || a; if (c?.url && !sources.has(c.url)) sources.set(c.url, { url: c.url, title: c.title || '' }); } };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:') || line.endsWith('[DONE]')) continue;
          try {
            const d = JSON.parse(line.slice(5));
            if (d.error) return post({ type: 'error', message: d.error.message || 'The model returned an error.' });
            addSources(d.choices?.[0]?.delta?.annotations); addSources(d.choices?.[0]?.message?.annotations);
            if (d.usage) usage = { cost: d.usage.cost, input: d.usage.prompt_tokens, output: d.usage.completion_tokens };
            const delta = d.choices?.[0]?.delta?.content;
            if (delta) { text += delta; post({ type: 'delta', text: delta }); }
          } catch {}
        }
      }
      post({ type: 'done', text, ms: Date.now() - t0, sources: [...sources.values()], usage, model: preset.label + (think ? ', thinking' : '') + (job.web ? ' + web' : '') });
    } catch (e) {
      if (!abort.signal.aborted) post({ type: 'error', code: 'network', message: 'Could not reach OpenRouter. Check your connection.' });
    }
  });
});

// Jev decisions for routing and page checks: typed choices with probabilities, same OpenRouter key.
// Best-effort: null when switched off, slow (>2.5 s), failing or malformed, and callers then do what they did before.
async function jev(state, ids) {
  const { apiKey, jev: on = true } = await chrome.storage.local.get(['apiKey', 'jev']);
  const questions = Object.fromEntries((Array.isArray(ids) ? ids : []).filter(id => Object.hasOwn(INPAGE_JEV, id)).map(id => [id, INPAGE_JEV[id]]));
  if (!apiKey || !on || !Object.keys(questions).length || !state || typeof state !== 'object' || JSON.stringify(state).length > 40000) return null;
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 2500);
  try {
    const r = await fetch(JEV_URL, { method: 'POST', signal: abort.signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'inpage' }, body: JSON.stringify({ model: INPAGE_JEV_MODEL, state, questions }) });
    if (!r.ok) return null;
    const doc = await r.json(), answers = doc.answers || {}, out = { _cost: Number(doc.usage?.cost) || 0 };
    for (const id of Object.keys(questions)) {
      const a = answers[id], p = a?.probabilities;
      if (!a || !Object.hasOwn(questions[id].criteria, a.choice) || !p || typeof p !== 'object') return null;
      out[id] = { choice: a.choice, p: Object.fromEntries(Object.keys(questions[id].criteria).map(k => [k, Number(p[k]) || 0])) };
    }
    return out;
  } catch { return null; } finally { clearTimeout(timer); }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!ours(sender) || !msg || typeof msg.type !== 'string') return;
  // A preview of an image for the extension's own pages (the side panel, All notes), loaded under the same rules as
  // images for the model, so those pages never fetch a page-chosen address themselves (their CSP allows no web images).
  if (msg.type === 'image-preview') {
    if (!sender.url?.startsWith(chrome.runtime.getURL('')) || typeof msg.src !== 'string') return;
    imagePart(msg.src).then(p => reply(p?.image_url.url || null), () => reply(null));
    return true;
  }
  if (msg.type === 'store-get') {
    const keys = (Array.isArray(msg.keys) ? msg.keys : []).filter(k => typeof k === 'string' && !PRIVATE_KEYS.has(k) && ownRecord(sender, k));
    chrome.storage.local.get(keys).then(reply);
    return true;
  }
  if (msg.type === 'store-set') {
    const items = Object.fromEntries(Object.entries(msg.items || {}).filter(([k]) => !PRIVATE_KEYS.has(k) && (['webSearch', 'actions', 'glossary', 'reading'].includes(k) || k.startsWith('inpage:')) && ownRecord(sender, k)));
    for (const k of Object.keys(items)) if (k.startsWith('inpage:')) { items[k] = INPAGE_cleanRecord(items[k]); if (!items[k]) delete items[k]; }
    if ('actions' in items) { items.actions = INPAGE_cleanActions(items.actions); if (!items.actions) delete items.actions; }
    if ('glossary' in items) { items.glossary = INPAGE_cleanGlossary(items.glossary); if (!items.glossary) delete items.glossary; }
    if ('reading' in items) { items.reading = INPAGE_cleanReading(items.reading); if (!items.reading) delete items.reading; }
    chrome.storage.local.set(items).then(() => reply(true));
    return true;
  }
  if (msg.type === 'health') {
    (async () => {
      const { apiKey, preset } = await settings();
      if (!apiKey) return reply({ ok: false, reason: 'nokey', preset });
      try {
        const r = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!r.ok) return reply({ ok: false, reason: r.status === 401 ? 'badkey' : 'error', preset });
        const d = (await r.json()).data || {};
        reply({ ok: true, preset, usage: d.usage, limit: d.limit, limitRemaining: d.limit_remaining });
      } catch { reply({ ok: false, reason: 'offline', preset }); }
    })();
    return true;
  }
  // A picture of the visible tab, for questions about a video frame (the content script crops it to the player).
  // Only when the asking tab is the one on screen, before and after, so a quick tab switch can't capture another site.
  if (msg.type === 'capture') {
    const onScreen = () => chrome.tabs.query({ active: true, windowId: sender.tab?.windowId }).then(([t]) => t?.id === sender.tab?.id);
    (async () => {
      const before = switches;                                       // any tab switch from here on (even A→B→A): discard
      if (!sender.tab || !(await onScreen())) return reply(null);
      const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 82 }).catch(() => null);
      const still = await onScreen();
      reply(shot && still && switches === before ? shot : null);
    })();
    return true;
  }
  // ---------- other open tabs as sources (only tabs where inpage runs, in this window) ----------
  if (msg.type === 'tabs-list') {
    chrome.tabs.query({ windowId: sender.tab?.windowId }).then(tabs => reply(tabs.filter(t => t.id !== sender.tab?.id && /^https?:/.test(t.url || '')).map(t => ({ id: t.id, title: t.title, url: t.url, discarded: t.discarded }))));
    return true;
  }
  if (msg.type === 'tabs-text') {
    const ask = id => Promise.race([chrome.tabs.sendMessage(id, { type: 'page-text' }), new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null);
    (async () => {
      const ids = (Array.isArray(msg.ids) ? msg.ids : []).filter(Number.isInteger).slice(0, 6);
      const out = [];
      for (const id of ids) {
        const t = await chrome.tabs.get(id).catch(() => null);
        if (!t || t.windowId !== sender.tab?.windowId) { out.push({ id, error: 'closed' }); continue; }
        const r = t.discarded ? null : await ask(id);
        out.push(r?.text ? { id, title: r.title || t.title, url: r.url || t.url, text: String(r.text).slice(0, 26000) } : { id, title: t.title, url: t.url, error: t.discarded ? 'asleep' : 'unreadable' });
      }
      reply(out);
    })();
    return true;
  }
  if (msg.type === 'tab-find' || msg.type === 'tab-flash') {
    (async () => {
      const t = await chrome.tabs.get(msg.id).catch(() => null);
      if (!t || t.windowId !== sender.tab?.windowId) return reply(false);
      if (msg.type === 'tab-flash') { await chrome.tabs.update(msg.id, { active: true }); }
      reply(await chrome.tabs.sendMessage(msg.id, { type: msg.type === 'tab-flash' ? 'flash-quote' : 'find-quote', quote: String(msg.quote || '').slice(0, 400) }).catch(() => false));
    })();
    return true;
  }
  // ---------- the drawer in the browser's side panel (the page really compresses); "page" keeps it inside the page ----------
  if (msg.type === 'panel-mode') { reply(!!chrome.sidePanel?.open && panelPref); return; }
  if (msg.type === 'panel-open') {
    // must run straight away, inside the click that asked for it, or the browser refuses
    if (!chrome.sidePanel?.open || !sender.tab) { reply(false); return; }
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => reply(true), () => reply(false));
    return true;
  }
  if (msg.type === 'jev') { jev(msg.state, msg.ids).then(reply); return true; }
  if (msg.type === 'open-options') chrome.runtime.openOptionsPage();
  if (msg.type === 'open-library') chrome.tabs.create({ url: chrome.runtime.getURL(`library.html${typeof msg.page === 'string' ? `?page=${encodeURIComponent(msg.page)}` : ''}`) });
  if (msg.type === 'open-actions') chrome.tabs.create({ url: chrome.runtime.getURL('options.html#actions') });
});

// Open tabs keep a copy of the actions; tell them when the list changes (Settings, an import, or chat in another tab).
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !(changes.actions || changes.glossary || changes.memory)) return;
  const type = changes.actions ? 'actions-changed' : 'memory-changed';
  for (const t of await chrome.tabs.query({})) if (t.id) chrome.tabs.sendMessage(t.id, { type }).catch(() => {});
});

// Kept in memory so the shortcut can open the panel immediately (an await first would lose the user gesture).
let panelPref = true;
chrome.storage.local.get('drawerMode').then(v => { panelPref = v.drawerMode !== 'page'; });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.drawerMode) panelPref = c.drawerMode.newValue !== 'page'; });
chrome.commands?.onCommand.addListener(async (command, tab) => {
  // the shortcut is a user gesture: open the side panel now (the page then toggles it closed if it was open)
  if (command === 'panel' && panelPref && chrome.sidePanel?.open && tab?.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'command', command }).catch(() => {});
});
