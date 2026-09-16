@echo off
setlocal
cd /d "%~dp0"
title LUXURIID - TEST GRATUIT
color 0A

echo.
echo ========================================
echo          LUXURIID - TEST GRATUIT
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERREUR : Node.js n'est pas installe.
  echo Installe Node.js puis relance ce fichier.
  pause
  exit /b 1
)

if not exist .env (
  copy /Y .env.example .env >nul
  echo Le fichier .env vient d'etre cree.
  echo.
  echo IMPORTANT : ouvre .env et colle ta cle OpenAI sur la ligne OPENAI_API_KEY.
  notepad .env
  echo.
  pause
)

if not exist node_modules (
  echo Installation de LUXURIID, une seule fois...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERREUR pendant npm install.
    pause
    exit /b 1
  )
)

echo.
echo Demarrage du serveur IA...
start "LUXURIID SERVEUR" cmd /k "cd /d "%~dp0" && npm start"

echo Attente du serveur...
for /l %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto READY
  timeout /t 1 /nobreak >nul
)

echo.
echo Le serveur ne repond pas encore.
echo Regarde la fenetre noire LUXURIID SERVEUR pour voir l'erreur.
pause
exit /b 1

:READY
echo Serveur OK.
echo Ouverture de LUXURIID...
start "" "http://localhost:3000/LUXURIID_FINAL.html"
exit /b 0
