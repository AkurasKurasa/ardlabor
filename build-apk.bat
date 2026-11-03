@echo off
setlocal
cd /d "%~dp0"
title ARdlabor - build the Android APK
echo.
echo  == ARdlabor: build the Android APK ==
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Installing it now...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  Node.js installed. Close this window and double-click build-apk.bat again.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo  Git is not installed. Installing it now...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  echo.
  echo  Git installed. Close this window and double-click build-apk.bat again.
  pause
  exit /b 1
)

echo  [1/4] Saving a snapshot of the project (Expo uploads it from Git)...
if not exist ".git" git init -q
git add -A
git -c user.name="ARdlabor" -c user.email="ardlabor@localhost" commit -q -m "ARdlabor build" >nul 2>nul

cd app
echo  [2/4] Installing app packages (first time takes a few minutes)...
call npx --yes yarn@1 install --frozen-lockfile
if errorlevel 1 goto fail

echo  [3/4] Installing the Expo build tool...
call npm install -g eas-cli
if errorlevel 1 goto fail

echo  [4/4] Building the APK on Expo's servers...
call eas whoami >nul 2>nul
if errorlevel 1 (
  echo  Log in with your free expo.dev account:
  call eas login
  if errorlevel 1 goto fail
)
echo  If it asks to create a project or generate a keystore, answer Y.
call eas build -p android --profile apk
if errorlevel 1 goto fail

echo.
echo  Done. Open the link above (or scan the QR code) on your Android phone to download the APK.
pause
exit /b 0

:fail
echo.
echo  Something failed. Copy the error text above and send it to Claude.
pause
exit /b 1
