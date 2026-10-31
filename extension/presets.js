// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Model choices in the popup, all through OpenRouter. "think" turns on reasoning (slower, deeper);
// "vision" means the model can read images. Latencies from the 22 Oct 2026 benchmark.
const INPAGE_MODELS = [
  { id: 'deepseek-flash', label: 'DeepSeek Flash', note: 'Fast, default · ~1-3 s · reads images', model: 'deepseek/deepseek-v4.1-flash-1017', vision: true },
  { id: 'gpt-oss', label: 'GPT-OSS 120B', note: 'Fastest · ~1 s · text only, looser formatting', model: 'openai/gpt-oss-120b' },
  { id: 'deepseek-think', label: 'DeepSeek Flash, thinking', note: 'Careful maths · ~5-8 s', model: 'deepseek/deepseek-v4.1-flash-1017', think: true, vision: true },
  { id: 'haiku', label: 'Claude Haiku 5.5', note: 'Polished prose · ~3-6 s · reads images', model: 'anthropic/claude-haiku-5.5', vision: true },
  { id: 'jev-auto', label: 'Auto (Jev Router)', note: 'Picks a model per request · 1-75 s · for hard derivations', model: 'typesafe/jev-router', router: true, vision: true },
];
const INPAGE_VISION_FALLBACK = 'deepseek-flash';   // used for images when the chosen model is text-only

