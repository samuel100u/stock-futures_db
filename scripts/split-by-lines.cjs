const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '../src')
const lines = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8').split('\n')

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
  const parts = ranges.map(([s, e]) => lines.slice(s - 1, e).join('\n'))
  return parts.join('\n\n')
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
  const dir = path.dirname(rel)
  fs.mkdirSync(path.join(SRC, dir), { recursive: true })
  const body = patch(extract(ranges))
  fs.writeFileSync(path.join(SRC, rel), header + body + '\n')
}

// constants
const constLines = [
  ...lines.slice(15, 24),
  lines[177],
  ...lines.slice(484, 507),
].join('\n').replace(/^const /gm, 'export const ')
fs.mkdirSync(path.join(SRC, 'config'), { recursive: true })
fs.writeFileSync(path.join(SRC, 'config/constants.js'), constLines + '\n')

// state
fs.writeFileSync(path.join(SRC, 'state.js'), `export const state = {
  db: null,
  priceChart: null,
  stockSelectInstance: null,
  stockTagsMap: {},
  currentStrongList: [],
  currentPullbackUniverse: [],
  currentSurgeList: [],
  currentReferenceDate: '',
  currentReferenceTimestamp: 0,
  currentAnalysisPeriodStart: 0,
  currentAvgDays: 1,
  blacklist: JSON.parse(localStorage.getItem('stock_blacklist') || '[]'),
  favorites: [],
  spotQuoteCache: {},
  liveQuoteTimerId: null,
  liveQuoteSessionTimerId: null,
  cloudDbTimerId: null,
  futuresMapCache: null,
  liveQuoteInFlight: false,
  cloudDbInFlight: false,
  lastLiveQuoteAt: 0,
  lastCloudDbAt: 0,
  liveQuoteOffSessionDone: false,
  lastFullAnalyzeAt: 0,
  priceChartStockId: null,
  liveQuoteSyncedOnce: false,
  liveQuoteFailStreak: 0,
}
`)

const H = {
  state: "import { state } from '../state.js'\n",
  stC: "import { state } from '../state.js'\nimport * as C from '../config/constants.js'\nconst { CANDLE_UP, CANDLE_DOWN, CANDLE_NEUTRAL, FAVORITES_COOKIE_NAME, FAVORITES_COOKIE_DAYS, TRADE_VALUE_M_SQL, LIVE_QUOTE_REFRESH_MS, LIVE_ANALYZE_REFRESH_MS, QUOTE_SESSION_START, QUOTE_SESSION_END, WANTGOO_QUOTES_URL, WANTGOO_FUTURES_URL, LIVE_QUOTE_API_BASE, ACCESS_KEY_COOKIE_NAME, ACCESS_KEY_COOKIE_DAYS, GITHUB_DB_URL, GITHUB_DB_REFRESH_MS, SPOT_PULLBACK_MIN } = C\n",
  stDom: "import { state } from '../state.js'\nimport { showToast } from '../utils/dom.js'\n",
}

