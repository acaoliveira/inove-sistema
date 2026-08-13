@echo off
chcp 65001 >nul
title Liberar acesso pelo Wi-Fi - INOVE

REM ---- pede permissao de administrador se ainda nao tiver
net session >nul 2>&1
if errorlevel 1 (
  echo   Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cls
echo.
echo   ==========================================================
echo     Liberando o acesso pelo Wi-Fi (celular e tablet)
echo   ==========================================================
echo.

netsh advfirewall firewall delete rule name="INOVE Sistema de Pedidos" >nul 2>nul
netsh advfirewall firewall add rule name="INOVE Sistema de Pedidos" dir=in action=allow protocol=TCP localport=3000-3010

if errorlevel 1 (
  echo.
  echo   Nao foi possivel criar a regra. Tire uma foto desta tela.
) else (
  echo.
  echo   Pronto! Agora o celular consegue abrir o sistema pelo Wi-Fi.
  echo   Use o endereco que aparece na janela preta do sistema,
  echo   por exemplo:  http://192.168.0.15:3000
)
echo.
pause
