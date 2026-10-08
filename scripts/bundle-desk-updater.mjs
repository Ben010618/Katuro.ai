// Bundles main-process libraries into single files the packaged app can load.
// The installer ships no node_modules, so electron/main.cjs requires electron/vendor/*.cjs.
import { build } from 'rolldown';

await build({
  input: 'electron-updater',
  platform: 'node',
  external: ['electron'],
  output: { file: 'electron/vendor/updater.cjs', format: 'cjs', codeSplitting: false },
  logLevel: 'warn',
});
console.log('Bundled electron-updater -> electron/vendor/updater.cjs');

// iPhone photos (HEIC/HEIF) -> JPEG, used by the photos-to-PDF tool.
await build({
  input: 'heic-convert',
  platform: 'node',
  external: ['electron'],
  output: { file: 'electron/vendor/heic.cjs', format: 'cjs', codeSplitting: false },
  logLevel: 'warn',
});
console.log('Bundled heic-convert -> electron/vendor/heic.cjs');
