# Merge Master

Merge Master is a standalone Usernode 2048 service. It is ready to run directly in Docker or manually with Node.js.

## What this app includes

- 4x4 Merge gameplay with keyboard and touch controls
- On-chain username updates
- Verified leaderboard flow
- Attested score submission flow
- Standalone HTTP server with explorer proxy and mock endpoints in local dev mode

## Production deploy with Docker

1. Go to the project directory:

```bash
cd examples/merge-master
```

2. Create a production env file:

```bash
cat > .env <<'EOF'
APP_PUBKEY=ut1_merge_master_default_pubkey
SCORE_ATTEST_SECRET=replace-with-a-long-random-secret
EOF
```

3. Build and start:

```bash
docker compose up -d --build
```

4. Expose your domain to this service port:

- App listens on container port `3310`
- Host mapping is `3310:3310`
- Point reverse proxy/domain to `http://<host>:3310`

5. Verify:

```bash
curl -I http://localhost:3310
```

## Manual run (no Docker)

1. Go to the project directory:

```bash
cd examples/merge-master
```

2. Start local development mode (mock endpoints enabled):

```bash
npm run dev
```

3. Open:

`http://localhost:3310`

4. Start production mode manually:

```bash
SCORE_ATTEST_SECRET=replace-with-a-long-random-secret npm start
```

## Environment variables

- `PORT` default: `3310`
- `APP_PUBKEY` app recipient address
- `SCORE_ATTEST_SECRET` signing secret for attested score memos

## API endpoints

- `GET /` app UI
- `GET /usernode-bridge.js` bridge script
- `POST /__merge/attest-score` score attestation
- `GET /__merge/leaderboard` verified leaderboard
- `GET|POST /explorer-api/*` explorer proxy
- `GET /__mock/enabled` local dev only
- `POST /__mock/sendTransaction` local dev only
- `POST /__mock/getTransactions` local dev only
