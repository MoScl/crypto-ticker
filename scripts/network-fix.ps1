# network-fix.ps1 - System-level network self-healing for crypto-ticker
# Optional ops tool (Plan B). Diagnoses the local DNS hijack and guides fixing.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\network-fix.ps1
# NOTE: steps that change system DNS require an elevated (Admin) shell.

$ErrorActionPreference = 'Continue'

Write-Host ''
Write-Host '=== [1/6] Active adapter (has default gateway) ===' -ForegroundColor Cyan
Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } |
  Format-Table InterfaceAlias, @{n='IPv4';e={$_.IPv4Address.IPAddress}}, @{n='Gateway';e={$_.IPv4DefaultGateway.NextHop}} -AutoSize

Write-Host '=== [2/6] DNS servers per adapter ===' -ForegroundColor Cyan
Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses.Count -gt 0 } |
  Format-Table InterfaceAlias, ServerAddresses -AutoSize

Write-Host '=== [3/6] UDP :53 owner (local DNS hijack check) ===' -ForegroundColor Cyan
$p53 = Get-NetUDPEndpoint -LocalPort 53 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
if ($p53) {
  $proc = Get-Process -Id $p53 -ErrorAction SilentlyContinue
  Write-Host ("UDP 53 owned by PID {0} => {1}  (if this is Sangfor / a security client," -f $p53, $proc.ProcessName) -ForegroundColor Yellow
  Write-Host '  it hijacks local DNS and answers "Server failed" - the root cause we found.)' -ForegroundColor Yellow
} else {
  Write-Host 'UDP 53 not bound - OK' -ForegroundColor Green
}

Write-Host '=== [4/6] DNS resolution sanity (should NOT point to foreign IPs) ===' -ForegroundColor Cyan
try {
  Resolve-DnsName -Name api.coingecko.com -Type A -ErrorAction Stop |
    Select-Object Name, IPAddress | Format-Table -AutoSize
} catch {
  Write-Host 'Resolve-DnsName failed - local DNS broken (as diagnosed).' -ForegroundColor Yellow
}

Write-Host '=== [5/6] Flush DNS cache ===' -ForegroundColor Cyan
ipconfig /flushdns | Out-Null
Write-Host 'DNS cache flushed.'

Write-Host '=== [6/6] Connectivity verify ===' -ForegroundColor Cyan
if (Test-Connection -ComputerName 119.29.29.29 -Count 2 -Quiet) { Write-Host 'Ping 119.29.29.29: OK (network layer works)' -ForegroundColor Green } else { Write-Host 'Ping 119.29.29.29: FAIL' -ForegroundColor Red }
try {
  $r = Invoke-WebRequest -Uri 'https://api.coingecko.com/api/v3/ping' -TimeoutSec 10 -UseBasicParsing
  Write-Host "CoinGecko via system stack: HTTP $($r.StatusCode) (direct works)"
} catch {
  Write-Host 'CoinGecko via system stack: FAIL (direct blocked - expected; the app auto-uses proxy 7897/7890/1080...)'
}

Write-Host ''
Write-Host '--- Optional fixes (Admin shell) ---' -ForegroundColor Cyan
Write-Host 'A. Point system DNS to public resolvers (bypass hijack):'
Write-Host '   Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses 119.29.29.29,223.5.5.5'
Write-Host '   (replace "Ethernet" with the active adapter name from [1/6])'
Write-Host 'B. If Clash Verge DNS listens on :53 and conflicts, change it in Clash Verge'
Write-Host '   settings (DNS listen port e.g. 1053) and restart it.'
Write-Host 'C. Reset network stack (only if adapter itself is broken):'
Write-Host '   netsh winsock reset  &&  netsh int ip reset  &&  shutdown /r /t 0'
Write-Host ''
Write-Host 'crypto-ticker needs NO system change: it auto-discovers proxies' -ForegroundColor Green
Write-Host 'and falls back to DoH, so it works even with the DNS hijack in place.' -ForegroundColor Green
