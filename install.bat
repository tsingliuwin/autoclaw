@echo off
echo Installing AutoClaw dependencies...
call npm install

echo Building AutoClaw...
call npm run build

echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo To configure, run:
echo   npm start -- setup
echo.
echo To use, run:
echo   npm start
echo.
pause
