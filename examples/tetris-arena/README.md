# Tetris Arena

Tetris Arena is a standalone Usernode game service with score attestation and leaderboard tracking.

## What this app includes

- 10x20 Tetris gameplay for desktop and mobile
- On-chain username updates
- Attested score submission flow
- Server-side leaderboard processing
- Standalone HTTP server with explorer proxy and local mock endpoints

## Production deploy with Docker

1. Go to the project directory:

```bash
cd examples/tetris-arena
```

2. Create `.env` for production:

```bash
cat > .env <<'EOF'
APP_PUBKEY=ut1_tetrisarena_default_pubkey
SCORE_ATTEST_SECRET=replace-with-a-long-random-secret
NODE_RPC_URL=https://alpha2.usernodelabs.org
EOF
```

3. Build and start:

```bash
docker compose up -d --build
```

4. Expose domain to this service:

- Container listens on `3333`
- Host mapping is `3333:3333`
- Point reverse proxy/domain to `http://<host>:3333`

5. Verify:

```bash
curl -I http://localhost:3333
```

## Manual run (no Docker)

1. Go to the project directory:

```bash
cd examples/tetris-arena
```

2. Start local mode:

```bash
npm run dev
```

3. Open:

`http://localhost:3333`

4. Start production mode manually:

```bash
SCORE_ATTEST_SECRET=replace-with-a-long-random-secret npm start
```

## Environment variables

- `PORT` default: `3333`
- `APP_PUBKEY` app recipient address
- `SCORE_ATTEST_SECRET` signing secret for attested score memos
- `NODE_RPC_URL` optional explorer/rpc URL override

## API endpoints

- `GET /` app UI
- `GET /usernode-bridge.js` bridge script
- `GET /__game/state?address=<pubkey>`
- `POST /__tetris/attest-score`
- `GET|POST /explorer-api/*`
- `GET /__mock/enabled` local dev only
- `GET /__mock/address` local dev only
- `POST /__mock/send` local dev only
- `POST /__mock/transactions` local dev only
