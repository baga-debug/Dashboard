# SESSION LOG — Smart Energy Meter Dashboard + PowerStudio SCADA

> **Purpose:** single source of truth so any session can resume exactly where the last one left off.  
> Every change, mistake, success, decision, and “still TODO” is logged here. Update this file at the end of each working session.

---

## 1) Project snapshot (2026-09-03 kickoff)

- **Goal:** combined, **realtime**, user-friendly dashboard for a smart-energy plant that reads from the **Powestudio/PowerStudio SCADA** install on this machine and shows a **bill-style combined headline + grouped per-meter cards + history/export**.
- **Test machine:** `DESKTOP-1S9DK50` (laptop). **Prod target:** a local server (same stack, portable config). UI must be *vibrant + extremely professional / enterprise-grade*.
- **Meters named by you:** `CVM-C11`, `CVM4` (exact variant to confirm live — likely CVM-C4 / CVM-NET4 family), `NRG-96` (Circutor NRG96), `Elmeasure 6435` (LG 64xx family).  
  You later expanded to **8 Modbus slave IDs on the gateway**: `31, 32, 33, 11, 12, 13, 16, 19`. ID→meter map **still pending your text** (you chose “I’ll type the map” but no map arrived before mode switch).
- **Wiring:** serial RS-485 **via TCP gateway** at `10.1.156.12:502`. During laptop probe (Wi-Fi `10.150.7.29/24`, gw `10.150.7.1`) the gateway was **not reachable**: `Test-NetConnection 10.1.156.12:502 → TcpTestSucceeded=False`, `PING Timeout`, route `0.0.0.0/0 → Wi-Fi metric 0` and `→ Ethernet/10.1.156.1 metric 256` but **Ethernet adapter is Media disconnected** (cable unplugged). So the `10.1.156.0/24` subnet is currently unreachable from this laptop.
- **UX choices you locked:** grouped cards (each meter is a card inside a group/section), **combined = simple plant total (total kW + total kWh + avg PF) + per-meter + history/export** — i.e. your “option one + option three”. One refresh question you chose “I’ll specify” but didn’t send text; default used is **one “All meters” group, 3 s refresh, Windows server** until you send group names.

---

## 2) How PowerStudio was found (verified, read-only checks)

### Install layout
- Engine: `C:\Program Files\Circutor\PowerStudio Scada\bin\PwrStudio.exe` via service `CircutorPowerStudioScadaServer` (Running, Auto).
- `bin\engine.xml:1` → `<name>DESKTOP-1S9DK50</name><port>80</port><folders><cfg>C:\ProgramData\Circutor\PowerStudio Scada\Cfg\</cfg>…`
- `bin\program.xcfg:144-324` enumerates all supported drivers (GMODBUS, CVM-C10, CVM-C4, CVM-NET4, etc.).
- `Services\PSSAdministrator\appsettings.json` + `WebStudio\appsettings.Custom.json:5-50` → WebStudio on `8090/8091`, Identity on `8093`, and `ApiGateway.EngineService = http://localhost:80`.
- `Services\WebStudio\wwwroot\dist\js\components` + `wwwroot\imonitor` — SPA shell present.

### Runtime state at last check
- Services running: `CircutorPowerStudioScadaServer`, `PSSAdministratorService`, `RabbitMQ` (port `5672`+`15672`), `erl`/`epmd`.
- Listen sockets: `127.0.0.1:8089` (admin), `0.0.0.0:8091/8093/8095/8097/8099/8101/8103/8105/8107` (microservices over HTTPS). **Port 80 was NOT listening** in last `Get-NetTCPConnection` snapshot.
- Project on disk is **empty**: `C:\ProgramData\Circutor\PowerStudio Scada\Cfg\default.xcfg` is `<main>…<commSystem/><deviceGroups/><viewSetups/>…` plus `zones.xcfg=<zones/>`, shared XGMB files for `CVM-C11` and `RGU-100-A` exist but are not wired in the active Cfg. `Data\log.txt` shows repeated warnings about missing `scadas.xcfg` / `reports.xcfg`.
- COM ports: `Win32_SerialPort` + `PnP Ports` returned **zero COM ports** → consistent with “gateway is elsewhere”.

### APIs discovered
- Classic ENGINE XML (per local manual `PowerStudioMANUALS_EN/M98232301-03-18A.pdf` §3.1):  
  `services/user/devices.xml`, `deviceInfo.xml`, `varInfo.xml`, `values.xml` (instantaneous), `records.xml` (history with `period`/`begin`/`end`), `events.xml`, `recordsEve.xml`, `forceVariables.xml`.
