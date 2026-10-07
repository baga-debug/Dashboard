Remove-Item -Force "c:\Users\User\Downloads\Dashboard\test_ps.py" -ErrorAction SilentlyContinue

Set-Location "c:\Users\User\Downloads\Dashboard\frontend"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed"
    exit 1
}

Set-Location "c:\Users\User\Downloads\Dashboard"
git add -A
git commit -m "Accelerate telemetry polling to 2s, add dynamic chart units & sanitize daily baseline"
git push origin main

# Restart local backend detached
$conns = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($conns) {
    foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Process "C:\Users\User\AppData\Local\Programs\Python\Python312\pythonw.exe" -ArgumentList "app.py" -WorkingDirectory "c:\Users\User\Downloads\Dashboard\backend"
Start-Sleep -Seconds 3

try {
    $res = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 6
    Write-Output "LOCAL BACKEND STATUS: OK ($($res.status)), SOURCE: $($res.source)"
} catch {
    Write-Output "LOCAL BACKEND STATUS: FAILED ($($_.Exception.Message))"
}
