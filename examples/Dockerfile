# ── Stage 1: Build the WASM module ───────────────────────────────────────────
FROM rust:1.83-slim AS wasm-builder

RUN apt-get update && apt-get install -y curl pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

WORKDIR /build
COPY falling-sands/sandspiel/ sandspiel/
RUN cd sandspiel && wasm-pack build crate --target nodejs

# ── Stage 2: Node.js runtime ────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm ci --omit=dev

# Shared library modules
COPY lib/ lib/

# Combined server
COPY server.js ./

# Shared bridge (copied into examples/ by deploy script)
COPY usernode-bridge.js ./

# HTML files for all three apps
COPY index.html ./
COPY cis/usernode_cis.html cis/
COPY falling-sands/index.html falling-sands/

# Falling-sands engine + WASM loader + built WASM package
COPY falling-sands/engine.js falling-sands/
COPY falling-sands/wasm-loader.js falling-sands/
COPY --from=wasm-builder /build/sandspiel/crate/pkg/ falling-sands/sandspiel/crate/pkg/

EXPOSE 8000

CMD ["node", "server.js"]
