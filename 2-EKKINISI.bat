@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SmartBeach - Ekkinisi
if not exist "backend\.env" (
  echo Prota trexe to 1-EGKATASTASI.bat
  pause
  exit /b 1
)
echo An xrisimopoieis XAMPP, to MySQL prepei na einai prasino sto XAMPP Control Panel.
echo.
start "SmartBeach - server" cmd /k "cd /d backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
timeout /t 4 >nul
start "SmartBeach - efarmogi" cmd /k "cd /d SmartBeachApp && npx expo start --web"
echo Anoixan 2 parathyra: o server kai i efarmogi. MIN ta kleiseis oso doulevis.
echo.
echo  * PC:     i efarmogi anoigei mona tis ston browser (http://localhost:8081)
echo  * Kinito: skanare to QR sto parathyro "efarmogi" me to Expo Go (idio Wi-Fi)
echo.
echo Logariasmoi (kodikos demo1234): customer1@demo.gr, owner1@smartbeach.gr, admin@smartbeach.gr
echo.
echo An ta Windows rotisoun gia Firewall, pata "Na epitrepetai i prosvasi".
echo.
pause
