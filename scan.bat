@echo off
echo ====================================
echo    HERMES - ESCANEIG BIBLIOTECA
echo ====================================
echo.

call venv\Scripts\activate
python backend\scanner\scan.py

echo.
echo Escaneig completat!
pause
