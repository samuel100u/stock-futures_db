import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import obfuscator from 'rollup-plugin-obfuscator'

export default defineConfig({
  base: '/stock-futures_db/',
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/dashboard.js')) return 'dashboard'
        },
      },
      plugins: [
        obfuscator({
          include: ['**/dashboard-*.js'],
          exclude: ['node_modules/**'],
          options: {
            compact: true,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            stringArray: true,
            stringArrayThreshold: 0.75,
            renameGlobals: false,
            selfDefending: false,
          },
        }),
      ],
    },
  },
  optimizeDeps: {
    include: ['sql.js', 'chart.js', 'jszip', 'tom-select'],
  },
})
