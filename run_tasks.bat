@echo off
setlocal
cd /d "%~dp0"

REM Get date in YYYY-MM-DD format using PowerShell for reliability
for /f %%a in ('powershell -Command "Get-Date -format 'yyyy-MM-dd'"') do set today=%%a

REM Force Python to use UTF-8 for input/output to handle Chinese characters and emojis correctly
set PYTHONUTF8=1

echo [1/2] Running Crawler...
python crawer.py
if %ERRORLEVEL% NEQ 0 (
    echo Error running crawer.py
    pause
    exit /b %ERRORLEVEL%
)

echo [2/2] Embedding market.db into index.html...
python "%~dp0..\embed_db_in_html.py" --db "%~dp0market.db" --html "%~dp0index.html"
if %ERRORLEVEL% NEQ 0 (
    echo Error running embed_db_in_html.py
    pause
    exit /b %ERRORLEVEL%
)


endlocal

