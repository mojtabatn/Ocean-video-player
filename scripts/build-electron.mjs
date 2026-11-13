import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// OMDb key (IMDb ratings): from OCEAN_OMDB_KEY or the git-ignored file .omdb-key; never in the source.
let omdbKey = process.env.OCEAN_OMDB_KEY ?? '';
try {
  omdbKey ||= readFileSync('.omdb-key', 'utf8').trim();
} catch {
  /* no key: ratings come only from the site */
}

const watch = process.argv.includes('--watch');
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['electron'], sourcemap: watch, define: { __OMDB_KEY__: JSON.stringify(omdbKey) } };

await Promise.all([
  build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' }),
  build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
]);
console.log('electron bundles built');
