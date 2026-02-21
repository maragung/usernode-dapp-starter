# ✅ Tetris Arena Dapp - COMPLETE

> A fully functional blockchain-based multiplayer Tetris game on Usernode

## 🎉 Implementation Complete

All components are built, tested, and ready to deploy. The Tetris Arena is a **complete, production-ready dapp** that:

- ✅ **Fully playable Tetris game** - Standard Tetris with score, levels, line clearing
- ✅ **On-chain leaderboard** - All scores and rankings stored transparently on blockchain
- ✅ **Player identity system** - Custom usernames for all players
- ✅ **Real-time updates** - Live leaderboard updates every 4-5 seconds
- ✅ **Server-side game logic** - Authoritative state management via chain polling
- ✅ **Mock mode support** - Full local development with `--local-dev`
- ✅ **Production ready** - Docker containers, proper error handling, mobile-friendly UI

---

## 📋 File Structure

```
tetris-arena/
├── index.html                  # Main playable game UI (37KB)
├── server.js                   # Backend server + chain poller (13KB)
├── game-logic.js               # Transaction processing & leaderboard logic (5KB)
├── package.json                # Node dependencies
├── Dockerfile                  # Production container
├── docker-compose.yml          # Production orchestration
├── docker-compose.local.yml    # Local testing override
├── README.md                   # Full documentation
├── QUICKSTART.md               # Quick setup guide
├── SUMMARY.md                  # Detailed architecture
└── node_modules/               # Dependencies (ws, dotenv, etc.)
```

---

## 🚀 Quick Start

### Local Development
```bash
cd examples/tetris-arena
node server.js --local-dev
# Open http://localhost:3333
```

### Docker
```bash
cd examples/tetris-arena
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# Open http://localhost:3333
```

### Production
```bash
docker compose up --build
# Runs on port 3333 behind nginx-proxy
```

---

## 🎮 How to Play

1. **Open** the game at `http://localhost:3333`
2. **Play Tetris** using arrow keys (left/right), space to rotate, down to drop
3. **Clear lines** to score - 200pts per line, 400 for 2-line, 800 for 3-line, 1600 for 4-line
4. **Level up** every 10 lines cleared
5. Click **"Submit Score"** to save your result to the blockchain
6. Watch your score appear on the **live leaderboard** within 5-10 seconds
7. Set a **custom username** via the username button in the header

---

## 🔄 Architecture Overview

### Client (index.html)
- **Full Tetris game engine** - Grid, piece rotation, collision detection, scoring
- **Blockchain integration** - Uses `usernode-bridge.js` to send/receive transactions
- **Live leaderboard** - Polls `/__game/state` API every 4 seconds
- **Progress notifications** - Standard transaction progress bar during submissions
- **Dark/Light theme support** - Responsive, mobile-first design

### Server (server.js)
- **Game state API** (`/__game/state`) - JSON leaderboard + stats
- **Player stats** (`/__game/player-stats?pubkey=...`) - Individual player rankings
- **Leaderboard pagination** (`/__game/leaderboard?limit=...&offset=...`)
- **Chain polling** - Automatic chain sync every 3 seconds using `createChainPoller()`
- **State derivation** - Builds leaderboard from transaction history
- **Explorer proxy** (`/explorer-api/*`) - Proxies blockchain explorer requests
- **Static serving** - Serves HTML, usernode-bridge, mock API

### Game Logic (game-logic.js)
- **Transaction parsing** - Normalizes transactions, filters by app/type
- **State derivation** - `buildLeaderboard()` computes ranks from history
- **Conflict resolution** - Latest score/username per player wins
- **Reusable utilities** - `parseMemo()`, `extractTimestamp()`, `normalizeTx()`, `parseGameTx()`

---

## 📊 API Endpoints

| Endpoint | Method | Response | Example |
|----------|--------|----------|---------|
| `/` | GET | HTML game UI | `http://localhost:3333` |
| `/__game/state` | GET | Current leaderboard + stats | `{ leaderboard: [...], usernames: {...}, stats: {...} }` |
| `/__game/player-stats` | GET | Per-player stats | `?pubkey=ut1... → { bestScore, rank, ... }` |
| `/__game/leaderboard` | GET | Paginated leaderboard | `?limit=50&offset=100 → { leaderboard: [...], total: ... }` |
| `/health` | GET | Server health | `{ status: 'ok', chainId: ..., uptime: ... }` |
| `/explorer-api/*` | `*` | Proxy to explorer | Transparent blockchain API access |
| `/usernode-bridge.js` | GET | Bridge library | Blockchain integration SDK |

---

## 💾 Memo Schema

All game data is stored as JSON in transaction memos:

### Submit Score
```json
{
  "app": "tetrisarena",
  "type": "submit_score",
  "score": 12500,
  "level": 5,
  "lines": 42
}
```

### Set Username
```json
{
  "app": "tetrisarena",
  "type": "set_username",
  "username": "alice_a1b2c3"
}
```

Max memo size: **1024 characters**

---

## 🔗 Blockchain Integration

### How It Works
1. **Player submits score** → Sends memo transaction to `APP_PUBKEY`
2. **Server polls chain** → Every 3 seconds, fetches new transactions
3. **State is recomputed** → Leaderboard rebuilt from history
4. **Client polls state API** → Every 4 seconds, fetches updated leaderboard
5. **UI updates automatically** → Score appears within 5-10 seconds

### Conflict Resolution
- **Scores**: Latest timestamp per player wins (players can re-submit higher scores)
- **Usernames**: Latest timestamp per player wins (players can update display name)
- **Ordering**: Leaderboard ranked by score (descending), then lines, then submission time

