# Plan v2 — Reliable & Secure "Build-Once, Forget" Dashboard

**Date:** 2026-09-20 19:11 IST | **Host:** DESKTOP-1S9DK50 (192.168.0.106 on MMK-home_5G, Ethernet Disconnected) → prod: local server on 10.1.156.0/24
**Gateway:** 10.1.156.12:502 unreachable from current Wi-Fi (expected; requires Ethernet/VLAN) | **PowerStudio:** engine http://localhost:80 UP (devices.xml empty, services Running) | **No Python/Node installed yet** | **No backend/frontend scaffold yet**

This plan replaces `plans/plan.md:42-48` build phases with a hardening-focused, zero-maintenance design. After this build you should not need to babysit the connection.

---

## 1. What previous sessions actually did (SESSION_LOG.md:8-114)

- **Inventoried PowerStudio** read-only: `C:\Program Files\Circutor\PowerStudio Scada\bin\PwrStudio.exe:80`, service `CircutorPowerStudioScadaServer` Running, `engine.xml:1` port 80, project `C:\ProgramData\Circutor\PowerStudio Scada\Cfg\default.xcfg:1` empty (`<commSystem/><deviceGroups/>`), APIs discovered `services/user/{devices,values,records}.xml` classic ENGINE XML + OIDC on 8093 + WebStudio on 8091. Last probe `2026-09-20 13:40`: `devices.xml → <devices></devices>` empty.
- **Captured wiring target**: 8 Modbus slaves `31,32,33,11,12,13,16,19` via TCP gateway `10.1.156.12:502`, meter families `CVM-C11 / CVM4-variant / NRG96 / Elmeasure LG6435(LG64xx family)`. Probe from laptop Wi-Fi `10.150.7.29/24` and today `192.168.0.106/24` both → `Test-NetConnection → TcpTestSucceeded=False`, `Ping Timeout`, root cause `Ethernet Media disconnected`. Requires cable to `10.1.156.0/24` switch/VLAN.
- **Approved UX**: grouped cards + plant combined strip (ΣkW, ΣkWh today/month, avg PF, active count, last-sync), per-meter card `Live|Today|History|Info`, 3s refresh default, one "All meters" group until you send names. `README.md:1-35` quick-start stub already written.
- **Blockers still open** `SESSION_LOG.md:73-88`: ID→meter map (8 lines), groups/refresh/OS, CT/PT ratios, Ethernet reachability confirm. No code built yet — workspace only has `README.md`, `SESSION_LOG.md`, `plans/plan.md`.
- **Mistakes logged** `SESSION_LOG.md:92-99`: archive extraction, UTF-16 log.txt, empty JS leaf, SQLite dll, dotnet.

**Today's audit (2026-09-20):** Python/Node missing (`python --version → not found`, `winget 1.29.290` available), PowerStudio :80 Listening (PID 4976 PwrStudio), Ethernet Disconnected, Wi-Fi Up 192.168.0.106, gateway still unreachable — consistent. No new build artifact.

---

## 2. Your requirement translated to engineering

"Reliable and secure connection which after building I don't need to worry about it later" = 8 properties:

