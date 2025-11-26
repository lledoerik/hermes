@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════╗
echo ║     HERMES - INSTALACIO COMPLETA       ║
echo ╚════════════════════════════════════════╝
echo.

:: Verificar prerequisits
echo [0/5] Verificant prerequisits...

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Python no esta instal·lat o no esta al PATH
    echo Descarrega'l de: https://www.python.org/downloads/
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js no esta instal·lat o no esta al PATH
    echo Descarrega'l de: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm no esta instal·lat o no esta al PATH
    pause
    exit /b 1
)

echo       Python: OK
for /f "tokens=2" %%i in ('python --version 2^>^&1') do echo       Versio: %%i
echo       Node.js: OK
for /f "tokens=1" %%i in ('node --version 2^>^&1') do echo       Versio: %%i
echo.

:: Pas 1: Crear entorn virtual
echo [1/5] Creant entorn virtual Python...
if exist "venv" (
    echo       Entorn virtual ja existeix, saltant...
) else (
    python -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo ERROR: No s'ha pogut crear l'entorn virtual
        pause
        exit /b 1
    )
    echo       Entorn virtual creat!
)
echo.

:: Activar entorn virtual
call venv\Scripts\activate.bat
if %ERRORLEVEL% neq 0 (
    echo ERROR: No s'ha pogut activar l'entorn virtual
    pause
    exit /b 1
)

:: Pas 2: Instal·lar dependencies Python
echo [2/5] Instal·lant dependencies Python...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo ERROR: No s'han pogut instal·lar les dependencies Python
    pause
    exit /b 1
)
echo       Dependencies Python instal·lades!
echo.

:: Pas 3: Instal·lar dependencies React
echo [3/5] Instal·lant dependencies React...
cd frontend
call npm install --silent
if %ERRORLEVEL% neq 0 (
    echo ERROR: No s'han pogut instal·lar les dependencies React
    cd ..
    pause
    exit /b 1
)
cd ..
echo       Dependencies React instal·lades!
echo.

:: Pas 4: Crear directoris
echo [4/5] Creant directoris...
if not exist "storage" mkdir storage
if not exist "storage\cache" mkdir storage\cache
if not exist "storage\metadata" mkdir storage\metadata
if not exist "config" mkdir config
echo       Directoris creats!
echo.

:: Pas 5: Escanejar multimedia (opcional)
echo [5/5] Escanejant multimedia...
if exist "backend\scanner\scan.py" (
    python backend\scanner\scan.py
    if %ERRORLEVEL% neq 0 (
        echo       Advertencia: L'escaneig ha fallat, pots executar-lo mes tard
    ) else (
        echo       Escaneig completat!
    )
) else (
    echo       Arxiu scan.py no trobat, saltant...
)
echo.

echo.
echo ╔════════════════════════════════════════╗
echo ║       INSTALACIO COMPLETADA!           ║
echo ╚════════════════════════════════════════╝
echo.
echo   Executa: start.bat per iniciar el sistema
echo.
pause