write('utils/dom.js', H.state, [[60, 65], [2043, 2043]])
write('config/params.js', H.state, [[42, 58], [1128, 1159]])
write('utils/format.js', H.stC + "import { state } from '../state.js'\nimport { getStockLatestQuote, getSpotQuote } from '../db/sql.js'\n", [[86, 99], [134, 204], [295, 302], [408, 416], [1116, 1127], [1514, 1518], [1822, 1842]])
write('utils/time.js', H.stDom + "import { state } from '../state.js'\nimport { formatDataDateTime } from './format.js'\n", [[100, 113], [870, 918], [1844, 1860]])
write('features/favorites.js', H.stC + "import { state } from '../state.js'\nimport { showToast } from '../utils/dom.js'\nimport { getStockLatestQuote } from '../db/sql.js'\nimport { formatFuturesSpotPriceCell, formatVolumeK } from '../utils/format.js'\nimport { formatStockLiveMetric } from '../utils/format.js'\nimport { createIcons } from 'lucide'\n", [[26, 40], [1161, 1227], [1285, 1312]])
write('features/blacklist.js', H.state + "import { showToast } from '../utils/dom.js'\nimport { tryAnalyze } from '../config/params.js'\nimport { createIcons } from 'lucide'\n", [[1313, 1352], [1443, 1443]])
write('features/punish.js', H.stDom + "import { createIcons } from 'lucide'\nimport { normalizeStockCode } from '../utils/format.js'\nimport { viewStock } from './favorites.js'\n", [[1446, 1513]])
write('features/prompts.js', H.stC + "import { state } from '../state.js'\nimport { showToast } from '../utils/dom.js'\nimport { formatPromptName, formatPromptDate } from '../utils/format.js'\nimport { getNewsSearchStartStr, getAnalysisDateLabel } from '../utils/time.js'\nimport { copyToClipboard } from '../utils/dom.js'\n", [[1826, 1842], [1862, 2042]])
write('ui/modals.js', H.stDom + "import { createIcons } from 'lucide'\nimport { escapeHtml } from '../utils/dom.js'\nimport { getCbInfo } from '../db/sql.js'\n", [[1354, 1412]])
write('ui/tabs.js', "import { state } from '../state.js'\nimport { refreshPunishData } from '../features/punish.js'\nimport { syncThresholdInputOnModeSwitch, getParams, tryAnalyze } from '../config/params.js'\n", [[1414, 1441]])
write('db/sql.js', H.stC + "import { state } from '../state.js'\nimport initSqlJs from 'sql.js/dist/sql-wasm.js'\nimport JSZip from 'jszip'\nimport { createIcons } from 'lucide'\nimport { showToast } from '../utils/dom.js'\nimport { formatDataDateTime, getLatestDataDateTime } from '../utils/time.js'\nimport { formatFuturesMiniCandle, formatSpotMiniCandle, formatFuturesSpotPriceCell, formatSpotAmplitude, formatStockLiveMetric } from '../utils/format.js'\nimport { tryAnalyze } from '../config/params.js'\nimport { startDataRefresh, setCloudDbStatus } from '../live/quotes.js'\nimport { requiresAccessKey, getLiveQuoteAccessKey, showWelcomeWaitingForKey, showAccessKeyModal } from '../live/access-key.js'\n\nexport const sqlPromise = initSqlJs({ locateFile: () => import.meta.env.BASE_URL + 'sql-wasm.wasm' })\n\n", [[303, 314], [834, 869], [1044, 1114], [1520, 1617], [1574, 1610]])
write('live/access-key.js', H.stC + "import { state } from '../state.js'\nimport { createIcons } from 'lucide'\nimport { showToast } from '../utils/dom.js'\nimport { fetchRemoteDatabase, sqlPromise } from '../db/sql.js'\nimport { startLiveQuotePolling, stopDataRefresh } from './quotes.js'\n", [[512, 675]])
write('live/quotes.js', H.stC + "import { state } from '../state.js'\nimport { createIcons } from 'lucide'\nimport { showToast } from '../utils/dom.js'\nimport { getLiveQuoteApiBase, getLiveQuoteAccessKey, showAccessKeyModal } from './access-key.js'\nimport { upsertQuotesToMemoryDb, ensureFuturesMap } from '../db/sql.js'\nimport { getTaipeiDateParts, getTaipeiMinutesFromMidnight, isActiveTradingSession, getNextQuoteSessionBoundaryMs } from '../utils/time.js'\nimport { tryAnalyze } from '../config/params.js'\nimport { applyLiveQuoteTick } from './tick.js'\nimport { refreshCloudDatabase } from '../db/sql.js'\nimport { isGitHubPages } from '../db/queries.js'\n", [[114, 129], [677, 833], [919, 1043], [1086, 1114]])
write('live/tick.js', H.state + "import { patchStrongTableLive, patchOverviewStatsLive, updatePriceChartLive, patchStockAnalysisLive } from '../ui/tables.js'\nimport { patchFavoritesSectionLive } from '../features/favorites.js'\nimport { refreshSpotPullbackSectionOnTick } from '../ui/tables.js'\n", [[473, 483]])
write('db/queries.js', H.stC, [[1612, 1617], [1555, 1572]])
write('analysis/overview.js', H.stC + "import { state } from '../state.js'\nimport { createIcons } from 'lucide'\nimport { getParams } from '../config/params.js'\nimport { isETF, isFinanceStock } from '../db/queries.js'\nimport { getStockLatestQuote } from '../db/sql.js'\nimport { getSpotQuote, getSpotPullbackFromHigh } from '../utils/format.js'\nimport { formatFuturesSpotPriceCell, formatSpotAmplitude, formatSpotPriceHighCell, formatSpotPullbackPct, formatFuturesMiniCandle, formatVolumeK, formatTradeValueMillion } from '../utils/format.js'\nimport { escapeHtml } from '../utils/dom.js'\nimport { getCbInfo } from '../db/sql.js'\nimport { showCbDetail } from '../ui/modals.js'\nimport { formatFavoriteBtn } from '../features/favorites.js'\nimport { addToBlacklist } from '../features/blacklist.js'\nimport { renderTagRankList, renderSpotPullbackSection } from '../ui/tables.js'\nimport { getTagsLabel } from '../db/sql.js'\nimport TomSelect from 'tom-select'\n", [[205, 294], [1618, 1736]])
write('analysis/surge.js', H.stC + "import { state } from '../state.js'\nimport { createIcons } from 'lucide'\nimport { getParams } from '../config/params.js'\nimport { isETF, isFinanceStock } from '../db/queries.js'\nimport { getCbInfo } from '../db/sql.js'\nimport { showCbDetail } from '../ui/modals.js'\nimport { formatFavoriteBtn } from '../features/favorites.js'\nimport { addToBlacklist } from '../features/blacklist.js'\nimport { formatVolumeK } from '../utils/format.js'\nimport { viewStock } from '../features/favorites.js'\nimport { getTagsLabel } from '../db/sql.js'\n", [[1737, 1774]])
write('ui/tables.js', H.stC + "import { state } from '../state.js'\nimport { createIcons } from 'lucide'\nimport { escapeHtml } from '../utils/dom.js'\nimport { getStockLatestQuote } from '../db/sql.js'\nimport { formatFuturesMiniCandle, formatFuturesSpotPriceCell, formatSpotAmplitude, formatStockLiveMetric, formatSpotPriceHighCell, formatSpotPullbackPct, getSpotPullbackFromHigh } from '../utils/format.js'\nimport { getParams } from '../config/params.js'\nimport { buildSpotPullbackList } from '../analysis/overview.js'\nimport { formatVolumeK } from '../utils/format.js'\nimport { formatFavoriteBtn, updateFavoriteButtonStates } from '../features/favorites.js'\nimport { SPOT_PULLBACK_MIN } from '../config/constants.js'\n", [[66, 85], [233, 294], [315, 472], [1228, 1284]])
write('ui/chart.js', "import Chart from 'chart.js/auto'\nimport { state } from '../state.js'\nimport { TRADE_VALUE_M_SQL } from '../config/constants.js'\nimport { getStockLatestQuote } from '../db/sql.js'\nimport { updateStockAnalysisMeta } from './tables.js'\nimport { formatVolumeK } from '../utils/format.js'\n", [[1775, 1821]])

