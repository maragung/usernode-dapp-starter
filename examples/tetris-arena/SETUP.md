# Tetris Arena Setup

## Local Development

Requires Node.js 20+

```bash
node server.js --local-dev
```

Visit http://localhost:3333

## Docker

```bash
docker compose up --build
```

Visit http://localhost:3333

## Configuration

Create `.env` file:

```
APP_PUBKEY=ut1_tetrisarena_default_pubkey
NODE_RPC_URL=https://alpha2.usernodelabs.org
PORT=3333
```

Or copy from `.env.example`:

```bash
cp .env.example .env
```

## How to Play

**Desktop:** Arrow keys to move, Z to rotate
**Mobile:** On-screen buttons

Complete lines to raise your score and level up.

When the game ends, save your score to the blockchain!
