import type { FeaturesSnapshot, CoinRow } from '../../types/features'
import type { MarketDecision } from '../decider/rules_decider'

export function selectCandidates(f: FeaturesSnapshot, decision: MarketDecision): CoinRow[] {
  if (decision.flag === 'NO-TRADE') return []
  const score = (r: CoinRow): number => {
    let s = 0
    if (r.ema_order_H1 === '20>50>200') s += 2
    if (r.ema_order_M15 === '20>50>200') s += 1
    if ((r.vwap_rel_M15 ?? 0) > 0) s += 1
    if (r.ema_order_H1 === '200>50>20') s -= 2
    if (r.ema_order_M15 === '200>50>20') s -= 1
    if ((r.vwap_rel_M15 ?? 0) < 0) s -= 1
    // liquidity tiebreaker
    const liq = (r.volume24h_usd ?? 0)
    return s * 1e12 + liq
  }
  const sorted = [...f.universe].sort((a, b) => score(b) - score(a))
  return sorted.slice(0, 3)
}


