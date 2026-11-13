@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SmartBeach - Ekkinisi
if not exist "backend\.env" (
  echo Prota trexe to 1-EGKATASTASI.bat
  pause
  exit /b 1
)

rem Palia parathyra SmartBeach (p.x. apo palio fakelo) kratane tis thyres 8000/8081.
rem Tote o neos server den ksekinaei kai apantaei o PALIOS ("Method Not Allowed").
rem Gi' auto ta kleinoume prota.
taskkill /FI "WINDOWTITLE eq SmartBeach - server*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq SmartBeach - efarmogi*" /T /F >nul 2>nul
call :freeport 8000 server
call :freeport 8081 efarmogi

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
exit /b 0

rem ---------------------------------------------------------------------------
rem An kapoio programma akouei idi sti thyra %1, rotaei kai to kleinei.
:freeport
call :portowner %~1
if not defined OLDPID exit /b 0
echo.
echo I thyra %~1 (%~2) einai idi piasmeni apo to programma "%OLDNAME%" (PID %OLDPID%).
echo Synithos einai palio parathyro SmartBeach pou emeine anoixto.
choice /C 12 /N /M "Pata 1 gia na to kleiso (synistatai) i 2 gia na to afiso: "
if errorlevel 2 exit /b 0
taskkill /PID %OLDPID% /T /F >nul 2>nul
timeout /t 2 /nobreak >nul
call :portowner %~1
if defined OLDPID (
  echo PROSOXI: i thyra %~1 einai akoma piasmeni. Kleise ola ta mavra parathyra
  echo SmartBeach me to xeri i kane epanekkinisi ston ypologisti kai ksanadokimase.
)
exit /b 0

rem Vriskei poio programma (PID kai onoma) akouei sti thyra %1.
:portowner
set "OLDPID="
set "OLDNAME="
for /f "usebackq tokens=1,*" %%a in (`powershell -NoProfile -Command "$c = @(Get-NetTCPConnection -LocalPort %~1 -State Listen -ErrorAction SilentlyContinue)[0]; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; Write-Output ([string]$c.OwningProcess + ' ' + $p.ProcessName) }"`) do (
  set "OLDPID=%%a"
  set "OLDNAME=%%b"
)
exit /b 0