// Actions: one-click prompts. "on" says where an action shows up: a selection's Ask or Rewrite chips, an image's
// chips, a video's "Ask about this moment" chips, or the drawer's page chips. Pinned Ask/Rewrite actions (up to 3) also sit in the selection toolbar.
// An Ask or page action with out: 'check' fact-checks the selection's block or the page with web search.
// These are the defaults; the user's own list (edited by chatting or in Settings) is stored as "actions".
const INPAGE_ACTION_PLACES = ['ask', 'rewrite', 'image', 'video', 'page'];
const INPAGE_DEFAULT_ACTIONS = [
  { id: 'karpathy', on: 'ask', label: 'Explain like Karpathy', pin: true, prompt: 'Explain this the way Andrej Karpathy teaches: start from the simplest concrete case, build the intuition from first principles, show the mechanism with tiny numbers or a few lines of plain Python, and say what is actually happening under the hood. No hand-waving; unpack any jargon.' },
  { id: 'explain-simply', on: 'ask', label: 'Explain simply', prompt: 'Explain simply' },
  { id: 'why-true', on: 'ask', label: 'Why is this true?', prompt: 'Why is this true?' },
  { id: 'tiny-example', on: 'ask', label: 'Give a tiny example', prompt: 'Give a tiny example' },
  { id: 'intuition', on: 'ask', label: "What's the intuition?", prompt: "What's the intuition?" },
  { id: 'to-code', on: 'ask', label: 'Turn into code', prompt: "Turn this idea into a short, runnable Python snippet (PyTorch if it's about neural networks) with brief comments, then say in one line what it prints and why." },
  { id: 'critique', on: 'ask', label: 'Critique this claim', prompt: "Critique this claim: what does it assume, where could it be wrong or overstated, what's the strongest counter-argument, and what evidence would settle it?" },
  { id: 'fact-check', on: 'ask', out: 'check', label: 'Fact-check this', prompt: 'Fact-check the claims in this passage against current web sources.' },
  { id: 'step-by-step', on: 'rewrite', label: 'Step by step', prompt: 'Step by step' },
  { id: 'numeric-example', on: 'rewrite', label: 'Add a numeric example', prompt: 'Add a numeric example' },
  { id: 'simpler', on: 'rewrite', label: 'Simpler', prompt: 'Simpler' },
  { id: 'define-terms', on: 'rewrite', label: 'Define the terms', prompt: 'Define the terms' },
  { id: 'shorter', on: 'rewrite', label: 'Shorter', prompt: 'Shorter' },
  { id: 'explain-figure', on: 'image', label: 'Explain this figure', prompt: 'Explain this figure' },
  { id: 'notice', on: 'image', label: 'What should I notice?', prompt: 'What should I notice?' },
  { id: 'walk-through', on: 'image', label: 'Walk me through it step by step', prompt: 'Walk me through it step by step' },
  { id: 'just-said', on: 'video', label: 'What did they just say?', prompt: 'Explain what was just said (the last 30 seconds), in plain words, with any formula or code on screen made concrete. Use the earlier captions only for context.' },
  { id: 'on-screen', on: 'video', label: "Explain what's on screen", prompt: "Explain what's on screen right now: the slide, formula or code, line by line where it helps." },
  { id: 'last-minutes', on: 'video', label: 'Explain the last 2 minutes', prompt: 'Explain the last two minutes step by step, as if I missed them.' },
  { id: 'video-notes', on: 'video', label: 'Notes on this part', prompt: 'Write short study notes on this part of the lecture: the key ideas, any formula or code, and one question to check I understood.' },
  { id: 'catch-up', on: 'page', label: 'Catch me up', prompt: 'Catch me up on what I have read so far: the main points up to here, in a few lines, without anything that comes later.' },
  { id: 'summarize', on: 'page', label: 'Summarize the key ideas', prompt: 'Summarize the key ideas' },
  { id: 'fact-check-page', on: 'page', out: 'check', label: 'Fact-check this page', prompt: 'Fact-check the key claims on this page against current web sources.' },
  { id: 'equations', on: 'page', label: 'Explain every equation step by step', prompt: 'Explain every equation step by step' },
  { id: 'check-questions', on: 'page', label: 'Add a check-your-understanding question after each section', prompt: 'Add a check-your-understanding question after each section' },
  { id: 'jargon', on: 'page', label: 'Define the jargon where it first appears', prompt: 'Define the jargon where it first appears' },
  { id: 'prereqs', on: 'page', label: 'What should I know before reading this?', prompt: 'What should I know before reading this?' },
];
// Checks a list from storage, an import or the model: known fields only, sane sizes, unique ids, at most 3 pins.
function INPAGE_cleanActions(list) {
  if (!Array.isArray(list)) return null;
  const out = [], ids = new Set();
  for (const a of list.slice(0, 80)) {
    if (!a || typeof a !== 'object' || !INPAGE_ACTION_PLACES.includes(a.on)) continue;
    const label = String(a.label || '').replace(/\s+/g, ' ').trim().slice(0, 60), prompt = String(a.prompt || '').trim().slice(0, 2000);
    if (!label || !prompt) continue;
    let id = String(a.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'action';
    for (let n = 2, base = id; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    out.push({ id, on: a.on, label, prompt, ...(a.out === 'check' && (a.on === 'ask' || a.on === 'page') ? { out: 'check' } : {}), ...(a.pin && (a.on === 'ask' || a.on === 'rewrite') ? { pin: true } : {}), ...(a.hidden ? { hidden: true } : {}) });
  }
  let pins = 0;
  for (const a of out) if (a.pin && !a.hidden && ++pins > 3) delete a.pin;
  return out;
}

// Quiet memory, kept in this browser only: your glossary (terms you've asked about; recalled when you select them
// again) and where you stopped on long pages. These check what content scripts may store.
function INPAGE_cleanGlossary(map) {
  if (!map || typeof map !== 'object') return null;
  const s = (v, n) => String(v ?? '').slice(0, n);
  const rows = Object.entries(map).filter(([k, e]) => k && e && typeof e === 'object' && e.term && e.def)
    .map(([k, e]) => [s(k, 80), { term: s(e.term, 80), def: s(e.def, 320), url: s(e.url, 600), title: s(e.title, 200), thread: s(e.thread, 20), ts: Number(e.ts) || 0, n: Math.min(999, Number(e.n) || 1) }])
    .sort((a, b) => b[1].ts - a[1].ts).slice(0, 600);
  return Object.fromEntries(rows);
}
function INPAGE_cleanReading(map) {
  if (!map || typeof map !== 'object') return null;
  const rows = Object.entries(map).filter(([k, e]) => k.startsWith('inpage:') && e && typeof e === 'object')
    .map(([k, e]) => [k.slice(0, 700), { quote: String(e.quote || '').slice(0, 160), pct: Math.max(0, Math.min(1, Number(e.pct) || 0)), ts: Number(e.ts) || 0 }])
    .sort((a, b) => b[1].ts - a[1].ts).slice(0, 400);
  return Object.fromEntries(rows);
}

// A page's saved notes, checked wherever they come from (its own content script or a restored backup): the right
// shapes, simple ids and fact-check verdicts from a fixed set, under a size cap, so a crafted record can't put markup
// into the views or break them.
const INPAGE_VERDICTS = ['supported', 'disputed', 'unclear', 'stopped', 'fail', 'wait', 'run'];
function INPAGE_cleanRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  try { if (JSON.stringify(r).length > 4_000_000) return null; } catch { return null; }
  const okId = v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);
  const objs = (a, n) => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object' && !Array.isArray(x)).slice(0, n);
  const n = v => Number.isFinite(+v) ? +v : 0, str = (v, max = 200) => String(v ?? '').slice(0, max);
  const quote = q => ({ ...q, exact: str(q.exact, 4000), prefix: str(q.prefix, 400), suffix: str(q.suffix, 400), ...(q.video != null ? { video: q.video && typeof q.video === 'object' ? { t: n(q.video.t), url: /^https?:/.test(String(q.video.url)) ? str(q.video.url, 3000) : '' } : null } : {}), ...(q.image != null ? { image: str(q.image, 3000) } : {}), ...(q.text != null ? { text: str(q.text, 4000) } : {}) });
  const meta = m => m && typeof m === 'object' ? { model: str(m.model), cost: m.cost == null ? null : n(m.cost), routing: n(m.routing), input: m.input == null ? null : n(m.input), output: n(m.output), ms: n(m.ms), parts: (Array.isArray(m.parts) ? m.parts : []).slice(0, 20).map(p => str(p)), images: n(m.images), web: !!m.web } : undefined;
  const msgs = a => (Array.isArray(a) ? a : []).slice(-400).filter(m => m && typeof m === 'object' && !Array.isArray(m)).filter(m => typeof m.role === 'string' && m.role.length < 20)
    .map(m => ({ ...m, content: m.content == null || typeof m.content === 'string' ? m.content : String(m.content), ...(m.check != null && !okId(m.check) ? { check: '' } : {}), ...('meta' in m ? { meta: meta(m.meta) } : {}),
      ...('ops' in m ? { ops: objs(m.ops, 40).filter(o => o.op === 'add' ? o.action && typeof o.action === 'object' && typeof o.action.label === 'string' && typeof o.action.prompt === 'string' : o.op === 'update' ? typeof o.id === 'string' && o.set && typeof o.set === 'object' : o.op === 'delete' && typeof o.id === 'string') } : {}), ...('status' in m ? { status: ['pending', 'saved', 'discarded', 'replaced'].includes(m.status) ? m.status : 'discarded' } : {}) }));
  return {
    edits: objs(r.edits, 500).filter(e => okId(e.id) && ['rewrite', 'insert'].includes(e.kind)).map(e => ({ ...e, tag: str(e.tag, 20) || 'P', instructions: (Array.isArray(e.instructions) ? e.instructions : []).slice(0, 50).map(i => str(i, 2000)),
      srcs: (Array.isArray(e.srcs) ? e.srcs : []).slice(0, 20).map(s => str(s, 3000)), ...['originalHTML', 'html'].reduce((o, k) => (k in e ? { ...o, [k]: str(e[k], 200000) } : o), {}),
      ...['anchorText', 'originalText'].reduce((o, k) => (k in e ? { ...o, [k]: str(e[k], 2000) } : o), {}) })),
    threads: objs(r.threads, 500).filter(t => okId(t.id) && t.quote && typeof t.quote === 'object').map(t => ({ ...t, quote: quote(t.quote), ts: n(t.ts), messages: msgs(t.messages) })),
    chat: msgs(r.chat),
    batches: objs(r.batches, 200).filter(b => okId(b.id)).map(b => ({ ...b, summary: str(b.summary, 300), items: objs(b.items, 50).map(it => ({ ...it, op: it.op === 'insert_after' ? 'insert_after' : 'rewrite', status: ['wait', 'run', 'done', 'fail', 'stopped'].includes(it.status) ? it.status : 'fail', instruction: str(it.instruction, 2000), label: str(it.label, 200), block: str(it.block, 12) })) })),
    checks: objs(r.checks, 100).filter(c => okId(c.id)).map(c => ({ ...c, items: objs(c.items, 20).map(it => ({ ...it, claim: str(it.claim, 400), note: str(it.note, 2000), ...(it.quote && typeof it.quote === 'object' ? { quote: quote(it.quote) } : { quote: { exact: '', prefix: '', suffix: '' } }), verdict: INPAGE_VERDICTS.includes(it.verdict) ? it.verdict : 'unclear', sources: objs(it.sources, 10) })) })),
    title: String(r.title || '').slice(0, 300), updated: Number(r.updated) || 0,
  };
}
