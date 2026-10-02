# Plan — Smart Energy Meter Dashboard + PowerStudio SCADA

## Goal
Local dashboard (laptop test now → local server), realtime + bill-style combined + grouped per-meter cards + history/export. Must read from Powestudio SCADA alongside direct Modbus TCP polling via gateway.

## Confirmed targets
- Gateway: `10.1.156.12:502`
- IDs on bus: `31, 32, 33, 11, 12, 13, 16, 19` (8 slaves)
- Families: CVM-C11, CVM4 (variant TBD live), NRG-96, Elmeasure 6435 (LG64xx family)
- Reachability at laptop check (Wi-Fi only): **NOT reachable** — Ethernet `10.1.156.0/24` was Media disconnected. Requires cable/VLAN before live poll.
- PowerStudio: engine `DESKTOP-1S9DK50:80`, project `default.xcfg` empty, services running.

## Architecture
```
RS-485 bus (8 meters)
   ↕
TCP gateway 10.1.156.12:502 (Modbus TCP)
   ↕ (primary, 2–5 s poll, per-ID timeout isolation)
Dashboard backend (FastAPI/Express + SQLite)
   ↕ SSE/WS + REST (/api/live, /api/history, /api/export.csv, /health)
Frontend — vibrant enterprise SPA
   ├─ Plant Combined strip (ΣkW, ΣkWh, avg PF, today/month, last-sync)
   ├─ Group sections (user-defined) → meter cards (status, kW, kWh, V/I/PF, sparkline)
   │   └─ card detail: Live | Today | History | Info
   └─ Trends + Export views + Health (gateway latency, per-slave stale flags)

PowerStudio ENGINE XML (secondary): services/user/values.xml, records.xml
   — polled in parallel once Editor project is configured; UI tags source (Gateway vs PowerStudio).
```

## Backend poller
- One Modbus TCP connection (or pooled), FC03/FC04, round-robin IDs.
- Per-meter decoder keyed by discovered model (probe function: read holding/input regs at common LG & Circutor addresses, match against front-panel display).
- Normalized model: `meter_id, name, model, kw, kw_l1..l3, kva, kvar, pf, pf_l1..l3, v_ll_avg, v_ln_avg, v_l1..l3, i_avg, i_l1..l3, hz, kwh_import, kwh_export?, status, ts, source`.
- SQLite: `readings` (ts, meter_id, json) + daily/monthly aggregates; retention policy.

## Frontend
- Enterprise palette (dark header + card elevation), dense but scannable.
- Combined strip always pinned; cards grouped; offline/degraded state per meter (grey + “stale Xs ago”).
- Charts: per-meter 24h sparkline + group history bar (daily kWh) + month trend.

## Build phases
0. Confirm ID→meter map + groups/refresh/OS (awaiting your paste).
1. Backend poller + SQLite + API + simulator fallback when gateway offline.
2. Frontend grouped cards + combined + realtime wiring.
3. History aggregation + CSV export.
4. PowerStudio XML reader + Editor setup notes (devices + vars + groups).
5. Package for local server + polish + docs.

## Gaps to close next
- ID map (8 lines), groups, CT/PT ratios, Ethernet connectivity.

## Risks
- Elmeasure LG6435 vs LG6435E vs Schneider rebrand (EM6435) register offsets differ — mitigated by live probing against display value.
- Word order (ABCD vs CDAB) and float vs int32 — auto-detected per meter.
