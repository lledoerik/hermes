@echo off
echo ====================================
echo    HERMES - INICIANT SISTEMA
echo ====================================
echo.

echo Iniciant backend...
start cmd /k "venv\Scripts\activate && python backend\main.py"

timeout /t 3 > nul

echo Iniciant frontend...
start cmd /k "cd frontend && npm start"

echo.
echo ====================================
echo Sistema iniciat!
echo.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8000/docs
echo ====================================
echo.
pause
