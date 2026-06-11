const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm')
const destDir = path.join(__dirname, '../public')
const dest = path.join(destDir, 'sql-wasm.wasm')

if (!fs.existsSync(src)) {
  console.warn('sql-wasm.wasm not found yet; run npm install first')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log('Copied sql-wasm.wasm to public/')
