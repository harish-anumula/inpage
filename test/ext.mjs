// Shared test setup. The tests load a copy of the extension whose shadow root is open, so Playwright can see
// the toolbar, status chips and edit controls (the shipped extension keeps it closed). The composer and the
// drawer are extension frames: reach them with C(page) and D(page), or drawerFrame(page) for evaluate().
// Click inside the frames with .dispatchEvent('click'): headless Chrome doesn't route mouse clicks to an iframe in
// the part of an emulated viewport that lies below its real (smaller) window, so a real click there hits the page.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension');

// Playwright's own Chromium (`npx playwright install chromium`) in its full build, which runs extensions headless;
// set CHROME=/path/to/chrome to use another one.
export const BROWSER = process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chromium' };
// The tests call OpenRouter for real (a few cents for the whole suite): OPENROUTER_KEY, or the first line of
// .openrouter-key at the repo root (gitignored).
export function key() {
  if (process.env.OPENROUTER_KEY) return process.env.OPENROUTER_KEY.trim();
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.openrouter-key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').split('\n')[0].trim();
  throw new Error('Set OPENROUTER_KEY, or put your OpenRouter key in .openrouter-key at the repo root (it is gitignored).');
}

// patches: [[file, from, to]] edits to the test copy (e.g. point the worker at an address that refuses connections).
export function testExtension(patches = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inpage-ext-'));
  fs.cpSync(EXT, dir, { recursive: true });
  const ui = path.join(dir, 'src/ui.js');
  const src = fs.readFileSync(ui, 'utf8');
  if (!src.includes("const SHADOW = 'closed';")) throw new Error('src/ui.js: SHADOW constant not found');
  fs.writeFileSync(ui, src.replace("const SHADOW = 'closed';", "const SHADOW = 'open';"));
  const frame = path.join(dir, 'ui/frame.js'), fsrc = fs.readFileSync(frame, 'utf8');   // and let a test window bind the panel page to a tab
  if (!fsrc.includes('const TEST_BINDING = false')) throw new Error('ui/frame.js: TEST_BINDING constant not found');
  fs.writeFileSync(frame, fsrc.replace('const TEST_BINDING = false', 'const TEST_BINDING = true'));
  for (const [file, from, to] of patches) {
    const f = path.join(dir, file), text = fs.readFileSync(f, 'utf8');
    if (!text.includes(from)) throw new Error(`${file}: "${from}" not found`);
    fs.writeFileSync(f, text.replace(from, to));
  }
  return dir;
}

// Launch Chrome for Testing with the test copy; returns the context, the extension id and an options page
// (an extension page, for chrome.storage and chrome.tabs calls).
export async function launch({ viewport = { width: 1360, height: 900 }, colorScheme = 'light', deviceScaleFactor = 1, modelId = 'deepseek-flash', storage = {}, shipped = false, patches = [] } = {}) {
  const ext = shipped ? EXT : testExtension(patches);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'inpage-')), {
    ...BROWSER, headless: true, viewport, colorScheme, deviceScaleFactor,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const setup = await ctx.newPage();
  await setup.goto(`chrome-extension://${extId}/options.html`);
  await setup.evaluate(s => chrome.storage.local.set(s), { apiKey: key(), modelId, webSearch: false, drawerMode: 'page', ...storage });   // the in-page drawer, which Playwright can see; test/panel.mjs covers the side panel
  return { ctx, extId, setup };
}

export const C = page => page.frameLocator('iframe.cframe');
export const D = page => page.frameLocator('iframe.dframe');
// A frame's Playwright Frame, found by its address (works with the closed shadow root too); the drawer's is
// created the first time the drawer opens.
export async function frameOf(page, kind, timeout = 10000) {
  const t0 = Date.now();
  for (;;) {
    const f = page.frames().find(f => f.url().includes(`/ui/frame.html#${kind}`));
    if (f) return f;
    if (Date.now() - t0 > timeout) throw new Error(`${kind} frame never appeared`);
    await page.waitForTimeout(50);
  }
}
export const drawerFrame = (page, timeout) => frameOf(page, 'drawer', timeout);
// Open the drawer on a page through the popup's message path.
export const openDrawer = (setup, urlPart) => setup.evaluate(async u => { const t = (await chrome.tabs.query({})).find(x => x.url?.includes(u)); await chrome.tabs.sendMessage(t.id, { type: 'open-drawer' }); }, urlPart);