// new app.js
const appJs = `import { createIcons } from 'lucide'
import 'tom-select/dist/css/tom-select.default.min.css'
import { initTabsAndMode } from './ui/tabs.js'
import { initFavoriteButtonDelegation, renderFavoritesSection, viewStock, submitAccessKeyModal, saveAccessKeyFromSettings, clearAccessKeyFromSettings, toggleFavorite, addFavoriteFromSelector, copyFavoritesList, removeFromFavorites } from './features/favorites.js'
import { clearBlacklist, removeFromBlacklist, addToBlacklist, handleFilterToggle } from './features/blacklist.js'
import { refreshPunishData } from './features/punish.js'
import { copyOverviewStockList, copyOverviewPrompt, copySurgePrompt } from './features/prompts.js'
import { showCbDetail, closeCbModal } from './ui/modals.js'
import { syncAccessKeyInputs } from './live/access-key.js'
import { fetchRemoteDatabase } from './db/sql.js'
import { requiresAccessKey, getLiveQuoteAccessKey, showWelcomeWaitingForKey, showAccessKeyModal } from './live/access-key.js'
import { refreshCloudDatabase } from './db/sql.js'
import { getLiveQuoteApiBase } from './live/access-key.js'
import { isActiveTradingSession, refreshLiveQuotes } from './live/quotes.js'
import { stopDataRefresh } from './live/quotes.js'
import { state } from './state.js'
import { isGitHubPages } from './db/queries.js'
import { GITHUB_DB_REFRESH_MS } from './config/constants.js'
import { tryAnalyze } from './config/params.js'

initTabsAndMode()

async function initApp() {
${lines.slice(2054, 2107).join('\n').replace(/\bdb\b/g, 'state.db').replace(/liveQuoteOffSessionDone/g, 'state.liveQuoteOffSessionDone')}
}

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

fs.writeFileSync(path.join(SRC, 'app.js'), appJs)
fs.copyFileSync(path.join(SRC, 'app.js'), path.join(SRC, 'app-monolith-backup.js'))
console.log('Split done')
