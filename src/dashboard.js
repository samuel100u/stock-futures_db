import initSqlJs from 'sql.js/dist/sql-wasm.js'
import Chart from 'chart.js/auto'
import TomSelect from 'tom-select'
import JSZip from 'jszip'
import { createIcons, icons } from 'lucide'
import 'tom-select/dist/css/tom-select.default.min.css'

function refreshIcons() {
  createIcons({ icons })
}

const sqlPromise = initSqlJs({
  locateFile: () => import.meta.env.BASE_URL + 'sql-wasm.wasm',
})

/**
 * 💎 定義與組件初始化
 */
let db = null, priceChart = null, stockSelectInstance = null;
const CANDLE_UP = '#f43f5e';
const CANDLE_DOWN = '#22c55e';
const CANDLE_NEUTRAL = '#64748b';
let stockTagsMap = {};
let currentStrongList = [], currentPullbackUniverse = [], currentSurgeList = [], currentReferenceDate = "", currentReferenceTimestamp = 0;
let currentAnalysisPeriodStart = 0, currentAvgDays = 1;
let blacklist = JSON.parse(localStorage.getItem('stock_blacklist') || '[]');
const FAVORITES_COOKIE_NAME = 'stock_favorites';
const FAVORITES_COOKIE_DAYS = 365;

