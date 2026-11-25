// Copies the single-file build into the desktop app before packaging.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'dist-single', 'index.html');
if (!fs.existsSync(src)) { console.error('Run "npm run build:single" in the stickv1 folder first.'); process.exit(1); }
fs.mkdirSync(path.join(__dirname, 'web'), { recursive: true });
fs.copyFileSync(src, path.join(__dirname, 'web', 'index.html'));
console.log('Copied the game into desktop/web/');
