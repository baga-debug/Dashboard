# SRMIST Smart Energy Dashboard — Deployment Guide

This project consists of:
1. **Frontend**: Vite + React + TypeScript + Tailwind CSS (Apple Liquid Glass UI)
2. **Backend**: Python FastAPI with SQLite (`dashboard.db`), Modbus RTU/TCP engine, and PowerStudio SCADA poller (`172.16.160.49:5222`).

---

## Deployment Options at a Glance

| Deployment Target | Best For | Prerequisites | Live SCADA Connection? |
|---|---|---|---|
| **Option 1: Vercel** | Public cloud preview, executive presentations, portfolio | GitHub / Vercel account | Resilient demo fallback (or via Cloudflare Tunnel) |
| **Option 2: On-Prem Windows Server** | True substation plant operations (SRMIST campus) | Windows PC with Python 3.12 | **Yes** (direct campus LAN access) |
| **Option 3: Docker / Cloud VM** | Linux server, DigitalOcean, Render, Railway, AWS | Docker & Docker Compose | Yes (if network has campus VPN/route) |
| **Option 4: Cloudflare Tunnel** | Accessing on-prem campus dashboard from anywhere online | Free Cloudflare account | **Yes** (secure HTTPS tunnel to campus) |

---

## Option 1: Deploy to Vercel (Frontend Cloud)

The frontend is fully configured for Vercel with client-side SPA routing (`vercel.json`) and an intelligent offline fallback layer that serves certified campus snapshots when disconnected from the internal network.

### Method A: Via Vercel Web Dashboard (Easiest)
1. Push this repository to **GitHub** (or GitLab/Bitbucket).
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. In the **Project Configuration** screen:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click *Edit* and select `frontend` (or `./frontend`)
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
   * **Install Command**: `npm install`
5. Click **"Deploy"**.
6. Vercel will build and provide a live URL (e.g. `https://srmist-energy-dashboard.vercel.app`).

### Method B: Via Vercel CLI
From your terminal, navigate to the `frontend/` folder:
```powershell
cd frontend
npm install -g vercel
vercel
```
Follow the interactive prompts:
* *Link to existing project?* **No**
* *Project name?* `srmist-energy-dashboard`
* *Directory located?* `./`
* *Override settings?* **No** (Vercel automatically detects `vite.config.ts`)

To deploy to production:
```powershell
vercel --prod
```

---

## Option 2: On-Premises Windows Plant Server (Recommended for SCADA)

Since the meters communicate over the internal SRMIST campus network (`172.16.160.49:5222` and `10.1.156.12:502`), hosting the dashboard on a campus workstation or substation PC provides direct real-time telemetry.

### 1. Build the Production Frontend
Ensure the React production assets are compiled:
```powershell
cd frontend
npm install
npm run build
cd ..
```
The FastAPI backend is configured to automatically serve `frontend/dist` directly at `http://localhost:8000/`.

### 2. Run as an Automatic Windows Service (Runs on boot in background)
To ensure the dashboard starts automatically when the PC reboots (without needing a user to log in):
1. Right-click **PowerShell** and choose **"Run as Administrator"**.
2. Run the provided service installer script:
   ```powershell
   cd C:\Users\User\Downloads\Dashboard
   powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1
   ```
3. The dashboard service `SmartEnergyDashboard` will be created and set to **Automatic** startup.

### 3. Quick Start via Desktop Shortcut / Batch File
For operator workstations:
* Double-click **`START HERE - Double Click Me.bat`** or **`Smart Energy Dashboard.bat`**.
* The server will launch and automatically open `http://127.0.0.1:8000/` in the default browser.

### 4. Allowing Other Campus Computers to View the Dashboard
To open access to other PCs on the campus network:
1. Open PowerShell as Administrator and run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\secure-firewall.ps1
   ```
2. Any computer or tablet on the same campus Wi-Fi / LAN can now access the dashboard at:
   `http://<SERVER_IP>:8000` (e.g., `http://172.16.x.x:8000`).

---

## Option 3: Deploy with Docker & Docker Compose

For deploying on a Linux VM, on-prem Docker host, or cloud container services (Render, Railway, Fly.io, DigitalOcean):

### 1. Build and Run Container
```bash
docker compose up -d --build
```
This multi-stage Docker build:
1. Compiles the React + TypeScript frontend with Node 20.
2. Packages Python 3.12 with all required packages.
3. Copies `backend/data` and mounts SQLite `dashboard.db` persistently.
4. Starts FastAPI on port `8000`.

### 2. Useful Docker Commands
* Check logs: `docker compose logs -f`
* Stop service: `docker compose down`
* Restart service: `docker compose restart`

---

## Option 4: Secure Remote Access from Anywhere (Cloudflare Tunnel)

If the server is running on the local campus network, but you want external operators or executives to securely view live substation telemetry from home or mobile without VPN:

1. Install Cloudflare Tunnel (`cloudflared`):
   ```powershell
   winget install Cloudflare.cloudflared
   ```
2. Log in to Cloudflare:
   ```powershell
   cloudflared tunnel login
   ```
3. Create a quick tunnel directly to the local dashboard port:
   ```powershell
   cloudflared tunnel --url http://localhost:8000
   ```
4. Cloudflare will output a public HTTPS address (e.g., `https://random-subdomain.trycloudflare.com`) that securely routes traffic through Cloudflare's edge network to your local dashboard with zero open firewall ports!

---

## Environment & Configuration Check

Before deploying to production, verify:
* **`backend/config.yaml`**: Contains Modbus gateway IPs (`10.1.156.12:502`), meter addresses, CT/PT ratios, and PowerStudio SCADA URL (`172.16.160.49:5222`).
* **`backend/data/dashboard.db`**: Stores continuous 365-day energy rollups. Ensure directory permissions allow write access.
* **Health Check Endpoint**: Test with `curl http://localhost:8000/health` (returns `{"status":"ok"}`).
