const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '../src')
const raw = fs.readFileSync(path.join(SRC, 'app-monolith.js'), 'utf8')

const STATE_VARS = [
  'db', 'priceChart', 'stockSelectInstance', 'stockTagsMap',
  'currentStrongList', 'currentPullbackUniverse', 'currentSurgeList',
  'currentReferenceDate', 'currentReferenceTimestamp', 'currentAnalysisPeriodStart', 'currentAvgDays',
  'blacklist', 'favorites', 'spotQuoteCache',
  'liveQuoteTimerId', 'liveQuoteSessionTimerId', 'cloudDbTimerId', 'futuresMapCache',
  'liveQuoteInFlight', 'cloudDbInFlight', 'lastLiveQuoteAt', 'lastCloudDbAt',
  'liveQuoteOffSessionDone', 'lastFullAnalyzeAt', 'priceChartStockId', 'liveQuoteSyncedOnce', 'liveQuoteFailStreak',
]

function patchState(code) {
  let out = code.replace(/function setLiveQuoteStatus\(state,/g, 'function setLiveQuoteStatus(status,')
  for (const v of STATE_VARS) {
    out = out.replace(new RegExp(`\\b${v}\\b`, 'g'), `state.${v}`)
  }
  out = out.replace(/getElementById\('state\.db-status'\)/g, "getElementById('db-status')")
  out = out.replace(/if \(state\.db === 'loading'\)/g, "if (status === 'loading')")
  out = out.replace(/else if \(state\.db === 'ok'\)/g, "else if (status === 'ok')")
  return out
}

let body = raw.slice(raw.indexOf('/**\n * 💎 定義與組件初始化'))
body = body.replace(/import initSqlJs[\s\S]*?const sqlPromise = initSqlJs\([\s\S]*?\}\)\s*\n/, '')
body = body.replace(/let db = null[\s\S]*?const FAVORITES_COOKIE_DAYS = \d+;\s*\n/, '')
body = body.replace(/const CANDLE_UP[\s\S]*?const FAVORITES_COOKIE_DAYS = \d+;\s*\n/, '')
body = body.replace(/let stockTagsMap[\s\S]*?let currentAvgDays = \d+;\s*\n/, '')
body = body.replace(/let blacklist = [^;]+;\s*\n/, '')
body = body.replace(/let favorites = loadFavoritesFromCookie\(\);\s*\n/, 'state.favorites = loadFavoritesFromCookie();\n')
body = body.replace(/let spotQuoteCache = \{\};\s*\n/, '')
body = body.replace(/const TRADE_VALUE_M_SQL[\s\S]*?const GITHUB_DB_REFRESH_MS = \d+;\s*\n/, '')
body = body.replace(/let liveQuoteTimerId[\s\S]*?let liveQuoteFailStreak = \d+;\s*\n/, '')
body = body.replace(/window\.onload = async \(\) => \{/, 'export async function initApp() {')
body = body.replace(/\nObject\.assign\(window[\s\S]*$/, '')

const header = `import initSqlJs from 'sql.js/dist/sql-wasm.js'
import Chart from 'chart.js/auto'
import TomSelect from 'tom-select'
import JSZip from 'jszip'
import { createIcons } from 'lucide'
import 'tom-select/dist/css/tom-select.default.min.css'
import { state } from './state.js'
import {
  CANDLE_UP, CANDLE_DOWN, CANDLE_NEUTRAL, FAVORITES_COOKIE_NAME, FAVORITES_COOKIE_DAYS,
  TRADE_VALUE_M_SQL, LIVE_QUOTE_REFRESH_MS, LIVE_ANALYZE_REFRESH_MS,
  QUOTE_SESSION_START, QUOTE_SESSION_END, WANTGOO_QUOTES_URL, WANTGOO_FUTURES_URL,
  LIVE_QUOTE_API_BASE, ACCESS_KEY_COOKIE_NAME, ACCESS_KEY_COOKIE_DAYS,
  GITHUB_DB_URL, GITHUB_DB_REFRESH_MS, SPOT_PULLBACK_MIN,
} from './config/constants.js'

const sqlPromise = initSqlJs({
  locateFile: () => import.meta.env.BASE_URL + 'sql-wasm.wasm',
})

`

let dashboard = header + patchState(body)
dashboard = dashboard.replace(/^(async )?function /gm, 'export $1function ')
dashboard = dashboard.replace(/export export /g, 'export ')

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

const constSrc = raw.match(/const CANDLE_UP[\s\S]*?const FAVORITES_COOKIE_DAYS = \d+;/)?.[0] || ''
const constSrc2 = raw.match(/const TRADE_VALUE_M_SQL[\s\S]*?const GITHUB_DB_REFRESH_MS = \d+;/)?.[0] || ''
const constSrc3 = raw.match(/const SPOT_PULLBACK_MIN = [^;]+;/)?.[0] || ''
fs.mkdirSync(path.join(SRC, 'config'), { recursive: true })
fs.writeFileSync(path.join(SRC, 'config/constants.js'), [constSrc, constSrc3, constSrc2].join('\n').replace(/^const /gm, 'export const ') + '\n')

fs.writeFileSync(path.join(SRC, 'dashboard.js'), dashboard)

const barrels = {
  'utils/dom.js': ['showToast', 'escapeHtml', 'copyToClipboard'],
  'utils/format.js': ['formatDataDateTime', 'getLatestDataDateTime', 'formatMiniDayCandle', 'formatLabeledMiniCandle', 'formatFuturesMiniCandle', 'formatSpotMiniCandle', 'formatSpotAmplitude', 'getSpotPullbackFromHigh', 'formatSpotPullbackPct', 'formatSpotPriceHighCell', 'formatFuturesSpotPriceCell', 'formatStockLiveMetric', 'formatVolumeK', 'formatTradeValueMillion', 'formatPromptName', 'formatPromptDate', 'getNewsSearchStartStr', 'getAnalysisDateLabel', 'normalizeStockCode'],
  'config/params.js': ['getParams', 'applyOverviewThresholdForMode', 'syncThresholdInputOnModeSwitch', 'tryAnalyze'],
  'db/queries.js': ['isGitHubPages', 'isETF', 'isFinanceStock', 'loadStockTagsMap', 'getTagsForStock', 'getPrimaryTag', 'getTagsLabel'],
  'db/sql.js': ['getStockLatestQuote', 'loadDatabase', 'findMarketDbEntry', 'fetchRemoteDatabase', 'fetchMarketDbUint8', 'applyDatabaseBytes', 'refreshCloudDatabase', 'getCbInfo', 'ensureFuturesMap', 'upsertQuotesToMemoryDb'],
  'live/access-key.js': ['getLiveQuoteApiBase', 'requiresAccessKey', 'getLiveQuoteAccessKey', 'setLiveQuoteAccessKey', 'clearLiveQuoteAccessKey', 'syncAccessKeyInputs', 'showAccessKeyModal', 'hideAccessKeyModal', 'applyAccessKeyAndStartLive', 'submitAccessKeyModal', 'saveAccessKeyFromSettings', 'clearAccessKeyFromSettings', 'showWelcomeWaitingForKey', 'showWelcomeLoading', 'resetDashboardToKeyGate'],
  'live/quotes.js': ['updateSpotQuoteCacheFromQuotes', 'getSpotQuote', 'applyLiveQuoteTick', 'buildProxyApiUrl', 'liveQuoteEndpoint', 'formatLiveQuoteError', 'fetchProxyJson', 'mergeQuotesFuturesClient', 'fetchQuotesFuturesViaProxy', 'fetchWantgooJson', 'getTaipeiDateParts', 'getTaipeiMinutesFromMidnight', 'isActiveTradingSession', 'taipeiLocalToUtcMs', 'getNextQuoteSessionBoundaryMs', 'setLiveQuoteStatus', 'refreshLiveQuotes', 'stopLiveQuoteFastPolling', 'syncLiveQuoteSchedule', 'startLiveQuotePolling', 'stopLiveQuotePolling', 'setCloudDbStatus', 'startCloudDbPolling', 'stopCloudDbPolling', 'startDataRefresh', 'stopDataRefresh'],
  'analysis/overview.js': ['buildPullbackUniverse', 'buildSpotPullbackList', 'renderSpotPullbackSection', 'refreshSpotPullbackSectionOnTick', 'processOverview'],
  'analysis/surge.js': ['processSurgeAnalysis'],
  'ui/tables.js': ['renderTagRankList', 'updateStockAnalysisMeta', 'patchStockAnalysisLive', 'patchStrongTableLive', 'patchOverviewStatsLive', 'updatePriceChartLive', 'renderFavoritesSection', 'patchFavoritesSectionLive', 'renderBlacklist'],
  'ui/chart.js': ['updatePriceTrend'],
  'ui/modals.js': ['showCbDetail', 'closeCbModal'],
  'ui/tabs.js': ['initTabsAndMode'],
  'features/favorites.js': ['loadFavoritesFromCookie', 'saveFavoritesToCookie', 'isFavorite', 'formatFavoriteBtn', 'initFavoriteButtonDelegation', 'updateFavoriteButtonStates', 'addToFavorites', 'removeFromFavorites', 'toggleFavorite', 'addFavoriteFromSelector', 'copyFavoritesList', 'viewStock'],
  'features/blacklist.js': ['addToBlacklist', 'removeFromBlacklist', 'clearBlacklist', 'handleFilterToggle'],
  'features/punish.js': ['refreshPunishData'],
  'features/prompts.js': ['isPromptExcludedStock', 'filterPromptStocks', 'getOverviewListLabel', 'buildPromptGroupRulesBlock', 'buildOverviewPromptTemplate', 'buildSurgePromptTemplate', 'copyOverviewStockList', 'copyOverviewPrompt', 'copySurgePrompt'],
}

for (const [file, names] of Object.entries(barrels)) {
  fs.mkdirSync(path.dirname(path.join(SRC, file)), { recursive: true })
  const depth = file.split('/').length - 1
  const prefix = depth === 1 ? './' : '../'.repeat(depth)
  fs.writeFileSync(path.join(SRC, file), `export { ${names.join(', ')} } from '${prefix}dashboard.js'\n`)
}

// initTabsAndMode - extract tab code into exported function in dashboard
let dash = fs.readFileSync(path.join(SRC, 'dashboard.js'), 'utf8')
if (!dash.includes('export function initTabsAndMode')) {
  dash = dash.replace(
    '// 頁籤與模式切換\ndocument.querySelectorAll',
    'export function initTabsAndMode() {\ndocument.querySelectorAll',
  )
  dash = dash.replace(
    /if\(state\.db\) tryAnalyze\(\);\s*\n\}\);\s*\n\nexport function handleFilterToggle/,
    'if(state.db) tryAnalyze();\n});\n}\n\nexport function handleFilterToggle',
  )
  fs.writeFileSync(path.join(SRC, 'dashboard.js'), dash)
}

fs.writeFileSync(path.join(SRC, 'app.js'), `import {
  initApp, initTabsAndMode,
  submitAccessKeyModal, saveAccessKeyFromSettings, clearAccessKeyFromSettings,
  toggleFavorite, addFavoriteFromSelector, handleFilterToggle, viewStock,
  clearBlacklist, removeFromBlacklist, addToBlacklist,
  copyFavoritesList, copyOverviewStockList, copyOverviewPrompt, copySurgePrompt,
  showCbDetail, closeCbModal, refreshPunishData, removeFromFavorites,
} from './dashboard.js'

initTabsAndMode()

Object.assign(window, {
  submitAccessKeyModal, saveAccessKeyFromSettings, clearAccessKeyFromSettings,
  toggleFavorite, addFavoriteFromSelector, handleFilterToggle, viewStock,
  clearBlacklist, removeFromBlacklist, addToBlacklist,
  copyFavoritesList, copyOverviewStockList, copyOverviewPrompt, copySurgePrompt,
  showCbDetail, closeCbModal, refreshPunishData, removeFromFavorites,
})

initApp()
`)

console.log('prepare-dashboard done')
