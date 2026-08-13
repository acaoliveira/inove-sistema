#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo
echo "  =========================================================="
echo "    INOVE Representações - Sistema de Pedidos"
echo "  =========================================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  O Node.js ainda não está instalado neste computador."
  echo
  echo "    1. Acesse  https://nodejs.org"
  echo "    2. Baixe a versão LTS (22 ou superior)"
  echo "    3. Instale e clique neste arquivo de novo."
  echo
  (command -v open >/dev/null && open https://nodejs.org/pt-br/download) >/dev/null 2>&1
  read -r -p "  Pressione ENTER para fechar..."
  exit 1
fi

rm -f dados/porta.txt 2>/dev/null

# abre o navegador só depois que o sistema estiver no ar
(
  for _ in $(seq 1 25); do
    [ -f dados/porta.txt ] && break
    sleep 1
  done
  sleep 1
  PORTA=$(cat dados/porta.txt 2>/dev/null || echo 3000)
  (command -v open >/dev/null && open "http://localhost:$PORTA") \
    || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORTA")
) >/dev/null 2>&1 &

echo "  Iniciando... o navegador abre sozinho em alguns segundos."
node server.js

echo
read -r -p "  O sistema foi encerrado. Pressione ENTER para fechar..."
