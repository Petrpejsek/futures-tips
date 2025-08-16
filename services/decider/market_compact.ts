import type { FeaturesSnapshot } from '../../types/features'
import type { MarketRawSnapshot } from '../../types/market_raw'

export type MarketCompact = {
  timestamp: string
  feeds_ok: boolean
  breadth_pct_H1: number
  avg_volume24h_usd_topN: number
  data_warnings: string[]
  btc: {
    ema50_H4_gt_200_H4: boolean
    ema20_H1: number | null
    ema50_H1: number | null
    ema200_H1: number | null
    rsi_H1: number | null
    atr_pct_H1: number | null
    vwap_rel_H1: number | null
    above_VWAP_H1: boolean | null
  }
  eth: {
    ema50_H4_gt_200_H4: boolean
    ema20_H1: number | null
    ema50_H1: number | null
    ema200_H1: number | null
    rsi_H1: number | null
    atr_pct_H1: number | null
    vwap_rel_H1: number | null
    above_VWAP_H1: boolean | null
  }
}

export function buildMarketCompact(features: FeaturesSnapshot, snapshot: MarketRawSnapshot): MarketCompact {
  const avgVol = (() => {
    const vols = snapshot.universe
      .map(u => u.volume24h_usd ?? 0)
      .filter(v => Number.isFinite(v) && v > 0)
    if (vols.length === 0) return 0
    const sum = vols.reduce((a, b) => a + b, 0)
    return sum / vols.length
  })()

  const dataWarnings = Array.isArray(snapshot.data_warnings) ? snapshot.data_warnings.slice(0, 10) : []

  const safeNum = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const safeBool = (v: any): boolean | null => (typeof v === 'boolean' ? v : null)

  return {
    timestamp: features.timestamp,
    feeds_ok: !!snapshot.feeds_ok,
    breadth_pct_H1: Math.max(0, Math.min(100, features.breadth.pct_above_EMA50_H1)),
    avg_volume24h_usd_topN: Math.max(0, Number.isFinite(avgVol) ? avgVol : 0),
    data_warnings: dataWarnings,
    btc: {
      ema50_H4_gt_200_H4: !!features.btc.flags.H4_ema50_gt_200,
      ema20_H1: safeNum(features.btc.ema20_H1),
      ema50_H1: safeNum(features.btc.ema50_H1),
      ema200_H1: safeNum(features.btc.ema200_H1),
      rsi_H1: safeNum(features.btc.rsi_H1),
      atr_pct_H1: safeNum(features.btc.atr_pct_H1),
      vwap_rel_H1: safeNum(features.btc.vwap_rel_H1),
      above_VWAP_H1: safeBool(features.btc.flags.H1_above_VWAP),
    },
    eth: {
      ema50_H4_gt_200_H4: !!features.eth.flags.H4_ema50_gt_200,
      ema20_H1: safeNum(features.eth.ema20_H1),
      ema50_H1: safeNum(features.eth.ema50_H1),
      ema200_H1: safeNum(features.eth.ema200_H1),
      rsi_H1: safeNum(features.eth.rsi_H1),
      atr_pct_H1: safeNum(features.eth.atr_pct_H1),
      vwap_rel_H1: safeNum(features.eth.vwap_rel_H1),
      above_VWAP_H1: safeBool(features.eth.flags.H1_above_VWAP),
    },
  }
}

