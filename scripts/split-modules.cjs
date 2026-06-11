/**
 * Splits src/app.js into modules under src/
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '../src')
const appJs = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8')

const headerEnd = appJs.indexOf('/**\n * 💎 定義與組件初始化')
const footerStart = appJs.indexOf('\nObject.assign(window,')
const body = appJs.slice(headerEnd, footerStart)

const STATE_VARS = [
  'db', 'priceChart', 'stockSelectInstance', 'stockTagsMap',
  'currentStrongList', 'currentPullbackUniverse', 'currentSurgeList',
  'currentReferenceDate', 'currentReferenceTimestamp', 'currentAnalysisPeriodStart', 'currentAvgDays',
  'blacklist', 'favorites', 'spotQuoteCache',
  'liveQuoteTimerId', 'liveQuoteSessionTimerId', 'cloudDbTimerId', 'futuresMapCache',
  'liveQuoteInFlight', 'cloudDbInFlight', 'lastLiveQuoteAt', 'lastCloudDbAt',
  'liveQuoteOffSessionDone', 'lastFullAnalyzeAt', 'priceChartStockId', 'liveQuoteSyncedOnce', 'liveQuoteFailStreak',
]

const CONST_NAMES = [
  'CANDLE_UP', 'CANDLE_DOWN', 'CANDLE_NEUTRAL', 'FAVORITES_COOKIE_NAME', 'FAVORITES_COOKIE_DAYS',
  'TRADE_VALUE_M_SQL', 'LIVE_QUOTE_REFRESH_MS', 'LIVE_ANALYZE_REFRESH_MS',
  'QUOTE_SESSION_START', 'QUOTE_SESSION_END', 'WANTGOO_QUOTES_URL', 'WANTGOO_FUTURES_URL',
  'LIVE_QUOTE_API_BASE', 'ACCESS_KEY_COOKIE_NAME', 'ACCESS_KEY_COOKIE_DAYS',
  'GITHUB_DB_URL', 'GITHUB_DB_REFRESH_MS', 'SPOT_PULLBACK_MIN',
]

const FILE_MAP = {
  'utils/dom.js': ['showToast', 'escapeHtml', 'copyToClipboard'],
  'utils/format.js': [
    'formatDataDateTime', 'formatVolumeK', 'formatTradeValueMillion', 'formatMiniDayCandle',
    'formatLabeledMiniCandle', 'formatFuturesMiniCandle', 'formatSpotMiniCandle', 'formatSpotAmplitude',
    'getSpotPullbackFromHigh', 'formatSpotPullbackPct', 'formatSpotPriceHighCell', 'formatFuturesSpotPriceCell',
    'formatStockLiveMetric', 'formatPromptName', 'formatPromptDate', 'normalizeStockCode',
  ],
  'utils/time.js': [
    'getLatestDataDateTime', 'getTaipeiDateParts', 'getTaipeiMinutesFromMidnight', 'isActiveTradingSession',
    'taipeiLocalToUtcMs', 'getNextQuoteSessionBoundaryMs', 'getNewsSearchStartStr', 'getAnalysisDateLabel',
  ],
  'config/params.js': ['getParams', 'applyOverviewThresholdForMode', 'syncThresholdInputOnModeSwitch', 'tryAnalyze'],
  'db/queries.js': ['isETF', 'isFinanceStock', 'isGitHubPages'],
  'db/sql.js': [
    'loadDatabase', 'findMarketDbEntry', 'fetchRemoteDatabase', 'fetchMarketDbUint8', 'applyDatabaseBytes',
    'refreshCloudDatabase', 'loadStockTagsMap', 'getTagsForStock', 'getPrimaryTag', 'getTagsLabel', 'getCbInfo',
    'getStockLatestQuote', 'upsertQuotesToMemoryDb', 'ensureFuturesMap',
  ],
  'live/access-key.js': [
    'getLiveQuoteApiBase', 'requiresAccessKey', 'getLiveQuoteAccessKey', 'setLiveQuoteAccessKey',
    'clearLiveQuoteAccessKey', 'syncAccessKeyInputs', 'showAccessKeyModal', 'hideAccessKeyModal',
    'applyAccessKeyAndStartLive', 'submitAccessKeyModal', 'saveAccessKeyFromSettings', 'clearAccessKeyFromSettings',
    'showWelcomeWaitingForKey', 'showWelcomeLoading', 'resetDashboardToKeyGate',
  ],
  'live/quotes.js': [
    'buildProxyApiUrl', 'liveQuoteEndpoint', 'formatLiveQuoteError', 'fetchProxyJson', 'mergeQuotesFuturesClient',
    'fetchQuotesFuturesViaProxy', 'fetchWantgooJson', 'setLiveQuoteStatus', 'refreshLiveQuotes',
    'stopLiveQuoteFastPolling', 'syncLiveQuoteSchedule', 'startLiveQuotePolling', 'stopLiveQuotePolling',
    'setCloudDbStatus', 'startCloudDbPolling', 'stopCloudDbPolling', 'startDataRefresh', 'stopDataRefresh',
    'updateSpotQuoteCacheFromQuotes', 'getSpotQuote', 'applyLiveQuoteTick', 'patchStockAnalysisLive',
    'patchStrongTableLive', 'patchOverviewStatsLive', 'updatePriceChartLive',
  ],
  'analysis/overview.js': [
    'buildPullbackUniverse', 'buildSpotPullbackList', 'processOverview',
  ],
  'analysis/surge.js': ['processSurgeAnalysis'],
  'ui/tables.js': [
    'renderTagRankList', 'renderSpotPullbackSection', 'refreshSpotPullbackSectionOnTick',
    'updateStockAnalysisMeta', 'renderFavoritesSection', 'patchFavoritesSectionLive', 'renderBlacklist',
  ],
  'ui/chart.js': ['updatePriceTrend', 'onStockSelect'],
  'ui/modals.js': ['showCbDetail', 'closeCbModal'],
  'ui/tabs.js': ['initTabsAndMode'],
  'features/favorites.js': [
    'loadFavoritesFromCookie', 'saveFavoritesToCookie', 'isFavorite', 'formatFavoriteBtn',
    'initFavoriteButtonDelegation', 'updateFavoriteButtonStates', 'addToFavorites', 'removeFromFavorites',
    'toggleFavorite', 'addFavoriteFromSelector', 'copyFavoritesList', 'viewStock',
  ],
  'features/blacklist.js': ['addToBlacklist', 'removeFromBlacklist', 'clearBlacklist', 'handleFilterToggle'],
  'features/punish.js': ['refreshPunishData'],
  'features/prompts.js': [
    'isPromptExcludedStock', 'filterPromptStocks', 'getOverviewListLabel', 'buildPromptGroupRulesBlock',
    'buildOverviewPromptTemplate', 'buildSurgePromptTemplate', 'copyOverviewStockList', 'copyOverviewPrompt', 'copySurgePrompt',
  ],
}

function extractFunctions(code) {
  const fns = new Map()
  const re = /(^|\n)(async function (\w+)|function (\w+)|document\.getElementById\('mode-selector'\)[\s\S]*?}\);)\n?/g
  let m
  const starts = []
  const re2 = /^(async function|function) (\w+)/gm
  while ((m = re2.exec(code)) !== null) {
    starts.push({ name: m[2], index: m.index })
  }
  // tab block
  const tabIdx = code.indexOf("document.querySelectorAll('.tab-btn')")
  if (tabIdx >= 0) {
    const modeEnd = code.indexOf('function handleFilterToggle', tabIdx)
    if (modeEnd > tabIdx) {
      fns.set('initTabsAndMode', code.slice(tabIdx, modeEnd).trim())
    }
  }
  for (let i = 0; i < starts.length; i++) {
    const { name, index } = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].index : code.length
    let chunk = code.slice(index, end).trim()
    fns.set(name, chunk)
  }
  return fns
}

function toStateRef(code) {
  let out = code
  for (const v of STATE_VARS) {
    out = out.replace(new RegExp(`\\b${v}\\b`, 'g'), `state.${v}`)
  }
  for (const c of CONST_NAMES) {
    out = out.replace(new RegExp(`\\b${c}\\b`, 'g'), c)
  }
  return out
}

// Extract top declarations
const stateInit = {}
let processedBody = body

// Remove let/const declarations at top - capture for state/constants files
for (const v of STATE_VARS) {
  const re = new RegExp(`let ${v}[^;]*;\\s*`, 'g')
  processedBody = processedBody.replace(re, '')
}
for (const c of CONST_NAMES) {
  const re = new RegExp(`const ${c}[^;]*;\\s*`, 'g')
  processedBody = processedBody.replace(re, '')
}
processedBody = processedBody.replace(/let favorites = loadFavoritesFromCookie\(\);\s*/, '')
processedBody = processedBody.replace(/let blacklist = [^;]+;\s*/, '')

