# Trader MVP Analyze → Signals

MVP Analyze pipeline (M1–M4) is implemented:
- M1: Public Fetcher (Binance Futures)
- M2: Features (deterministic indicators)
- M3-mini: Rules-based Market Decision
- M4-mini: Rules-based Signals (1–3 setups)

Run:
- Start backend: `npm run dev:server`
- Start UI: `npm run dev`
- Open http://localhost:4200 and click Run

QA:
- Export fixtures: `npm run export:m1m2`
- Run checks: `npm run qa:m2`

Status: MVP Analyze→Signals – DONE

## MVP Analyze→Signals – DEV freeze

- Pass: duration_ms ≈ 1.1–1.9 s, featuresMs 2–4 ms, sizes OK
- Fail (tolerováno v DEV): symbols = 24
  - Poznámka: "blokováno symboly – chybí H1 u altů; WS/TTL/backfill jen částečně pokrývá TopN"
- Akční bod (další sprint): Perf Sprint – stabilizovat symbols ≥ 30 (WS alt H1 prewarm + robustnější backfill a telemetrie drop:*:alt:*:noH1)


