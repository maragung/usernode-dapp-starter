# Tetris Arena

Blockchain-integrated Tetris game for Usernode. Play, save your high score to the chain, and compete on the leaderboard.

## Features

- Full Tetris gameplay (10×20 grid, 8 tetrominoes, line clearing, level progression)
- Responsive design (desktop and mobile)
- Dark/light theme with automatic system preference detection
- Save high scores to Usernode blockchain
- Custom usernames with wallet address tracking
- Live leaderboard with your rank
- Mock API for local development
- Production-ready Docker deployment

## Quick Start

**Local development:**

```bash
node server.js --local-dev
```

Open http://localhost:3333

**Docker:**

```bash
docker compose up --build
```

## Gameplay

- Arrow keys to move, Z to rotate (desktop)
- On-screen buttons available (mobile)
- Complete lines to advance levels
- Game over when blocks reach the top
- Save score to chain when prompted

## Configuration

Environment variables:

```
PORT=3333              # HTTP port
APP_PUBKEY=ut1_...     # Game wallet address
NODE_RPC_URL=...       # Node RPC endpoint
```

## Architecture

**Frontend:** Vanilla JavaScript single HTML file

**Backend:** Node.js server with:
- Static file serving
- Blockchain polling
- Leaderboard aggregation
- Mock API support

**Blockchain:** Scores stored as JSON in transaction memos

## Files

- `index.html` — Game UI and logic
- `server.js` — Backend server
- `usernode-bridge.js` — Blockchain bridge
- `docker-compose.yml` — Docker configuration
- `Dockerfile` — Container image
