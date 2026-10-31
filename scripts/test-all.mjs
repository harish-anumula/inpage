// Runs the end-to-end suite, one test after another, and prints a summary. (spa, images and web drive live sites
// with arguments, so they run by hand: see the top of each file.) Each loads the extension into Playwright's
// Chromium and calls OpenRouter for real (about 20 cents for the whole suite; key in OPENROUTER_KEY or .openrouter-key).
// Starts the local test servers if they aren't running. Pass names to run a subset: npm test -- ux panel
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';

const SUITE = [
  ['sanitize'], ['private'], ['isolation'], ['injection'], ['ux', 'local', 'http://127.0.0.1:8799/softmax.html', '#ce, p'], ['page', 'local', 'http://127.0.0.1:8799/softmax.html'],
  ['trust'], ['jev'], ['actions'], ['check'], ['library'], ['memory'], ['nudges'], ['tabs'], ['video'], ['panel'], ['edges'],
];
const only = process.argv.slice(2);
const unknown = only.filter(n => !SUITE.some(([s]) => s === n));
if (unknown.length) { console.error(`No such test: ${unknown.join(', ')}. Tests: ${SUITE.map(([s]) => s).join(', ')}`); process.exit(2); }
const free = port => new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.end(); r(false); }); s.on('error', () => r(true)); });
const servers = [];
for (const [port, dir] of [[8799, 'test/pages'], [8800, '.']]) {
  if (await free(port)) servers.push(spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' }));
}
await new Promise(r => setTimeout(r, 800));
const results = [];
for (const [name, ...args] of SUITE.filter(([n]) => !only.length || only.includes(n))) {
  const t0 = Date.now();
  let ok = true;
  try { execFileSync(process.execPath, [`test/${name}.mjs`, ...args], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60000 }); } catch { ok = false; }
  results.push([name, ok, Math.round((Date.now() - t0) / 1000)]);
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(10)} ${Math.round((Date.now() - t0) / 1000)} s`);
}
servers.forEach(s => s.kill());
const failed = results.filter(r => !r[1]);
console.log(failed.length ? `\n${failed.length} of ${results.length} failed: ${failed.map(r => r[0]).join(', ')} (run one alone to see its output: node test/<name>.mjs)` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
