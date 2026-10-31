// Fast checks that need no browser or key (CI runs these): every script parses, the manifest and package versions
// match, the manifest only names files that exist, and the vendored libraries match their checksums.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const fail = [];
const js = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'lib' ? [] : js(path.join(dir, e.name))) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
for (const f of [...js('extension'), ...fs.readdirSync('test').filter(f => f.endsWith('.mjs')).map(f => `test/${f}`), ...fs.readdirSync('scripts').map(f => `scripts/${f}`)]) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { fail.push(`${f}: ${e.stderr.toString().split('\n').find(Boolean)}`); }
}
const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8')), pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (manifest.version !== pkg.version) fail.push(`version: manifest ${manifest.version} != package.json ${pkg.version}`);
const named = [manifest.background.service_worker, ...manifest.content_scripts.flatMap(c => [...c.js, ...(c.css || [])]), manifest.action.default_popup, manifest.options_page, ...Object.values(manifest.icons), manifest.side_panel.default_path.split('?')[0], ...(manifest.web_accessible_resources || []).flatMap(w => w.resources).filter(r => !r.includes('*'))];
for (const f of named) if (!fs.existsSync(path.join('extension', f))) fail.push(`manifest names a missing file: ${f}`);
for (const line of fs.readFileSync('extension/lib/VERSIONS.sha256', 'utf8').split('\n').filter(Boolean)) {
  const [sum, file] = line.trim().split(/\s+/);
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join('extension/lib', file))).digest('hex');
  if (got !== sum) fail.push(`vendored file changed: lib/${file}`);
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log(`ok: ${named.length} manifest files, scripts parse, versions ${pkg.version}, vendored checksums match`);
