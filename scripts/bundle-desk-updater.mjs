// Bundles electron-updater (and its dependencies) into one file the packaged app can load.
// The installer ships no node_modules, so electron/main.cjs requires electron/vendor/updater.cjs.
import { build } from 'rolldown';

await build({
  input: 'electron-updater',
  platform: 'node',
  external: ['electron'],
  output: { file: 'electron/vendor/updater.cjs', format: 'cjs', codeSplitting: false },
  logLevel: 'warn',
});
console.log('Bundled electron-updater -> electron/vendor/updater.cjs');
