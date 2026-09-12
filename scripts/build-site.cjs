const { mkdirSync, copyFileSync, rmSync } = require('node:fs');
const { join, dirname, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const levels = require('../levels.js');
// Rebuild a clean allowlisted directory, keeping credentials, database files
// and tooling out of both GitHub Pages and Cloudflare static assets.
rmSync(join(root, '_site'), { recursive: true, force: true });
const publicFiles = [
  'index.html', 'app.js', 'account.js', 'liff.js', 'levels.js', 'styles.css', '.nojekyll',
  'admin.html', 'admin.js', '_headers',
  'memory-game/index.html', 'docs/memory-game/index.html',
  ...levels.flatMap((level) => [level.original, level.edited])
];
for (const file of publicFiles) {
  const destination = join(root, '_site', file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, file), destination);
}
console.log(`Prepared ${publicFiles.length} public files in _site/`);