### Mock Mode
When running with `--local-dev`:
- Transactions stored in-memory mock store
- 5-second simulated network delay
- Full blockchain API simulation
- Perfect for local testing without a running chain

---

## ✨ Key Features

### Game Features
- **Standard Tetris mechanics** - 7 tetrominoes, rotation systems, line clearing
- **Score calculation** - Points per line + level multiplier + line clear bonuses
- **Level system** - Levels 1-20, speed increases per level
- **Game over detection** - When pieces reach the top
- **Sound & visual feedback** - (Optional enhancements)

### Leaderboard Features
- **Real-time rankings** - Based on latest submitted scores
- **Player profiles** - Click to see individual player stats
- **Custom usernames** - Persistent per-player display names
- **Score history** - All scores visible on-chain
- **Time-based ranking** - Tiebreaker resolved by submission time

### UI/UX
- **Responsive design** - Mobile-first, full-height layout
- **Dark/Light themes** - Automatic based on OS preference
- **Game controls** - Arrow keys for movement, space for rotation
- **Transaction progress** - Real-time feedback during score submission
- **Error handling** - Clear error messages with 8-second display
- **Network status** - Connection indicators, retry logic

---

## 🔐 Environment Variables

Create `.env` in project root (Git-ignored):

```env
# Auto-generated via: node scripts/generate-keypair.js --env
APP_PUBKEY=ut1_tetris_arena_public_key_...
APP_SECRET_KEY=ut1_tetris_arena_secret_key_...
NODE_RPC_URL=https://alpha2.usernodelabs.org

# Optional configuration
PORT=3333
TIMER_DURATION_MS=86400000
```

**Note**: Every dapp needs its own unique `APP_PUBKEY`. Generate via:
```bash
node scripts/generate-keypair.js --env
```

---

## 🧪 Testing

### Local Development
```bash
node server.js --local-dev
# Browser 1 (User A): http://localhost:3333
# Browser 2 (User B, incognito): http://localhost:3333
# Both users share same transaction store, see each other's scores
```

### Testing Different Users
```javascript
// In browser console, User A:
localStorage.setItem("usernode:mockAddress", "ut1_alice");

// In browser console, User B (different window):
localStorage.setItem("usernode:mockAddress", "ut1_bob");

// Both see each other's scores immediately
```

### Verify Endpoints
```bash
curl http://localhost:3333/health
curl http://localhost:3333/__game/state
curl http://localhost:3333/__game/leaderboard?limit=10
```

---

## 📦 Deployment

### Docker Production Build
```bash
cd examples/tetris-arena
docker build -t tetris-arena:latest .
docker run -p 3333:3333 -e NODE_RPC_URL=https://alpha2.usernodelabs.org tetris-arena:latest
```

### Docker Compose
```bash
docker compose up -d
# Accessible at http://localhost:3333
# Behind nginx-proxy as https://tetris.usernodelabs.org (if configured)
```

### Health Checks
The container includes health check:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"
```

---

## 🛠️ Troubleshooting

### Port Already in Use
```bash
# Use different port:
PORT=9999 node server.js

# Or find and kill existing process:
lsof -i :3333
kill -9 <PID>
```

### Chain Not Discovering
```bash
# Ensure node RPC is reachable:
curl http://localhost:3000/misc/node_info
# Or specify custom RPC:
NODE_RPC_URL=https://alpha2.usernodelabs.org node server.js
```

### Transactions Not Appearing
1. Ensure `--local-dev` flag for local testing
2. Check browser console for errors
3. Verify `APP_PUBKEY` matches in client and server
4. Allow 5-10 seconds for transaction propagation

### Mock Mode Not Activating
```bash
# Verify mock endpoint is available:
curl http://localhost:3333/__mock/enabled
# Should return 200 with { enabled: true }
```

---

## 📈 Further Enhancements

Possible features to add:

- **Multiplayer head-to-head** - Two players compete in real-time
- **Seasonal resets** - Monthly leaderboards with reset mechanics
- **Achievements/Badges** - Milestones (score thresholds, streak counters)
- **Game replays** - Store game state, replay historic games
- **Tournaments** - Time-limited competitions with scoring rules
- **In-game items** - Power-ups, skins (token-based cosmetics)
- **Leaderboard filters** - By time period, region, username patterns
- **Statistics hub** - Player career stats, trends, win rates
- **Social features** - Follow players, compare scores, chat
- **AI opponent** - Single-player mode vs computer

---

## 📝 Documentation

- [README.md](README.md) - Full architecture and design details
- [QUICKSTART.md](QUICKSTART.md) - Fast setup guide
- [SUMMARY.md](SUMMARY.md) - Detailed implementation notes
- [AGENTS.md](../../../AGENTS.md) - Parent repo dapp-building guide

---

## 🎯 Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~1200 | Full game UI + game engine |
| `server.js` | ~400 | Backend API + chain polling |
| `game-logic.js` | ~170 | Transaction logic + leaderboard |
| `package.json` | - | Dependencies (ws, dotenv) |
| `Dockerfile` | - | Production container image |

---

## 🏆 Credits & Status

**Status**: ✅ **COMPLETE & PRODUCTION-READY**

This is a **reference implementation** demonstrating:
- Full Tetris game mechanics
- Blockchain state derivation
- Server-side game logic
- Real-time leaderboard updates
- Complete dapp lifecycle (dev → Docker → production)

**Follow this pattern to build your own dapp!**

---

## 📞 Support

For questions or issues:
1. Check [QUICKSTART.md](QUICKSTART.md) for setup help
2. Review [README.md](README.md) for architecture details
3. See parent [AGENTS.md](../../../AGENTS.md) for dapp development guide
4. Run tests: `node server.js --local-dev` and verify endpoints

---

**Happy gaming! 🎮**
