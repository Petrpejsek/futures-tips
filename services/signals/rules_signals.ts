import Ajv from 'ajv'
import schema from '../../schemas/signal_set.schema.json'
import type { FeaturesSnapshot, CoinRow } from '../../types/features'
import type { MarketDecision } from '../decider/rules_decider'

const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema as any)

export type SignalSetup = {
  symbol: string
  mode: 'intraday' | 'swing'
  side: 'LONG' | 'SHORT'
  entry: string
  sl: string
  tp: string[]
  trailing: string
  sizing: { risk_pct: number }
  expires_in_min: number
  why: string[]
}

export type SignalSet = { setups: SignalSetup[] }

export function buildSignalSet(f: FeaturesSnapshot, decision: MarketDecision, candidates: CoinRow[]): SignalSet {
  const setups: SignalSetup[] = []
  for (const r of candidates) {
    const isLong = r.ema_order_H1 === '20>50>200' && (r.vwap_rel_M15 ?? 0) > 0 && (r.RSI_M15 ?? 0) >= 45 && (r.RSI_M15 ?? 0) <= 70
    const isShort = r.ema_order_H1 === '200>50>20' && (r.vwap_rel_M15 ?? 0) < 0 && (r.RSI_M15 ?? 0) >= 30 && (r.RSI_M15 ?? 0) <= 55
    if (!isLong && !isShort) continue
    const side = isLong ? 'LONG' : 'SHORT'
    const risk_pct = decision.flag === 'OK' ? 0.7 : 0.5
    const entry = 'limit @ last_close'
    const sl = isLong ? '1.0x ATR(H1) below' : '1.0x ATR(H1) above'
    const tp = ['1.0R','1.8R','3.0R']
    const trailing = '1x ATR after TP1'
    const why: string[] = []
    if (isLong) why.push('trend up (EMA order)')
    if (isShort) why.push('trend down (EMA order)')
    if ((r.vwap_rel_M15 ?? 0) > 0) why.push('above VWAP')
    if ((r.vwap_rel_M15 ?? 0) < 0) why.push('below VWAP')
    if ((r.RSI_M15 ?? 0) >= 45 && (r.RSI_M15 ?? 0) <= 70) why.push('RSI ok')
    if ((r.RSI_M15 ?? 0) >= 30 && (r.RSI_M15 ?? 0) <= 55) why.push('RSI ok')
    const setup: SignalSetup = { symbol: r.symbol, mode: 'intraday', side, entry, sl, tp, trailing, sizing: { risk_pct }, expires_in_min: 45, why: why.slice(0,3) }
    setups.push(setup)
  }
  const set: SignalSet = { setups: setups.slice(0, 3) }
  const ok = validate(set as any)
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn('SignalSet validation failed', validate.errors)
    return { setups: [] }
  }
  return set
}


