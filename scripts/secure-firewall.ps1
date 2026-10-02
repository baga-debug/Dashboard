# Harden Windows Firewall — reliable & secure connection
# Run as Administrator. Opens ONLY what we need.
# - Allow outbound Modbus 502 ONLY to 10.1.156.12 (gateway)
# - Allow inbound 8000 ONLY from 10.1.156.0/24 + 127.0.0.1 (dashboard UI/API)
# - Block 502 elsewhere, block 8000 from internet
param([switch]$Remove)

function Test-Admin {
  $id=[Security.Principal.WindowsIdentity]::GetCurrent()
  ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Admin)) { Write-Warning "Run as Administrator"; exit 1 }

$rules=@("Dashboard Modbus Outbound 502","Dashboard API Inbound 8000","Block Modbus Elsewhere")

if ($Remove) {
  foreach ($n in $rules) {
    Remove-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue
    Write-Host "Removed $n"
  }
  exit 0
}

# Clean old
foreach ($n in $rules) { Remove-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue }

# 1) Allow outbound 502 only to gateway
New-NetFirewallRule -DisplayName "Dashboard Modbus Outbound 502" -Direction Outbound -RemoteAddress 10.1.156.12 -RemotePort 502 -Protocol TCP -Action Allow -Profile Any -Description "Dashboard -> gateway 10.1.156.12:502 only (isolated VLAN, no internet)" | Out-Null
Write-Host "Allow outbound 502 to 10.1.156.12 only"

# 2) Allow inbound 8000 only from LAN + loopback
New-NetFirewallRule -DisplayName "Dashboard API Inbound 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -RemoteAddress @("10.1.156.0/24","127.0.0.1","::1") -Profile Any -Description "Dashboard UI/API :8000 only from plant VLAN + localhost" | Out-Null
Write-Host "Allow inbound 8000 from 10.1.156.0/24 + 127.0.0.1"

# 3) Block outbound 502 elsewhere (defense)
New-NetFirewallRule -DisplayName "Block Modbus Elsewhere" -Direction Outbound -RemotePort 502 -Protocol TCP -Action Block -Profile Any -Description "Block Modbus 502 to any other host (defense in depth)" | Out-Null
Write-Host "Block outbound 502 to any other host"

Write-Host ""
Write-Host "Firewall hardened. Verify:"
Get-NetFirewallRule -DisplayName "Dashboard*" , "Block Modbus*" -ErrorAction SilentlyContinue | Format-Table DisplayName,Enabled,Direction,Action -AutoSize
Write-Host "To remove: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Remove"
