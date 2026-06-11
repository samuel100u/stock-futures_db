const fs = require('fs')

let code = fs.readFileSync('src/legacy-app.js', 'utf8')
code = code.replace(/^        /gm, '')

const header = `import initSqlJs from 'sql.js/dist/sql-wasm.js'
import Chart from 'chart.js/auto'
import TomSelect from 'tom-select'
import JSZip from 'jszip'
import { createIcons } from 'lucide'
import 'tom-select/dist/css/tom-select.default.min.css'

const sqlPromise = initSqlJs({
  locateFile: () => import.meta.env.BASE_URL + 'sql-wasm.wasm',
})

`

code = code.replace(/const sqlPromise = initSqlJs\([\s\S]*?\}\);?\s*\n/, '')
code = code.replace(/lucide\.createIcons\(\)/g, 'createIcons()')

code = code.replace(
  /window\.submitAccessKeyModal = async \(\) => \{/,
  'async function submitAccessKeyModal() {',
)
code = code.replace(
  /window\.saveAccessKeyFromSettings = async \(\) => \{/,
  'async function saveAccessKeyFromSettings() {',
)
code = code.replace(
  /window\.clearAccessKeyFromSettings = \(\) => \{/,
  'function clearAccessKeyFromSettings() {',
)
code = code.replace(
  /window\.toggleFavorite = \(id, name\) => \{/,
  'function toggleFavorite(id, name) {',
)
code = code.replace(
  /window\.addFavoriteFromSelector = \(\) => \{/,
  'function addFavoriteFromSelector() {',
)
code = code.replace(
  /window\.handleFilterToggle = \(\) => \{ if\(db\) tryAnalyze\(\); \};/,
  'function handleFilterToggle() { if (db) tryAnalyze(); }',
)
code = code.replace(
  /window\.viewStock = \(id\) => \{/,
  'function viewStock(id) {',
)

code = code.replace(/window\.onload = async \(\) => \{/, 'async function initApp() {')

const footer = `
Object.assign(window, {
  submitAccessKeyModal,
  saveAccessKeyFromSettings,
  clearAccessKeyFromSettings,
  toggleFavorite,
  addFavoriteFromSelector,
  handleFilterToggle,
  viewStock,
  clearBlacklist,
  removeFromBlacklist,
  addToBlacklist,
  copyFavoritesList,
  copyOverviewStockList,
  copyOverviewPrompt,
  copySurgePrompt,
  showCbDetail,
  closeCbModal,
  refreshPunishData,
  removeFromFavorites,
})

initApp()
`

fs.writeFileSync('src/app.js', header + code.trim() + '\n' + footer)
console.log('src/app.js written')
