// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Rendering shared by the content scripts and the UI frame: escaping, the sanitiser policy, Markdown and KaTeX.
// One policy for both, so model output is cleaned the same way wherever it is shown.
(() => {
  const IP = (window.__inpage = window.__inpage || {});

  IP.escapeHTML = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  IP.host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  IP.fragment = html => {                        // DOMParser, not innerHTML, so Trusted Types pages accept it
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const frag = document.createDocumentFragment();
    for (const n of [...doc.body.childNodes]) frag.appendChild(document.importNode(n, true));
    return frag;
  };

  // ---------- sanitising model output ----------
  // Nothing the model writes may make the browser fetch anything (that would leak the conversation in a URL): images
  // that were already in the block may stay, links must be http(s), mailto or #, and every other attribute that
  // names a resource goes. Model output gets a short list of text and table elements (no SVG, MathML, media or
  // forms); a block's own original HTML, restored after a rewrite, keeps its MathML and SVG under the same rules.
  let allowedSrcs = new Set();
  const URL_ATTRS = new Set(['srcset', 'poster', 'background', 'action', 'formaction', 'data', 'ping', 'lowsrc', 'dynsrc', 'longdesc', 'codebase', 'manifest', 'icon', 'profile', 'archive', 'imagesrcset', 'attributionsrc']);
  DOMPurify.addHook('uponSanitizeAttribute', (n, d) => {
    const a = d.attrName;
    if (URL_ATTRS.has(a)) d.keepAttr = false;
    else if (a === 'src') { if (n.nodeName !== 'IMG' || !(/^data:image\/(png|jpe?g|gif|webp)[;,]/i.test(d.attrValue) || allowedSrcs.has(d.attrValue))) d.keepAttr = false; }
    else if (a === 'href' || a === 'xlink:href') {
      const v = d.attrValue.trim();
      if (n.nodeName.toLowerCase() === 'a' ? !/^(https?:|mailto:|#)/i.test(v) : !v.startsWith('#')) d.keepAttr = false;
    }
  });
  const BASE = { FORBID_ATTR: ['style', 'id'], ALLOW_DATA_ATTR: false, ALLOW_UNKNOWN_PROTOCOLS: false };
  const MODEL_TAGS = ['a', 'abbr', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'wbr'];
  const MODEL_ATTRS = ['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'scope', 'headers', 'class', 'lang', 'dir', 'start', 'reversed', 'type', 'value', 'open', 'datetime', 'align', 'valign', 'abbr'];
  const purify = html => DOMPurify.sanitize(html, { ...BASE, ALLOWED_TAGS: MODEL_TAGS, ALLOWED_ATTR: MODEL_ATTRS });
  const purifyOriginal = html => DOMPurify.sanitize(html, { ...BASE,
    FORBID_TAGS: ['style', 'script', 'iframe', 'frame', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed', 'link', 'meta', 'base', 'html', 'head', 'body', 'video', 'audio', 'source', 'track', 'picture', 'image', 'feimage', 'use', 'animate', 'set', 'animatemotion', 'animatetransform', 'foreignobject', 'portal', 'fencedframe'] });
  IP.clean = (html, srcs, { original } = {}) => { allowedSrcs = new Set(srcs || []); try { return (original ? purifyOriginal : purify)(html); } finally { allowedSrcs = new Set(); } };

  // Markdown would eat backslashes inside math, so math is swapped out before parsing and back after.
  IP.markdown = src => {
    const stash = [], keep = m => `@@IPM${stash.push(m) - 1}@@`;
    const prot = (src || '').replace(/\$\$[\s\S]+?\$\$/g, keep).replace(/\\\[[\s\S]+?\\\]/g, keep)
      .replace(/\\\([\s\S]+?\\\)/g, keep).replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)\$/g, (_m, pre, body) => pre + keep(`$${body}$`));
    return purify(marked.parse(prot).replace(/@@IPM(\d+)@@/g, (_m, i) => IP.escapeHTML(stash[+i])));
  };

  // Our own small auto-render: katex.renderToString works in quirks-mode pages (katex.render refuses them),
  // and a formula that fails to parse is shown as its source instead of breaking the rest.
  const MATH_RE = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
  const MATH_RE_DOLLARS = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$])/g;
  IP.renderMath = (node, dollars) => {
    const quirks = document.compatMode !== 'CSS1Compat';
    const re = dollars ? MATH_RE_DOLLARS : MATH_RE;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement?.closest('.katex, code, pre, script, style, textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const texts = []; let t;
    while ((t = walker.nextNode())) if (/\\[[(]|\$/.test(t.data)) texts.push(t);
    for (const textNode of texts) {
      const src = textNode.data; re.lastIndex = 0;
      if (!re.test(src)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = re.exec(src))) {
        frag.append(src.slice(last, m.index));
        const display = m[1] != null || m[3] != null, tex = m[1] ?? m[2] ?? m[3] ?? m[4];
        try {
          const html = katex.renderToString(tex, { displayMode: display, throwOnError: true, output: quirks ? 'mathml' : 'htmlAndMathml', strict: 'ignore' });
          frag.append(IP.fragment(html));
        } catch {
          const code = document.createElement('code'); code.textContent = m[0]; frag.append(code);
        }
        last = re.lastIndex;
      }
      frag.append(src.slice(last));
      textNode.replaceWith(frag);
    }
  };

  // Citations: page answers quote the page as {{q: exact words}}. IP.cites lists the quotes; IP.citeHTML renders
  // an answer with numbered chips (ok = found on the page, bad = not found, none = not checked yet).
  // {{q: …}} quotes this page; {{q2: …}} quotes source 2 (another open tab).
  const CITE = /\{\{\s*q(\d*)\s*:\s*([\s\S]*?)\s*\}\}/g;
  IP.cites = text => [...String(text || '').matchAll(CITE)].map(m => m[2].trim());
  IP.citeSources = text => [...String(text || '').matchAll(CITE)].map(m => +(m[1] || 0));
  IP.citeHTML = (text, checks, names) => {
    let n = 0;
    const srcs = IP.citeSources(text);
    const src = String(text || '').replace(/\{\{\s*q\d*\s*:[^}]*$/, '').replace(CITE, () => `@@CITE${n++}@@`);   // a marker still streaming in is hidden
    // Markers become chips by walking the sanitised tree's text nodes, never by editing its HTML, so nothing inside an
    // attribute can be broken open; a marker that ended up in an attribute is dropped.
    const doc = new DOMParser().parseFromString(`<body>${IP.markdown(src)}</body>`, 'text/html');
    for (const el of doc.body.querySelectorAll('*')) for (const a of [...el.attributes]) if (a.value.includes('@@CITE')) el.setAttribute(a.name, a.value.replace(/@@CITE\d+@@/g, ''));
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), hits = [];
    for (let t; (t = walker.nextNode());) if (t.data.includes('@@CITE')) hits.push(t);
    for (const t of hits) {
      const frag = doc.createDocumentFragment(); let last = 0;
      for (const m of t.data.matchAll(/@@CITE(\d+)@@/g)) {
        frag.append(t.data.slice(last, m.index)); last = m.index + m[0].length;
        const i = +m[1], ok = checks?.[i], from = names?.[srcs[i]], where = from ? `in “${from}”` : 'on the page';
        const b = doc.createElement('button');
        b.className = `cite${ok === true ? ' ok' : ok === false ? ' bad' : ''}${srcs[i] ? ' tab' : ''}`; b.dataset.cite = String(i);
        b.title = ok === false ? `This quote isn’t ${where} (as the author wrote it)` : ok === true ? `Quote found ${where}: click to see it, and check it supports the point` : `Show this ${where}`;
        b.textContent = String(i + 1); frag.append(b);
      }
      frag.append(t.data.slice(last)); t.replaceWith(frag);
    }
    return doc.body.innerHTML;
  };
  IP.citesToText = text => String(text || '').replace(CITE, (_m, _s, q) => ` (“${q.trim()}”)`);

  // Web sources as small chips, one per site.
  IP.dedupeSources = list => { const urls = new Set(), hosts = new Set(); return (list || []).filter(s => { const h = IP.host(s.url); if (urls.has(s.url) || hosts.has(h)) return false; urls.add(s.url); hosts.add(h); return true; }); };
  IP.sourcesHTML = list => list?.length ? `<div class="sources"><b>Sources</b>${IP.dedupeSources(list).filter(s => /^https?:/i.test(s.url)).map(s => `<a href="${IP.escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer" title="${IP.escapeHTML(s.title || s.url)}">${IP.escapeHTML(IP.host(s.url))}</a>`).join('')}</div>` : '';
})();
