FROM node:18-alpine

WORKDIR /app

# Copy files
COPY server.js .
COPY game-logic.js .
COPY index.html .

# No additional dependencies needed - using Node.js native http

EXPOSE 3300

ENV PORT=3300

CMD ["node", "server.js"]
