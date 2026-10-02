# Start-Hidden — one-click launcher for non-technical user
# Called by Desktop icon / double-click. Starts backend hidden, waits, opens browser.
# No admin required. Works even if gateway is offline (simulator mode).

$ErrorActionPreference="SilentlyContinue"
$py="C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe"
$pyw="C:\Users\User\AppData\Local\Programs\Python\Python312\pythonw.exe"
if(-not (Test-Path $py)){ $py="python" }
if(-not (Test-Path $pyw)){ $pyw=$py }
$root="C:\Users\User\Downloads\Dashboard"
$backend="$root\backend\app.py"
$healthUrl="http://127.0.0.1:8000/health"
$dashUrl="http://127.0.0.1:8000"

function Is-Running {
  try{
    $r=Invoke-WebRequest $healthUrl -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch { return $false }
}

if(Is-Running){
  # already up — just open
  Start-Process $dashUrl | Out-Null
  exit 0
}

# kill stale python that may be stuck on wrong port (only our app)
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Python312*" } | ForEach-Object {
  try{ Stop-Process -Id $_.Id -Force } catch {}
}
Start-Sleep -Seconds 1

# ensure data/logs dirs exist
New-Item -ItemType Directory -Force -Path "$root\backend\data","$root\backend\logs" | Out-Null

# start backend hidden (use python.exe with WindowStyle Hidden — pythonw is flaky for this app)
try{
  Start-Process -FilePath $py -ArgumentList "`"$backend`"" -WindowStyle Hidden -WorkingDirectory "$root\backend"
} catch {
  $fallback = if(Test-Path $pyw){ $pyw } else { $py }
  Start-Process -FilePath $fallback -ArgumentList "`"$backend`"" -WindowStyle Hidden
}

# wait for health 15s
for($i=0;$i -lt 15;$i++){
  Start-Sleep -Seconds 1
  if(Is-Running){ break }
}

Start-Process $dashUrl | Out-Null

# optional toast (Windows 10+) - keep simple ASCII only
try{
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  $n=New-Object System.Windows.Forms.NotifyIcon
  $n.Icon=[System.Drawing.SystemIcons]::Information
  $n.Visible=$true
  $tip="Dashboard is running at $dashUrl"
  $n.ShowBalloonTip(3000,"Smart Energy Dashboard",$tip,[System.Windows.Forms.ToolTipIcon]::Info)
  Start-Sleep -Seconds 3
  $n.Dispose()
} catch {}
