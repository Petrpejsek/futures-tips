import type { Kline, MarketRawSnapshot } from './market_raw'

export type CoinFeat = {
  ema20_H4: number | null
  ema50_H4: number | null
  ema200_H4: number | null
  ema20_H1: number | null
  ema50_H1: number | null
  ema200_H1: number | null
  rsi_H1: number | null
  atr_pct_H1: number | null
  vwap_rel_H1: number | null
  vwap_rel_M15: number | null
  adx_H1: number | null
  flags: {
    H1_above_VWAP: boolean | null
    H4_ema50_gt_200: boolean | null
  }
}

export type EmaOrder =
  | '20>50>200'
  | '20>200>50'
  | '50>20>200'
  | '50>200>20'
  | '200>20>50'
  | '200>50>20'

export type CoinRow = {
  symbol: string
  price: number | null
  atr_pct_H1: number | null
  volume24h_usd: number | null
  ema_order_H1: EmaOrder | null
  ema_order_M15: EmaOrder | null
  RSI_M15: number | null
  vwap_rel_M15: number | null
  funding: number | null
  OI_chg_1h: number | null
  OI_chg_4h: number | null
}

export type FeaturesSnapshot = {
  timestamp: string
  btc: CoinFeat
  eth: CoinFeat
  universe: CoinRow[]
  breadth: { pct_above_EMA50_H1: number }
  warnings?: string[]
}


