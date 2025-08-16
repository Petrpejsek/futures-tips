import { Agent, setGlobalDispatcher } from 'undici'
import { buildMarketRawSnapshot } from './fetcher/binance'
import { WsCollector } from './ws/wsCollector'
import { setCollector } from './ws/registry'
import { performance } from 'node:perf_hooks'
import http from 'node:http'
import { decideMarketStrict } from '../services/decider/market_decider_gpt'
import { preflightCompact } from '../services/decider/market_compact'
import deciderCfg from '../config/decider.json'

setGlobalDispatcher(new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 60_000, pipelining: 10 }))

const PORT = 8788
const wsCollector = new WsCollector({ coreSymbols: ['BTCUSDT','ETHUSDT'], altSymbols: [] })
wsCollector.start()
setCollector(wsCollector)

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/api/health') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (url.pathname === '/api/ws/health') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(wsCollector.health()))
      return
    }
    if (url.pathname === '/api/snapshot') {
      res.setHeader('Cache-Control', 'no-store')
      const t0 = performance.now()
      try {
        const snapshot = await buildMarketRawSnapshot()
        ;(snapshot as any).duration_ms = Math.round(performance.now() - t0)
        delete (snapshot as any).latency_ms
        const body = JSON.stringify(snapshot)
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(body)
      } catch (err: any) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        const stack = typeof err?.stack === 'string' ? String(err.stack).split('\n').slice(0, 3) : []
        res.end(JSON.stringify({
          error: err?.message || 'INTERNAL_ERROR',
          stage: err?.stage || 'unknown',
          symbol: err?.symbol || null,
          stack
        }))
      }
      return
    }
    
    if (url.pathname === '/api/decide' && req.method === 'POST') {
      try {
        const mode = String(process.env.DECIDER_MODE || 'mock').toLowerCase()
        if (mode === 'gpt' && !process.env.OPENAI_API_KEY) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ flag: 'NO-TRADE', posture: 'RISK-OFF', market_health: 0, expiry_minutes: 30, reasons: ['gpt_error:no_api_key'], risk_cap: { max_concurrent: 0, risk_per_trade_max: 0 } }))
          return
        }
        const chunks: Buffer[] = []
        for await (const ch of req) chunks.push(ch as Buffer)
        const bodyStr = Buffer.concat(chunks).toString('utf8')
        const compact = bodyStr ? JSON.parse(bodyStr) : null
        if (!compact || typeof compact !== 'object') {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ flag: 'NO-TRADE', posture: 'RISK-OFF', market_health: 0, expiry_minutes: 30, reasons: ['gpt_error:bad_request'], risk_cap: { max_concurrent: 0, risk_per_trade_max: 0 } }))
          return
        }
        const pf = preflightCompact(compact)
        if (!pf.ok) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ flag: 'NO-TRADE', posture: 'RISK-OFF', market_health: 0, expiry_minutes: 30, reasons: [`gpt_error:${pf.reason}`], risk_cap: { max_concurrent: 0, risk_per_trade_max: 0 } }))
          return
        }
        const decision = await decideMarketStrict({ mode: mode as any, compact, features: {} as any, openaiKey: process.env.OPENAI_API_KEY || '', timeoutMs: (deciderCfg as any)?.timeoutMs || 8000 })
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(decision))
      } catch (e: any) {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ flag: 'NO-TRADE', posture: 'RISK-OFF', market_health: 0, expiry_minutes: 30, reasons: [`gpt_error:${e?.code||e?.name||'unknown'}`], risk_cap: { max_concurrent: 0, risk_per_trade_max: 0 } }))
      }
      return
    }
    res.statusCode = 404
    res.end('Not found')
  } catch (e: any) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: e?.message ?? 'Internal error' }))
  }
})

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})


