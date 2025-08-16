import React from 'react'

type Props = {
  running: boolean
  onRun: () => void
  onExportSnapshot: () => void
  onExportFeatures: () => void
  onToggleSettings: () => void
}

export const HeaderBar: React.FC<Props> = ({ running, onRun, onExportSnapshot, onExportFeatures, onToggleSettings }) => {
  return (
    <div className="space-between mb-12" style={{ paddingTop: 12 }}>
      <div style={{ fontWeight: 700 }}>Public Fetcher</div>
      <div className="row gap-8">
        <button className="btn primary" onClick={onRun} disabled={running} aria-label="Run (R)" aria-busy={running} title="Run (R)">
          {running ? (<span className="row gap-8"><span className="spinner" /> Running…</span>) : 'Run'}
        </button>
        <button className="btn" onClick={onExportSnapshot} disabled={running} aria-label="Export snapshot (S)" title="Export snapshot (S)">Export snapshot</button>
        <button className="btn" onClick={onExportFeatures} disabled={running} aria-label="Export features (F)" title="Export features (F)">Export features</button>
        <button className="btn ghost" onClick={onToggleSettings} aria-label="Open settings" title="Settings">⚙️</button>
      </div>
    </div>
  )
}


