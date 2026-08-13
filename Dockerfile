# Imagem oficial do Node 22 — o sistema não usa nenhuma biblioteca externa,
# então não há "npm install": é só copiar os arquivos e rodar.
FROM node:22-alpine

WORKDIR /app
COPY . .

# Os dados (banco, fotos, logo, backups) ficam no disco permanente do servidor.
ENV REPSYS_DATA=/dados
ENV REPSYS_NUVEM=1
RUN mkdir -p /dados

EXPOSE 3000
CMD ["node", "server.js"]