const fns = extractFunctions(processedBody)

// Remove tab block from unassigned fns duplicate
fns.delete('handleFilterToggle') // keep in blacklist

// Write state.js
const stateContent = `export const state = {
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
`
fs.mkdirSync(path.join(SRC, 'config'), { recursive: true })
fs.writeFileSync(path.join(SRC, 'state.js'), stateContent)

// Write constants.js from original lines
const constBlock = body.match(/const CANDLE_UP[\s\S]*?const FAVORITES_COOKIE_DAYS = \d+;\s*/)?.[0] || ''
const constBlock2 = body.match(/const TRADE_VALUE_M_SQL[\s\S]*?const GITHUB_DB_REFRESH_MS = \d+;\s*/)?.[0] || ''
const constBlock3 = body.match(/const SPOT_PULLBACK_MIN = [^;]+;\s*/)?.[0] || ''
fs.writeFileSync(
  path.join(SRC, 'config/constants.js'),
  (constBlock + '\n' + constBlock2 + '\n' + constBlock3).trim() + '\n',
)

const assigned = new Set()
const fileContents = {}

for (const [file, names] of Object.entries(FILE_MAP)) {
  const chunks = []
  for (const name of names) {
    const chunk = fns.get(name)
    if (!chunk) {
      console.warn('Missing function:', name)
      continue
    }
    assigned.add(name)
    chunks.push(toStateRef(chunk))
  }
  if (chunks.length) fileContents[file] = chunks.join('\n\n')
}

// initApp stays in app.js
const initChunk = fns.get('initApp')
if (!initChunk) console.warn('Missing initApp')

for (const [file, content] of Object.entries(fileContents)) {
  const dir = path.dirname(file)
  fs.mkdirSync(path.join(SRC, dir), { recursive: true })
  const exports = FILE_MAP[file].filter((n) => fns.has(n))
  const exportLine = exports.length
    ? `export { ${exports.join(', ')} }\n`
    : ''
  // Convert function declarations to export function
  let mod = content.replace(/^(async )?function (\w+)/gm, 'export $1function $2')
  fs.writeFileSync(path.join(SRC, file), mod + '\n')
}

console.log('Split complete. Functions:', fns.size, 'Assigned:', assigned.size)
console.log('Unassigned:', [...fns.keys()].filter((k) => !assigned.has(k) && k !== 'initApp'))
