# Imagem oficial do Node 22 — o sistema não usa nenhuma biblioteca externa,
# então não há "npm install": é só copiar os arquivos e rodar.
FROM node:22-alpine

# O servidor fica nos Estados Unidos e, sem isto, o relógio dele roda em UTC —
# 3 horas à frente de Brasília. Às 21h daqui já seria o dia seguinte lá, e o
# painel zerava as vendas do dia antes da hora. O tzdata traz a tabela de fusos
# (inclusive o horário de verão, se um dia voltar) e o TZ fixa o fuso de Brasília.
RUN apk add --no-cache tzdata
ENV TZ=America/Sao_Paulo

WORKDIR /app
COPY . .

# Os dados (banco, fotos, logo, backups) ficam no disco permanente do servidor.
ENV REPSYS_DATA=/dados
ENV REPSYS_NUVEM=1
RUN mkdir -p /dados

EXPOSE 3000
CMD ["node", "server.js"]
