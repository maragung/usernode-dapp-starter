# Tetris Arena - Blockchain-Based Multiplayer Tetris

A fully playable Tetris game with decentralized leaderboard stored on the Usernode blockchain. Features modern minimalist design with responsive layout and real-time multiplayer scoring.

## Overview

Tetris Arena combines the classic Tetris game with blockchain technology to create a transparent, immutable leaderboard system. All player scores and usernames are stored as transactions on-chain, making the game data completely verifiable and persistent.

### Key Features

- **Complete Tetris Game** - Full gameplay mechanics with piece rotation, line clearing, and level progression
- **On-Chain Leaderboard** - Scores permanently stored on blockchain
- **Real-Time Updates** - Live leaderboard updates every 5 seconds
- **Custom Usernames** - Players can set personalized display names
- **Modern UI** - Minimalist design with dark/light theme support
- **Responsive Layout** - Works perfectly on desktop and mobile devices
- **Zero Backend Database** - All data derived from blockchain transactions

## Getting Started

### Prerequisites

- Node.js 16+
- A Usernode wallet or access to mock mode
- Modern web browser

### Local Development

```bash
cd examples/tetris-arena

node server.js --local-dev
```

Open `http://localhost:3333` in your browser.

#### Local Development with Multiple Users

1. Browser 1 (Normal window): `http://localhost:3333`
2. Browser 2 (Incognito window): `http://localhost:3333`

Both windows share the same mock transaction store and can see each other's scores in real-time.

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## Gameplay

### Controls

| Input | Action |
|-------|--------|
| ← → Arrow Keys | Move piece left/right |
| ↓ Arrow Key | Drop piece faster |
| Z | Rotate piece |
| Spacebar | Start/Resume game |

### Scoring

- Single Line: 100 points
- Double Line: 300 points
- Triple Line: 500 points
- Tetris (4 lines): 800 points
- Hard Drop: 2 points per row

### Levels

- Level increases after every 10 lines cleared
- Speed increases with each level (1.2x multiplier per level)

## UI Layout

### Main Layout

```
┌─────────────────────────────────────────┐
│  Header: Logo, Connect, Leaderboard    │
├──────────────────┬─────────────────────┤
│                  │  Next Piece         │
│  Game Grid       ├─────────────────────┤
│  (20x10)         │  Stats (Score...)   │
│                  ├─────────────────────┤
│                  │  Controls (Buttons) │
│                  ├─────────────────────┤
│                  │  Profile            │
│                  ├─────────────────────┤
│                  │  Personal Best      │
│                  ├─────────────────────┤
│                  │  Top 5 Players      │
└──────────────────┴─────────────────────┘
```

### Right Sidebar (Mobile Adapts to Grid)

1. **Next Piece** - Preview of next Tetris piece
2. **Stats** - Current score, level, lines, high score
3. **Controls** - START, PAUSE, and ROTATE buttons
4. **Profile** - Wallet address and username management
5. **Personal Best** - Your best score and current rank
6. **Top 5** - Global leaderboard top players

## Blockchain Integration

### Transaction Memo Format

```javascript
{
  app: "tetrisarena",
  type: "submit_score",
  score: 12500,
  level: 5,
  lines: 42
}
```

### Usernames

Players can set custom usernames. Usernames are stored as separate transactions:

```javascript
{
  app: "tetrisarena",
  type: "set_username",
  username: "alice_a1b2c3"
}
```

The username suffix (based on last 6 characters of address) is automatically appended for uniqueness.

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/__game/state` | GET | Current leaderboard and stats |
| `/__game/player-stats` | GET | Individual player statistics |
| `/__game/leaderboard` | GET | Paginated leaderboard |
| `/health` | GET | Server health check |
| `/usernode-bridge.js` | GET | Blockchain bridge library |

## Architecture

### Client-Side (index.html)

- React-free vanilla JavaScript
- Real game engine with collision detection
- WebGL-free CSS Grid for rendering
- Local state management with localStorage
- Automatic leaderboard polling

### Server-Side (server.js)

- Express.js for HTTP routing
- Automatic chain polling every 3 seconds
- Transaction deduplication
- Leaderboard computation from blockchain data
- Explorer API proxy

### Game Logic (game-logic.js)

- Transaction parsing and normalization
- State derivation from blockchain
- Conflict resolution (latest write wins)
- Helper utilities for common operations

## Features

### Game Features

- 7 distinct Tetris pieces (I, O, T, S, Z, J, L)
- Rotation mechanics with collision detection
- Hard drop (holding down arrow)
- Line clearing with combo bonuses
- Score calculation with level multiplier
- Level progression system
- Game over detection

### Social Features

- Real-time leaderboard updates
- Personal username display
- Player ranking system
- Top 5 players showcase
- Blockchain verifiable scores

### UI/UX Features

- Modern minimalist design
- Dark/Light theme support
- Responsive grid layout
- Mobile-friendly controls
- Transaction progress indication
- Error message display with sticky timeout
- Loading states
- Smooth animations and transitions

## Design System

### Colors

**Dark Theme (Default)**
- Background: `#0a0e17`
- Foreground: `#e8eef9`
- Accent: `#5b9cff`
- Success: `#10b981`
- Danger: `#ef4444`

