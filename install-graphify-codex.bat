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

echo [5/5] Configuring Codex multi-agent support...
set "CODEX_HOME=%USERPROFILE%\.codex"
if defined CODEX_HOME set "CODEX_HOME=%CODEX_HOME%"
if not exist "%CODEX_HOME%" mkdir "%CODEX_HOME%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Join-Path $env:USERPROFILE '.codex\config.toml';" ^
  "$dir=Split-Path $p;" ^
  "New-Item -ItemType Directory -Force -Path $dir | Out-Null;" ^
  "$lines=@(); if(Test-Path $p){$lines=Get-Content -LiteralPath $p};" ^
  "$hasFeatures=$false; $start=-1; $end=$lines.Count;" ^
  "for($i=0;$i -lt $lines.Count;$i++){if($lines[$i] -match '^\s*\[features\]\s*graphify --version
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
){$hasFeatures=$true;$start=$i;break}};" ^
  "if($hasFeatures){for($i=$start+1;$i -lt $lines.Count;$i++){if($lines[$i] -match '^\s*\[[^\]]+\]\s*graphify --version
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
){$end=$i;break}};" ^
  "  $found=$false; for($i=$start+1;$i -lt $end;$i++){if($lines[$i] -match '^\s*multi_agent\s*='){ $lines[$i]='multi_agent = true'; $found=$true; break }};" ^
  "  if(-not $found){$head=@(); if($start -ge 0){$head=$lines[0..$end-1]}; $tail=@(); if($end -lt $lines.Count){$tail=$lines[$end..($lines.Count-1)]}; $lines=@($head + 'multi_agent = true' + $tail)}" ^
  "} else {" ^
  "  if($lines.Count -gt 0 -and $lines[-1] -ne ''){$lines += ''}; $lines += '[features]'; $lines += 'multi_agent = true'" ^
  "};" ^
  "$bak=$p+'.bak'; if(Test-Path $p){Copy-Item -LiteralPath $p -Destination $bak -Force};" ^
  "Set-Content -LiteralPath $p -Value $lines -Encoding UTF8;" ^
  "Write-Host ('Codex config updated: '+$p);"

if errorlevel 1 (
  echo [ERROR] Could not update Codex config.toml.
  exit /b 1
)

echo [OK] Codex multi_agent = true configured.
echo.

echo [6/6] Final verification...
echo.

if not exist ".codex\skills\graphify\SKILL.md" (
  echo [ERROR] Codex Graphify skill is missing:
  echo         .codex\skills\graphify\SKILL.md
  exit /b 1
)

echo [OK] .codex\skills\graphify\SKILL.md exists.

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
