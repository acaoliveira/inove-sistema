@echo off
REM Espera o sistema subir e so entao abre o navegador na porta correta.
cd /d "%~dp0"
set PORTA=3000

for /l %%t in (1,1,25) do (
  if exist "%~dp0dados\porta.txt" (
    set /p PORTA=<"%~dp0dados\porta.txt"
    goto ABRIR
  )
  timeout /t 1 /nobreak >nul
)

:ABRIR
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORTA%
exit
