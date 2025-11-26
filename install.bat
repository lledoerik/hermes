@echo off
echo ====================================
echo    HERMES - INSTALACIO COMPLETA
echo ====================================
echo.

echo [1/5] Creant entorn virtual Python...
python -m venv venv
call venv\Scripts\activate

echo [2/5] Instal·lant dependencies Python...
pip install --upgrade pip
pip install -r requirements.txt
python.exe -m pip install --upgrade pip

echo [3/5] Instal·lant dependencies React...
cd frontend
call npm install
cd ..

echo [4/5] Creant directoris...
if not exist "storage" mkdir storage
if not exist "storage\cache" mkdir storage\cache
if not exist "storage\metadata" mkdir storage\metadata


echo [5/5] Escannejant multimedia...
./scan.bat

echo.
echo ====================================
echo    INSTALACIO COMPLETADA!
echo ====================================
echo.
echo Executa: start.bat per iniciar
echo.
pause