| Property | Means |
|---|---|
| **Self-healing** | TCP drops, meter timeout, PowerStudio restart, host reboot — all auto-recover without manual click |
| **Isolated failures** | One dead slave (e.g. 19 offline) never blocks the other 7 |
| **No data loss** | SQLite WAL + daily aggregates + CSV export; survives power cut |
| **Observable** | `/health` + UI health bar tell you in 2s what's wrong, not silent blank |
| **Secure by default** | Gateway not exposed to internet, API not open to world, secrets not in repo, inputs validated |
| **Portable** | Copy `C:\Users\User\Downloads\Dashboard\` + `.env` to server → works, no recompile |
| **Low privilege** | Runs as limited Windows user, firewall denies by default |
| **Maintainable** | One config file, rotated logs, pinned deps, 1-page ops card |

---

## 3. Architecture — hardened

```
RS-485 bus (8 meters) ── RS-485
         │
   Moxa/Advantech TCP gateway 10.1.156.12:502 (Modbus TCP)  ← isolated VLAN 10.1.156.0/24, no internet route
         │  plaintext Modbus inside VLAN only
         ├─ keepalive 15s, TCP_NODELAY, single socket, watchdog 10s
         │
 Dashboard host (laptop now → Windows Server prod)
   ├─ Backend (Python FastAPI, asyncio, pymodbus)  :8000 localhost bind
   │   ├─ Poller: round-robin 8 IDs, per-ID 800ms timeout, 2 retries, circuit-breaker 30s isolate
   │   ├─ Reconnect: exponential backoff 1s→30s + jitter, + forced reconnect if no success 10s
   │   ├─ Secondary: PowerStudio ENGINE XML http://localhost:80/services/user/values.xml poll 5s (when non-empty)
   │   ├─ Merge: prefer gateway, fallback to PowerStudio, tag source="gateway|powerstudio|simulator"
   │   ├─ Store: SQLite WAL `data/dashboard.db`, tables readings( ts, meter_id, json ), daily_rollup, monthly_rollup
   │   ├─ API: /api/live, /api/history?meter=&from=&to=&period=daily|monthly, /api/export.csv, /health, /api/config
   │   └─ Security: API-key (X-Api-Key) + CORS allowlist, Pydantic validation, rate limit 60/min/IP, parameterized SQL
   │
   ├─ Frontend (Vite React TS) :5173 dev / :8000 static prod
   │   ├─ SSE @ /api/live/stream with auto-reconnect 1s→15s, stale banner if >6s no tick
   │   └─ Health view: gateway latency, per-slave stale Xs ago, source tag, last-sync age
   │
   └─ OS: Windows Service (WinSW) auto-start, restart on failure 5s infinite, log rotation 10MB×5, EventLog on crash
         Firewall: allow 502 outbound only to 10.1.156.12, allow 8000 inbound only from 10.1.156.0/24 + 127.0.0.1, block else
         Secrets: backend/.env (600 perms) never committed, .env.example committed

 If gateway unreachable (current state 192.168.0.106): simulator mode — same /api/live shape, synthetic but plausible values, dropout injection to prove UI resilience
```

**Why this is secure even though Modbus TCP is plaintext:** Modbus has no auth by design — security comes from *network isolation* (VLAN 10.1.156.0/24 not routed to internet/Wi-Fi), *host firewall* (only dashboard host can reach 502), and *dashboard API layer* (auth + TLS + validation) sitting in front. PowerStudio Engine stays on localhost:80, not exposed.

---

## 4. Reliable connection — 8 layers

1. **Physical:** Ethernet/VLAN only. No Wi-Fi bridge to gateway. Dashboard host static IP on 10.1.156.0/24 (e.g. .101), gateway .12. Cable-test `Test-NetConnection 10.1.156.12 -Port 502 → True` is gate for live mode.
2. **TCP:** One long-lived socket to 10.1.156.12:502, `TCP_KEEPIDLE 15s`, `TCP_KEEPINTVL 5s`, `TCP_KEEPCNT 3`, `TCP_NODELAY=1`. No connect-per-poll churn.
3. **Modbus framing:** FC03/FC04, pymodbus `ModbusTcpClient` asyncio, strict MBAP validation, ignore malformed, count CRC-equivalent TCP errors.
4. **Per-slave isolation:** Sequential poll cycle 8 IDs × (800ms timeout + 100ms gap) ≈ 7s worst-case, typical 1.2s. Each ID independent try: timeout → retry once → mark `status=stale`, open circuit-breaker 30s (skip that ID, continue others), then half-open probe.
5. **Poller supervisor:** Async task with `last_success_ts`. If `now - last_success > 10s` → close socket, backoff reconnect 1,2,4,8,16,30s + jitter 0-20%, log `WARN reconnect attempt N`.
6. **Dual source:** PowerStudio poll 5s independent task. Merge function: if gateway fresh (<5s) → use gateway; else if PowerStudio fresh → use PowerStudio with `source` flag; UI shows dot color + tooltip "Gateway"/"PowerStudio"/"Simulator".
7. **Storage resilience:** SQLite `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, daily `VACUUM` off, nightly backup `data/dashboard.db → backups/dashboard-YYYY-MM-DD.db`, retention 90 days raw, 2 years rollups.
8. **UI resilience:** SSE `EventSource` with `onerror → reconnect 1s→15s`, fetch fallback `/api/live` poll 3s if SSE fails 3×. Per-meter grey + "stale Xs ago" if `now - ts > 9s` (3 cycles). Combined strip shows `last-sync` age, never blank.

