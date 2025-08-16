import React, { useEffect, useMemo, useState } from 'react';
import { SnapshotBanner } from './components/SnapshotBanner';
import type { MarketRawSnapshot } from '../../types/market_raw';
import { computeFeatures } from '../../services/features/compute';
import type { FeaturesSnapshot } from '../../types/features';
import { decideFromFeatures, type MarketDecision } from '../../services/decider/rules_decider';
import { selectCandidates } from '../../services/signals/candidate_selector';
import { buildSignalSet, type SignalSet } from '../../services/signals/rules_signals';

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<MarketRawSnapshot | null>(null);
  const [features, setFeatures] = useState<FeaturesSnapshot | null>(null);
  const [featuresMs, setFeaturesMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<MarketDecision | null>(null);
  const [signalSet, setSignalSet] = useState<SignalSet | null>(null);

  const symbolsLoaded = useMemo(() => {
    if (!snapshot) return 0;
    const core = ['BTCUSDT', 'ETHUSDT'];
    const uni = snapshot.universe?.length ?? 0;
    return core.length + uni;
  }, [snapshot]);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/snapshot');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MarketRawSnapshot = await res.json();
      setSnapshot(data);
      // compute features
      const t0 = performance.now();
      const feats = computeFeatures(data);
      const dt = performance.now() - t0;
      setFeatures(feats);
      setFeaturesMs(dt);
      const dec = decideFromFeatures(feats);
      setDecision(dec);
      const cands = selectCandidates(feats, dec);
      const set = buildSignalSet(feats, dec, cands);
      setSignalSet(set);
      // console table summary
      const sizeKB = JSON.stringify(feats).length / 1024;
      // eslint-disable-next-line no-console
      console.table({ snapshotMs: Math.round(data.latency_ms), featuresMs: Math.round(dt), symbols: data.universe.length, featuresSizeKB: +sizeKB.toFixed(1) });
      // persist
      try {
        localStorage.setItem('m1Snapshot', JSON.stringify(data));
        localStorage.setItem('m2Features', JSON.stringify(feats));
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setRunning(false);
    }
  };

  const onExport = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `market_raw_snapshot_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExportFeatures = () => {
    if (!features) return;
    const blob = new Blob([JSON.stringify(features)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `features_snapshot_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    try {
      const sRaw = localStorage.getItem('m1Snapshot');
      const fRaw = localStorage.getItem('m2Features');
      if (sRaw) setSnapshot(JSON.parse(sRaw));
      if (fRaw) {
        const feats = JSON.parse(fRaw);
        setFeatures(feats);
        try {
          const dec = decideFromFeatures(feats);
          setDecision(dec);
          const cands = selectCandidates(feats, dec);
          const set = buildSignalSet(feats, dec, cands);
          setSignalSet(set);
        } catch {}
      }
    } catch {}
  }, []);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial', padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <h2>Public Fetcher</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={onRun} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </button>
        <button onClick={onExport} disabled={!snapshot}>Export snapshot (JSON)</button>
        <button onClick={onExportFeatures} disabled={!features}>Export features (JSON)</button>
      </div>
      <SnapshotBanner
        feedsOk={!!snapshot?.feeds_ok}
        latencyMs={snapshot?.latency_ms ?? 0}
        symbolsLoaded={symbolsLoaded}
        featuresMs={featuresMs}
        breadthPct={features?.breadth.pct_above_EMA50_H1 ?? null}
      />
      {error && (
        <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>
      )}
      {snapshot && (
        <details style={{ marginTop: 16 }}>
          <summary>Preview snapshot</summary>
          <pre style={{ maxHeight: 400, overflow: 'auto' }}>
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </details>
      )}
      {features && (
        <>
          <div style={{ height: 8 }} />
          {/* @ts-expect-error allow dynamic import path */}
          {React.createElement(require('./components/FeaturesPreview').FeaturesPreview, { features })}
        </>
      )}
      {decision && (
        <>
          <div style={{ height: 8 }} />
          {/* @ts-expect-error allow dynamic import path */}
          {React.createElement(require('./components/DecisionBanner').DecisionBanner, { decision })}
        </>
      )}
      {signalSet && (
        <>
          <div style={{ height: 8 }} />
          {/* @ts-expect-error allow dynamic import path */}
          {React.createElement(require('./components/SetupsTable').SetupsTable, { signalSet })}
        </>
      )}
    </div>
  );
};