export function loadFavoritesFromCookie() {
    const m = document.cookie.match(new RegExp('(?:^|; )' + FAVORITES_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    if (!m) return [];
    try {
        const arr = JSON.parse(decodeURIComponent(m[1]));
        return Array.isArray(arr) ? arr.filter(f => f && f.id) : [];
    } catch { return []; }
}

export function saveFavoritesToCookie() {
    const maxAge = FAVORITES_COOKIE_DAYS * 86400;
    document.cookie = `${FAVORITES_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(favorites))}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

let favorites = loadFavoritesFromCookie();
// 💎 修復：確保 getParams 在腳本最頂部定義，且具備安全性檢查
export function getParams() {
    const d = document.getElementById('param-deadline')?.value;
    const mode = document.body.getAttribute('data-mode') || 'volume';
    return {
        deadline: d ? new Date(d + 'T23:59:59').getTime() : Infinity,
        mode: mode,
        changePct: parseFloat(document.getElementById('param-change-pct')?.value || 3) / 100,
        minThreshold: parseFloat(document.getElementById('param-min-threshold-overview')?.value || 1000),
        avgDays: parseInt(document.getElementById('param-avg-days-overview')?.value || 1),
        surgeRatio: parseFloat(document.getElementById('param-surge-ratio')?.value || 1.5),
        recentDays: parseInt(document.getElementById('param-recent-days')?.value || 10),
        minAvgVol: parseFloat(document.getElementById('param-min-avg-vol')?.value || 2000),
        excludeETF: document.getElementById('param-exclude-etf')?.checked || false,
        excludeFinance: document.getElementById('param-exclude-finance')?.checked || false
    };
}

// WASM 定位修正
export function showToast(msg) { const t = document.getElementById('toast'); if(!t) return; document.getElementById('toast-msg').innerText = msg; t.classList.remove('translate-y-20', 'opacity-0'); setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 3000); }

export function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderTagRankList(tagCounts) {
    const container = document.getElementById('tag-rank-list');
    if (!container) return;
    const entries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    if (!entries.length) {
        container.innerHTML = '<div class="text-slate-500 text-center py-8">尚無強勢標的</div>';
        return;
    }
    const max = entries[0][1];
    container.innerHTML = entries.map(([tag, count], i) => {
        const pct = Math.max(8, Math.round((count / max) * 100));
        return `<div class="tag-rank-row">
            <span class="w-6 text-xs font-bold ${i < 3 ? 'text-emerald-400' : 'text-slate-500'}">${i + 1}</span>
            <span class="flex-1 text-slate-200 truncate" title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>
            <span class="text-xs font-mono font-bold text-emerald-400 w-6 text-right">${count}</span>
            <div class="tag-rank-bar"><div class="tag-rank-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

export function formatDataDateTime(tradeDate, time) {
    const ts = (time != null && time > 0) ? time : tradeDate;
    if (!ts) return '--';
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).formatToParts(new Date(ts)).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
    );
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getLatestDataDateTime(tradeDate) {
    if (!db || !tradeDate) return '--';
    try {
        const res = db.exec(`SELECT MAX(time) FROM market_data WHERE tradeDate = ${tradeDate}`);
        const latestTime = res.length ? res[0].values[0]?.[0] : null;
        return formatDataDateTime(tradeDate, latestTime);
    } catch (e) {
        return formatDataDateTime(tradeDate, null);
    }
}

/** 現貨報價僅記憶體快取，不寫入 DB */
let spotQuoteCache = {};

export function updateSpotQuoteCacheFromQuotes(quotes) {
    for (const q of quotes) {
        const sid = q.stockId || q.id;
        if (!sid || q.spotClose == null) continue;
        spotQuoteCache[sid] = {
            open: q.spotOpen ?? null,
            high: q.spotHigh ?? null,
            low: q.spotLow ?? null,
            close: q.spotClose,
            volume: q.spotVolume ?? null,
            previousClose: q.spotPreviousClose ?? null,
            time: q.spotTime ?? null,
        };
    }
}

export function getSpotQuote(stockId) {
    return spotQuoteCache[stockId] || null;
}

export function formatMiniDayCandle(open, high, low, close, size = 'sm') {
    const o = Number(open), h = Number(high), l = Number(low), c = Number(close);
    if (![o, h, l, c].every(v => Number.isFinite(v))) return '';
    const color = c > o ? CANDLE_UP : c < o ? CANDLE_DOWN : CANDLE_NEUTRAL;
    const range = Math.max(h - l, 0.001);
    const [W, H, half] = size === 'md' ? [22, 38, 4.5] : [18, 30, 3.5];
    const pad = 2, cx = W / 2;
    const y = v => pad + (H - pad * 2) * (1 - (v - l) / range);
    const bodyTop = y(Math.max(o, c));
    const bodyBot = y(Math.min(o, c));
    const bodyH = Math.max(bodyBot - bodyTop, 2);
    const tip = `開${o} 高${h} 低${l} 收${c}`;
    return `<svg class="mini-day-candle" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="${tip}" title="${tip}" role="img">
        <line x1="${cx}" y1="${y(h)}" x2="${cx}" y2="${y(l)}" stroke="${color}" stroke-width="1.5"/>
        <rect x="${cx - half}" y="${bodyTop}" width="${half * 2}" height="${bodyH}" fill="${color}" rx="0.5"/>
    </svg>`;
}

export function formatLabeledMiniCandle(open, high, low, close, label, size = 'sm') {
    const svg = formatMiniDayCandle(open, high, low, close, size);
    if (!svg) return '';
    return svg.replace('title="', `title="${label} `).replace('aria-label="', `aria-label="${label} `);
}

export function formatFuturesMiniCandle(stockId, size = 'sm') {
    const q = getStockLatestQuote(stockId);
    if (!q) return '';
    return formatLabeledMiniCandle(q.open, q.high, q.low, q.close, '期貨', size);
}

export function formatSpotMiniCandle(stockId, size = 'sm') {
    const spot = getSpotQuote(stockId);
    if (!spot) return '';
    return formatLabeledMiniCandle(spot.open, spot.high, spot.low, spot.close, '現貨', size);
}

/** 現貨震幅：(最高價 / 最低價 - 1) × 100% */
export function formatSpotAmplitude(stockId) {
    const spot = getSpotQuote(stockId);
    const high = Number(spot?.high), low = Number(spot?.low);
    if (!Number.isFinite(high) || !Number.isFinite(low) || low <= 0) return '--';
    return `${(((high / low) - 1) * 100).toFixed(1)}%`;
}

const SPOT_PULLBACK_MIN = 0.04;

/** 現貨自高點回落：(最高價 - 現價) / 最高價 */
export function getSpotPullbackFromHigh(stockId) {
    const spot = getSpotQuote(stockId);
    const high = Number(spot?.high), close = Number(spot?.close);
    if (!Number.isFinite(high) || !Number.isFinite(close) || high <= 0) return null;
    if (close >= high) return 0;
    return (high - close) / high;
}

export function formatSpotPullbackPct(pullback) {
    if (pullback == null || !Number.isFinite(pullback)) return '--';
    return `${(pullback * 100).toFixed(1)}%`;
}

export function formatSpotPriceHighCell(stockId) {
    const spot = getSpotQuote(stockId);
    const close = Number(spot?.close), high = Number(spot?.high);
    if (!Number.isFinite(close) || !Number.isFinite(high)) return '--';
    return `<div class="price-pair-cell">
        <div class="price-row"><span class="price-tag-spot">現貨</span><span class="price-val-spot">${close.toLocaleString()}</span></div>
        <div class="price-row"><span class="price-tag-futures">最高</span><span class="price-val-futures">${high.toLocaleString()}</span></div>
    </div>`;
}

/** 回落區塊：僅基準日當日成交量，不看漲幅門檻與分析天數 */
export function buildPullbackUniverse(latestDate, p) {
    const dayRes = db.exec(`SELECT stockId, name, volume, ${TRADE_VALUE_M_SQL} as val_m FROM market_data WHERE tradeDate = ${latestDate}`);
    if (!dayRes.length) return [];
    const list = [];
    dayRes[0].values.forEach(v => {
        const [id, name, vol, valM] = v;
        const metric = p.mode === 'value' ? valM : vol;
        if (metric < p.minThreshold) return;
        if (p.excludeETF && isETF(id, name)) return;
        if (p.excludeFinance && isFinanceStock(id, name)) return;
        if (blacklist.find(b => b.id === id)) return;
        list.push({ id, name });
    });
    return list;
}

export function buildSpotPullbackList() {
    return currentPullbackUniverse
        .map(s => {
            const pullback = getSpotPullbackFromHigh(s.id);
            return pullback != null && pullback >= SPOT_PULLBACK_MIN
                ? { id: s.id, name: s.name, pullback }
                : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.pullback - a.pullback);
}

export function renderSpotPullbackSection() {
    const list = buildSpotPullbackList();
    const tableBody = document.getElementById('spot-pullback-table-body');
    const emptyEl = document.getElementById('spot-pullback-empty');
    const badgeEl = document.getElementById('spot-pullback-count-badge');
    const tableWrap = tableBody?.closest('.scrollable-table');
    if (!tableBody) return;

    if (badgeEl) badgeEl.textContent = `${list.length} 筆符合`;

    if (!list.length) {
        tableBody.innerHTML = '';
        if (tableWrap) tableWrap.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }

    if (tableWrap) tableWrap.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');

    tableBody.innerHTML = '';
    list.forEach((v, i) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800 transition';
        tr.dataset.stockId = v.id;
        const rank = i + 1;
        const rankClass = rank <= 3 ? 'stock-rank rank-top' : 'stock-rank';
        const miniCandle = formatSpotMiniCandle(v.id);
        const favBtn = formatFavoriteBtn(v.id);
        tr.innerHTML = `<td class="px-2 md:px-3 py-3.5 ${rankClass}">${rank}</td>
            <td class="px-3 md:px-4 py-3.5">
                <div class="flex items-center gap-2.5">
                    <span class="spot-pullback-mini-candle shrink-0">${miniCandle}</span>
                    <div class="min-w-0">
                        <div class="stock-code">${v.id}</div>
                        <div class="stock-name">${escapeHtml(v.name)}</div>
                    </div>
                </div>
            </td>
            <td class="spot-pullback-col-price px-3 md:px-4 py-3.5 text-right">${formatSpotPriceHighCell(v.id)}</td>
            <td class="spot-pullback-col-pct px-3 md:px-4 py-3.5 text-right font-bold text-base text-amber-300" style="font-variant-numeric:tabular-nums">${formatSpotPullbackPct(v.pullback)}</td>
            <td class="px-3 md:px-4 py-3.5 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="viewStock('${v.id}')" class="p-2 hover:bg-blue-600/20 text-blue-400 rounded-full transition" title="看圖"><i data-lucide="line-chart" size="16"></i></button>
                    ${favBtn}
                </div>
            </td>`;
        tableBody.appendChild(tr);
    });
    refreshIcons();
}

/** 每 10 秒即時 tick：重算當日 universe（含最新成交量）並完整重繪回落清單 */
export function refreshSpotPullbackSectionOnTick() {
    if (!db) return;
    const p = getParams();
    const latestDateRes = db.exec(`SELECT MAX(tradeDate) FROM market_data WHERE tradeDate <= ${p.deadline}`);
    if (!latestDateRes.length || !latestDateRes[0].values[0][0]) return;
    currentPullbackUniverse = buildPullbackUniverse(latestDateRes[0].values[0][0], p);
    renderSpotPullbackSection();
}

export function formatFuturesSpotPriceCell(stockId, futuresClose) {
    const spot = getSpotQuote(stockId);
    const fut = `<div class="price-row"><span class="price-tag-futures">期貨</span><span class="price-val-futures">${Number(futuresClose).toLocaleString()}</span></div>`;
    if (spot?.close == null) return `<div class="price-pair-cell">${fut}</div>`;
    const sp = `<div class="price-row"><span class="price-tag-spot">現貨</span><span class="price-val-spot">${Number(spot.close).toLocaleString()}</span></div>`;
    return `<div class="price-pair-cell">${fut}${sp}</div>`;
}

export function getStockLatestQuote(stockId) {
    if (!db || !stockId) return null;
    const p = getParams();
    try {
        const res = db.exec(`SELECT open, high, low, close, previousClose, volume, tradeDate, time, name FROM market_data WHERE stockId = '${stockId}' AND tradeDate <= ${p.deadline} ORDER BY tradeDate DESC LIMIT 1`);
        if (!res.length || !res[0].values.length) return null;
        const [open, high, low, close, previousClose, volume, tradeDate, time, name] = res[0].values[0];
        const gain = previousClose > 0 ? (close - previousClose) / previousClose : 0;
        return { open, high, low, close, previousClose, volume, tradeDate, time, name, gain };
    } catch (e) { return null; }
}

export function updateStockAnalysisMeta(stockId) {
    const el = document.getElementById('stock-analysis-meta');
    if (!el || !stockId) return;
    const quote = getStockLatestQuote(stockId);
    const name = quote?.name || '';
    const tags = getTagsForStock(stockId);
    const tagHtml = tags.length
        ? tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')
        : '<span class="text-slate-500 text-xs">尚無題材標籤</span>';
    const quoteDate = quote ? formatDataDateTime(quote.tradeDate, quote.time) : '';
    const spot = getSpotQuote(stockId);
    const spotGain = spot?.previousClose > 0 ? (spot.close - spot.previousClose) / spot.previousClose : null;
    const hasSpot = spot?.close != null;
    const futCandle = formatFuturesMiniCandle(stockId, 'md');
    const spotCandle = formatSpotMiniCandle(stockId, 'md');
    const priceHtml = quote ? `<div class="price-detail-block${hasSpot ? '' : ' price-detail-single'}">
        <div class="price-detail-col price-detail-futures">
            <div class="price-detail-head">
                <span class="price-tag-futures">期貨</span>
                <span class="price-detail-candle price-detail-candle-futures">${futCandle}</span>
            </div>
            <div class="price-val-futures">${Number(quote.close).toLocaleString()}</div>
            <div class="price-detail-sub">
                <span class="price-detail-gain ${quote.gain >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold text-base">
                    ${quote.gain >= 0 ? '+' : ''}${(quote.gain * 100).toFixed(2)}%
                </span>
                <span class="price-detail-vol text-slate-400 text-sm">量 ${formatVolumeK(quote.volume)}</span>
            </div>
        </div>
        ${hasSpot ? `<div class="price-detail-divider" aria-hidden="true"></div>
        <div class="price-detail-col price-detail-spot">
            <div class="price-detail-head">
                <span class="price-tag-spot">現貨</span>
                <span class="price-detail-candle price-detail-candle-spot">${spotCandle}</span>
            </div>
            <div class="price-val-spot">${Number(spot.close).toLocaleString()}</div>
            <div class="price-detail-sub">
                ${spotGain != null ? `<span class="price-detail-gain ${spotGain >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold text-base">${spotGain >= 0 ? '+' : ''}${(spotGain * 100).toFixed(2)}%</span>` : ''}
                ${spot.volume != null ? `<span class="price-detail-vol text-slate-400 text-sm">量 ${formatVolumeK(spot.volume)}</span>` : ''}
            </div>
        </div>` : ''}
        ${quoteDate ? `<div class="price-detail-time">數據 ${quoteDate}</div>` : ''}
    </div>` : '';
    el.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-1">
        <span class="stock-meta-code font-bold text-slate-100 text-base">${escapeHtml(stockId)}</span>
        ${name ? `<span class="text-slate-400">${escapeHtml(name)}</span>` : ''}
        ${formatFavoriteBtn(stockId)}
    </div>${priceHtml}<div class="flex flex-wrap gap-1.5 mt-2">${tagHtml}</div>`;
    refreshIcons();
}

export function patchStockAnalysisLive(stockId) {
    const el = document.getElementById('stock-analysis-meta');
    if (!el || !stockId) return;
    const codeEl = el.querySelector('.stock-meta-code');
    if (!codeEl || codeEl.textContent !== stockId) return;
    const quote = getStockLatestQuote(stockId);
    const spot = getSpotQuote(stockId);
    if (!quote) return;
    const futCol = el.querySelector('.price-detail-futures');
    if (futCol) {
        const futCandleEl = futCol.querySelector('.price-detail-candle-futures');
        if (futCandleEl) futCandleEl.innerHTML = formatFuturesMiniCandle(stockId, 'md');
        const futVal = futCol.querySelector('.price-val-futures');
        if (futVal) futVal.textContent = Number(quote.close).toLocaleString();
        const futGain = futCol.querySelector('.price-detail-gain');
        if (futGain) {
            futGain.className = `price-detail-gain ${quote.gain >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold text-base`;
            futGain.textContent = `${quote.gain >= 0 ? '+' : ''}${(quote.gain * 100).toFixed(2)}%`;
        }
        const futVol = futCol.querySelector('.price-detail-vol');
        if (futVol) futVol.textContent = `量 ${formatVolumeK(quote.volume)}`;
    }
    const spotCol = el.querySelector('.price-detail-spot');
    if (spot?.close != null && spotCol) {
        const spotCandleEl = spotCol.querySelector('.price-detail-candle-spot');
        if (spotCandleEl) spotCandleEl.innerHTML = formatSpotMiniCandle(stockId, 'md');
        const spotVal = spotCol.querySelector('.price-val-spot');
        if (spotVal) spotVal.textContent = Number(spot.close).toLocaleString();
        const spotGainVal = spot.previousClose > 0 ? (spot.close - spot.previousClose) / spot.previousClose : null;
        const spotGainEl = spotCol.querySelector('.price-detail-gain');
        if (spotGainEl && spotGainVal != null) {
            spotGainEl.className = `price-detail-gain ${spotGainVal >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-bold text-base`;
            spotGainEl.textContent = `${spotGainVal >= 0 ? '+' : ''}${(spotGainVal * 100).toFixed(2)}%`;
        }
        const spotVolEl = spotCol.querySelector('.price-detail-vol');
        if (spotVolEl && spot.volume != null) spotVolEl.textContent = `量 ${formatVolumeK(spot.volume)}`;
    }
    const dateEl = el.querySelector('.price-detail-time');
    if (dateEl) dateEl.textContent = `數據 ${formatDataDateTime(quote.tradeDate, quote.time)}`;
    if (spot?.close != null && !el.querySelector('.price-detail-spot')) {
        updateStockAnalysisMeta(stockId);
    }
}

export function formatStockLiveMetric(quote, mode) {
    if (!quote) return '';
    if (mode === 'value') {
        const mult = (quote.name || '').includes('小型') ? 100 : 2000;
        return formatTradeValueMillion((quote.volume * quote.close * mult) / 1000000);
    }
    return formatVolumeK(quote.volume);
}

export function patchStrongTableLive() {
    const p = getParams();
    document.querySelectorAll('#strong-table-body tr[data-stock-id]').forEach(tr => {
        const id = tr.dataset.stockId;
        const miniEl = tr.querySelector('.strong-mini-candle');
        if (miniEl) miniEl.innerHTML = formatSpotMiniCandle(id);
        const ampTd = tr.querySelector('.strong-col-spot-amp');
        if (ampTd) ampTd.textContent = formatSpotAmplitude(id);
        const quote = getStockLatestQuote(id);
        if (!quote) return;
        const priceTd = tr.querySelector('.strong-col-price');
        if (priceTd) priceTd.innerHTML = formatFuturesSpotPriceCell(id, quote.close);
        if (p.avgDays === 1) {
            const gainTd = tr.querySelector('.strong-col-gain');
            if (gainTd) {
                gainTd.className = `strong-col-gain px-3 md:px-4 py-3.5 text-right font-bold text-base ${quote.gain >= 0 ? 'text-rose-400' : 'text-emerald-400'}`;
                gainTd.textContent = `${quote.gain >= 0 ? '+' : ''}${(quote.gain * 100).toFixed(2)}%`;
            }
            const metricTd = tr.querySelector('.strong-col-metric');
            if (metricTd) metricTd.textContent = formatStockLiveMetric(quote, p.mode);
        }
    });
}

export function patchOverviewStatsLive() {
    const p = getParams();
    const latestDateRes = db.exec(`SELECT MAX(tradeDate) FROM market_data WHERE tradeDate <= ${p.deadline}`);
    if (!latestDateRes.length || !latestDateRes[0].values[0][0]) return;
    const latestDate = latestDateRes[0].values[0][0];
    const dateStr = getLatestDataDateTime(latestDate);
    const dateEl = document.getElementById('overview-db-date');
    if (dateEl) dateEl.innerText = `(數據日期: ${dateStr})`;
    const statDate = document.getElementById('stat-date');
    if (statDate) statDate.innerText = dateStr;
    const totalMetricRes = db.exec(`SELECT ${p.mode === 'value' ? `SUM(${TRADE_VALUE_M_SQL})` : 'SUM(volume)'} FROM market_data WHERE tradeDate = ${latestDate}`);
    const statVol = document.getElementById('stat-volume');
    if (statVol && totalMetricRes.length) {
        statVol.innerText = p.mode === 'value'
            ? formatTradeValueMillion(totalMetricRes[0].values[0][0])
            : (totalMetricRes[0].values[0][0] || 0).toLocaleString();
    }
}

export function updatePriceChartLive(stockId) {
    if (!priceChart || priceChartStockId !== stockId || !db) return;
    const res = db.exec(`SELECT tradeDate, close, volume FROM market_data WHERE stockId = '${stockId}' ORDER BY tradeDate ASC`);
    if (!res.length) return;
    const vals = res[0].values;
    const lastIdx = vals.length - 1;
    const volumes = vals.map(v => v[2]);
    priceChart.data.datasets[0].data[lastIdx] = vals[lastIdx][1];
    priceChart.data.datasets[1].data[lastIdx] = vals[lastIdx][2];
    if (priceChart.options.scales.y1) priceChart.options.scales.y1.max = Math.max(...volumes) * 4;
    priceChart.update('none');
}

export function applyLiveQuoteTick() {
    patchStrongTableLive();
    patchFavoritesSectionLive();
    refreshSpotPullbackSectionOnTick();
    patchOverviewStatsLive();
    const sid = stockSelectInstance?.getValue() || '';
    if (sid) {
        patchStockAnalysisLive(sid);
        updatePriceChartLive(sid);
    }
}

// 成交金額（百萬）：小型 1口=100股，標準 1口=2000股 → 元 / 1e6
const TRADE_VALUE_M_SQL = `(volume * close * CASE WHEN name LIKE '%小型%' THEN 100 ELSE 2000 END) / 1000000.0`;

/** 即時報價輪詢間隔（毫秒）；僅更新 WASM 記憶體內 db，不寫入本機 market.db */
const LIVE_QUOTE_REFRESH_MS = 10000;
/** 盤中完整重算排行／題材的間隔（毫秒）；其間只就地更新價格數字 */
const LIVE_ANALYZE_REFRESH_MS = 120000;
/** 台股即時輪詢時段（台北時間 08:45～13:45）；其餘時段只更新一次 */
const QUOTE_SESSION_START = { h: 8, m: 45 };
const QUOTE_SESSION_END = { h: 13, m: 45 };
const WANTGOO_QUOTES_URL = 'https://www.wantgoo.com/investrue/all-quote-info';
const WANTGOO_FUTURES_URL = 'https://www.wantgoo.com/futures/all-stock-futures-list';
/**
 * Cloudflare Worker 代理（即時報價 + market.db.zip，需 API 金鑰）。
 */
const LIVE_QUOTE_API_BASE = 'https://stock-crawer.pages.dev';

const ACCESS_KEY_COOKIE_NAME = 'live_quote_access_key';
const ACCESS_KEY_COOKIE_DAYS = 365;

let liveQuoteTimerId = null, liveQuoteSessionTimerId = null, futuresMapCache = null;
let liveQuoteInFlight = false, lastLiveQuoteAt = 0;
let liveQuoteOffSessionDone = false, lastFullAnalyzeAt = 0, priceChartStockId = null, liveQuoteSyncedOnce = false, liveQuoteFailStreak = 0;

export function isGitHubPages() {
    return /\.github\.io$/i.test(location.hostname);
}

export function getLiveQuoteApiBase() {
    if (LIVE_QUOTE_API_BASE) return LIVE_QUOTE_API_BASE.replace(/\/$/, '');
    return null;
}

export function requiresAccessKey() {
    return !!getLiveQuoteApiBase();
}

export function showWelcomeWaitingForKey() {
    document.getElementById('welcome-screen')?.classList.remove('hidden');
    document.getElementById('dashboard-content')?.classList.add('hidden');
    document.getElementById('settings-panel')?.classList.add('hidden');
    const title = document.getElementById('welcome-title');
    const subtitle = document.getElementById('welcome-subtitle');
    const icon = document.getElementById('loading-icon');
    if (title) {
        title.innerText = '請輸入 API 金鑰';
        title.classList.remove('text-rose-400');
    }
    if (subtitle) subtitle.innerText = '輸入金鑰後才會下載市場資料並啟用儀表板。';
    if (icon) {
        icon.setAttribute('data-lucide', 'key-round');
        icon.classList.remove('animate-spin', 'text-blue-400', 'text-rose-400');
        icon.classList.add('text-amber-400');
    }
    refreshIcons();
}

export function showWelcomeLoading() {
    const title = document.getElementById('welcome-title');
    const subtitle = document.getElementById('welcome-subtitle');
    const icon = document.getElementById('loading-icon');
    if (title) {
        title.innerText = '正在同步雲端數據...';
        title.classList.remove('text-rose-400');
    }
    if (subtitle) subtitle.innerText = '請稍候，正在從雲端獲取最新市場資料。';
    if (icon) {
        icon.setAttribute('data-lucide', 'loader');
        icon.classList.add('animate-spin', 'text-blue-400');
        icon.classList.remove('text-amber-400', 'text-rose-400');
    }
    refreshIcons();
}

export function resetDashboardToKeyGate() {
    stopDataRefresh();
    if (db) {
        db.close();
        db = null;
    }
    liveQuoteSyncedOnce = false;
    lastLiveQuoteAt = 0;
    showWelcomeWaitingForKey();
    showAccessKeyModal();
}

export function getLiveQuoteAccessKey() {
    const m = document.cookie.match(new RegExp('(?:^|; )' + ACCESS_KEY_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
}

export function setLiveQuoteAccessKey(key) {
    const val = (key || '').trim();
    if (!val) {
        clearLiveQuoteAccessKey();
        return;
    }
    const maxAge = ACCESS_KEY_COOKIE_DAYS * 86400;
    document.cookie = `${ACCESS_KEY_COOKIE_NAME}=${encodeURIComponent(val)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    syncAccessKeyInputs(val);
}

export function clearLiveQuoteAccessKey() {
    document.cookie = `${ACCESS_KEY_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    syncAccessKeyInputs('');
}

export function syncAccessKeyInputs(key) {
    const v = key !== undefined ? key : getLiveQuoteAccessKey();
    const settings = document.getElementById('param-access-key');
    if (settings) settings.value = v;
}

export function showAccessKeyModal(message) {
    const modal = document.getElementById('access-key-modal');
    const err = document.getElementById('access-key-modal-error');
    const input = document.getElementById('access-key-modal-input');
    if (!modal) return;
    if (err) {
        if (message) {
            err.textContent = message;
            err.classList.remove('hidden');
        } else {
            err.textContent = '';
            err.classList.add('hidden');
        }
    }
    if (input && !input.value) input.value = getLiveQuoteAccessKey();
    modal.classList.add('active');
    refreshIcons();
    setTimeout(() => input?.focus(), 100);
}

export function hideAccessKeyModal() {
    document.getElementById('access-key-modal')?.classList.remove('active');
    document.getElementById('access-key-modal-error')?.classList.add('hidden');
}

export async function applyAccessKeyAndStartLive(key) {
    setLiveQuoteAccessKey(key);
    hideAccessKeyModal();
    stopDataRefresh();
    if (!db) {
        showWelcomeLoading();
        try {
            await fetchRemoteDatabase();
            showToast('API 金鑰已儲存，資料載入完成');
        } catch (e) {
            showWelcomeWaitingForKey();
            showAccessKeyModal(e.message || '載入失敗');
        }
    } else {
        startLiveQuotePolling();
        showToast('API 金鑰已儲存，即時報價已啟用');
    }
}

export async function submitAccessKeyModal() {
    const input = document.getElementById('access-key-modal-input');
    const key = (input?.value || '').trim();
    if (!key) {
        showAccessKeyModal('請輸入金鑰');
        return;
    }
    const btn = document.querySelector('#access-key-modal button');
    if (btn) btn.disabled = true;
    try {
        await applyAccessKeyAndStartLive(key);
    } finally {
        if (btn) btn.disabled = false;
    }
}

export async function saveAccessKeyFromSettings() {
    const input = document.getElementById('param-access-key');
    const key = (input?.value || '').trim();
    if (!key) {
        showToast('請輸入金鑰');
        return;
    }
    await applyAccessKeyAndStartLive(key);
}

export function clearAccessKeyFromSettings() {
    clearLiveQuoteAccessKey();
    resetDashboardToKeyGate();
    showToast('已清除 API 金鑰');
}

export function buildProxyApiUrl(path) {
    const base = getLiveQuoteApiBase();
    if (!base) return null;
    const key = getLiveQuoteAccessKey();
    if (!key) return null;
    const u = new URL(path.startsWith('/') ? path : `/${path}`, base);
    u.searchParams.set('key', key);
    return u.toString();
}

export function liveQuoteEndpoint(url) {
    if (!getLiveQuoteApiBase()) return url;
    if (url.includes('all-quote-info')) return buildProxyApiUrl('/api/quotes-futures');
    if (url.includes('all-stock-futures-list')) return buildProxyApiUrl('/api/futures');
    return url;
}

export function formatLiveQuoteError(err, fetchUrl) {
    const msg = err?.message || String(err);
    if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        return `無法連線代理（CORS／503）：請重新部署 Cloudflare Pages 的 pages-proxy/_worker.js。測試：${fetchUrl}`;
    }
    if (msg.includes('HTTP 401')) {
        return 'API 金鑰錯誤或未提供（HTTP 401），請在設定中重新輸入金鑰';
    }
    if (msg.includes('HTTP 404')) {
        return `代理 API 404，請重新部署 Cloudflare Pages（需含 _worker.js）。測試：${fetchUrl}`;
    }
    if (msg.includes('upstream HTTP 403')) {
        return `WantGoo 拒絕代理請求（403），請重新部署最新 Worker 後再試。`;
    }
    if (!LIVE_QUOTE_API_BASE) {
        return '請設定 LIVE_QUOTE_API_BASE 指向 Cloudflare Pages 代理網址';
    }
    return msg;
}

export async function fetchProxyJson(path) {
    const fetchUrl = buildProxyApiUrl(path);
    if (!getLiveQuoteApiBase()) throw new Error('LIVE_QUOTE_API_BASE 未設定');
    if (!fetchUrl) throw new Error('請先輸入 API 金鑰');
    const resp = await fetch(fetchUrl, { cache: 'no-store', mode: 'cors' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (data && data.error) throw new Error(data.error);
    return data;
}

export function mergeQuotesFuturesClient(quotes, futures) {
    const futuresMap = {};
    for (const item of futures) {
        if (item?.stockId) futuresMap[item.id] = item;
    }
    const spotByStockId = {};
    for (const q of quotes) {
        const id = String(q.id ?? '');
        if (/^\d{4}$/.test(id)) {
            spotByStockId[id] = {
                open: q.open ?? null,
                high: q.high ?? null,
                low: q.low ?? null,
                close: q.close ?? null,
                volume: q.volume ?? null,
                previousClose: q.previousClose ?? null,
                time: q.time ?? null,
            };
        }
    }
    const slim = [];
    for (const q of quotes) {
        const mapping = futuresMap[q.id];
        if (!mapping?.stockId) continue;
        const spot = spotByStockId[mapping.stockId];
        slim.push({
            stockId: mapping.stockId,
            name: mapping.name,
            tradeDate: q.tradeDate ?? null,
            time: q.time ?? null,
            flat: q.flat ?? null,
            floor: q.floor ?? null,
            ceil: q.ceil ?? null,
            open: q.open ?? null,
            high: q.high ?? null,
            low: q.low ?? null,
            close: q.close ?? null,
            volume: q.volume ?? null,
            millionAmount: q.millionAmount ?? null,
            previousClose: q.previousClose ?? null,
            previousVolume: q.previousVolume ?? null,
            previousMillionAmount: q.previousMillionAmount ?? null,
            spotOpen: spot?.open ?? null,
            spotHigh: spot?.high ?? null,
            spotLow: spot?.low ?? null,
            spotClose: spot?.close ?? null,
            spotVolume: spot?.volume ?? null,
            spotPreviousClose: spot?.previousClose ?? null,
            spotTime: spot?.time ?? null,
        });
    }
    return slim;
}

export async function fetchQuotesFuturesViaProxy() {
    try {
        return await fetchProxyJson('/api/quotes-futures');
    } catch (primaryErr) {
        try {
            const [quotes, futures] = await Promise.all([
                fetchProxyJson('/api/quotes'),
                fetchProxyJson('/api/futures'),
            ]);
            return mergeQuotesFuturesClient(quotes, futures);
        } catch {
            throw primaryErr;
        }
    }
}
const MARKET_DATA_UPSERT_SQL = `INSERT INTO market_data (
    stockId, name, tradeDate, time, flat, floor, ceil, open, high, low, close,
    volume, millionAmount, previousClose, previousVolume, previousMillionAmount
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(stockId, tradeDate) DO UPDATE SET
    name=excluded.name, time=excluded.time, flat=excluded.flat, floor=excluded.floor,
    ceil=excluded.ceil, open=excluded.open, high=excluded.high, low=excluded.low,
    close=excluded.close, volume=excluded.volume, millionAmount=excluded.millionAmount,
    previousClose=excluded.previousClose, previousVolume=excluded.previousVolume,
    previousMillionAmount=excluded.previousMillionAmount`;

export async function fetchWantgooJson(url) {
    const target = liveQuoteEndpoint(url);
    const viaLocalApi = target !== url;
    const headers = viaLocalApi ? {} : {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://www.wantgoo.com/'
    };
    const fetchJson = async (fetchUrl, withHeaders) => {
        const init = { cache: 'no-store' };
        if (withHeaders && Object.keys(headers).length) init.headers = headers;
        const resp = await fetch(fetchUrl, init);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data && data.error) throw new Error(data.error);
        return data;
    };
    if (viaLocalApi) {
        try {
            if (url.includes('all-quote-info')) {
                return await fetchQuotesFuturesViaProxy();
            }
            return await fetchJson(target, false);
        } catch (err) {
            throw new Error(formatLiveQuoteError(err, target));
        }
    }
    return await fetchJson(url, true);
}

export async function ensureFuturesMap() {
    if (futuresMapCache) return futuresMapCache;
    const futures = await fetchWantgooJson(WANTGOO_FUTURES_URL);
    futuresMapCache = {};
    futures.forEach(item => {
        futuresMapCache[item.id] = { stockId: item.stockId, name: item.name };
    });
    return futuresMapCache;
}

export function upsertQuotesToMemoryDb(quotes, futuresMap) {
    db.run('BEGIN TRANSACTION');
    try {
        let updated = 0;
        for (const q of quotes) {
            const stockId = q.stockId || futuresMap?.[q.id]?.stockId;
            const name = q.name || futuresMap?.[q.id]?.name;
            if (!stockId) continue;
            db.run(MARKET_DATA_UPSERT_SQL, [
                stockId, name,
                q.tradeDate ?? null, q.time ?? null,
                q.flat ?? null, q.floor ?? null, q.ceil ?? null,
                q.open ?? null, q.high ?? null, q.low ?? null, q.close ?? null,
                q.volume ?? null, q.millionAmount ?? null,
                q.previousClose ?? null, q.previousVolume ?? null, q.previousMillionAmount ?? null
            ]);
            updated++;
        }
        db.run('COMMIT');
        return updated;
    } catch (e) {
        db.run('ROLLBACK');
        throw e;
    }
}

export function getTaipeiDateParts(date = new Date()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Taipei',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
    );
    return {
        year: +parts.year, month: +parts.month, day: +parts.day,
        hour: +parts.hour, minute: +parts.minute
    };
}

export function getTaipeiMinutesFromMidnight(date = new Date()) {
    const p = getTaipeiDateParts(date);
    return p.hour * 60 + p.minute;
}

export function isActiveTradingSession(date = new Date()) {
    const mins = getTaipeiMinutesFromMidnight(date);
    const start = QUOTE_SESSION_START.h * 60 + QUOTE_SESSION_START.m;
    const end = QUOTE_SESSION_END.h * 60 + QUOTE_SESSION_END.m;
    return mins >= start && mins < end;
}

export function taipeiLocalToUtcMs(y, m, d, h, min) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+08:00`;
    return new Date(iso).getTime();
}

export function getNextQuoteSessionBoundaryMs() {
    const now = Date.now();
    const p = getTaipeiDateParts();
    const mins = p.hour * 60 + p.minute;
    const startMins = QUOTE_SESSION_START.h * 60 + QUOTE_SESSION_START.m;
    const endMins = QUOTE_SESSION_END.h * 60 + QUOTE_SESSION_END.m;

    if (isActiveTradingSession()) {
        return Math.max(1000, taipeiLocalToUtcMs(p.year, p.month, p.day, QUOTE_SESSION_END.h, QUOTE_SESSION_END.m) - now);
    }
    if (mins < startMins) {
        return Math.max(1000, taipeiLocalToUtcMs(p.year, p.month, p.day, QUOTE_SESSION_START.h, QUOTE_SESSION_START.m) - now);
    }
    const tomorrow = new Date(now + 86400000);
    const tp = getTaipeiDateParts(tomorrow);
    return Math.max(1000, taipeiLocalToUtcMs(tp.year, tp.month, tp.day, QUOTE_SESSION_START.h, QUOTE_SESSION_START.m) - now);
}

export function setLiveQuoteStatus(state, detail, { silent = false } = {}) {
    const el = document.getElementById('db-status');
    if (!el) return;
    const timeStr = lastLiveQuoteAt
        ? new Date(lastLiveQuoteAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '';
    const sessionLabel = isActiveTradingSession() ? '盤中' : '非盤中';
    if (state === 'loading') {
        if (silent) return;
        el.innerHTML = `<i data-lucide="loader-2" class="text-blue-400 animate-spin" size="14"></i> 更新即時報價中…`;
    } else if (state === 'ok') {
        const detailStr = detail != null ? ` · ${detail}` : '';
        if (silent && el.dataset.liveQuoteOk === '1') {
            const timeEl = document.getElementById('live-quote-time');
            const detailEl = document.getElementById('live-quote-detail');
            if (timeEl) timeEl.textContent = timeStr;
            if (detailEl) detailEl.textContent = detailStr;
            return;
        }
        el.dataset.liveQuoteOk = '1';
        el.innerHTML = `<i data-lucide="radio" class="text-emerald-500" size="14"></i> ${sessionLabel} <span id="live-quote-time">${timeStr}</span><span id="live-quote-detail">${detailStr}</span>`;
    } else {
        el.dataset.liveQuoteOk = '';
        el.innerHTML = `<i data-lucide="alert-circle" class="text-amber-500" size="14"></i> 即時報價失敗${detail ? `：${detail}` : ''}`;
    }
    refreshIcons();
}

export async function refreshLiveQuotes() {
    if (!db || liveQuoteInFlight || document.hidden) return;
    liveQuoteInFlight = true;
    const silent = lastLiveQuoteAt > 0;
    try {
        if (!silent) setLiveQuoteStatus('loading');
        const quotes = await fetchWantgooJson(WANTGOO_QUOTES_URL);
        updateSpotQuoteCacheFromQuotes(quotes);
        const count = upsertQuotesToMemoryDb(quotes);
        lastLiveQuoteAt = Date.now();
        liveQuoteFailStreak = 0;
        setLiveQuoteStatus('ok', count, { silent });
        applyLiveQuoteTick();
        const now = Date.now();
        const needFullAnalyze = !liveQuoteSyncedOnce
            || !lastFullAnalyzeAt
            || now - lastFullAnalyzeAt >= LIVE_ANALYZE_REFRESH_MS;
        if (needFullAnalyze) {
            liveQuoteSyncedOnce = true;
            const activeSid = stockSelectInstance?.getValue() || '';
            tryAnalyze();
            const sid = stockSelectInstance?.getValue() || activeSid;
            if (sid) updatePriceTrend(sid);
        }
    } catch (e) {
        liveQuoteFailStreak++;
        if (liveQuoteFailStreak <= 2 || liveQuoteFailStreak % 6 === 0) {
            console.error('Live quote refresh failed:', e);
        }
        if ((e.message || '').includes('401') || (e.message || '').includes('金鑰')) {
            showAccessKeyModal(e.message);
        }
        setLiveQuoteStatus('err', e.message);
    } finally {
        liveQuoteInFlight = false;
    }
}

export function stopLiveQuoteFastPolling() {
    if (liveQuoteTimerId) {
        clearInterval(liveQuoteTimerId);
        liveQuoteTimerId = null;
    }
}

export function syncLiveQuoteSchedule() {
    stopLiveQuoteFastPolling();
    if (liveQuoteSessionTimerId) {
        clearTimeout(liveQuoteSessionTimerId);
        liveQuoteSessionTimerId = null;
    }
    if (!db || !getLiveQuoteApiBase() || !getLiveQuoteAccessKey()) return;

    if (isActiveTradingSession()) {
        liveQuoteOffSessionDone = false;
        refreshLiveQuotes();
        liveQuoteTimerId = setInterval(refreshLiveQuotes, LIVE_QUOTE_REFRESH_MS);
    } else if (!liveQuoteOffSessionDone) {
        refreshLiveQuotes();
        liveQuoteOffSessionDone = true;
    } else if (lastLiveQuoteAt) {
        setLiveQuoteStatus('ok', '已同步一次');
    }

    liveQuoteSessionTimerId = setTimeout(syncLiveQuoteSchedule, getNextQuoteSessionBoundaryMs());
}

export function startLiveQuotePolling() {
    stopLiveQuotePolling();
    liveQuoteOffSessionDone = false;
    syncLiveQuoteSchedule();
}

export function stopLiveQuotePolling() {
    stopLiveQuoteFastPolling();
    if (liveQuoteSessionTimerId) {
        clearTimeout(liveQuoteSessionTimerId);
        liveQuoteSessionTimerId = null;
    }
}

export async function fetchMarketDbUint8() {
    const fetchUrl = buildProxyApiUrl('/api/market-db');
    if (!getLiveQuoteApiBase()) throw new Error('LIVE_QUOTE_API_BASE 未設定');
    if (!fetchUrl) throw new Error('請先輸入 API 金鑰');
    const u = new URL(fetchUrl);
    u.searchParams.set('v', String(Date.now()));
    const response = await fetch(u.toString(), { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const entry = findMarketDbEntry(zip);
    if (!entry) throw new Error('ZIP 內找不到 market.db');
    return entry.async('uint8array');
}

export async function applyDatabaseBytes(uint8, { isFirstLoad = false } = {}) {
    const SQL = await sqlPromise;
    if (db) db.close();
    db = new SQL.Database(uint8);
    loadStockTagsMap();
    if (isFirstLoad) {
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('dashboard-content').classList.remove('hidden');
        document.getElementById('settings-panel').classList.remove('hidden');
    }
    tryAnalyze();
    const sid = stockSelectInstance?.getValue();
    if (sid) updatePriceTrend(sid);
}

/** 啟動即時報價輪詢（DB 僅在初次載入時透過 Worker 下載一次） */
export function startDataRefresh() {
    stopDataRefresh();
    if (!getLiveQuoteApiBase() || !getLiveQuoteAccessKey() || !db) return;
    startLiveQuotePolling();
}

export function stopDataRefresh() {
    stopLiveQuotePolling();
}

export function formatVolumeK(vol) {
    if (vol === null || vol === undefined || isNaN(vol)) return '0.0K';
    const k = vol / 1000;
    return (k >= 10 ? k.toFixed(0) : k.toFixed(1)) + 'K';
}

export function formatTradeValueMillion(val) {
    if (val === null || val === undefined || isNaN(val)) return "0";
    if (val >= 100) return (val / 100).toFixed(2) + ' 億';
    return val.toFixed(1) + ' 百萬';
}

export function applyOverviewThresholdForMode(mode) {
    const inp = document.getElementById('param-min-threshold-overview');
    const label = document.getElementById('overview-threshold-label');
    if (!inp || !label) return;
    if (mode === 'value') {
        label.innerText = '最低成交金額(百萬)';
        inp.step = '1';
        inp.min = '0';
    } else {
        label.innerText = '最低成交量';
        inp.step = '1000';
        inp.min = '0';
    }
}

export function syncThresholdInputOnModeSwitch(oldMode, newMode) {
    const inp = document.getElementById('param-min-threshold-overview');
    if (!inp) return;
    inp.dataset[oldMode + 'Threshold'] = inp.value;
    inp.value = inp.dataset[newMode + 'Threshold'] || (newMode === 'value' ? '100' : '1000');
    applyOverviewThresholdForMode(newMode);
}

export function tryAnalyze() {
    if (!db) return;
    try {
        processOverview();
        processSurgeAnalysis();
        renderBlacklist();
        lastFullAnalyzeAt = Date.now();
    } catch (e) { console.error("分析錯誤:", e); showToast("分析執行出錯"); }
}

export function isFavorite(id) {
    return favorites.some(f => f.id === id);
}

export function formatFavoriteBtn(id) {
    const fav = isFavorite(id);
    return `<button type="button" data-fav-btn data-stock-id="${escapeHtml(id)}" class="fav-toggle-btn p-2 hover:bg-pink-500/20 ${fav ? 'is-fav text-pink-400' : 'text-slate-500 hover:text-pink-400'} rounded-full transition" title="${fav ? '移出最愛' : '加入最愛'}"><i data-lucide="heart" size="16"></i></button>`;
}

export function initFavoriteButtonDelegation() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-fav-btn]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.stockId;
        if (!id) return;
        const quote = db ? getStockLatestQuote(id) : null;
        const name = quote?.name || favorites.find(f => f.id === id)?.name || id;
        if (isFavorite(id)) removeFromFavorites(id);
        else addToFavorites(id, name);
    });
}

export function updateFavoriteButtonStates() {
    document.querySelectorAll('[data-fav-btn][data-stock-id]').forEach(btn => {
        const on = isFavorite(btn.dataset.stockId);
        btn.classList.toggle('is-fav', on);
        btn.classList.toggle('text-pink-400', on);
        btn.classList.toggle('text-slate-500', !on);
        btn.title = on ? '移出最愛' : '加入最愛';
    });
}

export function addToFavorites(id, name) {
    if (!id || isFavorite(id)) return false;
    favorites.push({ id, name: name || id });
    saveFavoritesToCookie();
    renderFavoritesSection();
    updateFavoriteButtonStates();
    showToast(`已加入最愛 ${id} ${name || ''}`);
    return true;
}

export function removeFromFavorites(id) {
    const item = favorites.find(f => f.id === id);
    if (!item) return;
    favorites = favorites.filter(f => f.id !== id);
    saveFavoritesToCookie();
    renderFavoritesSection();
    updateFavoriteButtonStates();
    showToast(`已移出最愛 ${id}`);
}

export function toggleFavorite(id, name) {
    if (isFavorite(id)) removeFromFavorites(id);
    else addToFavorites(id, name || id);
}

export function addFavoriteFromSelector() {
    const id = stockSelectInstance?.getValue() || '';
    if (!id) return showToast('請先選擇標的');
    const quote = getStockLatestQuote(id);
    const name = quote?.name || id;
    if (!addToFavorites(id, name)) showToast('已在最愛清單中');
}

export function renderFavoritesSection() {
    const body = document.getElementById('favorites-table-body');
    const wrap = document.getElementById('favorites-table-wrap');
    const empty = document.getElementById('favorites-empty');
    const badge = document.getElementById('favorites-count-badge');
    if (!body) return;

    if (badge) badge.textContent = `${favorites.length} 檔`;

    if (!favorites.length) {
        body.innerHTML = '';
        wrap?.classList.add('hidden');
        empty?.classList.remove('hidden');
        refreshIcons();
        return;
    }

    wrap?.classList.remove('hidden');
    empty?.classList.add('hidden');

    const p = getParams();
    body.innerHTML = '';
    favorites.forEach(f => {
        const quote = db ? getStockLatestQuote(f.id) : null;
        const miniCandle = formatSpotMiniCandle(f.id);
        const gain = quote?.gain ?? 0;
        const gainClass = gain >= 0 ? 'text-rose-400' : 'text-emerald-400';
        const gainSign = gain >= 0 ? '+' : '';
        const close = quote?.close ?? '--';
        const metric = quote ? formatStockLiveMetric(quote, p.mode) : '--';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800 transition';
        tr.dataset.stockId = f.id;
        tr.innerHTML = `
            <td class="px-3 md:px-4 py-3.5">
                <div class="flex items-center gap-2.5">
                    <span class="fav-mini-candle shrink-0">${miniCandle}</span>
                    <div class="min-w-0">
                        <div class="stock-code">${escapeHtml(f.id)}</div>
                        <div class="stock-name">${escapeHtml(f.name)}</div>
                    </div>
                </div>
            </td>
            <td class="fav-col-price px-3 md:px-4 py-3.5 text-right">${quote ? formatFuturesSpotPriceCell(f.id, close) : '--'}</td>
            <td class="fav-col-gain px-3 md:px-4 py-3.5 text-right font-bold text-base ${gainClass}">${quote ? `${gainSign}${(gain * 100).toFixed(2)}%` : '--'}</td>
            <td class="fav-col-metric px-3 md:px-4 py-3.5 text-right text-yellow-400 font-bold text-base" style="font-variant-numeric:tabular-nums">${metric}</td>
            <td class="px-3 md:px-4 py-3.5 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button type="button" onclick="viewStock('${escapeHtml(f.id)}')" class="p-2 hover:bg-blue-600/20 text-blue-400 rounded-full transition" title="看圖"><i data-lucide="line-chart" size="16"></i></button>
                    <button type="button" onclick="removeFromFavorites('${escapeHtml(f.id)}')" class="p-2 hover:bg-pink-500/20 text-pink-400 rounded-full transition" title="移出最愛"><i data-lucide="heart-off" size="16"></i></button>
                </div>
            </td>`;
        body.appendChild(tr);
    });
    refreshIcons();
}

export function patchFavoritesSectionLive() {
    if (!favorites.length) return;
    const p = getParams();
    document.querySelectorAll('#favorites-table-body tr[data-stock-id]').forEach(tr => {
        const id = tr.dataset.stockId;
        const miniEl = tr.querySelector('.fav-mini-candle');
        if (miniEl) miniEl.innerHTML = formatSpotMiniCandle(id);
        const quote = getStockLatestQuote(id);
        if (!quote) return;
        const priceTd = tr.querySelector('.fav-col-price');
        if (priceTd) priceTd.innerHTML = formatFuturesSpotPriceCell(id, quote.close);
        const gainTd = tr.querySelector('.fav-col-gain');
        if (gainTd) {
            gainTd.className = `fav-col-gain px-3 md:px-4 py-3.5 text-right font-bold text-base ${quote.gain >= 0 ? 'text-rose-400' : 'text-emerald-400'}`;
            gainTd.textContent = `${quote.gain >= 0 ? '+' : ''}${(quote.gain * 100).toFixed(2)}%`;
        }
        const metricTd = tr.querySelector('.fav-col-metric');
        if (metricTd) metricTd.textContent = formatStockLiveMetric(quote, p.mode);
    });
}

export function copyFavoritesList() {
    if (!favorites.length) return showToast('尚無最愛標的');
    const text = favorites.map(f => `${f.id} ${f.name}`).join(', ');
    copyToClipboard(text, '最愛清單已複製！');
}

// 黑名單管理
export function addToBlacklist(id, name) {
    if (!blacklist.find(b => b.id === id)) {
        blacklist.push({ id, name });
        localStorage.setItem('stock_blacklist', JSON.stringify(blacklist));
        tryAnalyze();
        showToast(`已隱藏 ${id} ${name}`);
    }
}

export function removeFromBlacklist(id) {
    blacklist = blacklist.filter(b => b.id !== id);
    localStorage.setItem('stock_blacklist', JSON.stringify(blacklist));
    tryAnalyze();
}

export function clearBlacklist() {
    if (confirm("確定要恢復所有隱藏的標的嗎？")) {
        blacklist = [];
        localStorage.setItem('stock_blacklist', JSON.stringify(blacklist));
        tryAnalyze();
    }
}

export function renderBlacklist() {
    const bar = document.getElementById('blacklist-bar');
    const container = document.getElementById('blacklist-tags');
    if (!blacklist.length) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    container.innerHTML = blacklist.map(b => `
        <div class="blacklist-item">
            <span>${b.id} ${b.name}</span>
            <i data-lucide="x" size="12" class="cursor-pointer" onclick="removeFromBlacklist('${b.id}')"></i>
        </div>
    `).join('');
    refreshIcons();
}

// CB 相關功能
export function getCbInfo(stockId) {
    if (!db) return null;
    try {
        // 根據 check_db.py 的結果，轉換標的代號在第 11 個欄位 (index 10)
        // 欄位名稱可能是亂碼，我們直接用索引或 PRAGMA 找出的名稱
        const tableInfo = db.exec("PRAGMA table_info(cb_data)");
        if (!tableInfo.length) return null;
        
        // 根據分析，第 11 個欄位 (index 10) 是 "轉換標的代號"
        const targetCol = tableInfo[0].values[10]?.[1];
        
        if (targetCol) {
            // 確保 stockId 是字串且去空格
            const sid = String(stockId).trim();
            const res = db.exec(`SELECT * FROM cb_data WHERE "${targetCol}" = '${sid}' OR "${targetCol}" LIKE '%${sid}%'`);
            if (res.length && res[0].values.length) {
                return {
                    columns: res[0].columns,
                    values: res[0].values
                };
            }
        }
    } catch (e) {
        console.error("CB 查詢錯誤:", e);
    }
    return null;
}

export function showCbDetail(stockId) {
    const info = getCbInfo(stockId);
    if (!info) return;
    
    const content = document.getElementById('cb-modal-content');
    content.innerHTML = '';
    
    info.values.forEach((row, idx) => {
        const card = document.createElement('div');
        card.className = 'bg-slate-900/50 p-4 rounded-xl border border-slate-800 mb-4';
        
        let html = `<div class="grid grid-cols-2 gap-3 text-sm">`;
        info.columns.forEach((col, i) => {
            const val = row[i] || '--';
            // 過濾掉一些不必要的亂碼欄位或空值
            if (val !== '--') {
                html += `<div><span class="text-slate-500 block text-[10px] uppercase">${col}</span><span class="text-slate-200 font-medium">${val}</span></div>`;
            }
        });
        html += `</div>`;
        card.innerHTML = html;
        content.appendChild(card);
    });
    
    document.getElementById('cb-modal').classList.add('active');
    refreshIcons();
}

export function closeCbModal(e) {
    document.getElementById('cb-modal').classList.remove('active');
}

export function initTabsAndMode() {
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        document.body.setAttribute('data-active-tab', target);
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const content = document.getElementById(`tab-${target}`);
        if(content) content.classList.add('active');
        if (target === 'punish') refreshPunishData();
    });
});

document.getElementById('mode-selector').addEventListener('click', () => {
    const oldMode = document.body.getAttribute('data-mode') || 'volume';
    const newMode = oldMode === 'volume' ? 'value' : 'volume';
    syncThresholdInputOnModeSwitch(oldMode, newMode);
    document.body.setAttribute('data-mode', newMode);
    document.querySelectorAll('.mode-option').forEach(opt => opt.classList.toggle('active', opt.dataset.val === newMode));
    
    const params = getParams();
    const prefix = params.avgDays > 1 ? `平均` : ``;
    document.getElementById('th-dynamic-metric').innerText = newMode === 'value' ? `${prefix}成交金額(百萬)` : `${prefix}成交量`;
    document.getElementById('stat-vol-label').innerText = newMode === 'value' ? `基準日成交金額(百萬)` : `基準日成交量`;
    
    if(db) tryAnalyze();
});
}

export function handleFilterToggle() { if (db) tryAnalyze(); }

// 處置股抓取
export async function refreshPunishData() {
    const container = document.getElementById('punish-table-body');
    const loading = document.getElementById('punish-loading');
    const empty = document.getElementById('punish-empty');
    if(!container) return;
    container.innerHTML = ''; loading.classList.remove('hidden'); empty.classList.add('hidden');

    const now = new Date();
    const lastMonth = new Date(); lastMonth.setMonth(now.getMonth() - 1);
    const fmt = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const url = `https://www.twse.com.tw/rwd/zh/announcement/punish?startDate=${fmt(lastMonth)}&endDate=${fmt(now)}&querytype=3&response=json&_=${Date.now()}`;

    try {
        const response = await fetch(url);
        const json = await response.json();
        if (!json || json.stat !== 'OK' || !json.data) throw new Error();

        const today = new Date(); today.setHours(0,0,0,0);
        const list = json.data.filter(item => {
            const periodStr = item[6]; 
            if (typeof periodStr !== 'string' || (!periodStr.includes('～') && !periodStr.includes('-'))) return false;
            const sep = periodStr.includes('～') ? '～' : '-';
            const dates = periodStr.split(sep);
            const parseTW = (s) => {
                const p = s.trim().split('/');
                return new Date(parseInt(p[0]) + 1911, parseInt(p[1]) - 1, parseInt(p[2]));
            };
            try { return parseTW(dates[1]) >= today && !blacklist.find(b => b.id === item[2]); } catch(e) { return false; }
        });

        loading.classList.add('hidden');
        if (!list.length) { empty.classList.remove('hidden'); } else {
            list.forEach(item => {
                const id = item[2], name = item[3], period = item[6], summary = item[7], detail = item[8];
                const sep = period.includes('～') ? '～' : '-';
                const endParts = period.split(sep)[1].trim().split('/');
                const endD = new Date(parseInt(endParts[0])+1911, parseInt(endParts[1])-1, parseInt(endParts[2]));
                const remain = Math.ceil((endD - today) / 86400000);
                
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-800 transition';
                tr.innerHTML = `
                    <td class="px-2 md:px-4 py-3">
                        <div class="font-bold text-blue-400 text-sm md:text-base">${id}</div>
                        <div class="text-xs text-slate-400 font-medium">${name}</div>
                    </td>
                    <td class="px-2 md:px-4 py-3">
                        <span class="badge-red text-[10px] md:text-xs whitespace-nowrap">${remain}天</span>
                    </td>
                    <td class="hidden md:table-cell px-2 md:px-4 py-3 text-xs text-slate-400 font-mono">${period}</td>
                    <td class="px-2 md:px-4 py-3 text-xs max-w-[120px] md:max-w-xs truncate text-slate-300" title="${detail}">${summary}</td>
                    <td class="px-2 md:px-4 py-3 text-center">
                        <button onclick="viewStock('${id}')" class="p-2 hover:bg-rose-500/20 text-rose-400 rounded-full transition">
                            <i data-lucide="line-chart" size="16"></i>
                        </button>
                    </td>`;
                container.appendChild(tr);
            });
            refreshIcons();
        }
    } catch (e) {
        loading.classList.add('hidden'); empty.innerHTML = `<span class="text-rose-400">連線失敗</span><br><small class="text-slate-600">證交所連線限制中</small>`; empty.classList.remove('hidden');
    }
}

// 非金融但名稱以「銀期貨」結尾（如 2049 上銀期貨）
const NON_FINANCE_FUTURES_CODES = new Set(['2049']);

export function normalizeStockCode(id) {
    const s = String(id || '').trim();
    const m = s.match(/^(\d{4})/);
    return m ? m[1] : s;
}

export function loadStockTagsMap() {
    stockTagsMap = {};
    if (!db) return;
    try {
        const res = db.exec(`
            SELECT st.stock_code, t.name
            FROM stock_tags st
            JOIN tags t ON t.id = st.tag_id
            ORDER BY st.stock_code, t.name
        `);
        if (res.length) {
            res[0].values.forEach(([code, name]) => {
                if (!stockTagsMap[code]) stockTagsMap[code] = [];
                stockTagsMap[code].push(name);
            });
        }
    } catch (e) {
        console.warn('stock_tags 未載入，可能為舊版 DB', e);
    }
}

export function getTagsForStock(stockId) {
    return stockTagsMap[normalizeStockCode(stockId)] || [];
}

export function getPrimaryTag(stockId) {
    const tags = getTagsForStock(stockId);
    return tags.length ? tags[0] : '未標記';
}

export function getTagsLabel(stockId) {
    const tags = getTagsForStock(stockId);
    return tags.length ? tags.join('、') : '—';
}

export function isFinanceStock(stockId, name) {
    const code = normalizeStockCode(stockId);
    const raw = (name || '').replace(/^小型/, '').trim();
    const core = raw.replace(/期貨$/, '').trim();

    // market_data 期貨命名：富邦金期貨、國泰金期貨、彰銀期貨…
    if (/金期貨$|金控期貨$|保險期貨$|證券期貨$|金融期貨$/.test(raw)) return true;
    if (/銀期貨$/.test(raw) && !NON_FINANCE_FUTURES_CODES.has(code)) return true;
    if (/金控|銀行|保險|證券|金融|金租|票券|商銀|企銀/.test(core)) return true;

    if (db) {
        try {
            const res = db.exec(`SELECT 產業組別 FROM sector_map WHERE stock_id = '${code}' LIMIT 1`);
            if (res.length && res[0].values[0]?.[0]?.includes('金融')) return true;
        } catch (_) { /* 新版 DB 可能無 sector_map */ }
    }
    return false;
}

export async function loadDatabase(uint8Array) {
    try {
        await applyDatabaseBytes(uint8Array, { isFirstLoad: true });
        if (getLiveQuoteApiBase()) {
            document.getElementById('db-status').innerHTML = `<i data-lucide="check-circle" class="text-emerald-500" size="14"></i> 雲端數據已同步`;
        }
        startDataRefresh();
        renderFavoritesSection();
        showToast("數據同步成功");
        refreshIcons();
    } catch (err) { console.error("WASM Load Error:", err); showToast("資料庫引擎載入失敗"); }
}

export function findMarketDbEntry(zip) {
    let f = zip.file("market.db");
    if (f) return f;
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && /(^|\/)market\.db$/i.test(n));
    return names.length ? zip.file(names[0]) : null;
}

