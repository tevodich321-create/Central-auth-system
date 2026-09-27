@echo off
setlocal EnableExtensions
title Graphify + Codex Installer

REM Always run from the folder containing this BAT file.
cd /d "%~dp0"

echo ============================================================
echo GRAPHIFY + CODEX - WINDOWS PROJECT INSTALLER
echo ============================================================
echo.
echo Project folder:
echo   %CD%
echo.

if not exist ".git" (
  echo [WARNING] This folder does not look like the root of a Git repository.
  echo           If you downloaded this BAT separately, put it in the
  echo           project root and run it again.
  echo.
)

echo [1/5] Checking uv...
where uv >nul 2>&1
if errorlevel 1 (
  echo [INFO] uv not found. Installing the official uv installer...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  if errorlevel 1 (
    echo [ERROR] uv installation failed.
    exit /b 1
  )
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

where uv >nul 2>&1
if errorlevel 1 (
  echo [ERROR] uv is installed but this CMD cannot find it on PATH.
  echo         Close this window, open a new CMD, and run this BAT again.
  exit /b 1
)

echo [2/5] Installing/upgrading official Graphify package...
uv tool install --upgrade graphifyy
if errorlevel 1 (
  echo [ERROR] Graphify package installation failed.
  exit /b 1
)

set "PATH=%USERPROFILE%\.local\bin;%PATH%"
where graphify >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Graphify command is not available on PATH.
  echo         Try "uv tool update-shell", then reopen CMD.
  exit /b 1
)

echo       Graphify version:
graphify --version
if errorlevel 1 (
  echo [ERROR] Graphify version check failed.
  exit /b 1
)

echo [3/5] Installing Graphify for Codex in THIS project...
graphify install --project --platform codex
if errorlevel 1 (
  echo [ERROR] Graphify project installation for Codex failed.
  exit /b 1
)

if not exist ".codex\skills\graphify\SKILL.md" (
  echo [ERROR] Graphify SKILL.md was not created at:
  echo         .codex\skills\graphify\SKILL.md
  exit /b 1
)

echo [OK] Project Graphify skill exists.
if exist ".codex\hooks.json" (
  echo [OK] Codex hook configuration exists.
) else (
  echo [WARNING] .codex\hooks.json was not created.
  echo           Graphify skill may still work, but always-on hooks
  echo           were not verified.
)

echo [4/5] Installing the official OpenAI Codex CLI...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"
if errorlevel 1 (
  echo [ERROR] Codex installation failed.
  exit /b 1
)

set "PATH=%USERPROFILE%\.local\bin;%APPDATA%\npm;%PATH%"

where codex >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Codex command is not available on PATH.
  echo         Close this window, open a new CMD, and run "codex --version".
  exit /b 1
)

echo       Codex version:
codex --version
if errorlevel 1 (
  echo [ERROR] Codex version check failed.
  exit /b 1
)

echo [5/5] Final verification...
echo.

if not exist ".agents\skills\graphify\SKILL.md" (
  echo [INFO] This is expected: Codex uses .codex\skills\graphify\SKILL.md.
)

echo Graphify:
graphify --version
echo.
echo Codex:
codex --version
echo.
echo Project Graphify skill:
echo .codex\skills\graphify\SKILL.md
echo.
echo ============================================================
echo INSTALLATION VERIFIED
echo ============================================================
echo.
echo NEXT:
echo   1. Run: codex
echo   2. Sign in with ChatGPT when Codex asks.
echo   3. Stay in this project folder.
echo   4. Run: $graphify .
echo.
echo First run will create graphify-out\ when Graphify processes
echo the real project. This installer does NOT fake that result.
echo.
echo OPTIONAL FOR GRAPHIFY PARALLEL EXTRACTION:
echo   Add multi_agent = true under [features] in:
echo   %%USERPROFILE%%\.codex\config.toml
echo   Then restart Codex.
echo.
pause
