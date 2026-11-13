@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SmartBeach - Egkatastasi
echo ============================================================
echo   SmartBeach - aftomati egkatastasi
echo ============================================================
echo.
echo Prin synexiseis: an xrisimopoieis XAMPP, anoixe to XAMPP Control Panel
echo kai pata Start sto MySQL (prepei na ginei prasino).
echo.
pause
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Den vrethike Python. Egkatestise to apo https://www.python.org/downloads/
  echo kai tsekare to "Add python.exe to PATH". Meta ksanaanoixe auto to arxeio.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Den vrethike Node.js. Egkatestise to apo https://nodejs.org ^(LTS^)
  echo kai meta ksanaanoixe auto to arxeio.
  pause
  exit /b 1
)
set PYTHONUTF8=1
python backend\scripts\setup_all.py
echo.
pause
