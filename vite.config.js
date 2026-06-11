import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/stock-futures_db/',
  plugins: [tailwindcss()],
  build: { outDir: 'dist' },
  optimizeDeps: {
    include: ['sql.js', 'chart.js', 'jszip', 'tom-select'],
  },
})
