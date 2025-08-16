import React from 'react'
import type { SignalSet } from '../../services/signals/rules_signals'

type Props = { signalSet: SignalSet }

export const SetupsTable: React.FC<Props> = ({ signalSet }) => {
  const noSetups = !signalSet.setups.length
  const copyJson = () => navigator.clipboard.writeText(JSON.stringify(signalSet, null, 2))
  return (
    <details style={{ marginTop: 16 }} open>
      <summary>Setups</summary>
      <div className="row gap-8" style={{ margin: '8px 0' }}>
        <button className="btn" onClick={copyJson}>Copy setups JSON</button>
      </div>
      {noSetups ? (
        <div style={{ color: '#9ca3af' }}>No setups (NO-TRADE)</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Symbol</th>
              <th>Side</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP</th>
              <th>Risk%</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {signalSet.setups.slice(0, 3).map((s) => (
              <tr key={s.symbol}>
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
    </details>
  )
}


