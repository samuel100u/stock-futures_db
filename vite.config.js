import { defineConfig } from 'vite'

export default defineConfig({
  base: '/stock-futures_db/',
  build: { outDir: 'dist' },
  optimizeDeps: {
    include: ['sql.js', 'chart.js', 'jszip', 'tom-select'],
  },
})
