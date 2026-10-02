# Install as Windows Service — reliable auto-restart, starts on boot
# Run as Administrator: powershell -ExecutionPolicy Bypass -File scripts\install-service.ps1
# Requires: Python 3.12 at C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe
param([switch]$Uninstall)

$ServiceName="SmartEnergyDashboard"
$DisplayName="Smart Energy Dashboard (PowerStudio bridge)"
$Description="Realtime Modbus TCP gateway 10.1.156.12:502 + PowerStudio XML -> vibrant dashboard on :8000. Auto-restart, self-healing."
$Py="C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe"
$App="C:\Users\User\Downloads\Dashboard\backend\app.py"
$WorkDir="C:\Users\User\Downloads\Dashboard\backend"

function Test-Admin {
  $id=[Security.Principal.WindowsIdentity]::GetCurrent()
  ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Uninstall) {
  Write-Host "Uninstalling $ServiceName..."
  sc.exe stop $ServiceName 2>$null | Out-Null
  Start-Sleep 2
  sc.exe delete $ServiceName | Out-Null
  Write-Host "Deleted."
  exit 0
}

if (-not (Test-Admin)) {
  Write-Warning "Not admin — service install requires Administrator. The dashboard still runs via scripts\start.ps1 (no admin)."
  Write-Host "To install service: right-click PowerShell -> Run as Administrator, then:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\install-service.ps1`""
  exit 1
}

if (-not (Test-Path $Py)) { Write-Error "Python not found at $Py"; exit 1 }
if (-not (Test-Path $App)) { Write-Error "App not found at $App"; exit 1 }

# Remove old
sc.exe stop $ServiceName 2>$null | Out-Null
Start-Sleep 2
sc.exe delete $ServiceName 2>$null | Out-Null
Start-Sleep 2

# Create — binPath must be quoted, start= auto, obj= LocalSystem (or NT AUTHORITY\NetworkService)
$binPath="\""$Py\"" \""$App\"""
Write-Host "Creating service $ServiceName -> $binPath"
sc.exe create $ServiceName binPath= $binPath DisplayName= $DisplayName start= auto | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "sc create failed"; exit 1 }

sc.exe description $ServiceName $Description | Out-Null
# Failure actions: restart 5s, restart 5s, restart 5s, reset 0 (infinite)
sc.exe failure $ServiceName reset= 0 actions= restart/5000/restart/5000/restart/5000 | Out-Null
# Work dir via registry? Use sc config with AppParameters if using WinSW — for bare python, set working dir via wrapper batch
# Create wrapper batch that cds then runs python, and update binPath to batch
$wrapper="$WorkDir\run-service.bat"
Set-Content -LiteralPath $wrapper -Value "@echo off`r`ncd /d `"$WorkDir`"`r`n`"$Py`" `"$App`"`r`n" -Encoding ASCII
# Update service to use wrapper
sc.exe config $ServiceName binPath= "`"$wrapper`"" | Out-Null

# Delayed auto start
try{ sc.exe config $ServiceName start= delayed-auto | Out-Null }catch{}

# Start
sc.exe start $ServiceName | Out-Null
Start-Sleep 4
sc.exe query $ServiceName | Out-String | Write-Host
try{
  $h=Invoke-WebRequest "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 8
  Write-Host "Health after service start: $($h.StatusCode)"
  Write-Host ($h.Content.Substring(0,300))
} catch { Write-Warning "Health check failed (service may still be starting): $_" }

Write-Host ""
Write-Host "Service $ServiceName installed. It will auto-start on boot and restart on crash (5s)."
Write-Host "Uninstall: powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\install-service.ps1`" -Uninstall"
Write-Host "Logs: $WorkDir\logs\app.log"