**Light Theme**
- Background: `#fafbfd`
- Foreground: `#0f1419`
- Accent: `#3b82f6`
- Success: `#059669`
- Danger: `#dc2626`

### Typography

- Font: System UI stack (San Francisco, Segoe UI, Roboto)
- Headings: 700 weight
- Body: 400-600 weight
- Monospace: ui-monospace for addresses

### Spacing

- Base unit: 4px
- Section gap: 16px
- Card padding: 12px
- Small gaps: 8px

## Development

### Modifying Game Rules

Edit constants in `<script>` section of `index.html`:

```javascript
const GRID_WIDTH = 10;        // Tetris field width
const GRID_HEIGHT = 20;       // Tetris field height
const LEADERBOARD_POLL_MS = 5000;  // Update interval
```

### Customizing Theme

Edit `:root` variables in `<style>` section:

```css
:root {
  --bg: #0a0e17;
  --accent: #5b9cff;
  --ok: #10b981;
  --danger: #ef4444;
}
```

### Adding New Game Modes

Create new memo types in game logic:

```javascript
if (memo.type === 'new_mode') {
  // Handle new game mode transaction
}
```

## Testing

### Test Scenarios

1. **Single Player** - Play, submit score, verify on leaderboard
2. **Multiple Simultaneous Players** - Use different browser windows
3. **Network Interruption** - Verify error handling and recovery
4. **High Score Submission** - Ensure score persistence and ranking
5. **Username Updates** - Verify username changes reflect in real-time

### Performance Metrics

- Grid rendering: 60 FPS
- Leaderboard poll: 5s intervals
- Transaction confirmation: 10-90 seconds
- State update: <100ms after poll

## Troubleshooting

### Game Not Starting

```bash
# Check server is running
curl http://localhost:3333/health

# Verify mock mode is enabled
curl http://localhost:3333/__mock/enabled
```

### Score Not Appearing

- Wait 5-10 seconds for next leaderboard poll
- Check browser console for errors
- Verify wallet is connected
- Ensure score is greater than 0

### UI Not Updating

- Hard refresh browser (Ctrl+Shift+R)
- Check for JavaScript errors in console
- Verify API endpoint responses in Network tab

### Connection Issues

```bash
# Verify explorer proxy
curl http://localhost:3333/explorer-api/active_chain

# Check NODE_RPC_URL
echo $NODE_RPC_URL
```

## Deployment

### Docker Production Build

```bash
docker build -t tetris-arena:latest .
docker run -p 3333:3333 \
  -e NODE_RPC_URL=https://alpha2.usernodelabs.org \
  tetris-arena:latest
```

### Environment Variables

```env
NODE_RPC_URL=https://alpha2.usernodelabs.org
PORT=3333
TIMER_DURATION_MS=86400000
```

### Health Checks

Server includes health endpoint for container orchestration:

```bash
curl http://localhost:3333/health
```

Response:
```json
{
  "status": "ok",
  "chainId": "utc1...",
  "leaderboardSize": 42,
  "uniquePlayers": 15,
  "uptime": 3600
}
```

## Performance Optimization

### Client-Side

- CSS Grid for efficient rendering (no canvas overhead)
- RequestAnimationFrame for smooth animations
- LocalStorage for high score persistence
- Minimal DOM updates

### Server-Side

- Transaction deduplication with Set
- In-memory leaderboard caching
- Efficient array sorting (O(n log n))
- HTTP compression ready

## Security Considerations

- Private keys never sent to frontend
- All transactions signed by native bridge
- Scores verified on-chain
- Username length validated (max 24 chars)
- Memo size limited to 1024 bytes

## Future Enhancements

- Game replays via blockchain data
- Seasonal leaderboards with resets
- Achievement badges and milestones
- Tournament bracket system
- Multiplayer head-to-head mode
- Power-ups and special pieces
- Custom skins (token-based cosmetics)
- Social features (friend searches, follows)

## File Structure

```
tetris-arena/
├── index.html           # Complete game UI (self-contained)
├── server.js            # Backend + chain polling
├── game-logic.js        # Transaction logic helpers
├── package.json         # Dependencies
├── Dockerfile           # Production container
├── docker-compose.yml   # Service definition
├── README.md            # This file
└── node_modules/        # Dependencies (ws, dotenv)
```

## License

Part of Usernode dapp starter kit.

## Support

For issues or questions:

1. Check [QUICKSTART.md](QUICKSTART.md) for setup help
2. Review [SUMMARY.md](SUMMARY.md) for implementation details
3. See parent [AGENTS.md](../../../AGENTS.md) for general dapp patterns

---

**Play, Score, and Own Your Tetris Legacy on Blockchain!**
