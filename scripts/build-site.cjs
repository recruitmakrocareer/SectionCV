const { mkdirSync, copyFileSync } = require('node:fs');
const { join, dirname, resolve } = require('node:path');

const root = resolve(__dirname, '..');
// Publish only runtime assets, keeping tooling and dependencies out of Pages.
const publicFiles = [
  'index.html', 'app.js', 'styles.css', '.nojekyll',
  'memory-game/index.html', 'docs/memory-game/index.html'
];
for (const file of publicFiles) {
  const destination = join(root, '_site', file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, file), destination);
}
console.log(`Prepared ${publicFiles.length} public files in _site/`);