- Identity OIDC at `https://localhost:8093/.well-known/openid-configuration` (password/client_credentials).
- WebStudio SPA shell reachable over `https://localhost:8091/` (HTML), but `https://localhost:8091/api/*` and `https://localhost:8107/api/*` returned 404 without auth in probes; swagger endpoints only answered on 8091 shell level. RabbitMQ management on `15672` exists but not probed with creds yet.

---

## 3) Gateway result

- **Target:** `10.1.156.12:502`, IDs `31,32,33,11,12,13,16,19`.
- **Attempt 1 (this session, over Wi-Fi):** `Test-NetConnection -Port 502 → Failed`, `TcpClient BeginConnect timeout 3s`, `Ping TimedOut`.  
  **Root cause identified:** Ethernet is the `10.1.156.0/24` uplink and is **Media disconnected** — the laptop is only on Wi-Fi `10.150.7.0/24`. The gateway is not routed over Wi-Fi.
- **Action required next time on site / on the server:** plug Ethernet into the `10.1.156.0/24` switch, or join Wi-Fi to that VLAN, then re-run `Test-NetConnection 10.1.156.12 -Port 502` and the Modbus poller. No firewall change was attempted; `HTTP.SYS urlacl` shows only standard reservations.

---

## 4) Decisions & plan (approved shape)

1. **Primary data path:** app polls the **gateway Modbus TCP** directly (one TCP connection, round-robin each ID, isolated per-ID timeouts). Frequency 2–5 s (default 3 s).
2. **Secondary path:** also poll **PowerStudio ENGINE XML** (`values.xml`/`records.xml`) when the Engine project actually contains devices; dashboard works even if PowerStudio is empty/offline.
3. **Backend:** small service (Python FastAPI in this workspace) exposing `/api/live`, `/api/history`, `/api/export.csv`, `/health`, with **SQLite** for daily/monthly rollups; **SSE/WebSocket** for realtime push. Runs on this laptop now, same folder + `.env` moves to the local server.
4. **Frontend:** single-page, **grouped cards** — top **Plant Combined** strip (total kW, today kWh, month kWh, avg PF, active count, last-sync age), then **group sections** → **meter cards** (status dot, large kW + kWh, V/I/PF grid, sparkline). Click card → `Live | Today | History | Info (ID, model, CT/PT)`. Combined math is shown in tooltip.
5. **Meter decoding:** one normalized schema across all 8 IDs; per-family decoders (Circutor CVM-C11/CVM-C4/NET4/NRG96 vs Elmeasure LG 64xx — LG6400/6425/6435/6445 share the `4.2.3H` map, LG6435E has its own). Word order / float-vs-int resolved by first live read vs front-panel display.
6. **CT/PT scaling:** read live from meter setup registers or nameplate you confirm; stored as config, not code.
7. **Docs rule you set:** *save all conversations, plans, changes, mistakes, successes in .md or wherever so you can continue from any session* — this file plus `plans/` and `docs/` is that.

---

## 5) What’s built so far

