// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
const key = document.getElementById('key'), status = document.getElementById('status');
const show = (text, cls) => { status.textContent = text; status.className = cls || ''; };

async function check() {
  const h = await chrome.runtime.sendMessage({ type: 'health' });
  if (h.ok) {
    const credit = h.limitRemaining != null ? ` · $${Number(h.limitRemaining).toFixed(2)} of credit left` : '';
    show(`Key works${credit}. You're ready.`, 'ok');
  } else show({ nokey: 'No key saved yet.', badkey: 'OpenRouter rejected this key.', offline: 'Could not reach OpenRouter.' }[h.reason] || 'Could not check the key.', h.reason === 'nokey' ? '' : 'bad');
}

chrome.storage.local.get('apiKey').then(v => { if (v.apiKey) { key.value = v.apiKey; check(); } else show('No key saved yet.'); });
document.getElementById('save').onclick = async () => {
  const v = key.value.trim();
  if (v && !v.startsWith('sk-or-')) return show('That doesn’t look like an OpenRouter key (they start with sk-or-).', 'bad');
  await chrome.storage.local.set({ apiKey: v });
  show('Checking…'); check();
};
const memBoxes = { glossary: document.getElementById('mem-glossary'), bookmark: document.getElementById('mem-bookmark'), nudges: document.getElementById('mem-nudges') };
chrome.storage.local.get('memory').then(({ memory = {} }) => { for (const [k, b] of Object.entries(memBoxes)) b.checked = memory[k] !== false; });
for (const b of Object.values(memBoxes)) b.onchange = () => chrome.storage.local.set({ memory: Object.fromEntries(Object.entries(memBoxes).map(([k, x]) => [k, x.checked])) });
const drawerRadios = [...document.querySelectorAll('input[name="drawer"]')];
chrome.storage.local.get('drawerMode').then(v => { const m = v.drawerMode === 'page' ? 'page' : 'panel'; drawerRadios.forEach(r => { r.checked = r.value === m; }); });
drawerRadios.forEach(r => r.onchange = () => chrome.storage.local.set({ drawerMode: r.value }));
const jevBox = document.getElementById('jev');
chrome.storage.local.get('jev').then(v => { jevBox.checked = v.jev !== false; });
jevBox.onchange = () => chrome.storage.local.set({ jev: jevBox.checked });
key.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('save').click(); });
document.getElementById('show').onclick = e => { key.type = key.type === 'password' ? 'text' : 'password'; e.target.textContent = key.type === 'password' ? 'Show' : 'Hide'; };

