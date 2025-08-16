import React from 'react'

type Props = {
  feedsOk: boolean
  latencyMs: number
  symbolsLoaded: number
  featuresMs?: number | null
  breadthPct?: number | null
}

export const SnapshotBanner: React.FC<Props> = ({ feedsOk, latencyMs, symbolsLoaded, featuresMs, breadthPct }) => {
  const bg = feedsOk ? '#e6ffed' : '#fff5f5'
  const color = feedsOk ? '#03543f' : '#9b1c1c'
  const border = feedsOk ? '#31c48d' : '#f98080'
  return (
    <div style={{
      background: bg,
      color,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: '10px 12px',
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      fontSize: 14,
      marginBottom: 12,
      flexWrap: 'wrap'
    }}>
      <strong>{feedsOk ? 'Feeds OK' : 'Feeds STALE/ERROR'}</strong>
      <span>Snapshot duration: {Math.round(latencyMs)} ms</span>
      <span>Symbols loaded: {symbolsLoaded}</span>
      <span>Features: {featuresMs != null ? Math.round(featuresMs) : '—'} ms</span>
      <span>Breadth: {breadthPct != null ? `${breadthPct}%` : '—'}</span>
    </div>
  )
}

