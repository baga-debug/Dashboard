# Start dashboard (backend + serves frontend dist on :8000)
#Usage: powershell -ExecutionPolicy Bypass -File scripts\start.ps1
$ErrorActionPreference="Stop"
$py="C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe"
$root="C:\Users\User\Downloads\Dashboard"
$backend="$root\backend\app.py"
$env:Path="$env:Path;C:\Users\User\AppData\Local\Programs\Python\Python312;C:\Users\User\AppData\Local\Programs\Python\Python312\Scripts"

# kill old
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Python312*" } | ForEach-Object { Write-Host "Stopping old python $($_.Id)"; try{ Stop-Process -Id $_.Id -Force }catch{} }
Start-Sleep -Seconds 2
Write-Host "Starting $backend on http://127.0.0.1:8000 and http://localhost:8000"
Start-Process -FilePath $py -ArgumentList "`"$backend`"" -WindowStyle Hidden -WorkingDirectory "$root\backend"
Start-Sleep -Seconds 3
try{
  $h=Invoke-WebRequest "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "Health: $($h.StatusCode) $($h.Content.Substring(0,120))"
  $live=Invoke-WebRequest "http://127.0.0.1:8000/api/live" -UseBasicParsing -TimeoutSec 5
  $j=$live.Content | ConvertFrom-Json
  Write-Host "Live: $($j.meters.Count) meters source=$($j.source) kw=$($j.combined.kw)"
  Write-Host "Open http://localhost:8000  (UI+API on one port)  or http://localhost:5173 if using vite dev"
} catch { Write-Warning "Start check failed: $_" }