// ---------- your actions: edit, reorder, pin, hide, delete; export and import as JSON ----------
const GROUPS = [['ask', 'When you select text · Ask'], ['rewrite', 'When you select text · Rewrite'], ['image', 'On images'], ['video', 'On videos (ask about this moment)'], ['page', 'On the whole page (drawer)']];
const listEl = document.getElementById('actions-list'), astatus = document.getElementById('astatus');
let actions = [], saveTimer = 0;
const say = t => { astatus.textContent = t; clearTimeout(say.t); say.t = setTimeout(() => { astatus.textContent = ''; }, 2500); };
const persist = (now) => { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { await chrome.storage.local.set({ actions: INPAGE_cleanActions(actions) }); say('Saved'); }, now ? 0 : 400); };   // a row with an empty label isn't saved until it has one
async function loadActions() { const v = await chrome.storage.local.get('actions'); actions = INPAGE_cleanActions(v.actions) || INPAGE_cleanActions(INPAGE_DEFAULT_ACTIONS); render(); }
function render() {
  listEl.replaceChildren(...GROUPS.map(([on, title]) => {
    const g = document.createElement('div'); g.className = 'group';
    g.innerHTML = `<h3></h3>`; g.querySelector('h3').textContent = title;
    actions.filter(a => a.on === on).forEach(a => g.append(row(a)));
    const add = document.createElement('button'); add.className = 'add'; add.textContent = '+ Add action';
    add.onclick = () => { actions.push({ id: `my-${Date.now().toString(36)}`, on, label: 'New action', prompt: 'Describe what it should do' }); persist(true); render(); const rows = listEl.querySelectorAll(`.group:nth-child(${GROUPS.findIndex(x => x[0] === on) + 1}) .act`); rows[rows.length - 1]?.querySelector('input.label').select(); };
    g.append(add);
    return g;
  }));
}
function row(a) {
  const r = document.createElement('div'); r.className = `act${a.hidden ? ' hidden' : ''}`;
  const pinnable = a.on === 'ask' || a.on === 'rewrite';
  r.innerHTML = `<div class="top"><input class="label" aria-label="Button label"><label class="tog"${pinnable ? '' : ' hidden'}><input type="checkbox" data-k="pin">Toolbar</label><label class="tog"><input type="checkbox" data-k="show">Show</label><button data-m="-1" title="Move up" aria-label="Move up">↑</button><button data-m="1" title="Move down" aria-label="Move down">↓</button><button data-del title="Delete" aria-label="Delete">Delete</button></div><textarea rows="2" aria-label="Prompt"></textarea>`;
  const label = r.querySelector('input.label'), prompt = r.querySelector('textarea');
  label.value = a.label; prompt.value = a.prompt;
  r.querySelector('[data-k="pin"]').checked = !!a.pin;
  r.querySelector('[data-k="show"]').checked = !a.hidden;
  const fit = () => { prompt.style.height = 'auto'; prompt.style.height = `${prompt.scrollHeight + 2}px`; };
  requestAnimationFrame(fit);
  label.oninput = () => { a.label = label.value; persist(); };
  prompt.oninput = () => { a.prompt = prompt.value; fit(); persist(); };
  r.querySelector('[data-k="pin"]').onchange = e => {
    if (e.target.checked && actions.filter(x => x.pin && !x.hidden).length >= 3) { e.target.checked = false; return say('Up to three actions fit in the toolbar. Unpin one first.'); }
    a.pin = e.target.checked; persist(true);
  };
  r.querySelector('[data-k="show"]').onchange = e => { a.hidden = !e.target.checked; r.classList.toggle('hidden', !!a.hidden); persist(true); };
  r.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const same = actions.filter(x => x.on === a.on), i = same.indexOf(a), j = i + +b.dataset.m;
    if (j < 0 || j >= same.length) return;
    const ai = actions.indexOf(a), aj = actions.indexOf(same[j]); [actions[ai], actions[aj]] = [actions[aj], actions[ai]];
    persist(true); render();
  });
  r.querySelector('[data-del]').onclick = () => { actions = actions.filter(x => x !== a); persist(true); render(); };
  return r;
}
document.getElementById('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'inpage', kind: 'actions', version: 1, actions: INPAGE_cleanActions(actions) }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'inpage-actions.json' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const fileEl = document.getElementById('import-file');
document.getElementById('import').onclick = () => fileEl.click();
fileEl.onchange = async () => {
  const f = fileEl.files[0]; fileEl.value = ''; if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch { return say('That file isn’t JSON.'); }
  const list = INPAGE_cleanActions(Array.isArray(data) ? data : data?.actions);
  if (!list?.length) return say('No actions found in that file.');
  if (!confirm(`Replace your ${actions.length} actions with the ${list.length} in this file?`)) return;
  actions = list; persist(true); render(); say(`Imported ${list.length} actions`);
};
document.getElementById('reset').onclick = async () => {
  if (!confirm('Put back the default actions? Your own actions will be removed.')) return;
  await chrome.storage.local.remove('actions'); await loadActions(); say('Defaults restored');
};
// Changes made by chatting in the drawer show up here too (unless you're typing in the list).
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.actions && !listEl.contains(document.activeElement)) loadActions(); });
loadActions();
if (location.hash === '#actions') setTimeout(() => document.getElementById('actions').scrollIntoView(), 50);
