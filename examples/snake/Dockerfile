FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy application files
COPY server.js .
COPY game-logic.js .
COPY index.html .

# Expose port for HTTP and WebSocket
EXPOSE 3300

ENV PORT=3300

CMD ["node", "server.js"]
