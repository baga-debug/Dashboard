@echo off
color 0A
echo ========================================================
echo   SMART ENERGY DASHBOARD — ONE CLICK START
echo ========================================================
echo.
echo  This will start the dashboard and open it in your browser.
echo  Wait 3-5 seconds after double-clicking...
echo.
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\start-hidden.ps1"
timeout /t 2 >nul
start "" "http://127.0.0.1:8000"
echo.
echo  Dashboard should now be open at http://127.0.0.1:8000
echo  If not, double-click again or check backend\logs\app.log
echo.
echo  To close the dashboard, close the browser and run:
echo    taskkill /IM python.exe /F
echo.
pause