/** 下載 ZIP 後全程在記憶體解壓（ArrayBuffer → Uint8Array），不建立本機檔案、不觸發下載。 */
export async function fetchRemoteDatabase() {
    try {
        const uint8 = await fetchMarketDbUint8();
        await loadDatabase(uint8);
    } catch (err) {
        console.error("Fetch DB Error:", err);
        const fetchUrl = buildProxyApiUrl('/api/market-db');
        const msg = formatLiveQuoteError(err, fetchUrl || '/api/market-db');
        const isUnsupportedZip = String(err?.message || err).includes("compression");
        document.getElementById('welcome-title').innerText = "數據同步失敗";
        document.getElementById('welcome-title').classList.add('text-rose-400');
        document.getElementById('loading-icon').setAttribute('data-lucide', 'alert-triangle');
        document.getElementById('loading-icon').classList.remove('animate-spin', 'text-blue-400');
        document.getElementById('loading-icon').classList.add('text-rose-400');
        showToast(isUnsupportedZip ? "ZIP 壓縮格式不支援，請用 Deflate 重新上傳" : msg);
        refreshIcons();
    }
}

export function isETF(id, name) {
    const n = (name || "").toUpperCase(); const i = (id || "").toString();
    return n.includes('ETF') || i.startsWith('00') || n.includes('受益') || n.includes('存託');
}

