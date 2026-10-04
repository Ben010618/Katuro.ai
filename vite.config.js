import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// The website needs ABSOLUTE asset paths: with './', a page like /lesson-gen/step-3
// asked for /lesson-gen/assets/index.js, got GitHub Pages' 404 page instead, and
// stayed blank (seen 2026-10-03 after a reload on Step 3). KaTuroDesk loads
// dist/index.html from disk (file://), which needs RELATIVE paths, so desktop
// builds use `vite build --mode desk`.
export const baseFor = (mode) => (mode === 'desk' ? './' : '/')

export default defineConfig(({ mode }) => ({
  base: baseFor(mode),
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'node',
    globals: true,
    // Desk agent tests build real Excel/Word files; on a busy PC 5s was occasionally too short.
    testTimeout: 20000,
    // In-memory localStorage/sessionStorage for stores that persist (see the file).
    setupFiles: ['./tests/setup/browserStorage.js'],
  },
}))