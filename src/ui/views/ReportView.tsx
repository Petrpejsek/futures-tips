import React, { useMemo } from 'react'
import type { MarketRawSnapshot } from '../../../types/market_raw'
import type { FeaturesSnapshot } from '../../../types/features'
import type { MarketDecision } from '../../../services/decider/rules_decider'
import type { SignalSet } from '../../../services/signals/rules_signals'

type Props = {
  snapshot: MarketRawSnapshot | null
  features: FeaturesSnapshot | null
  decision: MarketDecision | null
  signals: SignalSet | null
  featuresMs: number | null
}

function sizeKB(obj: unknown): number {
  try { return Math.round((new Blob([JSON.stringify(obj)]).size / 1024) * 10) / 10 } catch { return 0 }
}

export const ReportView: React.FC<Props> = ({ snapshot, features, decision, signals, featuresMs }) => {
  const timestamp = snapshot?.timestamp ?? 'n/a'
  const duration = (snapshot as any)?.duration_ms ?? (snapshot as any)?.latency_ms ?? null
  const symbols = snapshot?.universe ? 2 + snapshot.universe.length : null
  const feedsOk = snapshot?.feeds_ok
  const warnings = (features?.warnings ?? []).filter(w => typeof w === 'string')

  const diagDrops = useMemo(() => {
    // vyfiltruj první 20 warnings které začínají na drop:*:alt:*:noH1
    return warnings.filter(w => w.includes('drop:') && w.includes('alt') && w.includes('noH1')).slice(0, 20)
  }, [warnings])

  const onPrint = () => window.print()
  const onCopySummary = async () => {
    const lines: string[] = []
    lines.push(`Time: ${timestamp}`)
    lines.push(`Duration: ${duration ?? 'n/a'} ms`)
    lines.push(`Symbols: ${symbols ?? 'n/a'}`)
    if (decision) {
      lines.push(`Decision: ${decision.flag} | ${decision.posture} | ${decision.market_health}/100 | ${decision.expiry_minutes}m`)
      if (Array.isArray(decision.reasons) && decision.reasons.length) lines.push(`Reasons: ${decision.reasons.join(', ')}`)
    } else {
      lines.push('Decision: n/a')
    }
    const setups = signals?.setups ?? []
    if (setups.length === 0) {
      lines.push('Setups: No setups (NO-TRADE)')
    } else {
      for (const s of setups.slice(0, 3)) {
        lines.push(`Setup: ${s.symbol} ${s.side} ${s.entry} | SL ${s.sl} | TP1 ${s.tp?.[0] ?? 'n/a'}`)
      }
    }
    lines.push(`Diagnostics: feeds_ok=${feedsOk ? 'true' : 'false'}, featuresMs=${featuresMs != null ? Math.round(featuresMs) : 'n/a'}, snapshotKB=${sizeKB(snapshot)}, featuresKB=${sizeKB(features)}, warningsN=${warnings.length}`)
    const txt = lines.join('\n')
    try { await navigator.clipboard.writeText(txt); console.info('Copied summary') } catch {}
  }

  return (
    <div className="report">
      <div className="no-print row gap-8" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onPrint}>Print / Save PDF</button>
        <button className="btn" onClick={onCopySummary}>Copy summary</button>
      </div>
      <section className="section">
        <h3>Summary</h3>
        <div className="row wrap gap-12">
          <span className="pill">Time: {timestamp}</span>
          <span className="pill">Duration: {duration != null ? `${Math.round(duration)} ms` : 'n/a'}</span>
          <span className="pill">Symbols: {symbols ?? 'n/a'}</span>
        </div>
      </section>
      <section className="section">
        <h3>Decision</h3>
        {decision ? (
          <div className="row wrap gap-12">
            <span className="pill">Flag: {decision.flag}</span>
            <span className="pill">Posture: {decision.posture}</span>
            <span className="pill">Health: {decision.market_health}/100</span>
            <span className="pill">Expiry: {decision.expiry_minutes}m</span>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>n/a</div>
        )}
        {decision?.reasons?.length ? <div className="mt-8">Reasons: {decision.reasons.join(', ')}</div> : null}
      </section>
      <section className="section">
        <h3>Setups</h3>
        {!signals?.setups?.length ? (
          <div style={{ color: 'var(--muted)' }}>No setups (NO-TRADE)</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Entry</th>
                <th>SL</th>
                <th>TP</th>
                <th>Risk%</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {signals.setups.slice(0,3).map((s, i) => (
                <tr key={`${s.symbol}-${i}`}>
                  <td>{s.symbol}</td>
                  <td>{s.side}</td>
                  <td>{s.entry}</td>
                  <td>{s.sl}</td>
                  <td>{s.tp.join(', ')}</td>
                  <td>{(s.sizing.risk_pct * 100).toFixed(0)}%</td>
                  <td>{s.expires_in_min} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="section">
        <h3>Diagnostics</h3>
        <div className="row wrap gap-12">
          <span className="pill">feeds_ok: {String(!!feedsOk)}</span>
          <span className="pill">featuresMs: {featuresMs != null ? Math.round(featuresMs) : 'n/a'}</span>
          <span className="pill">snapshotKB: {sizeKB(snapshot)}</span>
          <span className="pill">featuresKB: {sizeKB(features)}</span>
          <span className="pill">warnings: {warnings.length}</span>
        </div>
        {diagDrops.length ? (
          <details className="mt-8">
            <summary>First drop:*:alt:*:noH1 warnings</summary>
            <ul>
              {diagDrops.map((w, i) => (<li key={i} className="monospace">{w}</li>))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  )
}