---

## 5. Security hardening — checklist (implemented in build)

- **Network:** Gateway VLAN isolated, no NAT to internet. Dashboard host firewall: `New-NetFirewallRule -DisplayName "Dashboard Modbus" -Direction Outbound -RemoteAddress 10.1.156.12 -RemotePort 502 -Action Allow`, inbound 8000 allow only `10.1.156.0/24,127.0.0.1`. All else block.
- **Transport:** Dashboard API behind Caddy/Nginx TLS (self-signed for LAN, or `mkcert` local CA). Frontend → backend always `https://dashboard.local:8000` on LAN. HSTS, no http downgrade.
- **Auth:** `X-Api-Key: <32-char random>` generated on first run, stored in `.env` (`DASHBOARD_API_KEY`), required for `/api/*` except `/health` (health is unauth but rate-limited). Frontend injects key from env at build. Option to upgrade to JWT later without code change (middleware).
- **CORS:** `allow_origins=["http://localhost:5173","https://dashboard.local","http://10.1.156.101:8000"]` — no `*`.
- **Validation:** Pydantic models for every query: `meter` must be in `SLAVE_IDS`, `from/to` ISO8601, `period ∈ {daily,monthly}`. Parameterized `SELECT ... WHERE meter_id=? AND ts BETWEEN ? AND ?`. Max `limit=10000`, CSV streaming not buffered fully.
- **Secrets:** `.env` gitignored, `chmod 600` equivalent via ACL `icacls .env /inheritance:r /grant:r "%USERNAME%:(R,W)"`. `config.yaml` holds non-secrets (host, IDs, CT ratios). No hardcoded creds.
- **Least privilege:** Service runs as `NT SERVICE\Dashboard` or `dashboard` local user, not SYSTEM/Admin, only RW to `Dashboard\data\` and `Dashboard\logs\`.
- **Dependencies:** `requirements.txt` pinned (`fastapi==0.115.*`, `pymodbus==3.6.*`), `package-lock.json` pinned, `npm audit` clean before build.
- **Logging:** No meter values in error logs beyond WARN, no keys logged, logs to `logs/app-YYYY-MM-DD.log` rotated, EventLog entry on service crash.

---

## 6. Zero-maintenance ops — "after build, forget"

- **Auto-start:** WinSW `dashboard.xml` → `onFailure action="restart" delay="5 sec"`, `startDelay 0`, `resetFailure 1 hour` but we set infinite restarts. Host reboot → dashboard up <10s after PowerStudio.
- **Health:** `GET /health` returns `{gateway:{reachable,latency_ms,last_ok}, powerstudio:{reachable,devices}, slaves:[{id,status,stale_s,last_ok}], uptime_s, version}`. UI Health card polls 10s.
- **Backups:** `scripts/backup.ps1` scheduled task 02:00 daily copy DB + config to `backups/`, keep 7 dailies + monthly.
- **Portability:** To move laptop → server: `robocopy C:\Users\User\Downloads\Dashboard \\server\Dashboard /MIR`, edit `backend\.env` `GATEWAY_HOST`, `SLAVE_IDS` labels, run `.\install-service.ps1`. No code edit.
- **Config single point:** `backend/config.yaml` (+ `.env` override):
  ```yaml
  gateway: {host: 10.1.156.12, port: 502, timeout_ms: 800, poll_ms: 3000, keepalive_s: 15}
  slaves: [31,32,33,11,12,13,16,19] # + per-ID {name, model, ct_ratio, pt_ratio, group}
  powerstudio: {host: 127.0.0.1, port: 80, enabled: true, poll_ms: 5000}
  groups: ["All meters"] # or ["Main","Floor1","DG"]
  security: {api_key: "${DASHBOARD_API_KEY}", cors_origins: [...], rate_limit_per_min: 60}
  storage: {db_path: "data/dashboard.db", retention_days: 90}
  ```
  Change group names / CT 200/5A here → restart service → UI updates.

---

## 7. What we will build (phases, each verifiable)

**Phase 0 — Tooling (30 min):** winget install Python 3.12 + Node 20 LTS + verify `python --version`, `node --version`. No reboot needed.

**Phase 1 — Backend skeleton + simulator (2-3 h):** FastAPI + `/api/live` returning normalized 8 meters (simulator), `/health`, SQLite init, config loader, CORS, API-key middleware, rate limit. Verify `curl http://localhost:8000/api/live → 8 meters`, `curl /health → gateway unreachable but simulator active`. Logs show `SIMULATOR MODE`.

