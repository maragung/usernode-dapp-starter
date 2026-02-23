FROM node:20-slim

WORKDIR /app

COPY index.html ./
COPY server.js ./
COPY package.json ./
COPY usernode-bridge.js ./

EXPOSE 3310

CMD ["node", "server.js"]
