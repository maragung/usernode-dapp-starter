# Snake Arena

Snake Arena is a standalone Usernode game service with ranked, battle, and daily modes.

## What this app includes

- Classic, Ranked, Battle, and Daily gameplay modes
- On-chain username updates
- Attested score submission flow
- Server leaderboard processing
- Standalone HTTP server with explorer proxy and local mock endpoints

## Production deploy with Docker

1. Go to the project directory:

```bash
cd examples/snake-arena
```

2. Create `.env` for production:

```bash
cat > .env <<'EOF'
APP_PUBKEY=ut1zvhmxlhmv95cgzaph6cpv0rrcrn29gr4xkdj9fuykc6648hmvgksmkfua6
SCORE_ATTEST_SECRET=replace-with-a-long-random-secret
EOF
```

3. Build and run:

```bash
docker compose up -d --build
```

4. Expose domain to port `3300`:

- Container listens on `3300`
- Host mapping is `3300:3300`
- Point your reverse proxy/domain to `http://<host>:3300`

5. Verify:

```bash
curl -I http://localhost:3300
```

## Manual run (no Docker)

1. Go to the project directory:

```bash
cd examples/snake-arena
```

2. Start local mode:

```bash
npm run dev
```

3. Open:

`http://localhost:3300`

4. Start production mode manually:

```bash
SCORE_ATTEST_SECRET=replace-with-a-long-random-secret npm start
```

## Environment variables

- `PORT` default: `3300`
- `APP_PUBKEY` app recipient address
- `SCORE_ATTEST_SECRET` signing secret for attested score memos

## API endpoints

- `GET /` app UI
- `GET /usernode-bridge.js` bridge script
- `GET /__snake/leaderboard`
- `GET /__snake/profile?address=<pubkey>`
- `POST /__snake/attest-score`
- `GET|POST /explorer-api/*`
- `GET /__mock/enabled` local dev only
- `POST /__mock/send` local dev only
- `POST /__mock/transactions` local dev only