// 💎 市場概況核心邏輯：支援當日漲幅 vs 波段漲幅智慧切換
export function processOverview() {
    const p = getParams();
    const latestDateRes = db.exec(`SELECT MAX(tradeDate) FROM market_data WHERE tradeDate <= ${p.deadline}`);
    if (!latestDateRes.length || !latestDateRes[0].values[0][0]) return;
    const latestDate = latestDateRes[0].values[0][0];
    currentReferenceTimestamp = latestDate;
    currentReferenceDate = getLatestDataDateTime(latestDate);

    const dateListRes = db.exec(`SELECT DISTINCT tradeDate FROM market_data WHERE tradeDate <= ${p.deadline} ORDER BY tradeDate DESC LIMIT ${p.avgDays}`);
    const targetDates = dateListRes[0].values.map(v => v[0]);
    currentAnalysisPeriodStart = targetDates.length ? targetDates[targetDates.length - 1] : latestDate;
    currentAvgDays = p.avgDays;

    const latestDataMap = {};
    const baseRes = db.exec(`SELECT m.stockId, m.name, m.close, m.previousClose FROM market_data m WHERE m.tradeDate = ${latestDate}`);
    if (baseRes.length) baseRes[0].values.forEach(v => { latestDataMap[v[0]] = v; });

    const multiDayRes = db.exec(`SELECT stockId, volume, ${TRADE_VALUE_M_SQL} as val_m, close FROM market_data WHERE tradeDate IN (${targetDates.join(',')})`);
    const stats = {};
    if (multiDayRes.length) {
        multiDayRes[0].values.forEach(v => {
            const id = v[0];
            if (!stats[id]) stats[id] = { volSum: 0, valSum: 0, count: 0, minClose: Infinity, maxClose: -Infinity };
            stats[id].volSum += v[1];
            stats[id].valSum += v[2];
            stats[id].minClose = Math.min(stats[id].minClose, v[3]);
            stats[id].maxClose = Math.max(stats[id].maxClose, v[3]);
            stats[id].count += 1;
        });
    }

    let validStocks = [];
    for (const id in stats) {
        const base = latestDataMap[id]; if (!base) continue;

        const metric = p.mode === 'value' ? stats[id].valSum / stats[id].count : stats[id].volSum / stats[id].count;
        if (metric < p.minThreshold) continue;
        if (p.excludeETF && isETF(id, base[1])) continue;
        if (p.excludeFinance && isFinanceStock(id, base[1])) continue;
        if (blacklist.find(b => b.id === id)) continue;

        // 💎 智慧漲幅邏輯判定（強勢清單）
        let gain = 0;
        if (p.avgDays === 1) {
            gain = base[3] > 0 ? (base[2] - base[3]) / base[3] : 0;
        } else {
            gain = stats[id].minClose > 0 ? (stats[id].maxClose - stats[id].minClose) / stats[id].minClose : 0;
        }
        if (gain < p.changePct) continue;
        validStocks.push({ id, name: base[1], close: base[2], tags: getTagsLabel(id), primaryTag: getPrimaryTag(id), avgMetric: metric, gain });
    }

    validStocks.sort((a, b) => b.avgMetric - a.avgMetric);
    currentStrongList = validStocks.map(v => ({ id: v.id, name: v.name, pct: (v.gain * 100).toFixed(2) }));
    currentPullbackUniverse = buildPullbackUniverse(latestDate, p);

    // 更新清單旁的日期標註
    const dateEl = document.getElementById('overview-db-date');
    if (dateEl) dateEl.innerText = `(數據日期: ${currentReferenceDate})`;

    document.getElementById('stat-stocks').innerText = Object.keys(latestDataMap).length;
    document.getElementById('stat-date').innerText = currentReferenceDate;
    const totalMetricRes = db.exec(`SELECT ${p.mode === 'value' ? `SUM(${TRADE_VALUE_M_SQL})` : 'SUM(volume)'} FROM market_data WHERE tradeDate = ${latestDate}`);
    document.getElementById('stat-volume').innerText = p.mode === 'value' ? formatTradeValueMillion(totalMetricRes[0].values[0][0]) : (totalMetricRes[0].values[0][0] || 0).toLocaleString();
    document.getElementById('stat-strong').innerText = validStocks.length;

    const tableBody = document.getElementById('strong-table-body'); tableBody.innerHTML = '';
    validStocks.forEach((v, i) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800 transition';
        tr.dataset.stockId = v.id;
        const rank = i + 1;
        const rankClass = rank <= 3 ? 'stock-rank rank-top' : 'stock-rank';
        const displayMetric = p.mode === 'value' ? formatTradeValueMillion(v.avgMetric) : formatVolumeK(v.avgMetric);
        const gainClass = v.gain >= 0 ? 'text-rose-400' : 'text-emerald-400';
        const gainSign = v.gain >= 0 ? '+' : '';

        // 檢查是否有 CB
        const cbInfo = getCbInfo(v.id);
        const cbBadge = cbInfo ? `<span class="badge-cb ml-1" onclick="showCbDetail('${v.id}')">CB</span>` : '';

        const miniCandle = formatSpotMiniCandle(v.id);
        const favBtn = formatFavoriteBtn(v.id);
        tr.innerHTML = `<td class="px-2 md:px-3 py-3.5 ${rankClass}">${rank}</td><td class="px-3 md:px-4 py-3.5"><div class="flex items-center gap-2.5"><span class="strong-mini-candle shrink-0">${miniCandle}</span><div class="min-w-0"><div class="flex items-center"><div class="stock-code">${v.id}</div>${cbBadge}</div><div class="stock-name">${v.name}</div></div></div></td><td class="strong-col-price px-3 md:px-4 py-3.5 text-right">${formatFuturesSpotPriceCell(v.id, v.close)}</td><td class="strong-col-spot-amp px-3 md:px-4 py-3.5 text-right text-sky-300 font-mono font-semibold text-sm" style="font-variant-numeric:tabular-nums">${formatSpotAmplitude(v.id)}</td><td class="strong-col-gain px-3 md:px-4 py-3.5 text-right font-bold text-base ${gainClass}">${gainSign}${(v.gain*100).toFixed(2)}%</td><td class="strong-col-metric px-3 md:px-4 py-3.5 text-right ${p.mode === 'value' ? 'text-emerald-400' : 'text-yellow-400'} font-bold text-base" style="font-variant-numeric:tabular-nums">${displayMetric}</td><td class="px-3 md:px-4 py-3.5 text-center"><div class="flex items-center justify-center gap-1"><button onclick="viewStock('${v.id}')" class="p-2 hover:bg-blue-600/20 text-blue-400 rounded-full transition" title="看圖"><i data-lucide="line-chart" size="16"></i></button>${favBtn}<button onclick="addToBlacklist('${v.id}', '${v.name}')" class="p-2 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-full transition" title="隱藏標的"><i data-lucide="eye-off" size="16"></i></button></div></td>`;
        tableBody.appendChild(tr);
    });
    refreshIcons();

    const tagCounts = {};
    validStocks.forEach(v => {
        const tags = getTagsForStock(v.id);
        if (!tags.length) {
            tagCounts['未標記'] = (tagCounts['未標記'] || 0) + 1;
            return;
        }
        tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
    });
    renderTagRankList(tagCounts);
    renderSpotPullbackSection();

    const allStocksQuery = db.exec(`SELECT m.stockId, m.name FROM market_data m WHERE m.tradeDate <= ${latestDate} GROUP BY m.stockId ORDER BY m.name ASC`);
    if (allStocksQuery.length) {
        const allStocks = allStocksQuery[0].values.filter(v => !(p.excludeETF && isETF(v[0], v[1])) && !(p.excludeFinance && isFinanceStock(v[0], v[1])));
        const prevSelected = stockSelectInstance?.getValue() || '';
        const onStockSelect = val => { if (val) { updatePriceTrend(val); updateStockAnalysisMeta(val); } };
        const options = allStocks.map(s => ({ value: s[0], text: `${s[0]} ${s[1]}` }));
        if (stockSelectInstance) {
            stockSelectInstance.clearOptions();
            stockSelectInstance.addOptions(options);
        } else {
            stockSelectInstance = new TomSelect("#stock-selector", { create: false, maxItems: 1, onChange: onStockSelect });
            stockSelectInstance.addOptions(options);
        }
        if (prevSelected && allStocks.some(s => s[0] === prevSelected)) {
            stockSelectInstance.setValue(prevSelected, true);
        }
    }
}

