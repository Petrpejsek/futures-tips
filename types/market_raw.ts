export type Kline = {
  openTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: string
}

export type KlineSet = {
  H4?: Kline[]
  H1?: Kline[]
  M15?: Kline[]
}

export type ExchangeFilters = Record<string, {
  tickSize: number
  stepSize: number
  minQty: number
  minNotional: number
}>

export type UniverseItem = {
  symbol: string
  klines: {
    H1?: Kline[]
    M15?: Kline[]
  }
  funding?: number
  oi_now?: number
  oi_hist?: Array<{ timestamp: string; value: number }>
  depth1pct_usd?: number
  spread_bps?: number
  volume24h_usd?: number
}

export type MarketRawSnapshot = {
  timestamp: string
  latency_ms?: number
  duration_ms?: number
  feeds_ok: boolean
  data_warnings: string[]
  btc?: {
    klines: KlineSet
    funding?: number
    oi_now?: number
    oi_hist?: Array<{ timestamp: string; value: number }>
  }
  eth?: {
    klines: KlineSet
    funding?: number
    oi_now?: number
    oi_hist?: Array<{ timestamp: string; value: number }>
  }
  universe: UniverseItem[]
  exchange_filters: ExchangeFilters
}

