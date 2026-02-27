@echo off
REM Auto-restart wrapper for reCAPTCHA Token Server
REM Server akan exit setelah N token, script ini restart otomatis
REM Usage: start.bat

echo ==========================================
echo   reCAPTCHA Server - Auto Restart Mode
echo ==========================================

set RESTART_COUNT=0

:loop
set /a RESTART_COUNT+=1
echo.
echo Starting server (session #%RESTART_COUNT%)...
echo ==========================================

call npx electron server.js

echo.
echo Server exited, restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
