import React, { useEffect, useMemo, useState } from 'react';
import { SnapshotBanner } from './components/SnapshotBanner';
import type { MarketRawSnapshot } from '../../types/market_raw';
import { computeFeatures } from '../../services/features/compute';
import type { FeaturesSnapshot } from '../../types/features';
import { decideFromFeatures, type MarketDecision } from '../../services/decider/rules_decider';
import { selectCandidates } from '../../services/signals/candidate_selector';
import { buildSignalSet, type SignalSet } from '../../services/signals/rules_signals';
import { HeaderBar } from './components/HeaderBar';
import { StatusPills, type WsHealth } from './components/StatusPills';
import { ErrorPanel } from './components/ErrorPanel';
import { SettingsDrawer } from './components/SettingsDrawer';
import { downloadJson } from './utils/downloadJson';

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<MarketRawSnapshot | null>(null);
  const [features, setFeatures] = useState<FeaturesSnapshot | null>(null);
  const [featuresMs, setFeaturesMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPayload, setErrorPayload] = useState<any | null>(null);
  const [decision, setDecision] = useState<MarketDecision | null>(null);
  const [signalSet, setSignalSet] = useState<SignalSet | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [wsHealth, setWsHealth] = useState<WsHealth | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const symbolsLoaded = useMemo(() => {
    if (!snapshot) return 0;
    const core = ['BTCUSDT', 'ETHUSDT'];
    const uni = snapshot.universe?.length ?? 0;
    return core.length + uni;
  }, [snapshot]);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    setErrorPayload(null);
    try {
      const res = await fetch('/api/snapshot');
      if (!res.ok) {
        let payload: any = null;
        try { payload = await res.json(); } catch {}
        if (payload && res.status === 500) {
          setErrorPayload(payload);
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }
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
      setLastRunAt(new Date().toISOString());
      setError(undefined as any);
      setErrorPayload(null);
      // console table summary
      const sizeKB = JSON.stringify(feats).length / 1024;
      // eslint-disable-next-line no-console
      console.table({ durationMs: Math.round((data as any).duration_ms ?? (data as any).latency_ms ?? 0), featuresMs: Math.round(dt), symbols: data.universe.length, setups: set.setups.length });
      // persist
      try {
        localStorage.setItem('m1Snapshot', JSON.stringify(data));
        localStorage.setItem('m2Features', JSON.stringify(feats));
        localStorage.setItem('m3Decision', JSON.stringify(dec));
        localStorage.setItem('m4SignalSet', JSON.stringify(set));
        localStorage.setItem('lastRunAt', String(new Date().toISOString()));
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setRunning(false);
    }
  };

  const onExport = () => { if (snapshot) downloadJson(snapshot, 'snapshot') };

  const onExportFeatures = () => { if (features) downloadJson(features, 'features') };

  // WS health poll (best-effort)
  useEffect(() => {
    let mounted = true
    let timer: number | undefined
    const poll = async () => {
      try {
        const res = await fetch('/api/ws/health')
        if (res.ok) {
          const h = await res.json()
          if (mounted) setWsHealth(h)
        } else {
          if (mounted) setWsHealth(null)
        }
      } catch { if (mounted) setWsHealth(null) }
      timer = window.setTimeout(poll, 4000)
    }
    poll()
    return () => { mounted = false; if (timer) clearTimeout(timer) }
  }, [])

  useEffect(() => {
    try {
      const sRaw = localStorage.getItem('m1Snapshot');
      const fRaw = localStorage.getItem('m2Features');
      const dRaw = localStorage.getItem('m3Decision');
      const setRaw = localStorage.getItem('m4SignalSet');
      const lastRun = localStorage.getItem('lastRunAt');
      if (sRaw) setSnapshot(JSON.parse(sRaw));
      if (fRaw) {
        const feats = JSON.parse(fRaw);
        setFeatures(feats);
        try {
          if (dRaw) setDecision(JSON.parse(dRaw)); else {
            const dec = decideFromFeatures(feats);
            setDecision(dec);
          }
          if (setRaw) setSignalSet(JSON.parse(setRaw)); else {
            const cands = selectCandidates(feats, decideFromFeatures(feats));
            const set = buildSignalSet(feats, decideFromFeatures(feats), cands);
            setSignalSet(set);
          }
        } catch {}
      }
      if (lastRun) setLastRunAt(lastRun);
    } catch {}
  }, []);

  // Keyboard shortcuts: r (run), s (export snapshot), f (export features)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable === true || target.tagName === 'SELECT'
      )
      if (isTyping) return
      if (e.key === 'r' || e.key === 'R') {
        if (!running) onRun()
      } else if (e.key === 's' || e.key === 'S') {
        onExport()
      } else if (e.key === 'f' || e.key === 'F') {
        onExportFeatures()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, snapshot, features])

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <HeaderBar running={running} onRun={onRun} onExportSnapshot={onExport} onExportFeatures={onExportFeatures} onToggleSettings={() => setSettingsOpen(true)} />
      <StatusPills
        feedsOk={snapshot?.feeds_ok ?? null}
        snapshotMs={(snapshot as any)?.duration_ms ?? (snapshot as any)?.latency_ms ?? null}
        featuresMs={featuresMs}
        symbols={snapshot?.universe?.length != null ? (2 + snapshot.universe.length) : null}
        ws={wsHealth}
      />
      <SnapshotBanner
        feedsOk={!!snapshot?.feeds_ok}
        latencyMs={(snapshot as any)?.duration_ms ?? (snapshot as any)?.latency_ms ?? 0}
        symbolsLoaded={symbolsLoaded}
        featuresMs={featuresMs}
        breadthPct={features?.breadth.pct_above_EMA50_H1 ?? null}
      />
      {errorPayload ? <ErrorPanel payload={errorPayload} /> : (error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null)}
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
          {/* dynamic import path for preview component */}
          {React.createElement(require('./components/FeaturesPreview').FeaturesPreview, { features })}
        </>
      )}
      {decision && (
        <>
          <div style={{ height: 8 }} />
          {/* dynamic import path for decision banner */}
          {React.createElement(require('./components/DecisionBanner').DecisionBanner, { decision })}
        </>
      )}
      {signalSet && (
        <>
          <div style={{ height: 8 }} />
          {/* dynamic import path for setups table */}
          {React.createElement(require('./components/SetupsTable').SetupsTable, { signalSet })}
        </>
      )}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} lastSnapshot={snapshot} lastRunAt={lastRunAt} />
    </div>
  );
};

