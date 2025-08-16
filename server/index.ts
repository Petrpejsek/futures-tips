import { Agent, setGlobalDispatcher } from 'undici'
import { buildMarketRawSnapshot } from './fetcher/binance'
import { WsCollector } from './ws/wsCollector'
import { setCollector } from './ws/registry'
import { performance } from 'node:perf_hooks'
import http from 'node:http'

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


