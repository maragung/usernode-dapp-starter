FROM node:20-alpine

WORKDIR /app

USER node

COPY --chown=node:node package.json server.js ./
COPY --chown=node:node index.html ./

# Copy usernode-bridge.js from root
COPY --chown=node:node ../../usernode-bridge.js ./

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/__game/state" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
