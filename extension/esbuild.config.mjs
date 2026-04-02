import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await esbuild.build({
  entryPoints: [path.join(root, 'extension/src/background.ts')],
  bundle: true,
  outfile: path.join(root, 'extension/dist/background.js'),
  platform: 'browser',
  target: 'chrome100',
  alias: {
    '@': root,
  },
  logLevel: 'info',
});
