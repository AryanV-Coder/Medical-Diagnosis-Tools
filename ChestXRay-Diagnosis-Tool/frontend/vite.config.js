import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // jsPDF optionally imports canvg for SVG rendering — we never use that
      // code path (we use html2canvas instead), so stub it out to prevent
      // Vite from failing to resolve the optional dynamic import.
      canvg: path.resolve('./src/stubs/canvg.stub.js'),
    },
  },
})
