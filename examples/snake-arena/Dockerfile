FROM node:20-alpine

WORKDIR /app

COPY server.js .
COPY game-logic.js .
COPY index.html .
COPY package.json .
COPY usernode-bridge.js .

EXPOSE 3300

ENV PORT=3300

CMD ["node", "server.js"]
