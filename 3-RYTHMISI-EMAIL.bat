@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SmartBeach - Rythmisi email
set PYTHONUTF8=1
python backend\scripts\setup_email.py
echo.
pause
