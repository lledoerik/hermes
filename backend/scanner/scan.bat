@echo off
chcp 65001 >nul

echo.
echo ╔════════════════════════════════════════╗
echo ║     HERMES - ESCANEIG BIBLIOTECA       ║
echo ╚════════════════════════════════════════╝
echo.

:: Guardar directori actual i anar a l'arrel del projecte
pushd %~dp0..\..

:: Verificar que l'entorn virtual existeix
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: L'entorn virtual no existeix.
    echo Executa primer: install.bat
    popd
    pause
    exit /b 1
)

:: Activar entorn virtual i executar scanner
call venv\Scripts\activate.bat
python backend\scanner\scan.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: L'escaneig ha fallat
    popd
    pause
    exit /b 1
)

echo.
echo Escaneig completat!
echo.

:: Tornar al directori original
popd
pause
