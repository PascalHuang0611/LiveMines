@echo off
setlocal EnableDelayedExpansion

REM =============================
REM === rtpsim macOS 交叉編譯 ===
REM === 風格同 testrobot/create_MAC_ver.bat
REM === GUI 為本機 Web UI（純 Go，CGO_ENABLED=0）
REM =============================

cd /d %~dp0
if not exist dist mkdir dist

echo [1/2] 設定環境參數...
set CGO_ENABLED=0
set GOOS=darwin
set GOARCH=arm64

echo [2/2] 編譯 macOS arm64 GUI ^(rtpsim-gui^)
go build -mod=mod -trimpath -ldflags "-s -w" -tags gui -o dist\rtpsim-gui .
if !errorlevel! neq 0 (
    echo ❌ 編譯失敗！
    pause
    exit /b 1
)

echo ✅ GUI 版本完成: dist\rtpsim-gui
echo --------------------------------------
echo 🎯 編譯完成，輸出在 dist\
echo     rtpsim-gui
echo     ^(執行後會自動開啟瀏覽器^)
echo --------------------------------------
pause
