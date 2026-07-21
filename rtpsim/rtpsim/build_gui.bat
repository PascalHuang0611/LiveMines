@echo off
REM Windows 建置 GUI（本機 Web UI，純 Go）
cd /d %~dp0
go build -mod=mod -trimpath -ldflags "-s -w" -tags gui -o rtpsim-gui.exe .
echo Built: rtpsim-gui.exe
