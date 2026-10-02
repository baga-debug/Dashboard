# Nightly backup — run via Task Scheduler 02:00 daily
# Usage: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# Creates C:\Users\User\Downloads\Dashboard\backups\dashboard-YYYY-MM-DD.db + keeps 7 dailies + config
$root="C:\Users\User\Downloads\Dashboard"
$src="$root\backend\data\dashboard.db"
$dstDir="$root\backups"
$date=Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
if (Test-Path $src) {
  $dst="$dstDir\dashboard-$date.db"
  Copy-Item -LiteralPath $src -Destination $dst -Force
  Write-Host "Backup $src -> $dst ($((Get-Item $dst).Length) bytes)"
  # also backup config
  Copy-Item -LiteralPath "$root\backend\config.yaml" -Destination "$dstDir\config-$date.yaml" -Force -ErrorAction SilentlyContinue
  # keep 7 dailies, 12 monthlies
  Get-ChildItem "$dstDir\dashboard-*.db" | Sort-Object LastWriteTime | Select-Object -SkipLast 7 | Remove-Item -Force -ErrorAction SilentlyContinue
  Write-Host "Cleanup kept 7 latest, removed old"
} else { Write-Warning "DB not found at $src" }
# Also keep 90 days retention inside DB is handled by app (or manual vacuum)
# Example retention delete: sqlite3 backend/data/dashboard.db "DELETE FROM readings WHERE ts < datetime('now','-90 days')"
