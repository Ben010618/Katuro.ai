import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/', // custom domain (katuro.website) serves from root, not a /RepoName/ subpath
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'node',
    globals: true,
  },
})