export function processSurgeAnalysis() {
    const p = getParams();
    const latestDateRes = db.exec(`SELECT MAX(tradeDate) FROM market_data WHERE tradeDate <= ${p.deadline}`);
    if (latestDateRes.length && latestDateRes[0].values[0][0]) {
        currentReferenceTimestamp = latestDateRes[0].values[0][0];
        currentReferenceDate = getLatestDataDateTime(currentReferenceTimestamp);
    }
    const tableBody = document.getElementById('surge-table-body'); tableBody.innerHTML = '';
    const res = db.exec(`SELECT m.stockId, m.name, m.volume, m.tradeDate FROM market_data m WHERE m.tradeDate <= ${p.deadline} AND m.tradeDate >= ${p.deadline - 31536000000} ORDER BY m.stockId, m.tradeDate DESC`);
    if (!res.length) return;
    const groups = {}; res[0].values.forEach(v => { if (!groups[v[0]]) groups[v[0]] = { name: v[1], volumes: [] }; groups[v[0]].volumes.push(v[2]); });
    const results = [];
    for (const id in groups) {
        const s = groups[id]; if ((p.excludeETF && isETF(id, s.name)) || (p.excludeFinance && isFinanceStock(id, s.name)) || s.volumes.length < p.recentDays + 1 || blacklist.find(b => b.id === id)) continue;
        const recent = s.volumes.slice(0, p.recentDays).reduce((a,b)=>a+b,0)/p.recentDays;
        const hist = s.volumes.slice(p.recentDays).reduce((a,b)=>a+b,0)/(s.volumes.length-p.recentDays);
        if (hist > 0 && recent >= p.minAvgVol) {
            const ratio = recent / hist; if (ratio >= p.surgeRatio) results.push({ id, name: s.name, tags: getTagsLabel(id), hist, recent, ratio });
        }
    }
    currentSurgeList = results;
    document.getElementById('surge-count-badge').innerText = results.length + " 筆符合";
    if (results.length) {
        results.sort((a,b)=>b.ratio-a.ratio).forEach(item => {
            const tr = document.createElement('tr'); tr.className = 'hover:bg-slate-800 transition';
            
            // 檢查是否有 CB
            const cbInfo = getCbInfo(item.id);
            const cbBadge = cbInfo ? `<span class="badge-cb ml-1" onclick="showCbDetail('${item.id}')">CB</span>` : '';

            const favBtn = formatFavoriteBtn(item.id);
            tr.innerHTML = `<td><div class="flex items-center"><div class="font-bold text-slate-100 text-sm md:text-base">${item.id}</div>${cbBadge}</div><div class="text-xs text-slate-400 font-medium">${item.name}</div></td><td class="text-sm text-slate-300 font-medium max-w-[10rem] truncate" title="${item.tags}">${item.tags}</td><td class="text-right font-mono text-slate-300">${formatVolumeK(item.hist)}</td><td class="text-right font-bold text-yellow-400 text-sm">${formatVolumeK(item.recent)}</td><td class="text-right"><span class="${item.ratio >= 2 ? 'badge-red' : 'text-yellow-500 font-bold'} text-sm">${item.ratio.toFixed(2)}x</span></td><td class="text-center"><div class="flex items-center justify-center gap-1"><button onclick="viewStock('${item.id}')" class="p-2 text-blue-400 hover:bg-blue-900/30 rounded-full transition" title="看圖"><i data-lucide="eye" size="14"></i></button>${favBtn}<button onclick="addToBlacklist('${item.id}', '${item.name}')" class="p-2 text-slate-500 hover:text-rose-400 rounded-full transition" title="隱藏標的"><i data-lucide="eye-off" size="14"></i></button></div></td>`;
            tableBody.appendChild(tr);
        });
        refreshIcons();
    }
}

