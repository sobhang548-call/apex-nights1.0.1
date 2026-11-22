param(
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js 20 or newer is required. Install it from https://nodejs.org/.'
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\better-sqlite3'))) {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Error 'npm is required to install the SQLite dependency.'
    exit 1
  }
  Push-Location $root
  try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
}

$env:PORT = [string]$Port
if ($NoBrowser) { $env:OPEN_BROWSER = '0' }

Push-Location $root
try {
  & node.exe (Join-Path $root 'server.js')
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
