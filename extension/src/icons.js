// inpage by Harish Reddy Anumula · MIT · https://github.com/harish-anumula/inpage
// Line icons (20px grid) and the logo, shared by the content scripts and the UI frame.
(() => {
  const IP = (window.__inpage = window.__inpage || {});
  const svg = (d, { w = 16, fill = false, sw = 1.7 } = {}) => `<svg viewBox="0 0 20 20" width="${w}" height="${w}" ${fill ? 'fill="currentColor"' : `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`} aria-hidden="true">${d}</svg>`;
  IP.icon = {
    ask: svg('<path d="M4.5 14.8V6.2A2.2 2.2 0 0 1 6.7 4h6.6a2.2 2.2 0 0 1 2.2 2.2v4.6a2.2 2.2 0 0 1-2.2 2.2H8z"/>'),
    edit: svg('<path d="M11 5l4 4M4.5 15.5l.8-3.6 7.6-7.6a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2l-7.6 7.6z"/>'),
    send: svg('<path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9"/>', { sw: 2 }),
    close: svg('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>'),
    back: svg('<path d="M12 4.5 6.5 10l5.5 5.5"/>'),
    globe: svg('<circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13M10 3.5c1.8 2 2.7 4.2 2.7 6.5s-.9 4.5-2.7 6.5c-1.8-2-2.7-4.2-2.7-6.5s.9-4.5 2.7-6.5z"/>', { w: 15, sw: 1.5 }),
    spark: svg('<path d="M10 2.5l1.7 4.8 4.8 1.7-4.8 1.7L10 15.5l-1.7-4.8L3.5 9l4.8-1.7z"/>', { w: 14, fill: true }),
    list: svg('<path d="M7.5 6h8M7.5 10h8M7.5 14h8M4.2 6h.1M4.2 10h.1M4.2 14h.1"/>'),
    page: svg('<path d="M6 3.5h5.5L15 7v9.5H6z"/><path d="M11.5 3.5V7H15"/>'),
    check: svg('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', { sw: 2 }),
    copy: svg('<rect x="7" y="7" width="9" height="9" rx="1.8"/><path d="M13 7V5.2A1.7 1.7 0 0 0 11.3 3.5H5.2A1.7 1.7 0 0 0 3.5 5.2v6.1A1.7 1.7 0 0 0 5.2 13H7"/>', { w: 14 }),
    insert: svg('<path d="M10 4.5v8M6 9l4 4 4-4M4.5 16h11"/>', { w: 14 }),
    tabs: svg('<rect x="3.5" y="6" width="10" height="9" rx="1.8"/><path d="M6.5 6V4.8a1.3 1.3 0 0 1 1.3-1.3h7.4a1.3 1.3 0 0 1 1.3 1.3v6.9a1.3 1.3 0 0 1-1.3 1.3h-1.7"/>', { w: 15, sw: 1.5 }),
    trash: svg('<path d="M4.5 6h11M8 6V4.5h4V6M6 6l.8 9.5h6.4L14 6"/>', { w: 14 }),
    logo: '<svg viewBox="0 0 128 128" width="20" height="20" aria-hidden="true"><rect width="128" height="128" rx="34" fill="#6D45C7"/><rect x="26" y="30" width="58" height="72" rx="10" fill="#fff"/><rect x="37" y="46" width="34" height="7" rx="3.5" fill="#6D45C7"/><rect x="37" y="60" width="26" height="7" rx="3.5" fill="#6D45C7"/><rect x="37" y="74" width="36" height="13" rx="4" fill="#6D45C7"/><path d="M98 18l4.6 12.4L115 35l-12.4 4.6L98 52l-4.6-12.4L81 35l12.4-4.6z" fill="#fff"/></svg>',
  };
})();
