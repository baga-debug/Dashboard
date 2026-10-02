# OPS — Smart Energy Plant Dashboard (Build-Once, Forget)

**Prod port:** `http://<dashboard-host>:8000`  — UI + API on ONE port (backend serves `frontend/dist`). Health: `/health`, Live: `/api/live`, SSE: `/api/live/stream`.

## One-command start (no service)
```bat
powershell -ExecutionPolicy Bypass -File C:\Users\User\Downloads\Dashboard\scripts\start.ps1
# opens http://localhost:8000
```

## Install as Windows Service (auto-start, auto-restart 5s infinite)
```bat
:: Run PowerShell as Administrator
powershell -ExecutionPolicy Bypass -File C:\Users\User\Downloads\Dashboard\scripts\install-service.ps1
sc query SmartEnergyDashboard
:: uninstall
powershell -ExecutionPolicy Bypass -File C:\Users\User\Downloads\Dashboard\scripts\install-service.ps1 -Uninstall
```

## Firewall (isolated VLAN hardening)
```bat
:: Administrator
powershell -ExecutionPolicy Bypass -File C:\Users\User\Downloads\Dashboard\scripts\secure-firewall.ps1
:: remove
powershell -ExecutionPolicy Bypass -File C:\Users\User\Downloads\Dashboard\scripts\secure-firewall.ps1 -Remove
```
- Outbound 502 ALLOWED only to `10.1.156.12` (gateway) — blocks Modbus to internet
- Inbound 8000 ALLOWED only from `10.1.156.0/24` + `127.0.0.1`
- All else blocked by default Windows Firewall

## Move laptop -> local server
1. `robocopy C:\Users\User\Downloads\Dashboard \\server\Dashboard /MIR /XD node_modules` (or copy folder via USB)
2. On server install Python 3.12 + (optional) Node 20 if you will rebuild frontend (`winget install Python.Python.3.12 OpenJS.NodeJS.LTS`)
3. `cd Dashboard\backend && python -m pip install -r requirements.txt`
4. Edit `backend\config.yaml` slaves name/model/group/ct_ratio/pt_ratio (or `backend\.env` GATEWAY_HOST/PORT) — no code change
5. `cd ..\frontend && npm install && npm run build`  (or copy `frontend\dist` already built)
6. `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` verify `http://localhost:8000/health` shows `gateway reachable` when Ethernet plugged to `10.1.156.0/24`
7. Install service + firewall (above)
8. Set static IP on server: e.g. `10.1.156.101/24`, plug cable to plant switch, `Test-NetConnection 10.1.156.12 -Port 502` must be `True`

## Config single point
- `backend\config.yaml` — gateway, 8 slaves (id/name/model/group/ct/pt), poll 3000ms, powerstudio, security cors, storage
- `backend\.env` — overrides `GATEWAY_HOST`, `GATEWAY_PORT`, `POWERSTUDIO_HOST`, `DASHBOARD_API_KEY` (empty = open dev, set 32-char random for prod), `POLL_INTERVAL_MS`
- Secrets never committed (`.env` gitignored). Prod: `python -c "import secrets; print(secrets.token_urlsafe(24))"` -> put in `.env`

## Verify reliable connection (self-healing)
- Unplug Ethernet 10s then replug — backend log `backend\logs\app.log` shows `Modbus connect fail ... backoff 1s -> 2s -> 4s` then `Modbus connected ... 12ms` within 3s after replug, UI flips `source: simulator -> gateway`, no restart.
- Kill one meter breaker (or fake: set slave 19 offline) — UI card greys "stale Xs ago", other 7 stay green (circuit-breaker 30s isolation)
- Reboot host — service starts in <10s after PowerStudio, `http://localhost:8000/health` `uptime_s` resets, poll_count resumes

## Backup & retention
- DB: `backend\data\dashboard.db` WAL mode, auto + manual: `powershell -ExecutionPolicy Bypass -File scripts\backup.ps1` (schedule 02:00 daily via Task Scheduler -> keep 7 dailies + config snapshots in `backups\`)
- History API: `/api/history?meter=31&from=2026-09-20T00:00:00Z&to=...&period=daily|monthly` ; export: `/api/export.csv?from=&to=`
- Retention: 90 days raw in DB (config `storage.retention_days`), 2 years daily/monthly rollups via queries

## PowerStudio (secondary, optional)
- Engine `http://127.0.0.1:80/services/user/devices.xml|values.xml` polled 5s; project `C:\ProgramData\Circutor\PowerStudio Scada\Cfg\default.xcfg` currently empty `<devices></devices>` — dashboard works without it (gateway primary). When Editor is configured, UI tags `source: powerstudio` fallback.

## Health & logs
- `http://localhost:8000/health` -> `{gateway:{reachable,latency_ms,last_ok}, powerstudio:{reachable,devices}, slaves:[{meter_id,status,stale_s}], uptime_s, source}`
- Logs `backend\logs\app.log` (also console) — no keys dumped, no PII. Rotate manually 10MB x5 or via `logs\app-*.log`.

## Frontend rebuild (if editing UI)
```bat
cd C:\Users\User\Downloads\Dashboard\frontend
npm install
npm run build   # -> dist -> served by backend on :8000
# dev with proxy:
npm run dev     # -> http://localhost:5173  (proxies /api to :8000)
```

## Security hardening checklist (already built)
- VLAN `10.1.156.0/24` isolated, no internet route to gateway
- Dashboard API CORS allowlist `http://localhost:5173, http://127.0.0.1:8000, http://<host>:8000` — no `*`
- API-key: set `DASHBOARD_API_KEY` in `.env`, frontend injects `X-Api-Key` (dev empty = open)
- Rate limit 60/min/IP, Pydantic validation, parameterized SQL (no injection), no eval
- Least privilege: service runs as LocalSystem by default — change to dedicated `dashboard` user if you prefer (`sc config` obj=)
- Pinned deps `requirements.txt` + `package-lock.json`, TLS via reverse proxy (Caddy/Nginx) if exposed beyond LAN

## Troubleshooting
- `Test-NetConnection 10.1.156.12 -Port 502 => False` — cable/VLAN not plugged, plug Ethernet to 10.1.156.0/24 switch, check `Get-NetIPConfiguration` Ethernet shows `10.1.156.x`
- `GET /health gateway error connect returned False` — expected until on plant network; simulator provides identical shape, UI always demoable
- Frontend blank — `http://localhost:8000/` should return HTML with `<script src="/assets/...">`, check `frontend\dist` exists else `npm run build`
- PowerStudio 0 devices — normal, project empty, fill via PowerStudio Editor -> devices + vars + groups
