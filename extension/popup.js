// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let tab, host;

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { host = new URL(tab.url).hostname; } catch { host = ''; }
  $('site').textContent = host ? `· ${host.replace(/^www\./, '')}` : '';

  const { modelId, disabledSites = {} } = await chrome.storage.local.get(['modelId', 'disabledSites']);
  $('model').innerHTML = INPAGE_MODELS.map(m => `<option value="${m.id}" title="${esc(m.note)}">${esc(m.label)}</option>`).join('');
  $('model').value = (INPAGE_MODELS.find(m => m.id === modelId) || INPAGE_MODELS[0]).id;
  $('model').title = INPAGE_MODELS.find(m => m.id === $('model').value).note;
  $('model').onchange = async () => { await chrome.storage.local.set({ modelId: $('model').value }); $('model').title = INPAGE_MODELS.find(m => m.id === $('model').value).note; };

  $('enabled').checked = !disabledSites[host];
  $('enabled').onchange = async () => {
    const { disabledSites: d = {} } = await chrome.storage.local.get('disabledSites');
    if ($('enabled').checked) delete d[host]; else d[host] = true;
    await chrome.storage.local.set({ disabledSites: d });
    chrome.tabs.sendMessage(tab.id, { type: 'set-enabled', enabled: $('enabled').checked }).catch(() => {});
  };
  // In side-panel mode, open the panel from this click (the browser only allows it inside one), then fill it.
  const { drawerMode } = await chrome.storage.local.get('drawerMode');
  $('open').onclick = async () => {
    if (chrome.sidePanel?.open && drawerMode !== 'page') chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, { type: 'open-drawer' }).catch(() => {}); window.close();
  };
  $('settings').onclick = () => chrome.runtime.openOptionsPage();
  $('library').onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL(`library.html${tab?.url ? `?page=${encodeURIComponent(tab.url.split('#')[0])}` : ''}`) }); window.close(); };
  $('clear').onclick = async () => {
    if (!confirm('Remove every thread, edit and chat on this page?')) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'clear-page' }).catch(() => {});
    items();
  };
  health(); items();
}

async function health() {
  const h = await chrome.runtime.sendMessage({ type: 'health' });
  $('dot').className = `dot ${h.ok ? 'ok' : 'bad'}`;
  const left = h.ok && h.limitRemaining != null ? ` · $${Number(h.limitRemaining).toFixed(2)}` : '';
  $('statusText').textContent = h.ok ? `Ready${left}` : { nokey: 'Key needed', badkey: 'Key rejected', offline: 'Offline' }[h.reason] || 'Check settings';
  $('warn').innerHTML = h.ok ? '' : h.reason === 'offline'
    ? '<div class="warn">Could not reach OpenRouter. Check your connection.</div>'
    : '<div class="warn">Add your OpenRouter key in <b>Settings</b> to start. It stays in this browser.</div>';
}

async function items() {
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'page-items' }).catch(() => null);
  const ul = $('items');
  if (!res) { $('open').disabled = true; $('open').style.opacity = .4; ul.outerHTML = '<div class="empty" id="items">inpage can’t run on this page (browser pages and the extension store are off limits).</div>'; return; }
  const rows = [
    ...res.threads.map((t, i) => `<li data-k="thread" data-id="${esc(t.id)}"><span class="k">${i + 1}</span><span><div class="t">${esc(t.question || 'Question')}</div><div class="s">${t.missing ? 'Not found on the page · ' : ''}“${esc(t.quote)}”</div></span></li>`),
    ...res.edits.map(e => `<li data-k="edit" data-id="${esc(e.id)}"><span class="k">${e.kind === 'insert' ? '+' : '✎'}</span><span><div class="t">${esc(e.instruction)}</div><div class="s">${e.missing ? 'Not found on the page · ' : ''}${esc(e.text)}</div></span></li>`),
  ];
  $('count').textContent = rows.length || '';
  ul.innerHTML = rows.length ? rows.join('') : '<div class="empty">Nothing yet. Select text on the page and choose Ask or Rewrite, or open inpage to ask about the whole page.</div>';
  ul.querySelectorAll('li').forEach(li => li.onclick = () => {
    chrome.tabs.sendMessage(tab.id, { type: li.dataset.k === 'thread' ? 'focus-thread' : 'focus-edit', id: li.dataset.id });
    window.close();
  });
}

init();
