import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { MarketDecision } from './rules_decider'
import { decideFromFeatures } from './rules_decider'
import type { FeaturesSnapshot } from '../../types/features'
import type { MarketCompact } from './market_compact'
import decisionSchema from '../../schemas/market_decision.schema.json'
import compactSchema from '../../schemas/market_compact.schema.json'

const ajv = new Ajv({ allErrors: true, removeAdditional: true })
addFormats(ajv)
const validateDecision = ajv.compile(decisionSchema as any)
const validateCompact = ajv.compile(compactSchema as any)

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

export async function decideMarketStrict(opts: {
  mode: 'gpt' | 'mock'
  compact: MarketCompact
  features: FeaturesSnapshot
  openaiKey?: string | null
  timeoutMs: number
}): Promise<MarketDecision> {
  const { mode, compact, features, openaiKey, timeoutMs } = opts
  if (mode !== 'gpt') {
    return decideFromFeatures(features)
  }

  if (!validateCompact(compact)) {
    return failClosed('compact_invalid')
  }

  if (!openaiKey) {
    return failClosed('no_api_key')
  }

  try {
    const { OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: openaiKey })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const sys = `You are a market decider. Output strict JSON only, matching provided schema. No markdown.`
    const user = JSON.stringify(compact)

    const resp = await client.chat.completions.create({
      model: 'gpt-5',
      temperature: 0.1,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      signal: controller.signal as any,
    } as any)
    clearTimeout(timer)

    const text = resp.choices?.[0]?.message?.content || ''
    if (!text) return failClosed('empty_response')

    let parsed: any
    try { parsed = JSON.parse(text) } catch { return failClosed('parse_error') }

    if (!validateDecision(parsed)) {
      return failClosed('schema_invalid')
    }
    return parsed as MarketDecision
  } catch (e: any) {
    if (e?.name === 'AbortError') return failClosed('timeout')
    return failClosed('api_error')
  }
}