export function updatePriceTrend(stockId) {
    updateStockAnalysisMeta(stockId);
    const p = getParams(); const res = db.exec(`SELECT tradeDate, close, volume FROM market_data WHERE stockId = '${stockId}' ORDER BY tradeDate ASC`);
    if (!res.length) return; const vals = res[0].values;
    const labels = vals.map(v => {
        const d = new Date(v[0]);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    });
    const prices = vals.map(v => v[1]); const volumes = vals.map(v => v[2]);
    const isBacktesting = p.deadline < vals[vals.length-1][0];
    if (priceChart) priceChart.destroy();
    priceChartStockId = stockId;
    const ctx = document.getElementById('priceChart').getContext('2d');
    priceChart = new Chart(ctx, {
        plugins: [{ id: 'vLine', afterDraw: chart => { if (isBacktesting) { const {ctx, chartArea:{top, bottom}, scales:{x}} = chart; let lx = -1; for (let i=0; i<vals.length; i++) if (vals[i][0] <= p.deadline) lx = x.getPixelForValue(i); if (lx !== -1) { ctx.save(); ctx.beginPath(); ctx.setLineDash([5,5]); ctx.strokeStyle='#f43f5e'; ctx.moveTo(lx, top); ctx.lineTo(lx, bottom); ctx.stroke(); ctx.restore(); } } } }],
        data: { labels, datasets: [{ type: 'line', label: '價格', data: prices, borderColor: '#60a5fa', borderWidth: 2.5, fill: false, tension: 0.3, pointRadius: 1, yAxisID: 'y', segment: { borderColor: ctx => (isBacktesting && vals[ctx.p0DataIndex][0] > p.deadline) ? 'rgba(148, 163, 184, 0.4)' : undefined, borderDash: ctx => (isBacktesting && vals[ctx.p0DataIndex][0] > p.deadline) ? [5, 5] : undefined } }, { type: 'bar', label: '量', data: volumes, backgroundColor: vals.map(v => (isBacktesting && v[0] > p.deadline) ? 'rgba(71, 85, 105, 0.3)' : 'rgba(250, 204, 21, 0.6)'), yAxisID: 'y1' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { position: 'left', grid: { color: '#1e293b' }, ticks: { font: { size: 9 }, color: '#64748b' } },
                y1: { position: 'right', display: false, max: Math.max(...volumes) * 4 },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 9 },
                        color: '#64748b',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: c => labels[c[0].dataIndex]
                    }
                }
            }
        }
    });
}

