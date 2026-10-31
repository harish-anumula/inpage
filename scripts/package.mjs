// Builds dist/inpage-<version>.zip from extension/ for the Chrome Web Store, Edge Add-ons, or a GitHub release.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { version } = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
fs.mkdirSync('dist', { recursive: true });
const out = `dist/inpage-${version}.zip`;
fs.rmSync(out, { force: true });
execFileSync('zip', ['-qr', `../${out}`, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: 'extension', stdio: 'inherit' });
console.log(`${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
