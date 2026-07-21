@echo off
setlocal
cd /d %~dp0
set DIST=%~dp0dist
set DOCS=%~dp0..\..\..\docs

if not exist "%DIST%" mkdir "%DIST%"
copy /Y "%DOCS%\TG001_LM01_*_Config.json" "%DIST%\"
copy /Y "%DOCS%\LM_Qualified_test_data20260612_ServerSimulation.csv" "%DIST%\"
echo Synced data files to %DIST%
