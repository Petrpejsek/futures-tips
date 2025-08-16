import OpenAI from 'openai'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { MarketDecision } from './rules_decider'
import { decideFromFeatures } from './rules_decider'
import type { FeaturesSnapshot } from '../../types/features'
import type { MarketCompact } from './market_compact'
import decisionSchema from '../../schemas/market_decision.schema.json'
import fs from 'node:fs'
import path from 'node:path'

const ajv = new Ajv({ allErrors: true, removeAdditional: true })
addFormats(ajv)
const validateDecision = ajv.compile(decisionSchema as any)
const cfg = JSON.parse(fs.readFileSync(path.resolve('config/decider.json'), 'utf8'))
const SYSTEM = fs.readFileSync(path.resolve('prompts/market_decider.md'), 'utf8')
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function failClosed(code: string): MarketDecision {
  return {
    flag: 'NO-TRADE',
    posture: 'RISK-OFF',
    market_health: 0,
    expiry_minutes: 30,
    reasons: [`gpt_error:${code}`],
    risk_cap: { max_concurrent: 0, risk_per_trade_max: 0 },
  }
}

export async function decideMarketStrict(opts: { mode: 'gpt' | 'mock'; compact: MarketCompact; features: FeaturesSnapshot; openaiKey?: string | null; timeoutMs: number }): Promise<MarketDecision> {
  const { mode, compact, features, timeoutMs } = opts
  if (mode !== 'gpt') return decideFromFeatures(features)
  // fail-closed if no key
  if (!process.env.OPENAI_API_KEY) return failClosed('no_api_key')
  // Chat Completions JSON mode
  try {
    const model = cfg.model ?? 'gpt-4o-mini'
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' } as any,
      temperature: cfg.temperature ?? 0.1,
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nVrať POUZE čistý JSON dle schématu.` },
        { role: 'user', content: `MarketCompact:\n${JSON.stringify(compact)}` },
      ],
    } as any)
    const outText = completion.choices?.[0]?.message?.content ?? ''
    if (typeof outText !== 'string' || !outText.trim()) throw new Error('openai_empty_output')
    const decision = JSON.parse(outText)
    if (!validateDecision(decision)) throw new Error('schema_invalid:decision')
    return decision as MarketDecision
  } catch (e: any) {
    const mapOpenAIError = (err: any): string => {
      const t = err?.error?.type || err?.name || err?.code || 'unknown'
      const code = err?.error?.code || err?.status || ''
      const raw = String(t).toLowerCase()
      if (raw.includes('invalid_request')) return 'openai_invalid_request'
      if (raw.includes('insufficient_quota')) return 'openai_quota'
      if (raw.includes('rate_limit')) return 'openai_rate_limit'
      if (raw.includes('timeout')) return 'openai_timeout'
      return `openai_${(t || 'unknown')}`.replace(/[^a-z0-9_:-]/gi, '')
    }
    const reason = e?.message?.startsWith('schema_invalid') ? 'gpt_error:schema_invalid:decision' : (e?.name === 'AbortError' ? 'gpt_error:timeout' : `gpt_error:${mapOpenAIError(e)}`)
    console.error('[DECIDER] fail', { reason, status: e?.status, type: e?.error?.type, code: e?.error?.code, msg: String(e?.message || '').slice(0, 160) })
    return {
      flag: 'NO-TRADE', posture: 'RISK-OFF', market_health: 0, expiry_minutes: 30,
      reasons: [reason], risk_cap: { max_concurrent: 0, risk_per_trade_max: 0 }
    }
  }
}


