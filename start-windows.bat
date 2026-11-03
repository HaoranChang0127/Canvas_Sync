@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  call npm install
  if errorlevel 1 (pause & exit /b 1)
)
call npx playwright install chromium
if errorlevel 1 (pause & exit /b 1)
node server.js
pause
