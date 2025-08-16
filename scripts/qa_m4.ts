import { promises as fs } from 'node:fs'
import path from 'node:path'
import { selectCandidates } from '../services/signals/candidate_selector'
import { buildSignalSet } from '../services/signals/rules_signals'
import type { FeaturesSnapshot } from '../types/features'
import type { MarketRawSnapshot } from '../types/market_raw'
import { decideFromFeatures } from '../services/decider/rules_decider'

async function readLatest(dir: string): Promise<string | null> {
  try {
    const abs = path.resolve(process.cwd(), dir)
    const files = (await fs.readdir(abs)).filter(f => f.endsWith('.json')).map(f => path.join(abs, f))
    if (!files.length) return null
    const stats = await Promise.all(files.map(async f => ({ f, s: await fs.stat(f) })))
    stats.sort((a,b)=>b.s.mtimeMs - a.s.mtimeMs)
    return stats[0].f
  } catch { return null }
}

async function main() {
  const fPath = (await readLatest('fixtures/features')) || ''
  const sPath = (await readLatest('fixtures/market_raw')) || ''
  if (!fPath || !sPath) {
    console.log('QA_M4_GO: NO | missing fixtures')
    return
  }
  const feats: FeaturesSnapshot = JSON.parse(await fs.readFile(fPath, 'utf8'))
  const snap: MarketRawSnapshot = JSON.parse(await fs.readFile(sPath, 'utf8'))
  const dec = decideFromFeatures(feats)
  const cands = selectCandidates(feats, dec)
  const set = buildSignalSet(feats, dec, cands)
  const ok = Array.isArray(set.setups) && set.setups.length <= 3 && set.setups.every(s => s.mode === 'intraday')
  console.table({ setups: set.setups.length, modeOk: set.setups.every(s=>s.mode==='intraday') })
  console.log(`QA_M4_GO: ${ok ? 'YES' : 'NO'}`)
}

main().catch(e => { console.error('QA_M4 error', e); process.exit(1) })


