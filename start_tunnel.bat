@echo off
title SRMIST Smart Energy - Cloudflare SCADA Tunnel
echo ==============================================================================
echo   SRMIST Smart Energy Substation - Secure Cloudflare Zero Trust Tunnel
echo   Forwarding on-prem SCADA telemetry (http://localhost:8000) to Cloud
echo ==============================================================================
echo.

where cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    set "PATH=%LOCALAPPDATA%\Programs\cloudflared;%PATH%"
)

echo Starting tunnel...
echo Look for the URL ending with '.trycloudflare.com' below:
echo.

cloudflared tunnel --url http://localhost:8000
pause
