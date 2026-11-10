const fs = require('fs');
const path = require('path');

const distWeb = path.resolve(__dirname, '..', 'dist-web');
const assetsDir = path.join(distWeb, 'assets');
const files = fs.readdirSync(assetsDir);
const cssFile = files.find(f => f.endsWith('.css'));
const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));

if (!cssFile || !jsFile) {
  console.error('Error: CSS or JS bundle not found in dist-web/assets');
  process.exit(1);
}

const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8');
const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NexoMD v0.2.0 — Editor Markdown Híbrido (Rust + Vue 3)</title>
    <style>${cssContent}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">${jsContent}</script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distWeb, 'index.html'), html, 'utf-8');
console.log(`Standalone dist-web/index.html generated successfully! (${(fs.statSync(path.join(distWeb, 'index.html')).size / 1024).toFixed(1)} KB)`);
