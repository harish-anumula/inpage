// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// The notes library: every page with inpage notes, searchable, with the notes rendered, Markdown export per page
// or for everything, and a JSON backup you can restore. Reads chrome.storage.local directly (an extension page).
const IP = window.__inpage, $ = id => document.getElementById(id);
let pages = [], current = null, glossary = {};

const esc = IP.escapeHTML;
const day = ts => ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const textOf = r => [r.title, ...(r.checks || []).flatMap(c => (c.items || []).flatMap(it => [it.claim, it.note])), ...(r.threads || []).flatMap(t => [t.quote?.exact, ...t.messages.map(m => m.shown || m.content)]), ...(r.chat || []).map(m => m.shown || m.content), ...(r.edits || []).flatMap(e => [e.instructions?.join(' '), e.originalText, e.anchorText])].filter(Boolean).join('\n');
const counts = r => [r.threads?.length && `${r.threads.length} question${r.threads.length === 1 ? '' : 's'}`, (r.chat || []).filter(m => m.role === 'user').length && `${(r.chat || []).filter(m => m.role === 'user').length} page chat`, r.edits?.length && `${r.edits.length} change${r.edits.length === 1 ? '' : 's'}`, (r.checks || []).some(c => c.items?.length) && 'fact-checked'].filter(Boolean);
const toast = msg => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600); };
const download = (name, text, type = 'text/markdown') => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

async function load() {
  const all = await chrome.storage.local.get(null);
  glossary = INPAGE_cleanGlossary(all.glossary) || {};
  pages = Object.entries(all).filter(([k, v]) => k.startsWith('inpage:') && v && typeof v === 'object' && counts(v).length)
    .map(([key, r]) => ({ key, r, url: INPAGE_MD.urlOf(key), text: textOf(r).toLowerCase() }))
    .sort((a, b) => (b.r.updated || 0) - (a.r.updated || 0));
  renderList();
  const want = new URLSearchParams(location.search).get('page');
  if (current === 'glossary') return showGlossary();
  const pick = (want && pages.find(p => p.url === want)) || pages.find(p => p.key === current?.key) || pages[0];
  if (pick) show(pick); else if (Object.keys(glossary).length) showGlossary(); else renderEmpty();
}

