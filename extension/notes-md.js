// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Notes as Markdown (Obsidian-friendly): one section per page with its threads, page chat and changes.
// Answers are already Markdown; their maths is converted to $…$ and $$…$$.
const INPAGE_MD = (() => {
  const urlOf = key => key.replace(/^inpage:/, '');
  const day = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
  const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
  const quote = s => oneLine(s).split(/(?<=[.?!])\s+/).join(' ').replace(/^/, '> ');
  const htmlText = html => oneLine(new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body.textContent);
  const sources = list => list?.length ? `\n*Sources:* ${list.map(s => `[${oneLine(s.title) || s.url}](${s.url})`).join(' · ')}\n` : '';
  // Obsidian (and most Markdown apps) render $…$ and $$…$$, not \(…\) and \[…\].
  const dollars = s => String(s || '').replace(/\\\[([\s\S]+?)\\\]/g, (_m, t) => `\n$$\n${t.trim()}\n$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, t) => `$${t.trim()}$`);
  const IP_host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const cites = s => String(s || '').replace(/\{\{\s*q\d*\s*:\s*([\s\S]*?)\s*\}\}/g, (_m, q) => ` (“${q.trim()}”)`);
  const atTime = v => { try { const u = new URL(v.url); u.searchParams.set('t', `${Math.floor(v.t)}s`); return u.href; } catch { return v.url; } };
  const firstQ = t => t.messages?.find(m => m.role === 'user')?.shown || 'Question';

  function page(key, r, { level = 2 } = {}) {
    const h = '#'.repeat(level), url = urlOf(key), out = [`${h} ${oneLine(r.title) || url}`, '', `<${url}> · ${day(r.updated)}`, ''];
    const threads = r.threads || [], chat = (r.chat || []).filter(m => m.kind !== 'actions'), edits = r.edits || [];
    if (threads.length) {
      out.push(`${h}# Questions`, '');
      threads.forEach((t, i) => {
        out.push(`${h}## ${i + 1}. ${oneLine(firstQ(t))}`, '');
        out.push(t.quote?.video ? `[${oneLine(t.quote.exact)}](${atTime(t.quote.video)})` : t.quote?.image ? `![${oneLine(t.quote.exact)}](${t.quote.image})` : quote(t.quote?.exact), '');
        t.messages.forEach((m, j) => {
          if (m.role === 'user') { if (j) out.push(`**Q:** ${oneLine(m.shown || m.content)}`, ''); }
          else if (m.error) out.push(`*(${oneLine(m.content)})*`, '');
          else out.push(dollars(cites(m.content)).trim(), sources(m.sources));
        });
      });
    }
    if (chat.length) {
      out.push(`${h}# About the whole page`, '');
      for (const m of chat) {
        if (m.role === 'user') out.push(`**Q:** ${oneLine(m.shown || m.content)}`, '');
        else if (m.kind === 'changes') { const b = (r.batches || []).find(x => x.id === m.batch); if (b) out.push(`*Changed the page: ${oneLine(b.summary)} (${b.items.filter(i => i.status === 'done').length} changes)*`, ''); }
        else if (!m.error) out.push(dollars(cites(m.content)).trim(), sources(m.sources));
      }
    }
    const checks = (r.checks || []).filter(c => c.items?.length);
    if (checks.length) {
      out.push(`${h}# Fact-checks`, '');
      for (const c of checks) for (const it of c.items) {
        const v = { supported: '✅ Supported', disputed: '❌ Disputed', unclear: '❔ Unclear' }[it.verdict] || 'Not checked';
        out.push(`- **${v}:** ${oneLine(it.claim)}${it.note ? ` — ${oneLine(it.note)}` : ''}${it.sources?.length ? ` (${it.sources.map(s => `[${IP_host(s.url)}](${s.url})`).join(', ')})` : ''}`);
      }
      out.push('');
    }
    if (edits.length) {
      out.push(`${h}# Changes to the page`, '');
      for (const e of edits) {
        const what = e.kind === 'insert' ? 'Added' : 'Rewrote';
        const where = oneLine(e.originalText || e.anchorText).slice(0, 140);
        out.push(`- **${what}** (${oneLine(e.instructions?.at(-1))})${where ? ` — ${e.kind === 'rewrite' ? 'was' : 'after'} “${where}${where.length >= 140 ? '…' : ''}”` : ''}`);
        out.push(`  ${quote(dollars(htmlText(e.html))).slice(0, 1200)}`);
      }
      out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // One page as its own note, with front matter.
  function note(key, r) {
    return `---\ntitle: "${oneLine(r.title || urlOf(key)).replace(/"/g, "'")}"\nsource: ${urlOf(key)}\nupdated: ${day(r.updated)}\ntags: [inpage]\n---\n\n${page(key, r, { level: 1 })}`;
  }
  // Every page in one file.
  function all(entries) {
    return `---\ntitle: inpage notes\nexported: ${day(Date.now())}\ntags: [inpage]\n---\n\n# inpage notes\n\n${entries.map(([k, r]) => page(k, r)).join('\n---\n\n')}`;
  }
  const filename = (title, ext = 'md') => `${oneLine(title).replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) || 'inpage notes'}.${ext}`;
  // The glossary as a definition list.
  function glossary(map, level = 1) {
    const rows = Object.values(map || {}).sort((a, b) => a.term.localeCompare(b.term));
    return `${'#'.repeat(level)} Glossary\n\n${rows.map(e => `- **${oneLine(e.term)}**: ${oneLine(e.def)} ([${oneLine(e.title) || urlOf(e.url)}](${e.url}))`).join('\n')}\n`;
  }
  return { page, note, all, glossary, filename, urlOf };
})();
