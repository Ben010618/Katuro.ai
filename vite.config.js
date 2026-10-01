import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  base: './', // relative base for both web and electron local execution
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'node',
    globals: true,
  },
})