function snippet(text, q) {
  const i = text.indexOf(q); if (i < 0) return '';
  const raw = text.slice(Math.max(0, i - 60), i + q.length + 80).replace(/\s+/g, ' ');
  return `${i > 60 ? '…' : ''}${esc(raw).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`)}…`;
}
function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const shown = q ? pages.filter(p => p.text.includes(q) || p.url.toLowerCase().includes(q)) : pages;
  const terms = Object.values(glossary).filter(e => !q || `${e.term} ${e.def}`.toLowerCase().includes(q));
  const gloss = Object.keys(glossary).length ? `<button class="item gloss" data-glossary aria-current="${current === 'glossary'}"><div class="t">Your glossary</div><div class="s"><span>${terms.length} term${terms.length === 1 ? '' : 's'}${q ? ' match' : ''}</span></div></button>` : '';
  $('list').innerHTML = gloss + (shown.length ? shown.map(p => `<button class="item" data-key="${esc(p.key)}" aria-current="${p.key === current?.key}">
      <div class="t">${esc(p.r.title || p.url)}</div><div class="s"><span>${esc(IP.host(p.url))}</span><span>${day(p.r.updated)}</span><span>${counts(p.r).join(' · ')}</span></div>
      ${q && p.text.includes(q) ? `<div class="hit">${snippet(p.text, q)}</div>` : ''}</button>`).join('')
    : `<p class="nothing">${pages.length ? 'No notes match.' : 'No notes yet.'}</p>`);
  $('list').querySelectorAll('.item[data-key]').forEach(b => b.onclick = () => show(pages.find(p => p.key === b.dataset.key)));
  $('list').querySelector('[data-glossary]')?.addEventListener('click', showGlossary);
}
function showGlossary() {
  current = 'glossary';
  const q = $('q').value.trim().toLowerCase();
  const rows = Object.entries(glossary).filter(([, e]) => !q || `${e.term} ${e.def}`.toLowerCase().includes(q)).sort((a, b) => a[1].term.localeCompare(b[1].term));
  $('detail').innerHTML = `<div class="inner"><div class="dh"><h2>Your glossary</h2><div class="url">Terms you asked about, in your own words. Select one on any page to see it again.</div></div>
    <div class="acts"><button class="btn" data-a="gmd">Copy as Markdown</button></div>
    <div class="card">${rows.map(([k, e]) => `<div class="edit gl"><div style="flex:1"><div class="i">${esc(e.term)}</div><div class="o" style="color:var(--text2)">${esc(e.def)}</div><div class="o"><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title || IP.host(e.url))}</a> · ${day(e.ts)}</div></div><button class="btn danger" data-del="${esc(k)}" title="Forget this term">Forget</button></div>`).join('') || '<p class="nothing">No terms match.</p>'}</div></div>`;
  $('detail').querySelector('[data-a="gmd"]').onclick = async () => { await navigator.clipboard.writeText(INPAGE_MD.glossary(glossary)); toast('Copied as Markdown'); };
  $('detail').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { delete glossary[b.dataset.del]; await chrome.storage.local.set({ glossary }); showGlossary(); renderList(); });
  renderList();
}
function renderEmpty() {
  $('detail').innerHTML = `<div class="empty"><h2>No notes yet</h2><p>Select text on any page and choose Ask or Rewrite, or open inpage (Alt+Shift+I) to ask about the whole page. Everything you keep shows up here.</p></div>`;
}

const videoAt = v => { try { const u = new URL(v.url); u.searchParams.set('t', `${Math.floor(v.t)}s`); return u.href; } catch { return v.url; } };
const ans = m => `<div class="a">${IP.markdown(IP.citesToText(m.content))}</div>${m.sources?.length ? `<div class="src">Sources: ${IP.dedupeSources(m.sources).filter(s => /^https?:/i.test(s.url)).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(IP.host(s.url))}</a>`).join(' · ')}</div>` : ''}`;
function show(p) {
  current = p;
  const r = p.r, threads = r.threads || [], chat = (r.chat || []).filter(m => m.kind !== 'actions'), edits = r.edits || [];
  $('detail').innerHTML = `<div class="inner"><div class="dh"><h2>${esc(r.title || p.url)}</h2><div class="url"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a> · ${day(r.updated)}</div></div>
    <div class="acts"><button class="btn primary" data-a="open">Open page</button><button class="btn" data-a="copy">Copy as Markdown</button><button class="btn" data-a="md">Download .md</button><button class="btn danger" data-a="del">Delete notes</button></div>
    ${threads.length ? `<h3>Questions</h3>${threads.map((t, i) => `<div class="card"><div class="quote">${t.quote?.video ? `<a href="${esc(videoAt(t.quote.video))}" target="_blank" rel="noopener noreferrer">${esc(t.quote.exact)}</a>` : t.quote?.image ? `<img alt="" data-src="${esc(t.quote.image)}">` : esc(t.quote?.exact || '')}</div>
      ${t.messages.map((m, j) => m.role === 'user' ? `<div class="q">${j ? '' : `${i + 1}. `}${esc(m.shown || m.content)}</div>` : m.error ? `<div class="err">${esc(m.content)}</div>` : ans(m)).join('')}</div>`).join('')}` : ''}
    ${chat.length ? `<h3>About the whole page</h3><div class="card">${chat.map(m => m.role === 'user' ? `<div class="q">${esc(m.shown || m.content)}</div>` : m.kind === 'changes' ? (() => { const b = (r.batches || []).find(x => x.id === m.batch); return b ? `<p><em>Changed the page: ${esc(b.summary)}</em></p>` : ''; })() : m.error ? `<div class="err">${esc(m.content)}</div>` : ans(m)).join('')}</div>` : ''}
    ${(r.checks || []).some(c => c.items?.length) ? `<h3>Fact-checks</h3><div class="card">${(r.checks || []).flatMap(c => c.items || []).map(it => `<div class="edit"><span class="k v-${esc(it.verdict)}">${it.verdict === 'supported' ? '✓' : it.verdict === 'disputed' ? '!' : '?'}</span><div><div class="i">${esc(it.claim)}</div><div class="o">${esc(it.note || '')}${it.sources?.length ? ` · ${it.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(IP.host(s.url))}</a>`).join(' · ')}` : ''}</div></div></div>`).join('')}</div>` : ''}
    ${edits.length ? `<h3>Changes to the page</h3><div class="card">${edits.map(e => `<div class="edit"><span class="k">${e.kind === 'insert' ? '+' : '✎'}</span><div><div class="i">${esc(e.instructions?.at(-1) || '')}</div><div class="o">${e.kind === 'rewrite' ? 'Rewrote' : 'Added after'} “${esc((e.originalText || e.anchorText || '').slice(0, 160))}”</div></div></div>`).join('')}</div>` : ''}
  </div>`;
  $('detail').querySelectorAll('img[data-src]').forEach(i => { const s = i.dataset.src; if (/^data:image\//.test(s)) i.src = s; else chrome.runtime.sendMessage({ type: 'image-preview', src: s }).then(u => { if (u) i.src = u; }).catch(() => {}); });
  $('detail').querySelectorAll('.a').forEach(n => { IP.renderMath(n, true); n.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; }); });
  $('detail').querySelector('[data-a="open"]').onclick = () => chrome.tabs.create({ url: p.url });
  $('detail').querySelector('[data-a="copy"]').onclick = async () => { await navigator.clipboard.writeText(INPAGE_MD.note(p.key, p.r)); toast('Copied as Markdown'); };
  $('detail').querySelector('[data-a="md"]').onclick = () => download(INPAGE_MD.filename(r.title || IP.host(p.url)), INPAGE_MD.note(p.key, p.r));
  $('detail').querySelector('[data-a="del"]').onclick = async () => {
    if (!confirm('Delete every note on this page? Open tabs keep showing them until they reload.')) return;
    await chrome.storage.local.remove(p.key); current = null; toast('Deleted'); load();
  };
  $('detail').scrollTop = 0;
  renderList();
}

$('q').addEventListener('input', () => { renderList(); if (current === 'glossary') showGlossary(); });
const pop = $('exportPop');
$('exportBtn').onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; $('exportBtn').setAttribute('aria-expanded', String(!pop.hidden)); };
document.addEventListener('click', () => { pop.hidden = true; $('exportBtn').setAttribute('aria-expanded', 'false'); });
pop.addEventListener('click', async e => {
  const x = e.target.closest('button')?.dataset.x; if (!x) return;
  const stamp = new Date().toISOString().slice(0, 10);
  if (x === 'md') { if (!pages.length && !Object.keys(glossary).length) return toast('No notes to export yet'); download(`inpage notes ${stamp}.md`, INPAGE_MD.all(pages.map(p => [p.key, p.r])) + (Object.keys(glossary).length ? `\n---\n\n${INPAGE_MD.glossary(glossary, 2)}` : '')); }
  if (x === 'json') {
    const all = await chrome.storage.local.get(null);
    const data = { app: 'inpage', kind: 'backup', version: 1, exported: Date.now(), pages: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('inpage:'))), ...(all.actions ? { actions: all.actions } : {}), ...(all.glossary ? { glossary: all.glossary } : {}) };
    download(`inpage backup ${stamp}.json`, JSON.stringify(data, null, 1), 'application/json');
  }
  if (x === 'restore') $('restoreFile').click();
});
$('restoreFile').onchange = async () => {
  const f = $('restoreFile').files[0]; $('restoreFile').value = ''; if (!f) return;
  if (f.size > 200_000_000) return toast('That file is too big to be an inpage backup');
  let data; try { data = JSON.parse(await f.text()); } catch { return toast('That file isn’t JSON'); }
  if (data?.app !== 'inpage' || data.kind !== 'backup' || !data.pages || typeof data.pages !== 'object') return toast('That isn’t an inpage backup');
  const have = await chrome.storage.local.get(Object.keys(data.pages));
  const add = Object.fromEntries(Object.entries(data.pages).filter(([k]) => k.startsWith('inpage:') && k.length < 2100).map(([k, v]) => [k, INPAGE_cleanRecord(v)]).filter(([k, v]) => v && (!have[k] || v.updated > (have[k].updated || 0))));
  const actions = data.actions ? INPAGE_cleanActions(data.actions) : null;
  const gl = data.glossary ? { ...(INPAGE_cleanGlossary(data.glossary) || {}), ...glossary } : null;
  if (!confirm(`Restore ${Object.keys(add).length} page${Object.keys(add).length === 1 ? '' : 's'} of notes${actions ? ` and your ${actions.length} actions` : ''}? Pages you have newer notes for are kept as they are.`)) return;
  await chrome.storage.local.set({ ...add, ...(actions ? { actions } : {}), ...(gl ? { glossary: INPAGE_cleanGlossary(gl) } : {}) });
  toast(`Restored ${Object.keys(add).length} pages`); load();
};
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && Object.keys(ch).some(k => k.startsWith('inpage:') || k === 'glossary')) { clearTimeout(load.t); load.t = setTimeout(load, 300); } });
load();