**Phase 2 — Hardened Modbus poller (3-4 h):** pymodbus TCP client with keepalive, per-ID isolation, circuit breaker, backoff, dual poller for PowerStudio XML, merge logic. Verify with `Test-NetConnection` still false → stays simulator; with mock gateway (local modbus server) → flips to `source=gateway`, latency <50ms, one ID killed → other 7 still green.

**Phase 3 — Frontend enterprise UI (4-5 h):** Vite React, Tailwind, combined strip pinned, group sections → cards, SSE wiring + fallback, stale handling, sparkline, detail drawer Live|Today|History|Info, Health view. Verify in simulator: all 8 cards show kW/kWh/V/I/PF, combined = sum, staleness injection turns card grey.

**Phase 4 — History & export (2 h):** Daily/monthly aggregation cron 00:05, `/api/history` + `/api/export.csv` streaming, retention. Verify `GET /api/history?period=daily → 30 rows`, CSV download.

**Phase 5 — Service hardening & docs (2 h):** WinSW `dashboard.xml`, `install-service.ps1`, `backup.ps1`, firewall rules script `scripts/secure-firewall.ps1`, `OPS.md` 1-pager, `SESSION_LOG.md:8` update, `README.md` quick-start final. Verify `Restart-Service Dashboard` → API recovers <5s, reboot test.

**Total:** ~13-16h across sessions, each phase leaves a runnable checkpoint so you can pause after any phase.

---

## 8. Gaps we close on site (no blocker for build)

- You paste 8-line ID→meter map when ready — we default to `31=CVM-C11` etc. and you edit `config.yaml` 1 line per meter.
- You paste CT/PT (e.g. `31 200/5A`) — default 1.0 until then (direct).
- Plug Ethernet to 10.1.156.0/24 → `Test-NetConnection 10.1.156.12 -Port 502 → True` → backend auto-detects gateway, no restart needed (poll 3s later flips from simulator).
- Calibrate decoders live vs front-panel: read holding regs 0x00-0x50 for each ID, compare float vs int32 vs CDAB order, lock `decoder` per ID in config.

---

## 9. Risks & mitigations

- **LG6435 vs LG6435E vs EM6435 register shift** → probe function on first live connect, store discovered map, don't guess.
- **Word order ABCD vs CDAB** → try both, match display within 2% → lock.
- **PowerStudio empty project** → already handled: gateway primary, PowerStudio optional, dashboard works either way; later Editor config just adds source without code change.
- **Python not installed** → winget fixes in 5 min, pinned versions avoid drift.

---

## 10. Decision needed

Reply **"Build"** and I will start Phase 0→1 now (install tooling, scaffold backend+simulator, verify API). Alternate: **"Build offline only"** (skip Modbus until you are on site) or **"Modify plan"** (tell me groups/CT now).

After each phase I will update `SESSION_LOG.md:102-113` so any new session resumes exactly.

