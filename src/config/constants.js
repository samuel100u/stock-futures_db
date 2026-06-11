export const CANDLE_UP = '#f43f5e';
export const CANDLE_DOWN = '#22c55e';
export const CANDLE_NEUTRAL = '#64748b';
let stockTagsMap = {};
let currentStrongList = [], currentPullbackUniverse = [], currentSurgeList = [], currentReferenceDate = "", currentReferenceTimestamp = 0;
let currentAnalysisPeriodStart = 0, currentAvgDays = 1;
let blacklist = JSON.parse(localStorage.getItem('stock_blacklist') || '[]');
export const FAVORITES_COOKIE_NAME = 'stock_favorites';
export const FAVORITES_COOKIE_DAYS = 365;

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

export const SPOT_PULLBACK_MIN = 0.04;

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
    createIcons();
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
    </div>${priceHtml}<div class="flex flex-wrap gap-1.5 mt-2">${tagHtml}</div>`;
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
export const TRADE_VALUE_M_SQL = `(volume * close * CASE WHEN name LIKE '%小型%' THEN 100 ELSE 2000 END) / 1000000.0`;

/** 即時報價輪詢間隔（毫秒）；僅更新 WASM 記憶體內 db，不寫入本機 market.db */
export const LIVE_QUOTE_REFRESH_MS = 10000;
/** 盤中完整重算排行／題材的間隔（毫秒）；其間只就地更新價格數字 */
export const LIVE_ANALYZE_REFRESH_MS = 120000;
/** 台股即時輪詢時段（台北時間 08:45～13:45）；其餘時段只更新一次 */
export const QUOTE_SESSION_START = { h: 8, m: 45 };
export const QUOTE_SESSION_END = { h: 13, m: 45 };
export const WANTGOO_QUOTES_URL = 'https://www.wantgoo.com/investrue/all-quote-info';
export const WANTGOO_FUTURES_URL = 'https://www.wantgoo.com/futures/all-stock-futures-list';
/**
 * 即時報價代理（本機 file://、GitHub Pages 皆用此網址，免本機 server）。
 * 留空則改為定期重拉下方 GITHUB_DB_URL 的 ZIP。
 */
export const LIVE_QUOTE_API_BASE = 'https://stock-crawer.pages.dev';
export const ACCESS_KEY_COOKIE_NAME = 'live_quote_access_key';
export const ACCESS_KEY_COOKIE_DAYS = 365;
export const GITHUB_DB_URL = 'https://raw.githubusercontent.com/samuel100u/stock-futures_db/main/market.db.zip';
/** GitHub Pages 且未設 Worker 時，重拉雲端 DB 間隔（毫秒）；0 = 關閉 */
export const GITHUB_DB_REFRESH_MS = 120000;
export const SPOT_PULLBACK_MIN = 0.04;
