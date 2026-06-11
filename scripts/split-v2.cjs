const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '../src')
const lines = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8').split('\n')

const SKIP_DECL = /^(let (db|priceChart|stockSelectInstance|stockTagsMap|current|blacklist|favorites|spotQuoteCache|liveQuote|cloudDb|futuresMap|last|priceChartStock)|const (CANDLE|FAVORITES|TRADE_VALUE|LIVE_|QUOTE_|WANTGOO|ACCESS_|GITHUB|SPOT_PULLBACK))/

const STATE_VARS = [
  'db', 'priceChart', 'stockSelectInstance', 'stockTagsMap',
  'currentStrongList', 'currentPullbackUniverse', 'currentSurgeList',
  'currentReferenceDate', 'currentReferenceTimestamp', 'currentAnalysisPeriodStart', 'currentAvgDays',
  'blacklist', 'favorites', 'spotQuoteCache',
  'liveQuoteTimerId', 'liveQuoteSessionTimerId', 'cloudDbTimerId', 'futuresMapCache',
  'liveQuoteInFlight', 'cloudDbInFlight', 'lastLiveQuoteAt', 'lastCloudDbAt',
  'liveQuoteOffSessionDone', 'lastFullAnalyzeAt', 'priceChartStockId', 'liveQuoteSyncedOnce', 'liveQuoteFailStreak',
]

function extract(ranges) {
  const out = []
  for (const [s, e] of ranges) {
    for (let i = s - 1; i < e; i++) {
      const line = lines[i]
      if (!line || SKIP_DECL.test(line.trim())) continue
      if (line.trim() === 'let favorites = loadFavoritesFromCookie();') {
        out.push('state.favorites = loadFavoritesFromCookie()')
        continue
      }
      out.push(line)
    }
  }
  return out.join('\n')
}

