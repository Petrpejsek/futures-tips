import React from 'react'
import type { MarketDecision } from '../../../services/decider/rules_decider'

type Props = { decision: MarketDecision }

export const DecisionBanner: React.FC<Props> = ({ decision }) => {
  const color = decision.flag === 'OK' ? '#03543f' : decision.flag === 'CAUTION' ? '#92400e' : '#9b1c1c'
  const bg = decision.flag === 'OK' ? '#e6ffed' : decision.flag === 'CAUTION' ? '#fffbea' : '#fff5f5'
  const icon = decision.flag === 'OK' ? '🟢' : decision.flag === 'CAUTION' ? '🟡' : '🔴'
  const hasGptError = (decision.reasons || []).some(r => typeof r === 'string' && r.startsWith('gpt_error:'))
  return (
    <div style={{ background: bg, color, border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 12px', marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{icon} {decision.flag}</strong>
        <span>Posture: {decision.posture}</span>
        <span>Health: {decision.market_health}%</span>
        <span>Expiry: {decision.expiry_minutes}m</span>
      </div>
      <div style={{ marginTop: 6 }}>Reasons: {decision.reasons.slice(0, 3).join(', ')}</div>
      {hasGptError && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#7a5b00' }}>
          GPT mode: strict fail-closed result received (gpt_error). UI remains functional.
        </div>
      )}
    </div>
  )
}