export function formatPromptName(name) {
    return (name || "").replace(/小型/g, "").replace(/期貨/g, "").trim();
}

export function isPromptExcludedStock(item) {
    const id = String(item.id || "").trim();
    const name = formatPromptName(item.name);
    return id === "2330" || name.includes("台積電");
}

export function filterPromptStocks(list) {
    return list.filter(s => !isPromptExcludedStock(s));
}

export function formatPromptDate(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
}

export function getNewsSearchStartStr(ts) {
    const d = new Date(ts);
    d.setMonth(d.getMonth() - 3);
    return formatPromptDate(d.getTime());
}

export function getAnalysisDateLabel() {
    const endTs = currentReferenceTimestamp || Date.now();
    if (currentAvgDays <= 1 || !currentAnalysisPeriodStart || currentAnalysisPeriodStart >= endTs) {
        return formatPromptDate(endTs);
    }
    return `${formatPromptDate(currentAnalysisPeriodStart)} ~ ${formatPromptDate(endTs)}`;
}

export function getOverviewListLabel() {
    return currentAvgDays <= 1 ? "今日強勢標的" : `近${currentAvgDays}日強勢標的`;
}

export function buildPromptGroupRulesBlock(newsSearchStart, newsSearchEnd, stockCount) {
    return `## 搜尋要求

請聯網搜尋最新重大財經新聞, 產業趨勢, 題材動態及供需/技術突破訊息.

> ⚠️ **實戰分組與「強關聯過濾」核心原則**  
> 請嚴格對照以下 **指定核心主流族群** 進行審視與歸類. 若個股實質符合任一族群的技術, 供應鏈, 轉型材料或資金炒作邏輯, 請優先歸入該組.

## 任務

你是財經專家, 請依下方邏輯協助完成以上股票分類.

## 分類演算法(邏輯如下)

\`\`\`python
def classify_stock(stock_id, retry=False):
    news = get_news(stock_id)
    cls = get_most_important_classification(news)
    return cls if cls in range(1, 12) else "其他"

results = {sid: classify_stock(sid) for sid in stock_ids}

# 針對「其他」進行第二次嘗試
for sid, cls in results.items():
    if cls == "其他":
results[sid] = classify_stock(sid, retry=True)
\`\`\`

## 指定核心主流族群

### 1. AI伺服器

- **系統與整機:** AI 伺服器整機(如機架式, 櫃式系統), HGX/MGX 系統架構, NVLink 運算節點, AI 伺服器主機板(Motherboard), CPU/GPU 載板(Baseboard)
- **關鍵核心零組件:** AI 伺服器專用機殼(4U/6U 以上高密度規格), 高階滑軌(承重及盲插抽換規格), PCIe Gen 5/Gen 6 高速擴充槽, 高功率厚銅板(Heavy Copper PCB)

### 2. 液冷散熱

- **水冷系統組件:** 液冷板(Cold Plate), 冷卻分流歧管(Manifold), CDU(冷卻分配裝置), 快速接頭(Quick Disconnect), 防漏連接管路
- **氣冷與浸沒式:** 3D VC(三維蒸汽腔)散熱模組, 高風壓/高風量散熱風扇, 浸沒式液冷槽(Immersion Cooling Tank), 介電冷卻液(Dielectric Coolant)

### 3. BBU供電

- **電池核心材料與電芯:** 磷酸鋰鐵(LFP)正極材料, 高安全性電解液, 高導電性添加劑, 高倍率放電儲能電芯
- **管理與控制系統:** BBU 專用電池管理系統(BMS)晶片與模組, 高功率密度電源供應器(PSU), BBU 控制板與微控制器(MCU)
- **機構與連接組件:** 高電流專用連接器, 低阻抗重載線束, BBU 專用金屬機箱與微型散熱部件

### 4. 高階PCB與半導體上游材料

- **電子級玻璃纖維紗/布:** Low Dk / Low Df(低介電), Ultra Low Dk 玻璃纖維布(如 L-Glass, NE-Glass 規格), 開纖布, 超薄型電子級玻纖布
- **高階銅箔(Copper Foil):** VLP(Very Low Profile), HVLP(Hyper Very Low Profile), RTF(Reverse Treated Foil, 反轉銅箔), 超薄電解銅箔(低於 9 微米), 壓延銅箔
- **高階銅箔基板(CCL)與載板(Substrate):** Ultra Low Loss, Super Ultra Low Loss 等級之高頻高速 CCL; ABF(Ajinomoto Build-up Film)增層膜載板, 高階 BT 載板
- **軟板與特殊材料:** 高階 FCCL(軟性銅箔基板), 低介電改質聚醯亞胺薄膜(Modified PI / MPI), LCP(液晶聚合物)薄膜

### 5. 矽光子與高速傳輸 CPO SOI LPO

- **晶圓與基板材料:** SOI(Silicon-on-Insulator, 絕緣層上矽)晶圓, GaAs(砷化鎵)/ InP(磷化銦)等三五族半導體材料
- **光電核心元件:** CPO(共同封裝光學)模組, 光收發器(Optical Transceiver 800G/1.6T 規格), EEL(邊射型雷射)/ VCSEL(垂直共振腔面射型雷射)晶片
- **光路與測試組件:** FA(Fiber Array, 光纖陣列), 高精密微透鏡(Micro-lens), 矽光專用高頻測試探針台與晶圓級光學測試設備

### 6. 記憶體

- **高頻寬與新世代記憶體:** HBM(High Bandwidth Memory, 高頻寬記憶體)晶片, DDR5 / LPDDR5X 記憶體顆粒, CXL(Compute Express Link)記憶體模組與擴充控制晶片
- **基礎晶圓與封裝材料:** HBM 堆疊專用 TSV(矽穿孔)材料, 極薄晶圓研磨拋光材料, 高階下填膠(Underfill)及環氧樹脂模塑料(EMC)

### 7. 低軌衛星

- **地面站接收設備:** 使用者終端設備(User Terminal), 相位陣列天線(Phase Array Antenna), 高頻低雜訊放大器(LNA), 衛星追蹤控制模組
- **衛星機載酬載與通訊:** 太空級通訊板(Space-grade PCB), 高頻微波元件, 射頻前端模組(RF FEM), 衛星電源管理系統

### 8. AI ASIC

- **特殊應用晶片客製化:** AI 專用 ASIC 晶片設計(前端/後端 NRE), 高階 IP 授權(如 PCIe Gen 6, HBM3/4 介面, 高速 SerDes), 晶圓代工與先進封裝(CoWoS/SoIC)委託服務(Turnkey)

### 9. Edge AI

- **終端裝置運算晶片:** 整合 NPU(網路處理單元)之 AI PC 處理器, AI 手機應用處理器(AP), 車載 AI 晶片
- **邊緣端軟硬體組件:** 低功耗邊緣推論模組, 嵌入式 AI 視覺感測器, 終端微型記憶體模組

### 10. 面板級封裝 FOPLP

- **特殊基板與材料:** TGV(Through Glass Via, 玻璃通孔)技術基板, 大面積玻璃載板(Carrier Glass), 專用剝離層材料(Release Layer), 高頻封裝模塑料(EMC)
- **高精密製程設備:** 大面積高均勻度電鍍機, 面板級步進式曝光機(Stepper), 雷射剝離機(Laser Lift-off), 精準晶片黏結機(Die Bonder)

### 11. 綠能重電

- **電網與輸配電系統:** 特高壓/高壓變壓器(如 345kV 規格), 氣體絕緣開關(GIS), 配電盤, 智慧電網控制系統
- **儲能與綠能基礎設施:** MW(百萬瓦)級表前儲能系統, 電網級逆變器(Inverter), 高壓直流輸電(HVDC)關鍵組件

### 12. 其他

> 注意: 此組僅限完全與上述 11 項 AI 科技無實質關聯的傳統或政策標的(如純航運, 純營建, 純政策綠能). 禁止將任何有科技轉型預期的個股混入此組.

## 分組鐵律

1. 組別須實質相關, 禁止硬湊無關個股.
2. 直接依下方輸出格式作答, 禁止前言, 摘要, 推理過程或其他多餘文字.
3. 禁止引用營收, 財報, EPS, 本益比, 等基本面; 僅依新聞題材, 產業動態, 產品/技術進展分類.
4. 每檔須標註「已證實事實」或「市場預期/傳言」(「其他」組除外).
5. 禁止用證交所產業分類分組(例: 台玻不等於玻璃業).
6. 👑 **領頭羊** 須依我給的標的順序(成交量大到小)選定.
7. 一檔僅可進入一個族群, 選擇由多數新聞決定.
8. 新聞僅限 **${newsSearchStart} ~ ${newsSearchEnd}**.
9. 禁止自創族群, 僅能使用上述 12 類.
10. 已分入前 11 類者, 不得再進「其他」.
11. 傳統/跨界標的(如 LED, 玻璃, PCB, 光學, 封測)勿依歷史主業歸類; 須查 Touch Taiwan/Computex, 展會及新品發布新聞, 若涉光通訊, 矽光子, AI 材料, BBU 等, 優先歸對應 AI 族群, 禁止直接丟「其他」.
12. 分組以新聞為主, 禁止臆測.
13. 對歸類為「其他」者, 須依上方演算法執行 retry 第二次分類後再定案.

## 📤 輸出格式(嚴格簡明化, 禁止多餘文字)

### [族群名稱A]

* 👑 **領頭羊**: 股票名稱 (代表性產品) - [已證實事實/市場預期] 簡短一句產品/題材亮點
* 股票名稱B (代表性產品) - [已證實事實/市場預期] 簡短亮點

### [族群名稱B]

* 👑 **領頭羊**: 股票名稱 (代表性產品) - [已證實事實/市場預期] 簡短亮點

### [其他]

股票名稱X (代表性產品), 股票名稱Y (代表性產品), 股票名稱Z (代表性產品)

---

**※ 確保全部 ${stockCount} 個股票歸類完畢, 邏輯嚴密, 絕不遺漏.**`;
}

