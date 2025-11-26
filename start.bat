@echo off
chcp 65001 >nul

echo.
echo ╔════════════════════════════════════════╗
echo ║       HERMES - INICIANT SISTEMA        ║
echo ╚════════════════════════════════════════╝
echo.

:: Verificar que l'entorn virtual existeix
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: L'entorn virtual no existeix.
    echo Executa primer: install.bat
    pause
    exit /b 1
)

:: Verificar que les dependencies estan instal·lades
if not exist "frontend\node_modules" (
    echo ERROR: Les dependencies de React no estan instal·lades.
    echo Executa primer: install.bat
    pause
    exit /b 1
)

:: Iniciar backend
echo [1/2] Iniciant backend (FastAPI)...
start "HERMES - Backend" cmd /k "cd /d %~dp0 && venv\Scripts\activate.bat && python backend\main.py"

:: Esperar que el backend estigui llest
echo       Esperant que el backend estigui llest...
timeout /t 3 /nobreak >nul

:: Iniciar frontend
echo [2/2] Iniciant frontend (React)...
start "HERMES - Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo ╔════════════════════════════════════════╗
echo ║          SISTEMA INICIAT!              ║
echo ╠════════════════════════════════════════╣
echo ║                                        ║
echo ║   Frontend: http://localhost:3000      ║
echo ║   Backend:  http://localhost:8000/docs ║
echo ║                                        ║
echo ╚════════════════════════════════════════╝
echo.
echo   Prem qualsevol tecla per tancar aquesta finestra.
echo   (Els serveis continuaran executant-se)
echo.
pause >nul