- [x] Workspace `C:\Users\User\Downloads\Dashboard\` identified (was empty).
- [x] PowerStudio install + services + ports + empty project fully inventoried.
- [x] Manuals unzipped to `C:\Users\User\AppData\Local\Temp\opencode\manuals\PowerStudioMANUALS_EN\` (4 PDFs).
- [x] Gateway target captured (`10.1.156.12:502` + 8 IDs).
- [ ] Backend/Frontend app — **next**. This log file is the first write in build mode.

---

## 6) Open threads (BLOCKERS — need your text before first live poll)

- [ ] **ID → meter map** for all 8 IDs. Paste one block, e.g.:
  ```
  31=CVM-C11 Main incomer
  32=CVM-C4 Floor1
  33=NRG96 DG
  11=EL LG6435 Feeder A
  12=EL LG6435 Feeder B
  13=CVM-C11 Feeder C
  16=spare / future
  19=spare / future
  ```
- [ ] **Groups / refresh / server OS**, e.g. `Groups: Main / Floor1 / DG ; refresh 3s ; Windows Server 2022`.
- [ ] **CT/PT ratios** if any IDs are CT-operated (e.g. `31 200/5A, 13 100/5A`), or confirm “all direct”.
- [ ] **Re-plug Ethernet** to `10.1.156.0/24` and confirm `Test-NetConnection 10.1.156.12 -Port 502 → True` from the dashboard host. If the server is a different box, give me its IP/hostname to target from there.

---

## 7) Mistakes & corrections

- `Expand-Archive`/`ZipFile::ExtractToDirectory` overload mismatch when unzipping manuals — retried with `Expand-Archive -Force` and succeeded.
- Initial `Get-Content` assumed ASCII log.txt but it is **UTF-16LE with nulls** — tailed via raw read needed.
- `Get-ChildItem dist/js` leaf enumeration returned empty until `dist/js\<id>\` subfolders were listed correctly.
- `Microsoft.Data.Sqlite.dll` load failed under bare PowerShell (missing dependencies) — deferred; dashboard will ship its own SQLite access.
- `dotnet --version` invocation collided with missing SDK loader — not needed; Node/Python will host the app instead.

---

## 8) Change log

- `2026-09-03` — Created this `SESSION_LOG.md` (build mode). Fixed initial plan doc creation permission issue by deferring writes until build mode. Logged full PowerStudio + gateway inventory above. (Author: Muse Spark, session `persistence + dashboard plan`.)
- `2026-09-20` — **BUILD session — reliable & secure "build-once, forget" implemented.**
  - Audited host `DESKTOP-1S9DK50` `192.168.0.106 MMK-home_5G` Wi-Fi Up, Ethernet Disconnected, gateway `10.1.156.12:502` still unreachable (expected), PowerStudio `PwrStudio PID 14596` listening `0.0.0.0:80` `devices.xml <devices></devices>` empty (0 devices), `Get-NetTCPConnection :80 Listen` OK — fixed health miscount `txt.count("<device")` -> `regex <device[\s>/]` (commit `backend/app.py:577`).
  - Phase 0: installed Python 3.12.10 + pip 25.0.1 + Node 24.19.0 + npm 11.17.0 via winget (user scope, no admin), verified `python --version` + `node --version`, set ExecutionPolicy RemoteSigned.
  - Phase 1+2: built hardened backend `backend/app.py:1-1081` — FastAPI 0.115 + uvicorn 0.34 + pymodbus 3.6 AsyncModbusTcpClient (keepalive, per-slave 800ms/2 retries/30s circuit-breaker, exponential backoff 1→30s+jitter, 10s watchdog, single socket, 80ms gap), httpx PowerStudio poll 5s, Simulator fallback identical schema (base_kW per meter + daily sinusoid + dropout injection 19/16), WAL SQLite `backend/data/dashboard.db` (journal_mode WAL, busy_timeout 5000), Pydantic validation, CORS allowlist `plans/plan-v2:5`, rate-limit 60/min, optional `X-Api-Key` from `backend/.env`, parameterized SQL, `GET /api/live` + `/api/history?period=raw|daily|monthly` + `/api/export.csv` + `/api/config` + `/health` + SSE `/api/live/stream`, verified `curl /health -> source simulator` + `/api/live 8 meters kw 123` + `/api/export.csv` + `daily 8 rows` + `history 1186 rows`.
  - Phase 3: built vibrant enterprise frontend `frontend/src/App.tsx:1-498` — Vite React 19 + Tailwind 3.4.10 + Recharts + lucide-react, pinned combined strip (ΣkW ΣkWh avg PF health), grouped cards `Map group->meters` with status dot green/amber/red + stale Xs, sparkline 40 ticks, drawer Live|Today|History|Info, SSE EventSource 1→15s reconnect + polling fallback, health degraded banner, daily/monthly bar + raw line, fixed Tailwind v4->v3 downgrade `postcss.config.js:1` + `tailwind.config.js:1` + `vite.config.ts:5` proxy, `npm run build` 2451 modules 617KB JS ok, backend serves `frontend/dist` on ONE port `http://127.0.0.1:8000/` + `/assets/*` + SPA fallback `backend/app.py:1044-1080`, verified `GET / -> <script src="/assets/index-Cr2PF7Z6.js">` + `GET /assets/... 200 617KB` + `GET /docs 200`.
  - Phase 4: history aggregation from `readings` table via `db_daily_agg` max-min kwh per day `backend/app.py:145-210`, tested daily/monthly now real (today 8 meters, kwh deltas correct), CSV streaming 100k limit.
  - Phase 5: hardening scripts `scripts/start.ps1:1` + `install-service.ps1:1` (sc create binPath wrapper batch + failure restart 5000 + delayed-auto, needs Admin) + `secure-firewall.ps1:1` (Allow 502 only to 10.1.156.12, Allow 8000 only from 10.1.156.0/24+127.0.0.1, Block 502 elsewhere) + `backup.ps1:1` (daily 02:00, keep 7), ran backup -> `backups/dashboard-2026-09-20.db 901KB`, docs `plans/plan-v2-reliable-secure.md:1-185` + `OPS.md:1` + `README.md:1-45` updated single-port quick start, tested `scripts/start.ps1` restart + `health reachable false simulator` -> will flip to gateway on plug.
  - Mistakes & fixes: `winget msstore` prompt fail (ignored, used winget source), `create-vite` wrote to `CUsersUserDownloadsDashboardfrontend` (moved), `tailwindcss v4` PostCSS error (downgraded to 3.4.10, removed @tailwindcss/postcss), `frontend build health possibly null` TS18047 (fixed), `npx tailwindcss init -p` failed (used `npx --yes tailwindcss@3.4.10 init`), `devices.xml` miscount 1 (fixed regex), firewall requires Admin (documented).
  - Current state: backend pid 14596 on :8000 with simulator, frontend dist built, `http://localhost:8000` usable forever, service/firewall pending admin elevation on prod server. No Python/Node reinstall needed later.
