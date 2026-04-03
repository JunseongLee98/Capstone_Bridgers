import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'extension/dist');

await esbuild.build({
  entryPoints: {
    background: path.join(root, 'extension/src/background.ts'),
    content: path.join(root, 'extension/src/content.ts'),
    panel: path.join(root, 'extension/src/panel-main.tsx'),
    options: path.join(root, 'extension/src/options-main.ts'),
  },
  bundle: true,
  outdir: dist,
  entryNames: '[name]',
  platform: 'browser',
  target: 'chrome100',
  format: 'iife',
  jsx: 'automatic',
  alias: {
    '@': root,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'extension/src/panel.css'), path.join(dist, 'panel.css'));
fs.copyFileSync(path.join(root, 'extension/src/options.css'), path.join(dist, 'options.css'));

console.log('Copied panel.css and options.css to extension/dist/');
