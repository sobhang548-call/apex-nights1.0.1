@echo off
title APEX NIGHTS - Local Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 4173
pause