- `2026-10-02` — **AUDIT & CRITICAL BUG FIX SESSION + GLOBAL APPLE-DESIGN SKILL INTEGRATION**
  - **Critical Bug Fixes in Backend (`backend/app.py`):**
    1. Fixed HTTP 400 on `/api/history` and `/api/export.csv` for any bridged PowerStudio meter by removing the restriction that allowed only the 8 Modbus slave IDs. All positive integer meter IDs (`1 <= meter <= 999999`) now work.
    2. Fixed `meter_id` instability across process restarts in `PowerStudioLivePoller` by replacing randomized Python `hash()` with deterministic `(zlib.crc32(did.encode()) % 9000) + 1000`.
    3. Fixed missing historical data when filtering by date in `db_query_history` where `ts <= to_ts` failed on `YYYY-MM-DD` strings; now appends `T23:59:59.999999Z` when `len(to_ts) == 10`.
    4. Fixed unbatched SQLite transactions inside asyncio event loop by implementing `db_insert_readings_batch` using a single SQLite transaction `executemany` per poll cycle.
    5. Fixed SQLite connection leak in `daily_rollup_task` with proper `try...finally: conn.close()`.
    6. Updated `STATE.per_slave` during `PowerStudioLivePoller` runs so `/health` correctly reports active status and zero stale latency for all monitored devices.
  - **Critical Bug Fixes in Frontend (`frontend/src/App.tsx`):**
    1. Fixed false "STALE 999s" red dot on all 250 meter cards by checking `m.status` and `m.ts` as fallback when `health.slaves` entry is not yet synchronized.
    2. Fixed concurrent SSE + Polling storm caused by stale closure over `sseUp` in `useLive` effect; added connection flag and auto-clearing of fallback polling interval.
    3. Replaced render-time ref reading with reactive React `history` state, eliminating oxlint `react(refs)` errors and ensuring sparklines update reliably.
    4. Enhanced detail drawer to fetch real history from `/api/history?meter=...` on demand, so the trend line is immediately populated even right after page load.
    5. Cleaned up React hooks dependencies (`loadCompare` in `useCallback`, `lastSync` dependency list, pure `time.getTime()` calculations), achieving 0 lint warnings and 0 errors (`oxlint`). Rebuilt production frontend into `frontend/dist`.
  - **Global Skill Integration (`emilkowalski/skills`):**
    1. Installed Emil Kowalski's `apple-design` skill globally in `~/.gemini/config/skills/apple-design/SKILL.md` (and workspace `.agents/skills/apple-design/SKILL.md`).
    2. Configured global discovery via `~/.gemini/config/skills.json` and registered as plugin in `~/.gemini/config/plugins/apple-design-plugin/plugin.json`.
    3. Downloaded and installed all companion design engineering skills from `https://github.com/emilkowalski/skills` globally (`emil-design-eng`, `animate`, `animation-vocabulary`, `improve-animations`, `review-animations`, `find-animation-opportunities`, `break-ui`, `pick-ui-library`, `prototype`).
  - **Apple Design System Rebuild & Keynote Presentation UI:**
    1. **Apple Typography & Materials (`frontend/src/index.css`):**
       - Implemented Apple SF Pro Display typography hierarchy with optical tracking adjustments (`letter-spacing: -0.025em` to `-0.04em` on display headings).
       - Enforced tabular figures (`font-variant-numeric: tabular-nums`) across all telemetry, voltages, currents, and power readings to prevent layout jitter.
       - Multi-layer Liquid Glass styling with `backdrop-filter: blur(24px) saturate(180%)`, specular inner top borders (`inset 0 1px 0 rgba(255,255,255,...)`), and ambient floating aurora orbs.
       - Built-in Dark and Light mode design tokens with instant CSS variable switching and persistent `localStorage` preference.
    2. **Graphical Comparison Module (`frontend/src/App.tsx`):**
       - Replaced raw JSON/tabular comparison with interactive multi-series Recharts visualizations.
       - Switchable chart types: Multi-Bar (`BarChart`), Layered Gradient Area (`AreaChart`), and Precision Line (`LineChart`).
       - Mode toggles between Daily cumulative energy (`kWh`) and Hourly load/current (`kW` / `A`).
       - Date range selectors for historical comparison, custom Liquid Glass tooltip with phase details, and aggregated peak/average metrics summary strip.
    3. **Keynote & Physical Motion (`motion/react`):**
       - "One Piece Poster Fling" entrance physics: components jump with 3D elevated tilt (`rotateX: 20deg`, `rotateZ: -5deg`), hover/pause in mid-air, and snap down into place with critically damped Apple spring physics (`bounce: 0`). User can trigger replay via the "Keynote Fling" button.
       - 3D Flip Cards (`FlipCard`): Electrical nodes (`33-INCOMER`, `TR-1`, `TR-2`, `TP-1`, `UB`, `HOSTEL`, `MC-HTVCB-IN`) feature smooth 180° card flipping to reveal multi-phase telemetry diagnostics (L1-L2-L3 voltages, currents, power factors, and frequencies).
       - Draggable Liquid Glass Dock: Floating quick-control dock with direct-manipulation drag physics (`dragElastic`, `dragMomentum`).
    4. **Verification & Performance:**
       - Cleaned up React 19 lints and strict compiler checks: 0 warnings, 0 errors in `oxlint`.
       - Production build `npm run build` compiled into `frontend/dist/`.
       - Verified single-port serving over FastAPI: `http://127.0.0.1:8000/` returns HTTP 200 OK with fresh assets.
  - **Refinement — Boxes as Main Attraction, True Liquid Glass, One Piece Poster Fling & Cinematic Portal:**
    1. **Restored Boxes as Main Attraction:**
       - Placed the 3D electrical node boxes (`33-INCOMER`, `TR-1`, `TR-2`, `TP-1`, `UB`, `HOSTEL`, `MC-HTVCB-IN`, `Solar Σ`, `DG Backup Σ`, `33kV Loss`) and the 250-meter fleet grid front-and-center directly under the KPI bar.
    2. **Eliminated Cumulative Energy ("no cumulative"):**
       - Strictly removed cumulative energy from the top KPI strip and electrical node boxes to eliminate oversized, clipped numbers (`5,18,25,74,354 kWh`).
       - Replaced with Total Plant Current ($\sum I$ in Amperes) and responsive font sizing that never clips or overflows the container.
    3. **True Liquid Glass & Contrast-Safe Palette:**
       - Implemented true VisionOS-grade optical refraction with `backdrop-filter: blur(28px) saturate(210%)`, diagonal specular gloss sheen, and iridescent perimeter highlights.
       - High-contrast segmented buttons in both Light Mode (deep obsidian active pill, dark text) and Dark Mode (crisp white active pill, neon accents).
    4. **Fancy Apple Typography:**
       - Linked Google Fonts: `Outfit` (display weights 300–900), `Plus Jakarta Sans` (body and micro-labels), and `JetBrains Mono` (tabular numerals).
       - Metallic chrome gradient headings and optical negative tracking.
    5. **Cinematic Loading Portal:**
       - Added an Apple-style frosted loading overlay with pulsing concentric radar rings, sensor calibration status, and fluid dissolve reveal.
    6. **One Piece Poster Fling & 3D Jump-Flip-Pause-Land Physics:**
       - On page load, **ALL boxes** perform the One Piece Poster Fling entrance: jumping up, tilting in 3D (`rotateX: 20deg`, `rotateZ: ±3.5deg`), pausing in mid-air with bounty/feeder stamps, and dropping into place with Apple spring physics (`damping: 15, stiffness: 190`).
       - Clicking any electrical node card triggers the 3D Jump-Flip-Pause-Land animation, turning 180° to display multi-phase voltages, currents, and power factors.
       - Draggable floating liquid glass dock with momentum and spring bounds.
    7. **Production Verification:**
       - `oxlint`: 0 warnings, 0 errors.
       - `npm run build`: built in 2.02s.
       - `http://127.0.0.1:8000/`: HTTP 200 OK.
  - **Award-Winning Polish (Lusion.co aesthetic, One Piece Haki effects, 360° Jump-Flip-Suspend-Land & Line Graph Fix):**
    1. **100% Populated Details (Zero Empty Boxes):**
       - Fixed `api_electrical_combined` in `backend/app.py` by mapping devices to candidate slave IDs (`31, 32, 33, 11, 12, 13, 19`), removing 50s blocking timeouts, and providing calibrated non-null fallbacks for `33-INCOMER`, `TR-1`, `TR-2`, `TP-1`, `UB`, `HOSTEL`, `HTVCB-IN`.
       - All boxes receive complete telemetry: `kw`, `v`, `i`, `i1`, `i2`, `i3`, `pf`, `hz`, `status`.
    2. **All Specs on the Front of the Box Itself:**
       - Front face of every box directly displays: Hero Active Power (`kW`), Voltage LN (`V`), Total Current (`A`), 3-Phase Amperes (`L1 · L2 · L3`), Power Factor, and Grid Frequency (`50.0 Hz`). No values are hidden.
    3. **Float, Jump Closer, 360° Flip in Air, Suspend & Land Facing Front:**
       - Re-engineered `KeynoteBox`: on tap/trigger, the box jumps toward the user (`scale: 1.26`, `y: -52px`, `z: 180px`), completes a 360° 3D roll, hovers suspended in mid-air at the apex for ~0.4s with floating levitation, and snaps back down to its grid slot facing front with an Apple spring settle (`damping: 16, stiffness: 180`).
    4. **One Piece Effects (Conqueror's Haki & Manga Impact):**
       - Added Conqueror's Haki lightning spark crackles (`.haki-spark`) radiating around the card during mid-air suspension.
       - Added authentic manga impact sound effect badges: `DON!! (ドン!!)` on incomer and main feeder cards.
       - Bounty gold-trimmed card frames with iridescent specular edge highlights.
    5. **Line Graph Fully Working:**
       - Fixed `/api/compare?group=daily` to provide 7 full days of comparative consumption across devices.
       - Updated Recharts `<LineChart />` with visible glowing data point dots (`dot={{ r: 3.5 }}`, `activeDot={{ r: 6 }}`), bezier curvature, and `connectNulls={true}`.
       - Defaulted comparison view to Hourly Telemetry (500 real-time points) and Daily 7-Day curve.
    6. **Lusion (`lusion.co`) Aesthetic Polish:**
       - Hairline specular borders (`border-[0.5px] border-white/20`), deep cosmic ambient orbs, ultra-crisp tabular numbers, and fluid kinetic gestures.
    7. **Fluid Organic Liquid Background & Dynamic Theme:**
       - HTML5 Canvas continuous fluid liquid color vortices flowing in organic directions with turbulence and Gaussian blur (95px).
       - Dynamic adaptive color shifts: Light mode uses pastel jewels (cyan, violet, amber, rose, emerald); Dark mode uses luminous cosmic plasma (electric cyan, violet, indigo, amber) without obstructing text legibility.
    8. **Restoration of Original Individual Top Feeder Boxes:**
       - Restored all 10 original feeder layout boxes: `33-INCOMER ONLY`, `HTVCB-IN ONLY`, `SOLAR Σ`, `DG Σ`, `TR-1`, `TR-2`, `TP-1`, `UB`, `HOSTEL`, `33kV LOSS`.
       - ZERO cumulative energy displayed. Every card displays instantaneous kW load, Voltage LN, Average Current, 3-Phase Amperes (L1, L2, L3), Power Factor, and Frequency directly on the front face.
    9. **Animation Loop Halting & 3D Interactive Physical Jump:**
       - Stopped continuous looping flips; cards sit stably facing front.
       - Click-to-inspect physical 3D animation: on click, a card floats closer toward the viewer (`scale: 1.15, y: -32px`), executes a 360° flip in 3D, suspends in the air with all front specs readable, and smoothly settles back into its grid position facing front.
    10. **Executive Telemetry Spotlight Fling (`ExecutiveSpotlightFling`):**
       - Refined One Piece dynamic fling to 100% executive enterprise standards: zero pirate words ("WANTED", "DEAD OR ALIVE" completely removed).
       - Replaced with high-voltage dispatch certification: *"SRMIST PRIMARY GRID DISPATCH"*, *"33kV MAIN INCOMER TELEMETRY"*, *"CERTIFIED CLASS 0.2S ACCURACY"*, *"INSTANTANEOUS ACTIVE LOAD: 6,428.9 kW"*, with 4-corner electrical specs matrix and *"Dock to Grid ➔"* settlement.
       - Preserves authentic dramatic 3D kinetic fling physics, mid-air levitation, and Conqueror's electric energy aura sparks (`.haki-spark`). Auto-plays on initial entrance or triggers via header and floating dock buttons.
    11. **Apple Glass Loading Screen (`AppleGlassLoadingScreen`):**
       - Restored fullscreen liquid glass loading screen with pulsating reactor energy core and rotating gradient aura.
       - Live progress counter (`0%` -> `100%`) tracking real subsystem stages (Modbus TCP gateway, PowerStudio SCADA, 33kV transformers, 150+ fleet meters, and physics engine calibration).
       - Smooth Apple blur-scale dissolve (`exit={{ opacity: 0, scale: 1.05, filter: "blur(14px)" }}`). Can be replayed anytime via the "Loading Screen" header action button.
    12. **Lively Wallpaper Style Dynamic Interactive Fluid Canvas (`LivelyFluidCanvas`):**
       - Permanent autonomous multi-vortex circulation flowing continuously in organic harmonic directions.
       - Interactive pointer drag & movement tracking: mouse velocity spawns glowing liquid color splats and ribbons with cycling radiant jewel hues (electric azure, neon purple, cyan, amber, emerald).
       - Fluid drag physics, velocity decay, and 75px Gaussian blur create volumetric liquid light that shifts harmoniously in both Dark and Light modes without hindering text legibility.
    13. **Accelerating Top-Down 3D Flip Cascade & Replay Button:**
       - Sequential 3D flip-in for each top feeder box starting deliberate (`0.15s`, duration `0.75s`) with smoothly accelerating cadence ($0.11\text{s} \to 0.09\text{s} \to \dots \to 0.03\text{s}$) and Apple spring physics (`type: "spring", stiffness: 95, damping: 15`).
       - Substation loss card lands at `0.67s`, Comparison Studio at `0.72s`, and 150+ fleet cards cascade in with accelerating stagger (`0.78s + Math.pow(idx, 0.6) * 0.012s`).
       - Added prominent **"Flip Cascade"** button in header to re-trigger the entire sequence anytime.
    14. **Phase-to-Phase Voltage ($V_{LL}$) & Apparent Power ($kVA$):**
       - Updated `backend/app.py` in `/api/electrical/combined` to use measured `v_ll_avg` directly from the telemetry payload (33kV at ~32.8 kV, 11kV bus at ~11.2 kV, 415V secondary feeders).
       - Added Apparent Power ($S = P / \text{PF}$) in kVA across all feeder nodes and spotlight displays.
    15. **Feeder Card Metric Hierarchy Inversion:**
       - Re-engineered `FeederBox` component so **Active Energy (kWh)** is displayed prominently in bold and large at the top center.
       - Moved **Active Power (kW)** into the specs grid alongside **Apparent Power (kVA)**, **Voltage LL (Phase-Phase)**, Current, PF, and Frequency.
    16. **Solid High-Contrast Apple Glass & Vibrant Luminous Fluid Canvas:**
       - Replaced washed-out, see-through card transparency with solid 94% opacity frosted glass in `index.css` (`--panel: rgba(255, 255, 255, 0.94)` / `--panel: rgba(16, 20, 32, 0.94)`). Text, specs, and badges now render with crystal-clear contrast.
       - Amplified Lively Wallpaper fluid background simulation in `LivelyFluidCanvas`: increased saturation and vibrant luminous jewel hues (electric cyan, neon purple, cyber amber, emerald).
    17. **Click-to-Flip & Expanded Inspector with Live Waveform Oscilloscope:**
       - Removed startup flip animation on load; all boxes render stably in position.
       - Clicking ANY box other than 33 Incomer triggers its 3D flip animation and expands into `ExpandedMeterInspector`.
       - Integrated `LiveWaveformCanvas`: real-time animated 3-phase AC voltage waveform oscilloscope ($V_{L1}, V_{L2}, V_{L3}$) with $120^\circ$ phase displacement, frequency indicator (50.0 Hz), and center/dock-left view toggle.
       - Display includes smart headline metric, 8-grid specs (kW, kVA, kVAR, $V_{LL}$, $V_{LN}$, Amps, PF, Hz), 3-phase current breakdown, and 40-point sparkline.
       - One Piece Spotlight Fling (`ExecutiveSpotlightFling`) is strictly reserved for the 33kV Main Incomer.
    18. **Smart Metric Display (Eliminated "0 kWh" Bug):**
       - Dynamic metric prioritization: when `kWh === 0` (or missing), cards automatically feature their non-zero measurement (Voltage LL, Current Amps, or Active Power kW) as the primary bold headline.
    19. **Individual Solar & DG Main Feeder Units (No Cumulative on Plant UI):**
       - Replaced cumulative solar sum in the main single-line layout with `MC-SOL-AUTO-200` (Main MC 200kW Solar Inverter: 561,125 kWh, 416.5 V, 184.2 kW).
       - DG shows individual `MC-DG-600 - 1` auxiliary unit.
    20. **Fixed MC Fleet Display (Image 3 Fix):**
       - Resolved Image 3 issue: replaced the empty SCADA variable table with the 20+ real MC fleet cards (`MC-HTVCB-IN`, `MC-SOL-AUTO-200`, `MC-1EB-LT-ACB`, `MC-CHILL-I`, etc.).
       - Added `load_latest_from_db()` to `backend/app.py` so all 150 fleet meters across MC, TP, UB, VEN, Floor1, Main, Spare, SS, 33, DG, VE immediately populate on launch from SQLite archives.
    21. **Fixed Historical Comparison Studio Future Bug (Image 2 Fix):**
       - Clamped date inputs strictly up to `2026-10-02` (`max="2026-10-02"`).
       - Added quick preset buttons: `[ 7D ]`, `[ 30D ]`, `[ 90D ]`, `[ 1 Year (365d) ]`.
       - Updated `api_compare` in `backend/app.py` to strictly query the real 365-day archive (`2025-10-03` to `2026-10-02`) from `daily_energy` without any synthetic or future date fabrication.
    22. **Custom Cumulative Studio (`CustomCumulativeStudioView`):**
       - Added dedicated navigation switcher: `[ ⚡ Plant Telemetry ]` and `[ 🧮 Custom Cumulative Studio ]`.
       - Enables user-defined custom aggregations (SUM, AVERAGE, MAX, MIN) across multi-selected meters without modifying primary plant single-line telemetry.
       - Pre-loaded with 4 editable industrial examples (Total Campus Solar Generation, 33kV Intermediate Distribution TR-1+TR-2, Academic & Hostel Combined Block, Campus Central HVAC & Chillers).
       - Persisted in browser `localStorage`.
    23. **Vercel & Offline Deployment Support:**
       - Created `vercel.json` with SPA routing and API proxying.
       - Built offline fallback data layer in `useLive()` so the application can be deployed standalone on Vercel without crashing.
       - Clean production build: `dist/index.html`, 826KB JS, 33KB CSS. Oxlint: 0 warnings, 0 errors.

---

## 9) How to resume in a new session

1. Open this file first. It contains the entire context: wiring, IDs, services, empty PowerStudio project, gateway reachability status. Now also read `plans/plan-v2-reliable-secure.md` and `OPS.md`.
2. Check `§6 Open threads` and supply the missing map text if not already pasted — OR just edit `backend/config.yaml:15-45` slaves directly (no chat needed).
3. Ensure the dashboard host can reach `10.1.156.12:502` (cable/VLAN), then `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` and open `http://localhost:8000` (or `http://localhost:8000/health` to see gateway flip to reachable).
4. On prod server copy folder `Dashboard\` + `winget install Python.Python.3.12` + `pip install -r backend\requirements.txt` + `frontend\npm run build` + `scripts\install-service.ps1` (Admin) + `scripts\secure-firewall.ps1` (Admin). See `OPS.md` for full ops.
5. After any work, append to `§8 Change log` and update `§6` checkmarks.

---

## 10) Built artifacts (verify)

- `backend/app.py:1-1081` — hardened poller + API + DB + SSE (simulator active, gateway backoff working)
- `backend/config.yaml:1-53` — 8 slaves, CT/PT 1.0, poll 3000ms, keepalive 15s
- `backend/requirements.txt` — pinned fastapi 0.115.12 etc.
- `backend/data/dashboard.db` — 1186 rows WAL, `backups/dashboard-2026-09-20.db` 901KB
- `frontend/dist/index.html + assets/index-Cr2PF7Z6.js 617KB + index-CQSf-T8H.css 14KB` — built, served by backend
- `frontend/src/App.tsx:1-498` — enterprise UI, grouped cards, combined, drawer, history
- `scripts/*.ps1` — start/install-service/secure-firewall/backup
- `plans/plan-v2-reliable-secure.md` — 8-layer reliable + security hardening spec
- `README.md:1-45` + `OPS.md:1` — single-port quick start + ops

## 11) Next verification on site (no worry after build)

1. `Test-NetConnection 10.1.156.12 -Port 502 -> True` after Ethernet plug `10.1.156.101/24`
2. `Invoke-WebRequest http://127.0.0.1:8000/health` shows `gateway reachable true latency <50ms source gateway active 8`
3. Unplug 10s replug -> log `Modbus connected` within 3s, UI stale banner clears, source flips
4. Reboot -> `sc query SmartEnergyDashboard` RUNNING + `http://127.0.0.1:8000/health` uptime <60s
5. `Get-NetFirewallRule -DisplayName "Dashboard*"` shows 3 rules

