@echo off
setlocal EnableExtensions
title Graphify + Codex Installer

echo ============================================================
echo GRAPHIFY + CODEX INSTALLER
echo ============================================================
echo.

where uv >nul 2>&1
if errorlevel 1 (
  echo [INFO] uv not found. Installing official uv...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  if errorlevel 1 (
    echo [ERROR] Failed to install uv.
    exit /b 1
  )
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

echo [1/4] Installing Graphify...
uv tool install --upgrade graphifyy
if errorlevel 1 (
  echo [ERROR] Graphify installation failed.
  exit /b 1
)

echo [2/4] Registering Graphify for Codex...
graphify install --platform codex
if errorlevel 1 (
  echo [ERROR] Graphify Codex integration failed.
  exit /b 1
)

echo [3/4] Installing the official Codex CLI...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"
if errorlevel 1 (
  echo [ERROR] Codex installation failed.
  echo You can use the official npm fallback: npm install -g @openai/codex
  exit /b 1
)

set "PATH=%APPDATA%\npm;%USERPROFILE%\.local\bin;%PATH%"

echo [4/4] Verifying...
where graphify >nul 2>&1
if errorlevel 1 (
  echo [ERROR] graphify command is not available on PATH.
  exit /b 1
)
where codex >nul 2>&1
if errorlevel 1 (
  echo [ERROR] codex command is not available on PATH.
  exit /b 1
)

echo.
echo Graphify:
graphify --version
echo.
echo Codex:
codex --version
echo.
echo ============================================================
echo INSTALLATION VERIFIED
echo ============================================================
echo.
echo Next:
echo   1. Run: codex
echo   2. Sign in with ChatGPT when prompted.
echo   3. Open this repository.
echo   4. Run: $graphify .
echo.
echo This installer reports failure when a real command fails.
echo It does not claim that a project was indexed until you run it.
echo.
pause
