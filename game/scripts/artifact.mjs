// Turns the single-file build into an artifact page fragment (no doctype/html/head/body wrappers):
// title + font link + inline style first, then the canvas/UI markup, then the inline module script.
import fs from 'node:fs';

const src = fs.readFileSync('dist-single/index.html', 'utf8');
const style = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...src.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('no module script found');
const out = `<title>Sporadium</title>
<meta name="description" content="Evolve a species from a single cell to the stars.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
${style}
</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<script type="module">
${scripts.join('\n')}
</script>
`;
fs.mkdirSync('dist-artifact', { recursive: true });
fs.writeFileSync('dist-artifact/sporadium.html', out);
console.log('dist-artifact/sporadium.html', (out.length / 1024).toFixed(0) + ' KB');
