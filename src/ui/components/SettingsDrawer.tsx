import React from 'react'
import type { MarketRawSnapshot } from '../../../types/market_raw'

type Props = {
  open: boolean
  onClose: () => void
  lastSnapshot: MarketRawSnapshot | null
  lastRunAt: string | null
}

type Cfg = {
  topN?: number
  candles?: number
  concurrency?: number
  depthMode?: string
  fundingMode?: string
  openInterestMode?: string
}

function readConfigFromSnapshot(s: MarketRawSnapshot | null): Cfg {
  try {
    const anyS = s as any
    const meta = anyS?.meta || anyS?.config || null
    if (!meta || typeof meta !== 'object') return {}
    return {
      topN: Number(meta.topN) || undefined,
      candles: Number(meta.candles) || undefined,
      concurrency: Number(meta.concurrency) || undefined,
      depthMode: typeof meta.depthMode === 'string' ? meta.depthMode : undefined,
      fundingMode: typeof meta.fundingMode === 'string' ? meta.fundingMode : undefined,
      openInterestMode: typeof meta.openInterestMode === 'string' ? meta.openInterestMode : undefined,
    }
  } catch { return {} }
}

export const SettingsDrawer: React.FC<Props> = ({ open, onClose, lastSnapshot, lastRunAt }) => {
  const cfg = readConfigFromSnapshot(lastSnapshot)
  const Item = ({ label, value }: { label: string; value: string | number | undefined }) => (
    <div className="space-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--muted)' }}>{label}</div>
      <div>{value ?? 'n/a'}</div>
    </div>
  )
  return (
    <>
      <div className={open ? 'backdrop open' : 'backdrop'} onClick={onClose} />
      <aside className={open ? 'drawer open' : 'drawer'} aria-hidden={!open} aria-label="Settings">
        <div className="space-between">
          <h3 style={{ margin: 0 }}>Settings</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="mt-12">
          <h4 style={{ margin: '8px 0' }}>Run config</h4>
          <Item label="topN" value={cfg.topN} />
          <Item label="candles" value={cfg.candles} />
          <Item label="concurrency" value={cfg.concurrency} />
          <Item label="depthMode" value={cfg.depthMode} />
          <Item label="fundingMode" value={cfg.fundingMode} />
          <Item label="openInterestMode" value={cfg.openInterestMode} />
        </div>
        <div className="mt-12">
          <h4 style={{ margin: '8px 0' }}>Build info</h4>
          <Item label="Last run" value={lastRunAt ?? 'n/a'} />
          <Item label="Snapshot timestamp" value={lastSnapshot?.timestamp ?? 'n/a'} />
          <Item label="Symbols" value={lastSnapshot?.universe ? 2 + lastSnapshot.universe.length : 'n/a'} />
        </div>
      </aside>
    </>
  )
}


