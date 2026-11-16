@echo off
setlocal
set "MRMAK_LAUNCH_ROOT=%~dp0"
if exist "%LOCALAPPDATA%\Project KO\projectko.exe" (
  start "" "%LOCALAPPDATA%\Project KO\projectko.exe" --repo "%MRMAK_LAUNCH_ROOT%."
  exit /b 0
)
if exist "%MRMAK_LAUNCH_ROOT%src-tauri\target\release\projectko.exe" (
  start "" "%MRMAK_LAUNCH_ROOT%src-tauri\target\release\projectko.exe" --repo "%MRMAK_LAUNCH_ROOT%."
  exit /b 0
)
echo Install Project KO from this project's GitHub Releases.
echo Or build with: powershell -NoProfile -ExecutionPolicy Bypass -File Setup.ps1 -Mode Desktop
echo See docs\getting-started.md for agent-guided setup.
pause
