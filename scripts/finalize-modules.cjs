const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '../src')
let dash = fs.readFileSync(path.join(SRC, 'dashboard.js'), 'utf8')

// Export all functions
dash = dash.replace(/^(async )?function /gm, 'export $1function ')

// initTabsAndMode wrapper
if (!dash.includes('export function initTabsAndMode')) {
  dash = dash.replace(
    '// 頁籤與模式切換\ndocument.querySelectorAll',
    'export function initTabsAndMode() {\ndocument.querySelectorAll',
  )
  dash = dash.replace(
    /if\(db\) tryAnalyze\(\);\s*\n\}\);\s*\n\nexport function handleFilterToggle/,
    'if(db) tryAnalyze();\n});\n}\n\nexport function handleFilterToggle',
  )
}

// Remove bottom bootstrap from dashboard
dash = dash.replace(/\nObject\.assign\(window,[\s\S]*?removeFromFavorites,\s*\}\)\s*\n\ninitApp\(\)\s*$/, '\n')

fs.writeFileSync(path.join(SRC, 'dashboard.js'), dash)

// constants + state (documentation modules; dashboard still self-contained)
const constMatch = dash.match(/const CANDLE_UP[\s\S]*?const GITHUB_DB_REFRESH_MS = \d+;/)?.[0] || ''
const spotMatch = dash.match(/const SPOT_PULLBACK_MIN = [^;]+;/)?.[0] || ''
fs.mkdirSync(path.join(SRC, 'config'), { recursive: true })
if (constMatch) {
  fs.writeFileSync(path.join(SRC, 'config/constants.js'), [constMatch, spotMatch].filter(Boolean).join('\n').replace(/^const /gm, 'export const ') + '\n')
}

fs.writeFileSync(path.join(SRC, 'state.js'), `/** Shared app state (see dashboard.js for live bindings). */
export const state = {}
`)

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
  const prefix = '../'.repeat(depth)
  fs.writeFileSync(path.join(SRC, file), `export { ${names.join(', ')} } from '${prefix}dashboard.js'\n`)
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

console.log('finalize-modules done')
