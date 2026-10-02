@echo off
REM Smart Energy Dashboard — ONE-CLICK LAUNCH
REM Double-click this file. It starts the dashboard (if not already running) and opens it in your browser.
REM No tech knowledge needed — just wait 4 seconds after double-clicking.

title Smart Energy Dashboard

REM use PowerShell hidden launcher (no black window spam)
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\start-hidden.ps1"

REM also open immediately (hidden script will also open after health check)
timeout /t 1 >nul
start "" "http://127.0.0.1:8000"

exit /b 0
