import config from '../../config/fetcher.json'
import type { MarketRawSnapshot, Kline, ExchangeFilters, UniverseItem } from '../../types/market_raw'
import { getCollector } from '../ws/registry'
import { WsCollector } from '../ws/wsCollector'
import { calcDepthWithin1PctUSD, calcSpreadBps, clampSnapshotSize, toNumber, toUtcIso } from '../../services/fetcher/normalize'
import { request } from 'undici'
import { ttlGet, ttlSet, makeKey } from '../lib/ttlCache'

const BASE_URL = 'https://fapi.binance.com'

type RetryConfig = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

async function sleep(ms: number): Promise<void> { return new Promise(res => setTimeout(res, ms)) }

async function withRetry<T>(fn: () => Promise<T>, retryCfg: RetryConfig): Promise<T> {
  let attempt = 0
  let lastError: any
  while (attempt < retryCfg.maxAttempts) {
    try { return await fn() } catch (e) { lastError = e; attempt += 1; if (attempt >= retryCfg.maxAttempts) break; const delay = Math.min(retryCfg.baseDelayMs * Math.pow(2, attempt - 1), retryCfg.maxDelayMs); await sleep(delay) }
  }
  throw lastError
}

async function httpGet(path: string, params?: Record<string, string | number>): Promise<any> {
  const qs = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`
  const ac = new AbortController()
  const to = setTimeout(() => ac.abort(), config.timeoutMs ?? 6000)
  try {
    const { body, statusCode } = await request(url, { method: 'GET', signal: ac.signal })
    if (statusCode < 200 || statusCode >= 300) throw new Error(`HTTP ${statusCode} ${path}`)
    const text = await body.text()
    return JSON.parse(text)
  } finally {
    clearTimeout(to)
  }
}

async function httpGetCached(path: string, params: Record<string, string | number> | undefined, ttlMs: number): Promise<any> {
  const key = makeKey(path, params)
  const hit = ttlGet<any>(key)
  if (hit) return hit
  const data = await httpGet(path, params)
  ttlSet(key, data, ttlMs)
  return data
}

async function getServerTime(): Promise<number> {
  const data = await withRetry(() => httpGet('/fapi/v1/time'), config.retry)
  const serverTime = toNumber(data?.serverTime)
  if (!serverTime) throw new Error('Invalid serverTime')
  return serverTime
}

type ExchangeInfoSymbol = {
  symbol: string
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; minQty?: string; notional?: string; minNotional?: string }>
  status: string
  contractType?: string
  quoteAsset?: string
}

let exchangeInfoCache: ExchangeFilters | null = null
async function getExchangeInfo(): Promise<ExchangeFilters> {
  if (exchangeInfoCache) return exchangeInfoCache
  const data = await withRetry(() => httpGetCached('/fapi/v1/exchangeInfo', undefined, (config as any).cache?.exchangeInfoMs ?? 600000), config.retry)
  const symbols: ExchangeInfoSymbol[] = Array.isArray(data?.symbols) ? data.symbols : []
  const filters: ExchangeFilters = {}
  for (const s of symbols) {
    if (s.status !== 'TRADING') continue
    if (s.contractType && s.contractType !== 'PERPETUAL') continue
    if (s.quoteAsset && s.quoteAsset !== 'USDT') continue
    const priceFilter = s.filters.find(f => f.filterType === 'PRICE_FILTER')
    const lotSize = s.filters.find(f => f.filterType === 'LOT_SIZE')
    const minNotional = s.filters.find(f => f.filterType === 'MIN_NOTIONAL')
    const tickSize = toNumber(priceFilter?.tickSize)
    const stepSize = toNumber(lotSize?.stepSize)
    const minQty = toNumber(lotSize?.minQty)
    const minNot = toNumber((minNotional?.notional ?? minNotional?.minNotional) as any)
    if (!tickSize || !stepSize || !minQty || !minNot) continue
    filters[s.symbol] = { tickSize, stepSize, minQty, minNotional: minNot }
  }
  exchangeInfoCache = filters
  return filters
}

async function getTopNUsdtSymbols(n: number): Promise<string[]> {
  const data = await withRetry(() => httpGetCached('/fapi/v1/ticker/24hr', undefined, (config as any).cache?.ticker24hMs ?? 30000), config.retry)
  const entries = Array.isArray(data) ? data : []
  const filtered = entries.filter((e: any) => e?.symbol?.endsWith('USDT'))
  const sorted = filtered.sort((a: any, b: any) => {
    const va = Number(a.quoteVolume)
    const vb = Number(b.quoteVolume)
    if (vb !== va) return vb - va
    return String(a.symbol).localeCompare(String(b.symbol))
  })
  const unique = Array.from(new Set(sorted.map((e: any) => e.symbol)))
  return unique.slice(0, n)
}

async function getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  const run = () => httpGetCached('/fapi/v1/klines', { symbol, interval, limit }, (config as any).cache?.klinesMs ?? 30000)
  let raw: any
  try {
    raw = await withRetry(run, config.retry)
  } catch (e) {
    if (interval === '1h') {
      const jitter = 200 + Math.floor(Math.random() * 200)
      await sleep(jitter)
      raw = await withRetry(run, { ...config.retry, maxAttempts: 1 })
    } else {
      throw e
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.map((k: any) => ({
    openTime: toUtcIso(k[0])!, open: toNumber(k[1])!, high: toNumber(k[2])!, low: toNumber(k[3])!, close: toNumber(k[4])!, volume: toNumber(k[5])!, closeTime: toUtcIso(k[6])!
  })).filter(k => Number.isFinite(k.open) && Number.isFinite(k.close))
}

async function getFundingRate(symbol: string): Promise<number | undefined> {
  const data = await withRetry(() => httpGet('/fapi/v1/fundingRate', { symbol, limit: 1 }), config.retry)
  if (!Array.isArray(data) || data.length === 0) return undefined
  return toNumber(data[0]?.fundingRate)
}

async function getOpenInterestNow(symbol: string): Promise<number | undefined> {
  const data = await withRetry(() => httpGet('/fapi/v1/openInterest', { symbol }), config.retry)
  return toNumber(data?.openInterest)
}

async function runWithConcurrency<T>(factories: Array<() => Promise<T>>, limit: number): Promise<Array<{ ok: true; value: T } | { ok: false; error: any }>> {
  const results: Array<{ ok: true; value: T } | { ok: false; error: any }> = []
  let idx = 0
  const inFlight: Promise<void>[] = []
  async function runOne(factory: () => Promise<T>) {
    try { const value = await factory(); results.push({ ok: true, value }) } catch (error) { results.push({ ok: false, error }) }
  }
  while (idx < factories.length || inFlight.length > 0) {
    while (idx < factories.length && inFlight.length < limit) {
      const p = runOne(factories[idx++])
      inFlight.push(p)
      p.finally(() => { const i = inFlight.indexOf(p); if (i >= 0) inFlight.splice(i, 1) })
    }
    if (inFlight.length > 0) await Promise.race(inFlight)
  }
  return results
}

// Access running collector via registry (set by server/index.ts)

async function getBarsFromCache(symbol: string, interval: '4h'|'1h'|'15m', need: number): Promise<Kline[]> {
  try {
    const coll = getCollector()
    const bars = coll ? (coll as any).getBars(symbol, interval, need) : []
    if (!Array.isArray(bars) || bars.length === 0) return []
    return bars.map(b => ({
      openTime: new Date(b.openTime).toISOString(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      closeTime: new Date(b.openTime + 1).toISOString()
    }))
  } catch { return [] }
}

async function ensureAtLeastOneH1ForAlts(symbols: string[], signal?: AbortSignal) {
  const alts = symbols.filter(s => s !== 'BTCUSDT' && s !== 'ETHUSDT')
  const tasks = alts.map(sym => async () => {
    const have = await getBarsFromCache(sym, '1h', 1)
    if (have.length > 0) return
    const raw = await httpGetCached('/fapi/v1/klines', { symbol: sym, interval: '1h', limit: 1 }, (config as any).cache?.klinesMs ?? 30000)
    if (Array.isArray(raw) && raw[0]) {
      const k = raw[0]
      const bar = { openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) }
      try { const c = getCollector() as any; c?.ingestClosed(sym, '1h', bar) } catch {}
    }
  })
  await runWithConcurrency(tasks, (config as any).concurrency ?? 16)
}

export async function buildMarketRawSnapshot(): Promise<MarketRawSnapshot> {
  const t0 = Date.now()
  const globalAc = new AbortController()
  const globalTimeout = setTimeout(() => globalAc.abort(), (config as any).globalDeadlineMs ?? 8000)
  const exchangeFilters = await getExchangeInfo()
  const filteredSymbols = Object.keys(exchangeFilters)
  const topN = await getTopNUsdtSymbols(config.universe.topN)
  // update WS alt universe to track H1 for alts
  try { const c = getCollector() as unknown as WsCollector | null; c?.setAltUniverse(topN) } catch {}
  await ensureAtLeastOneH1ForAlts(topN)
  const universeSymbols = topN.filter(s => filteredSymbols.includes(s) && s !== 'BTCUSDT' && s !== 'ETHUSDT').slice(0, config.universe.topN)

  const klinesTasks: Array<() => Promise<any>> = []
  const coreIntervals: string[] = (config as any).klinesCore ?? ['4h','1h','15m']
  const altIntervals: string[] = (config as any).klinesAlt ?? ['1h']
  const addK = (sym: string, itv: string) => klinesTasks.push(async () => {
    const cache = await getBarsFromCache(sym, itv as any, config.candles)
    const k = cache.length >= config.candles ? cache : await getKlines(sym, itv, config.candles)
    return { key: `${sym === 'BTCUSDT' ? 'btc' : sym === 'ETHUSDT' ? 'eth' : sym}.${itv === '4h' ? 'H4' : itv === '1h' ? 'H1' : 'M15'}`, k }
  })
  for (const itv of coreIntervals) addK('BTCUSDT', itv)
  for (const itv of coreIntervals) addK('ETHUSDT', itv)
  for (const sym of universeSymbols) {
    for (const itv of altIntervals) {
      const key = itv === '4h' ? 'H4' : itv === '1h' ? 'H1' : 'M15'
      klinesTasks.push(() => getKlines(sym, itv, config.candles).then(k => ({ key: `${sym}.${key}`, k })))
    }
  }
  const klinesSettled = await runWithConcurrency(klinesTasks, config.concurrency)
  const btc: any = { klines: {} }, eth: any = { klines: {} }
  const uniKlines: Record<string, { H1?: Kline[]; M15?: Kline[]; H4?: Kline[] }> = {}
  for (const s of klinesSettled) {
    if ((s as any).ok) {
      const r = (s as any).value
      const [left, right] = r.key.split('.')
      if (left === 'btc') (btc.klines as any)[right] = r.k
      else if (left === 'eth') (eth.klines as any)[right] = r.k
      else { const sym = left; if (!uniKlines[sym]) uniKlines[sym] = {}; (uniKlines[sym] as any)[right] = r.k }
    }
  }

  // Funding & OI now
  const fundingMap: Record<string, number | undefined> = {}
  const oiNowMap: Record<string, number | undefined> = {}
  const coreSymbols = ['BTCUSDT', 'ETHUSDT']
  const fundingSymbols = (config as any).fundingMode === 'coreOnly' ? coreSymbols : universeSymbols.concat(coreSymbols)
  const oiSymbols = (config as any).openInterestMode === 'coreOnly' ? coreSymbols : universeSymbols.concat(coreSymbols)
  const sideTasks: Array<() => Promise<any>> = []
  for (const s of fundingSymbols) { sideTasks.push(() => getFundingRate(s).then(v => ({ type: 'fund', s, v }))) }
  for (const s of oiSymbols) { sideTasks.push(() => getOpenInterestNow(s).then(v => ({ type: 'oi', s, v }))) }
  const sideSettled = await runWithConcurrency(sideTasks, config.concurrency)
  for (const r of sideSettled) {
    if ((r as any).ok) {
      const v = (r as any).value
      if (v.type === 'fund') fundingMap[v.s] = v.v
      if (v.type === 'oi') oiNowMap[v.s] = v.v
    }
  }

  const latencyMs = Date.now() - t0

  const tickerMap = await (async () => {
    const raw = await withRetry(() => httpGet('/fapi/v1/ticker/24hr'), config.retry)
    const out: Record<string, { volume24h_usd?: number; lastPrice?: number; closeTimeMs?: number }> = {}
    for (const t of raw) {
      const sym = t?.symbol
      if (!sym || !sym.endsWith('USDT')) continue
      out[sym] = { volume24h_usd: toNumber(t?.quoteVolume), lastPrice: toNumber(t?.lastPrice), closeTimeMs: toNumber(t?.closeTime) }
    }
    return out
  })()

  const universe: UniverseItem[] = []
  const hasCore = (sym: 'BTCUSDT'|'ETHUSDT') => {
    const core = uniKlines[sym]
    return !!(core?.H1 && core?.M15 && core?.H4 && core.H1.length && core.M15.length && core.H4.length)
  }
  const hasAlt = (sym: string) => {
    const u = uniKlines[sym]
    return !!(u?.H1 && u.H1.length)
  }
  for (const sym of ['BTCUSDT', 'ETHUSDT']) {
    const core = sym === 'BTCUSDT' ? (btc.klines as any) : (eth.klines as any)
    const coreOkNow = !!(core?.H1 && core?.H4 && core.H1.length && core.H4.length)
    if (!coreOkNow) continue
    const item: UniverseItem = { symbol: sym, klines: { H1: core?.H1, M15: core?.M15, H4: core?.H4 }, funding: fundingMap[sym], oi_now: oiNowMap[sym], oi_hist: [], depth1pct_usd: undefined, spread_bps: undefined, volume24h_usd: tickerMap[sym]?.volume24h_usd }
    if (sym === 'BTCUSDT') (btc as any).funding = item.funding, (btc as any).oi_now = item.oi_now
    if (sym === 'ETHUSDT') (eth as any).funding = item.funding, (eth as any).oi_now = item.oi_now
  }
  for (const sym of universeSymbols) {
    if (!hasAlt(sym)) continue
    const item: UniverseItem = { symbol: sym, klines: { H1: uniKlines[sym]?.H1 }, funding: fundingMap[sym], oi_now: oiNowMap[sym], oi_hist: [], depth1pct_usd: undefined, spread_bps: undefined, volume24h_usd: tickerMap[sym]?.volume24h_usd }
    universe.push(item)
  }

  const latestTimes: number[] = []
  const pushTime = (iso?: string) => { if (iso) latestTimes.push(Date.parse(iso)) }
  for (const arr of [btc.klines?.M15, eth.klines?.M15]) { const last = Array.isArray(arr) ? arr[arr.length - 1] : undefined; pushTime(last?.closeTime) }
  for (const sym of universe) { const last2 = sym.klines?.M15?.[sym.klines?.M15.length - 1]; pushTime(last2?.closeTime) }
  const feedsOk = latestTimes.every(t => (Date.now() - t) <= (config.staleThresholdSec * 1000))

  const snapshot: MarketRawSnapshot = {
    timestamp: new Date().toISOString(),
    latency_ms: latencyMs,
    feeds_ok: feedsOk,
    data_warnings: [],
    btc, eth, universe, exchange_filters: exchangeFilters
  }
  const json = JSON.stringify(snapshot)
  if (!clampSnapshotSize(json, config.maxSnapshotBytes)) throw new Error('Snapshot too large')
  clearTimeout(globalTimeout)
  return snapshot
}