export function buildOverviewPromptTemplate(analysisDate, listLabel, newsSearchStart, newsSearchEnd, stockLine, stockCount) {
    return `# 強勢標的分組分析

**分析日期:** ${analysisDate}  
**標的類型:** ${listLabel}

## 標的清單

${stockLine}

${buildPromptGroupRulesBlock(newsSearchStart, newsSearchEnd, stockCount)}`;
}

export function buildSurgePromptTemplate(analysisDate, newsSearchStart, newsSearchEnd, stockLine, stockCount) {
    return `# 量能異常標的分組分析

**分析日期:** ${analysisDate}  
**標的類型:** 量能異常標的

## 標的清單

${stockLine}

${buildPromptGroupRulesBlock(newsSearchStart, newsSearchEnd, stockCount)}`;
}

export function copyOverviewStockList() {
    const list = filterPromptStocks(currentStrongList);
    if (!list.length) return showToast("無強勢清單");
    const text = list.map(s => `${s.id} ${formatPromptName(s.name)}`).join(', ');
    copyToClipboard(text, '清單已複製！');
}

export function copyOverviewPrompt() {
    const promptList = filterPromptStocks(currentStrongList);
    if (!promptList.length) return showToast("無強勢清單");
    const ts = currentReferenceTimestamp || Date.now();
    const analysisDate = getAnalysisDateLabel();
    const newsSearchEnd = formatPromptDate(ts);
    const newsSearchStart = getNewsSearchStartStr(ts);
    const stockLine = promptList.map(s => `${s.id} ${formatPromptName(s.name)}`).join(', ');
    copyToClipboard(buildOverviewPromptTemplate(analysisDate, getOverviewListLabel(), newsSearchStart, newsSearchEnd, stockLine, promptList.length));
}
export function copySurgePrompt() {
    const promptList = filterPromptStocks(currentSurgeList);
    if (!promptList.length) return showToast("無名單");
    const ts = currentReferenceTimestamp || Date.now();
    const analysisDate = formatPromptDate(ts);
    const newsSearchEnd = analysisDate;
    const newsSearchStart = getNewsSearchStartStr(ts);
    const stockLine = promptList.map(s => `${s.id} ${formatPromptName(s.name)} (爆發 ${s.ratio.toFixed(2)} 倍)`).join(', ');
    copyToClipboard(buildSurgePromptTemplate(analysisDate, newsSearchStart, newsSearchEnd, stockLine, promptList.length));
}
export function copyToClipboard(text, toastMsg = '指令已複製！') { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); showToast(toastMsg); }
export function viewStock(id) {
    if (stockSelectInstance) stockSelectInstance.setValue(id);
    else updatePriceTrend(id);
    const chartSection = document.getElementById('shared-stock-analysis');
    if (chartSection) chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 💎 初始化與自動監聽
 */
export async function initApp() {
    const today = new Date().toISOString().split('T')[0];
    const deadlineInput = document.getElementById('param-deadline');
    if (deadlineInput) deadlineInput.value = today;

    // 自動綁定參數更新事件：數值變動立即分析
    const paramIds = ['param-deadline', 'param-change-pct', 'param-min-threshold-overview', 'param-avg-days-overview', 'param-surge-ratio', 'param-recent-days', 'param-min-avg-vol'];
    paramIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventType = el.type === 'date' ? 'change' : 'input';
            el.addEventListener(eventType, () => { 
                if(db) {
                    tryAnalyze();
                    // 💎 動態更新表頭文字
                    if(id === 'param-avg-days-overview') {
                        const days = parseInt(el.value) || 1;
                        document.getElementById('th-dynamic-gain').innerText = days > 1 ? `波段漲幅` : `單日漲幅`;
                        const mode = document.body.getAttribute('data-mode');
                        document.getElementById('th-dynamic-metric').innerText = mode === 'value' ? (days > 1 ? `平均成交金額(百萬)` : `成交金額(百萬)`) : (days > 1 ? `平均成交量` : `成交量`);
                    }
                }
            });
        }
    });

    initFavoriteButtonDelegation();
    syncAccessKeyInputs();
    renderFavoritesSection();
    const modalKeyInput = document.getElementById('access-key-modal-input');
    if (modalKeyInput) {
        modalKeyInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') submitAccessKeyModal();
        });
    }

    refreshIcons();
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !db) return;
        if (getLiveQuoteApiBase() && getLiveQuoteAccessKey()) {
            if (isActiveTradingSession()) refreshLiveQuotes();
            else if (!liveQuoteOffSessionDone) refreshLiveQuotes();
        }
    });
    window.addEventListener('beforeunload', stopDataRefresh);
    if (requiresAccessKey() && !getLiveQuoteAccessKey()) {
        showWelcomeWaitingForKey();
        showAccessKeyModal();
    } else {
        await fetchRemoteDatabase();
    }
}

