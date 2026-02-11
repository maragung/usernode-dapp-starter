# Falling Sands

A multiplayer falling-sands simulation powered by [sandspiel](https://github.com/MaxBittker/sandspiel). The simulation runs server-side as a WASM module and streams its state to connected browser clients over WebSocket. Players draw on a local overlay and submit their changes as transactions via `usernode-bridge.js`.

## Quick Start

```bash
# 1. Init the sandspiel submodule (if you haven't already)
git submodule update --init --recursive

# 2. Build the WASM module
npm run build-wasm

# 3. Install dependencies
npm install

# 4. Run the server (--local-dev enables mock transaction endpoints)
node server.js --local-dev
```

Open `http://localhost:3333` in a browser. The LAN address is printed at startup for mobile testing.

## Docker

```bash
docker build -t falling-sands .
docker run -p 3333:3333 falling-sands
```

## How It Works

- **Server** (`server.js`): Runs `Universe.tick()` at 30 Hz, delta-compresses the cell buffer, and broadcasts zlib-compressed frames to all WebSocket clients.
- **Client** (`index.html`): Receives frames, decompresses with pako, and renders the cell grid via WebGL using regl. Drawings are accumulated locally on an overlay canvas and sent as transaction memos through `usernode-bridge.js`.
- **WASM** (`wasm-loader.js`): Thin wrapper that loads the sandspiel Rust crate compiled to WebAssembly, exposing `Universe`, `Species`, and raw WASM memory.

## TODO

- [ ] **Fluid simulation** — The original sandspiel uses a WebGL-based fluid simulation that influences particle movement via wind vectors. This was skipped because the existing implementation runs entirely on the GPU. Re-adding it requires either porting the fluid sim to run server-side (e.g. CPU-based Navier-Stokes) or finding another approach.
- [ ] **Deterministic simulation** — Make the server simulation fully deterministic by seeding it from transaction block timestamps and removing non-deterministic randomness (e.g. `Math.random()`) from the simulator. This would allow clients to independently verify simulation state.
