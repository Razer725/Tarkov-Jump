@echo off
title Tarkov Jump - Local Server
cd /d "%~dp0"
start "" "http://127.0.0.1:8080"
node server.js
if errorlevel 1 (
  echo.
  echo Не удалось запустить игру. Убедитесь, что Node.js установлен.
  pause
)