function patch(code) {
  let out = code
  for (const v of STATE_VARS) {
    out = out.replace(new RegExp(`\\b${v}\\b`, 'g'), `state.${v}`)
  }
  out = out.replace(/function setLiveQuoteStatus\(state,/g, 'export function setLiveQuoteStatus(status,')
  out = out.replace(/setLiveQuoteStatus\(state,/g, 'setLiveQuoteStatus(status,')
  out = out.replace(/^(async )?function /gm, 'export $1function ')
  return out
}

function write(rel, header, ranges) {
  fs.mkdirSync(path.dirname(path.join(SRC, rel)), { recursive: true })
  fs.writeFileSync(path.join(SRC, rel), header + patch(extract(ranges)) + '\n')
}

const constBody = [
  ...lines.slice(15, 24),
  lines[177],
  ...lines.slice(484, 506),
].join('\n').replace(/^const /gm, 'export const ')
fs.mkdirSync(path.join(SRC, 'config'), { recursive: true })
fs.writeFileSync(path.join(SRC, 'config/constants.js'), constBody + '\n')

fs.writeFileSync(path.join(SRC, 'state.js'), `export const state = {
  db: null, priceChart: null, stockSelectInstance: null, stockTagsMap: {},
  currentStrongList: [], currentPullbackUniverse: [], currentSurgeList: [],
  currentReferenceDate: '', currentReferenceTimestamp: 0,
  currentAnalysisPeriodStart: 0, currentAvgDays: 1,
  blacklist: JSON.parse(localStorage.getItem('stock_blacklist') || '[]'),
  favorites: [], spotQuoteCache: {},
  liveQuoteTimerId: null, liveQuoteSessionTimerId: null, cloudDbTimerId: null, futuresMapCache: null,
  liveQuoteInFlight: false, cloudDbInFlight: false, lastLiveQuoteAt: 0, lastCloudDbAt: 0,
  liveQuoteOffSessionDone: false, lastFullAnalyzeAt: 0, priceChartStockId: null,
  liveQuoteSyncedOnce: false, liveQuoteFailStreak: 0,
}
`)

const C = `import { state } from '../state.js'\nimport { CANDLE_UP, CANDLE_DOWN, CANDLE_NEUTRAL, FAVORITES_COOKIE_NAME, FAVORITES_COOKIE_DAYS, TRADE_VALUE_M_SQL, LIVE_QUOTE_REFRESH_MS, LIVE_ANALYZE_REFRESH_MS, QUOTE_SESSION_START, QUOTE_SESSION_END, WANTGOO_QUOTES_URL, WANTGOO_FUTURES_URL, LIVE_QUOTE_API_BASE, ACCESS_KEY_COOKIE_NAME, ACCESS_KEY_COOKIE_DAYS, GITHUB_DB_URL, GITHUB_DB_REFRESH_MS, SPOT_PULLBACK_MIN } from '../config/constants.js'\n`
const S = `import { state } from '../state.js'\n`

write('utils/dom.js', S, [[60, 65], [2043, 2043]])
write('config/params.js', S, [[42, 58], [1128, 1159]])
write('utils/format.js', C, [[86, 99], [134, 204], [295, 302], [408, 416], [1116, 1127], [1514, 1518], [1822, 1842]])
write('utils/time.js', S + `import { formatDataDateTime } from './format.js'\n`, [[100, 113], [870, 918], [1844, 1860]])
write('db/queries.js', C, [[512, 514], [1612, 1617], [1555, 1572]])
write('features/favorites.js', C + `import { showToast } from '../utils/dom.js'\nimport { createIcons } from 'lucide'\n`, [[26, 40], [1161, 1227], [1285, 1312]])
write('features/blacklist.js', S + `import { showToast } from '../utils/dom.js'\nimport { tryAnalyze } from '../config/params.js'\nimport { createIcons } from 'lucide'\n`, [[1313, 1352], [1443, 1443]])
write('features/punish.js', S + `import { showToast } from '../utils/dom.js'\nimport { createIcons } from 'lucide'\nimport { normalizeStockCode } from '../utils/format.js'\n`, [[1446, 1513]])
write('features/prompts.js', C + `import { showToast, copyToClipboard } from '../utils/dom.js'\nimport { formatPromptName, formatPromptDate } from '../utils/format.js'\nimport { getNewsSearchStartStr, getAnalysisDateLabel } from '../utils/time.js'\n`, [[1826, 1842], [1862, 2042]])
write('ui/modals.js', S + `import { showToast } from '../utils/dom.js'\nimport { escapeHtml } from '../utils/dom.js'\nimport { createIcons } from 'lucide'\n`, [[1354, 1412]])
write('ui/tabs.js', S + `import { refreshPunishData } from '../features/punish.js'\nimport { syncThresholdInputOnModeSwitch, getParams, tryAnalyze } from '../config/params.js'\n`, [[1414, 1441]])

// live: access-key + quotes + tick in one file (lines 516-1114, 473-483)
write('live/quotes.js', C + `import { showToast } from '../utils/dom.js'\nimport { createIcons } from 'lucide'\nimport { getTaipeiDateParts, getTaipeiMinutesFromMidnight, isActiveTradingSession, getNextQuoteSessionBoundaryMs } from '../utils/time.js'\nimport { tryAnalyze } from '../config/params.js'\nimport { isGitHubPages } from '../db/queries.js'\n`, [[114, 129], [473, 483], [516, 1114], [1086, 1114]])

write('db/sql.js', C + `import initSqlJs from 'sql.js/dist/sql-wasm.js'\nimport JSZip from 'jszip'\nimport { showToast } from '../utils/dom.js'\nimport { createIcons } from 'lucide'\nimport { tryAnalyze } from '../config/params.js'\nimport { isGitHubPages } from './queries.js'\n\nexport const sqlPromise = initSqlJs({ locateFile: () => import.meta.env.BASE_URL + 'sql-wasm.wasm' })\n\n`, [[303, 314], [834, 869], [1044, 1085], [1520, 1610]])

// Patch fetchRemoteDatabase / applyDatabaseBytes to dynamic import startDataRefresh
let dbSql = fs.readFileSync(path.join(SRC, 'db/sql.js'), 'utf8')
dbSql = dbSql.replace(
  'state.startDataRefresh();',
  `(await import('../live/quotes.js')).startDataRefresh();`,
)
dbSql = dbSql.replace(
  /tryAnalyze\(\);\s*\n\s*createIcons\(\);/,
  `tryAnalyze();\n    createIcons();`,
)
fs.writeFileSync(path.join(SRC, 'db/sql.js'), dbSql)

write('ui/tables.js', C + `import { showToast, escapeHtml } from '../utils/dom.js'\nimport { createIcons } from 'lucide'\nimport { getParams } from '../config/params.js'\nimport { formatVolumeK, formatTradeValueMillion, formatFuturesMiniCandle, formatFuturesSpotPriceCell, formatSpotAmplitude, formatSpotPriceHighCell, formatSpotPullbackPct, getSpotPullbackFromHigh, formatStockLiveMetric } from '../utils/format.js'\nimport { formatFavoriteBtn, updateFavoriteButtonStates } from '../features/favorites.js'\n`, [[66, 85], [205, 294], [315, 472], [1228, 1284]])

write('analysis/overview.js', C + `import TomSelect from 'tom-select'\nimport { createIcons } from 'lucide'\nimport { getParams, tryAnalyze } from '../config/params.js'\nimport { isETF, isFinanceStock } from '../db/queries.js'\nimport { escapeHtml, showToast } from '../utils/dom.js'\nimport { formatFuturesSpotPriceCell, formatSpotAmplitude, formatFuturesMiniCandle, formatVolumeK, formatTradeValueMillion } from '../utils/format.js'\nimport { renderTagRankList, renderSpotPullbackSection } from '../ui/tables.js'\nimport { getCbInfo, getStockLatestQuote, getTagsLabel } from '../db/sql.js'\nimport { showCbDetail } from '../ui/modals.js'\nimport { formatFavoriteBtn } from '../features/favorites.js'\nimport { addToBlacklist } from '../features/blacklist.js'\n`, [[1618, 1736]])

write('analysis/surge.js', C + `import { createIcons } from 'lucide'\nimport { getParams } from '../config/params.js'\nimport { isETF, isFinanceStock } from '../db/queries.js'\nimport { getCbInfo, getTagsLabel } from '../db/sql.js'\nimport { showCbDetail } from '../ui/modals.js'\nimport { formatFavoriteBtn } from '../features/favorites.js'\nimport { addToBlacklist } from '../features/blacklist.js'\nimport { formatVolumeK } from '../utils/format.js'\nimport { viewStock } from '../features/favorites.js'\n`, [[1737, 1774]])

write('ui/chart.js', `import Chart from 'chart.js/auto'\nimport { state } from '../state.js'\nimport { TRADE_VALUE_M_SQL } from '../config/constants.js'\nimport { getStockLatestQuote } from '../db/sql.js'\nimport { updateStockAnalysisMeta } from './tables.js'\nimport { formatVolumeK } from '../utils/format.js'\n`, [[1775, 1821]])

// access-key functions are in live/quotes.js - add re-export file
fs.writeFileSync(path.join(SRC, 'live/access-key.js'), `export {
  getLiveQuoteApiBase, requiresAccessKey, getLiveQuoteAccessKey, setLiveQuoteAccessKey,
  clearLiveQuoteAccessKey, syncAccessKeyInputs, showAccessKeyModal, hideAccessKeyModal,
  applyAccessKeyAndStartLive, submitAccessKeyModal, saveAccessKeyFromSettings, clearAccessKeyFromSettings,
  showWelcomeWaitingForKey, showWelcomeLoading, resetDashboardToKeyGate,
} from './quotes.js'\n`)

// Fix db/sql fetchRemoteDatabase - need access key imports
const dbFix = fs.readFileSync(path.join(SRC, 'db/sql.js'), 'utf8')
if (!dbFix.includes('showWelcomeWaitingForKey')) {
  const dbHeader = dbFix.replace(
    "import { isGitHubPages } from './queries.js'",
    `import { isGitHubPages } from './queries.js'
import { requiresAccessKey, getLiveQuoteAccessKey, showWelcomeWaitingForKey, showAccessKeyModal } from '../live/access-key.js'
import { setCloudDbStatus } from '../live/quotes.js'`,
  )
  fs.writeFileSync(path.join(SRC, 'db/sql.js'), dbHeader)
}

// tabs init export name
let tabs = fs.readFileSync(path.join(SRC, 'ui/tabs.js'), 'utf8')
if (!tabs.includes('export function initTabsAndMode')) {
  tabs = tabs.replace('document.querySelectorAll', 'export function initTabsAndMode() {\ndocument.querySelectorAll')
  tabs += '\n}\n'
  fs.writeFileSync(path.join(SRC, 'ui/tabs.js'), tabs)
}

const initBody = lines.slice(2053, 2106).join('\n').replace(/\bdb\b/g, 'state.db').replace(/liveQuoteOffSessionDone/g, 'state.liveQuoteOffSessionDone')

const appJs = `import { createIcons } from 'lucide'
import 'tom-select/dist/css/tom-select.default.min.css'
import { initTabsAndMode } from './ui/tabs.js'
import { initFavoriteButtonDelegation, renderFavoritesSection, viewStock, submitAccessKeyModal, saveAccessKeyFromSettings, clearAccessKeyFromSettings, toggleFavorite, addFavoriteFromSelector, copyFavoritesList, removeFromFavorites } from './features/favorites.js'
import { clearBlacklist, removeFromBlacklist, addToBlacklist, handleFilterToggle } from './features/blacklist.js'
import { refreshPunishData } from './features/punish.js'
import { copyOverviewStockList, copyOverviewPrompt, copySurgePrompt } from './features/prompts.js'
import { showCbDetail, closeCbModal } from './ui/modals.js'
import { syncAccessKeyInputs, requiresAccessKey, getLiveQuoteAccessKey, showWelcomeWaitingForKey, showAccessKeyModal, getLiveQuoteApiBase } from './live/access-key.js'
import { fetchRemoteDatabase } from './db/sql.js'
import { refreshCloudDatabase, isActiveTradingSession, refreshLiveQuotes, stopDataRefresh } from './live/quotes.js'
import { state } from './state.js'
import { isGitHubPages } from './db/queries.js'
import { GITHUB_DB_REFRESH_MS } from './config/constants.js'
import { tryAnalyze } from './config/params.js'

initTabsAndMode()

async function initApp() {
${initBody}
}

Object.assign(window, {
  submitAccessKeyModal, saveAccessKeyFromSettings, clearAccessKeyFromSettings,
  toggleFavorite, addFavoriteFromSelector, handleFilterToggle, viewStock,
  clearBlacklist, removeFromBlacklist, addToBlacklist,
  copyFavoritesList, copyOverviewStockList, copyOverviewPrompt, copySurgePrompt,
  showCbDetail, closeCbModal, refreshPunishData, removeFromFavorites,
})

initApp()
`
fs.writeFileSync(path.join(SRC, 'app.js'), appJs)
console.log('split-v2 done')
