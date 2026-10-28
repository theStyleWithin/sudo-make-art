// Copies the web app into www/ so Capacitor can bundle it into the Android app.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
fs.mkdirSync(path.join(out, 'build'), { recursive: true });
fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(out, 'build', 'icon.png'));
console.log('web app copied to www/');
