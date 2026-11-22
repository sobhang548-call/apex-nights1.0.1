@echo off
setlocal
title APEX NIGHTS - Secure Local Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/ and retry.
  pause
  exit /b 1
)

if not exist "node_modules\better-sqlite3" (
  echo Installing the SQLite dependency...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

node server.js
pause
