@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SmartBeach - Neos diaxeiristis
set PYTHONUTF8=1
cd backend
python -m scripts.create_admin
echo.
pause
