import {
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
