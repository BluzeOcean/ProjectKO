@echo off
setlocal EnableExtensions
title pKO - dev - close this window to stop

rem  pKO one-click development launch
rem  Opens the desktop app on the source interface through Vite, so every
rem  edit reloads the running window. This console owns the whole stack:
rem  closing it stops the app, the Vite dev server and the Node service.
rem  Rust changes rebuild automatically; the interface reloads on save.

cd /d "%~dp0" 2>nul || goto :noFolder
set "PKO_ROOT=%CD%"

echo.
echo   pKO  -  Project KO development launch
echo   ------------------------------------------------------------
echo   Workspace : %PKO_ROOT%
echo   Interface : served from source by Vite, reloads on save
echo   Stop      : close this window to stop the app and Vite
echo   ------------------------------------------------------------
echo.

if not exist "workspace\workspace.json" goto :noWorkspace

tasklist /FI "IMAGENAME eq projectko.exe" /NH 2>nul | find /I "projectko.exe" >nul
if not errorlevel 1 goto :alreadyRunning

where node >nul 2>nul || goto :noNode
where npm >nul 2>nul || goto :noNode

if exist "node_modules\vite\package.json" goto :launch
echo   Installing project dependencies first, with npm ci...
echo.
call npm ci
if errorlevel 1 goto :installFailed
echo.

:launch
echo   Starting the dev stack. The first launch after a Rust change
echo   rebuilds the shell, so a minute of compiler output is normal.
echo.

call npm run desktop:dev -- -- -- --repo "%PKO_ROOT%"
set "PKO_CODE=%ERRORLEVEL%"

echo.
if not "%PKO_CODE%"=="0" (
  echo   pKO dev stopped with code %PKO_CODE%.
  echo   The messages above show what went wrong.
  echo.
  pause
  exit /b %PKO_CODE%
)
echo   pKO dev stopped.
exit /b 0

:noFolder
echo   Cannot open the pKO folder: "%~dp0"
echo.
pause
exit /b 1

:noWorkspace
echo   This folder is not a Project KO workspace.
echo   Expected: %PKO_ROOT%\workspace\workspace.json
echo.
pause
exit /b 1

:alreadyRunning
echo   Project KO is already running.
echo   Quit it from the tray first, then start pKO again.
echo.
pause
exit /b 1

:noNode
echo   Node.js and npm must be on PATH to run the development build.
echo   Install Node.js 22.20 or newer, then start pKO again.
echo.
pause
exit /b 1

:installFailed
echo   Dependency install failed. See the output above.
echo.
pause
exit /b 1
