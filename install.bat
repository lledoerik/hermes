@echo off
echo ====================================
echo    HERMES - INSTALACIO COMPLETA
echo ====================================
echo.

echo [1/4] Creant entorn virtual Python...
python -m venv venv
call venv\Scripts\activate

echo [2/4] Instal·lant dependencies Python...
pip install --upgrade pip
pip install -r requirements.txt
python.exe -m pip install --upgrade pip

echo [3/4] Instal·lant dependencies React...
cd frontend
call npm install
cd ..

echo [4/4] Creant directoris...
if not exist "storage" mkdir storage
if not exist "storage\cache" mkdir storage\cache
if not exist "storage\metadata" mkdir storage\metadata

echo.
echo ====================================
echo    INSTALACIO COMPLETADA!
echo ====================================
echo.
echo Segueix aquests passos:
echo.
echo 1. Edita config\settings.py amb les teves rutes
echo 2. Executa: start-scan.bat per escanejar
echo 3. Executa: start-all.bat per iniciar
echo.
pause
