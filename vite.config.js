import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
// The website needs ABSOLUTE asset paths: with './', a page like /lesson-gen/step-3
// asked for /lesson-gen/assets/index.js, got GitHub Pages' 404 page instead, and
// stayed blank (seen 2026-10-03 after a reload on Step 3). KaTuroDesk loads
// dist/index.html from disk (file://), which needs RELATIVE paths, so desktop
// builds use `vite build --mode desk`.
export const baseFor = (mode) => (mode === 'desk' ? './' : '/')

// KaTuroDesk's voice on the laptop (Piper, see src/services/desk/voice/piperVoice.js) needs its
// engine files next to index.html, so it works offline. Desktop builds only: the website
// never uses them, so they are not uploaded there.
const DESK_VOICE_FILES = {
  'ort-wasm-simd-threaded.mjs': 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm': 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
  'piper_phonemize.wasm': 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm',
  'piper_phonemize.data': 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data',
}
export function deskVoiceAssets(mode) {
  return {
    name: 'desk-voice-assets',
    apply: 'build',
    generateBundle() {
      if (mode !== 'desk') return
      for (const [name, from] of Object.entries(DESK_VOICE_FILES)) {
        this.emitFile({ type: 'asset', fileName: `desk-voice/${name}`, source: fs.readFileSync(path.resolve(from)) })
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  base: baseFor(mode),
  plugins: [
    react(),
    tailwindcss(),
    deskVoiceAssets(mode),
  ],
  resolve: {
    alias: [
      // Piper's engine: the variant that loads its .wasm from desk-voice/ (shipped once),
      // instead of the "bundle" variant that makes Vite copy a second 14 MB .wasm into assets.
      { find: /^onnxruntime-web\/wasm$/, replacement: path.resolve('node_modules/onnxruntime-web/dist/ort.wasm.min.mjs') },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    // Desk agent tests build real Excel/Word files; on a busy PC 5s was occasionally too short.
    testTimeout: 20000,
    // In-memory localStorage/sessionStorage for stores that persist (see the file).
    setupFiles: ['./tests/setup/browserStorage.js'],
  },
}))