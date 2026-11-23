@echo off
chcp 65001 >nul
title ZEUS
cd /d "%~dp0"

rem Cherche Python 3.10+ (lanceur "py" de Windows, puis "python"), puis demarre ZEUS avec les arguments recus
rem (DEMARRER-ZEUS.bat = interface web ; "setup" = configuration ; "phone" = telephone ; "doctor" = diagnostic).
set "PY="
where py >nul 2>nul && py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python"
if not defined PY goto nopython

%PY% zeus.py %*
goto fin

:nopython
echo.
echo  Python 3.10 ou plus recent est necessaire.
echo  Telecharge-le sur https://www.python.org/downloads/
echo  et coche "Add Python to PATH" pendant l'installation, puis relance ce fichier.
echo.
start "" https://www.python.org/downloads/

:fin
echo.
pause
