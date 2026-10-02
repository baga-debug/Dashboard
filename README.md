# Smart Energy Meter Dashboard — PowerStudio SCADA bridge (Build-Once, Worry-Free)

**Host:** laptop `DESKTOP-1S9DK50` (test) → local server (prod, isolated VLAN `10.1.156.0/24`).  
**Gateway:** `10.1.156.12:502` (8 slaves: `31,32,33,11,12,13,16,19`). Families: CVM-C11, CVM-C4, NRG96, Elmeasure LG6435.  
**Engine:** PowerStudio `DESKTOP-1S9DK50:80` (`C:\ProgramData\Circutor\PowerStudio Scada\Cfg\default.xcfg` currently empty `<devices></devices>` — gateway is primary).  
**Session log:** `SESSION_LOG.md` | **Reliable plan:** `plans/plan-v2-reliable-secure.md` | **Ops card:** `OPS.md`

## What was built 2026-09-20 (hardened, zero-maintenance)
- Backend `backend\app.py` (FastAPI + pymodbus AsyncModbusTcpClient + httpx PowerStudio XML): per-slave 800ms timeout/2 retries/30s circuit-breaker, keepalive 15s, exponential backoff 1s→30s + 10s watchdog, dual source merge, simulator fallback identical API shape, WAL SQLite `backend\data\dashboard.db`, rate-limit 60/min, CORS allowlist, optional `X-Api-Key`, parameterized SQL.
- Frontend `frontend\` (Vite React 19 + Tailwind 3.4 + Recharts): vibrant enterprise SPA — pinned combined strip (ΣkW, ΣkWh, avg PF, active, last-sync), group sections → meter cards (status dot green/amber/red, large kW+kWh+V/I/PF, sparkline), drawer Live|Today|History|Info, SSE ` /api/live/stream` with 1→15s reconnect + polling fallback, health bar.
- Single-port prod: backend serves `frontend\dist` on `http://localhost:8000` (`/` = UI, `/api/*` = API). No CORS in prod.
- Hardening: firewall `scripts\secure-firewall.ps1` ( outbound 502 only to 10.1.156.12, inbound 8000 only from 10.1.156.0/24 ), VLAN isolation, service `scripts\install-service.ps1` (auto-start, restart 5s infinite), nightly backup `scripts\backup.ps1`.

## Quick start (recommended: single port)
```bat
:: one-time (already done here)
winget install Python.Python.3.12 OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --scope user
C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe -m pip install -r backend\requirements.txt
cd frontend && npm install && npm run build && cd ..

:: run (no admin) — UI+API on :8000
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
:: open http://localhost:8000
:: health: http://localhost:8000/health  live: http://localhost:8000/api/live
```
If gateway offline (current Wi-Fi `192.168.0.106` / `MMK-home_5G` — expected), backend stays **simulator mode** (plausible 8 meters, dropout injection for stale test) so UI always demoable. Plug Ethernet to `10.1.156.0/24` switch -> `Test-NetConnection 10.1.156.12 -Port 502` True -> backend auto-flips `source: simulator -> gateway` in 3s no restart.

## Dev (two ports with proxy)
```bat
python backend\app.py  # :8000
cd frontend && npm run dev  # :5173 proxies /api to :8000 -> open http://localhost:5173
```

## Config (single file, no code rebuild)
- `backend\config.yaml` — gateway host/port/poll_ms, 8 slaves `[{id,name,model,group,ct_ratio,pt_ratio}]`, groups, powerstudio host/port, security cors, storage.
- `backend\.env` (gitignored, copy from `.env.example`) — `GATEWAY_HOST`, `GATEWAY_PORT`, `POWERSTUDIO_HOST`, `DASHBOARD_API_KEY` (32-char random: `python -c "import secrets; print(secrets.token_urlsafe(24))"`; empty = open dev), `POLL_INTERVAL_MS`, `DB_PATH`.
- On prod copy `Dashboard\` folder + edit `.env`/`config.yaml` `slaves` labels + `install-service.ps1` — done.

## API (same on :8000 and proxied :5173)
- `GET /health` -> `{gateway:{reachable,latency_ms,last_ok,error}, powerstudio:{reachable,devices}, slaves:[{meter_id,status,stale_s,last_ok}], uptime_s, source}` (stale <9s online, <30s stale, else offline)
- `GET /api/live` -> `{combined:{kw,kwh,pf,active,total}, meters:[{meter_id,name,model,group,kw,kwh_import,pf,v_ln_avg,i_avg,hz,source,status,ts} ...], ts, source}`
- `GET /api/live/stream` -> SSE `data: {combined,meters,ts,source}` every 3s + keepalive
- `GET /api/history?meter=31&from=2026-09-20T00:00:00Z&to=&period=raw|daily|monthly&limit=1000`
- `GET /api/export.csv?meter=&from=&to=` -> CSV
- `GET /api/config` -> non-secret config

## Verify reliable + secure after build
1. Plug host into `10.1.156.0/24` (static `10.1.156.101`), `Test-NetConnection 10.1.156.12 -Port 502` -> True -> `/health` `gateway reachable true latency <50ms` `source gateway` in <10s.
2. Stall test: unplug cable 10s -> logs `Modbus connect fail backoff` -> replug -> auto reconnected, UI never blank (shows stale Xs ago grey cards).
3. Kill one meter breaker -> its card greys `stale` but other 7 stay green (isolation).
4. Reboot: service returns `<10s` after PowerStudio, `/health` `uptime_s` resets.
5. Firewall: `Get-NetFirewallRule -DisplayName "Dashboard*"` shows 3 rules; try `Test-NetConnection <gateway>:502` from other VLAN -> blocked.
6. Backup: `powershell -ExecutionPolicy Bypass -File scripts\backup.ps1` -> `backups\dashboard-YYYY-MM-DD.db`.

See `OPS.md` for full ops, `SESSION_LOG.md:9-14` for session history.

## Next steps for you
1. Paste 8-line ID→meter map if names differ (else edit `backend\config.yaml` slaves `name` now: `31 Main Incomer / 32 Floor1 A / 33 DG / 11 Feeder A / 12 Feeder B / 13 Feeder C / 16 Spare / 19 Spare`).
2. Paste CT/PT ratios (e.g. `31 200/5A`) or confirm all direct (default 1.0).
3. When on site, plug Ethernet and run `scripts\install-service.ps1` as Admin + `scripts\secure-firewall.ps1` as Admin.
4. First live poll will probe regs `0x0000-0x0028` vs front-panel display to lock decoder (float ABCD vs CDAB vs int32) per meter — we log raw regs for calibration.

