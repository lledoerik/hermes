@echo off
chcp 65001 >nul

echo.
echo ╔════════════════════════════════════════╗
echo ║       HERMES - ATURANT SISTEMA         ║
echo ╚════════════════════════════════════════╝
echo.

echo Aturant processos...

:: Aturar processos de Node (frontend)
taskkill /f /im node.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Frontend aturat
) else (
    echo   [--] Frontend no estava executant-se
)

:: Aturar processos de Python (backend)
:: Busquem específicament el procés de uvicorn/main.py
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq python.exe" /fo list ^| find "PID:"') do (
    wmic process where "ProcessId=%%a" get commandline 2>nul | find "main.py" >nul
    if !ERRORLEVEL! equ 0 (
        taskkill /f /pid %%a >nul 2>&1
    )
)

:: Si no funciona el mètode anterior, aturar tots els python (més agressiu)
:: Descomenta la línia següent si tens problemes:
:: taskkill /f /im python.exe >nul 2>&1

echo   [OK] Backend aturat
echo.
echo Sistema aturat correctament!
echo.
pause
