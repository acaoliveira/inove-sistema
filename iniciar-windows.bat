@echo off
chcp 65001 >nul
title INOVE Representacoes - Sistema de Pedidos
cd /d "%~dp0"
cls

echo.
echo   ==========================================================
echo     INOVE Representacoes - Sistema de Pedidos
echo   ==========================================================
echo.

REM ---------- 1) esta rodando de dentro do ZIP? ----------
echo %~dp0 | find /i "\Temp\" >nul
if not errorlevel 1 goto DENTRO_DO_ZIP
echo %~dp0 | find /i "Temp1_" >nul
if not errorlevel 1 goto DENTRO_DO_ZIP

REM ---------- 2) o Node.js esta instalado? ----------
where node >nul 2>nul
if errorlevel 1 goto SEM_NODE

REM ---------- 3) tudo certo: inicia ----------
echo   Iniciando... o navegador abre sozinho em alguns segundos.
echo.
if exist "%~dp0dados\porta.txt" del /q "%~dp0dados\porta.txt" >nul 2>nul
start "" /min "%~dp0abrir-navegador.bat"
node server.js

echo.
echo   ==========================================================
echo     O sistema foi encerrado.
echo     Se apareceu algum erro acima, tire uma foto da tela.
echo   ==========================================================
pause
exit /b


:DENTRO_DO_ZIP
echo   ATENCAO - o sistema esta sendo aberto de dentro do arquivo ZIP.
echo.
echo   Faca assim:
echo     1. Feche esta janela.
echo     2. Clique com o botao DIREITO no arquivo ZIP que voce baixou.
echo     3. Escolha "Extrair tudo..." e depois "Extrair".
echo     4. Abra a pasta que apareceu e clique aqui de novo.
echo.
pause
exit /b


:SEM_NODE
echo   O Node.js ainda nao esta instalado neste computador.
echo   Ele e gratuito e leva 2 minutos.
echo.
echo     1. Vou abrir o site nodejs.org para voce.
echo     2. Baixe o botao verde da esquerda (versao LTS).
echo     3. Instale clicando em "Next" ate o fim.
echo     4. Volte aqui e clique neste arquivo de novo.
echo.
start "" https://nodejs.org/pt-br/download
pause
exit /b
