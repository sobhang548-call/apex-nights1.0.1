param(
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  Write-Host "Port $Port is busy. Trying 4174..." -ForegroundColor Yellow
  $Port = 4174
  $url = "http://localhost:$Port/"
  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Add($url)
  $listener.Start()
}

Write-Host ""
Write-Host "  APEX NIGHTS" -ForegroundColor Yellow
Write-Host "  http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $rel = $path.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar
    $file = Join-Path $root $rel

    $full = [IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith([IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = $mime[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($full)
      $res.ContentType = $type
      $res.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
      $res.Headers['Pragma'] = 'no-cache'
      $res.Headers['Expires'] = '0'
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes('Not found: ' + $path)
      $res.ContentType = 'text/plain'
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  } catch {
    if ($listener.IsListening) { Write-Host $_.Exception.Message -ForegroundColor DarkRed }
  }
}
