FROM node:20-alpine

WORKDIR /app

COPY package.json .
COPY index.html .
COPY server.js .
COPY usernode-bridge.js .

EXPOSE 3333

CMD ["node", "server.js"]
