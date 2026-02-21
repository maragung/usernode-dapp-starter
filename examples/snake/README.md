# 🐍 Snake Game - Usernode Dapp

A colorful, responsive Snake game built for the Usernode blockchain. Play in Classic or Ranked mode, connect your wallet, and compete on the leaderboard!

## Features

- 🎮 **Three Game Modes**
  - **Classic**: Play without time limits, no score saved
  - **Ranked**: Random time limits (30s - 5min), auto-submit scores to leaderboard
  - **Battle**: 5-player multiplayer with unique colors and daily limits

- 🌍 **Wrap-Around Walls**
  - Snake passes through walls!
  - Exit left side, re-enter right side
  - Exit top, re-enter bottom
  - All directional wrapping supported

- ⏸️ **Pause / Resume**
  - Press SPACE to pause/resume
  - Double-tap screen on mobile to pause/resume
  - Game freezes mid-play with visual indicator

- 🏆 **Leaderboard System**
  - Real-time leaderboard updated from blockchain transactions
  - Per-user high score tracking
  - Separate leaderboards for Ranked and Battle modes
  - 6 ranked submissions per 24 hours, 5 battles per 24 hours

- 📱 **Responsive Design**
  - Auto-detects PC vs smartphone
  - Touch controls for mobile
  - Keyboard controls (arrow keys or WASD)
  - Works on all screen sizes

- 🎨 **Colorful Graphics**
  - Animated snake movement with gradient colors
  - Pulsing food effect
  - Dark/light theme support
  - 5-player Battle mode with unique snake colors

- 🔗 **Wallet Integration**
  - Connect with Usernode wallet required to play
  - Score submissions stored on-chain
  - Username support
  - Exit button to return to menu anytime

## Getting Started

### Local Development

```bash
cd examples/snake

# Run development server
npm run dev
```

### With Docker

```bash
cd examples/snake

# Build and run with local-dev mode
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build

# Open browser
open http://localhost:3300
```

## How to Play

1. **Connect Wallet**: Click "Connect Wallet" to authenticate
2. **Choose Mode**: Select Classic, Ranked, or Battle mode
3. **Play**: Use keyboard or touch buttons to move
   - Arrow keys or WASD on PC keyboard
   - Double-tap to pause on mobile
4. **Score Points**: Eat the red food to gain points
5. **Game Over**: In Ranked/Battle modes, score auto-submits. Exit anytime with Exit button
6. **Controls**:
   - SPACE key = Pause/Resume
   - Double-tap screen = Pause/Resume (mobile)
   - Arrow Keys / WASD = Move
   - Exit button = Return to mode select

## Game Rules

### Score & Objects
- Each food eaten = +10 points
- Initial snake length = 3 segments
- Grid size = 20x20 cells
- **Walls wrap around** - exit one side, re-enter opposite side

### Classic Mode
- No time limit
- Play as long as you want
- Score not saved to leaderboard
- Perfect for practice

### Ranked Mode
- Random time limit per game: **30s to 30 minutes** (30s, 1min, 1.5min, 2min, 3min, 5min, 10min, 15min, 20min, 25min, 30min)
- Scores automatically submitted to blockchain after game ends
- Maximum 6 ranked games per 24 hours
- Must connect wallet before playing

### Battle Mode
- 5 concurrent players (you vs 4 AI opponents)
- Each player gets unique color (Red/Yellow/Green/Blue/Purple)
- Snakes pass through each other without collision
- Random time limit for each player (30s-5min)
- 3-minute inactivity rule: eliminated if no food eaten
- Winner (last survivor) auto-submits to Battle leaderboard
- Maximum 5 battles per 24 hours
- Real-time player status sidebar shows:
  - Player color
  - Food count
  - Time remaining
  - Alive/OUT status

## Architecture

### Frontend (index.html)
- React-based UI (via CDN)
- 2D Canvas rendering with WebGL fallback
- Responsive CSS Grid layout
- Real-time game loop and collision detection

### Backend (server.js)
- Node.js HTTP server
- Static file serving
- Explorer API proxy for CORS
- Mock transaction endpoints (local dev)
- Leaderboard API
- Chain polling for ranked submissions

### Game Logic (game-logic.js)
- Shared transaction processing
- Score validation
- Leaderboard management
- Username tracking
- Daily submission limits

## Transaction Format

All scores are submitted as blockchain transactions:

```json
{
  "app": "snake",
  "type": "score_submission",
  "score": 150,
  "mode": "ranked",
  "timestamp": 1708524234000,
  "username": "player_a1b2c3"
}
```

## API Endpoints

### GET `/__snake/leaderboard`
Returns current top scores

Response:
```json
{
  "scores": [
    {
      "rank": 1,
      "username": "alice_a1b2c3",
      "address": "ut1...",
      "score": 250,
      "timestamp": 1708524234000
    }
  ],
  "timestamp": 1708524300000
}
```

### GET `/__snake/stats?address=ut1...`
Get user statistics

Response:
```json
{
  "username": "alice_a1b2c3",
  "address": "ut1...",
  "bestScore": 250,
  "totalSubmissions": 5,
  "todaySubmissions": 2,
  "submissionsRemaining": 4
}
```

### POST `/__mock/send` (Local dev only)
Send mock transaction for testing

Request:
```json
{
  "from_pubkey": "ut1...",
  "destination_pubkey": "ut1...",
  "amount": 1,
  "memo": "{\"app\":\"snake\",\"type\":\"score_submission\",\"score\":100}"
}
```

### POST `/__mock/transactions` (Local dev only)
Query mock transactions

Request:
```json
{
  "account": "ut1...",
  "limit": 200
}
```

## Environment Variables

Create a `.env` file:

```env
APP_PUBKEY=ut1zvhmxlhmv95cgzaph6cpv0rrcrn29gr4xkdj9fuykc6648hmvgksmkfua6
APP_SECRET_KEY=your_secret_key_here
NODE_RPC_URL=https://alpha2.usernodelabs.org
PORT=3300
```

## Configuration

### Game Constants (in index.html)
- `GRID_SIZE = 20` - Grid cells per side
- `CELL_SIZE = 20` - Pixel size per cell
- `TX_SEND_OPTS.timeoutMs = 90000` - 90 second timeout for score submission
- `RANKED_TIME_LIMITS` - Available time limits: 30s, 60s, 90s, 2min, 3min, 5min

### Ranked Mode Limits (game-logic.js)
- `SUBMISSIONS_PER_DAY = 6` - Max ranked games per 24 hours
- `MAX_CLASSIC_SCORE = 1000` - Validation limit for classic mode

## Keyboard Controls

| Key | Action |
|-----|--------|
| ↑ / W | Move Up |
| ↓ / S | Move Down |
| ← / A | Move Left |
| → / D | Move Right |
| SPACE | Pause / Resume |
| Double-tap (mobile) | Pause / Resume |

Or use the Exit button in top-right corner to return to mode select at any time.

## Leaderboard Details

- **Ranked Mode Only**: Only scores from ranked mode appear on leaderboard
- **High Score Per User**: Each user can have multiple scores, but only their highest ranked score counts
- **Top 100**: Leaderboard displays top 100 players
- **Real-time Updates**: Scores update as transactions are confirmed on-chain
- **Daily Limit**: 6 submissions per 24 hour period per player

## Local Development Notes

### Test Multi-User

Open game in two browser windows to test leaderboard:
1. Regular window (User A)
2. Incognito/Private window (User B)

Mock addresses are stored in localStorage by window, so each window gets a unique test address.

### Using Mock Mode

When running `node server.js --local-dev`:
- Mock transactions stored in-memory (reset on restart)
- 5-second delay before transactions appear
- Explorer API proxy still connects to real upstream
- Perfect for testing without a running node

### Override App Address

To use a custom app pubkey for testing:

```javascript
// In browser console
localStorage.setItem("snake:app_pubkey", "ut1custom_address");
location.reload();
```

## Troubleshooting

### Wallet Connection Fails
- Ensure you're accessing via `http://localhost:3300` (not IP)
- Check that usernode-bridge.js is loaded
- Try incognito mode to clear localStorage

### Scores Not Appearing
- Check network tab for `/explorer-api/` calls
- Verify APP_PUBKEY matches between client and server
- Wait for chain polling (3-second intervals)

### Canvas Rendering Issues
- Clear browser cache
- Try a different browser
- Check for browser console errors

### Docker Build Fails
- Ensure you're in the `examples/snake` directory
- Verify Node.js version: `node --version` (need 18+)
- Check docker daemon is running

## Performance

- **Game Loop**: 200ms per tick (5 FPS) - tunable in code
- **Canvas Rendering**: 60 FPS (requestAnimationFrame)
- **Leaderboard Poll**: 5 seconds
- **Chain Poll**: 3 seconds
- **Typical Memory**: ~50MB for running server
- **Max Concurrent**: No inherent limit (stateless)

## Future Enhancements

- [ ] Multiplayer mode
- [ ] Power-ups and obstacles
- [ ] Difficulty levels
- [ ] Achievement badges
- [ ] Daily challenges
- [ ] Speed runs leaderboard
- [ ] Replay/replay system
- [ ] In-game music and sound

## License

MIT License - See LICENSE file in repo root

## Contributing

Contributions welcome! Some ideas:
- Additional game modes
- Mobile improvements
- Better graphics/animations
- Performance optimizations
- New leaderboard features

## Support

For issues or questions:
- Check the main AGENTS.md documentation
- Review examples in `/examples/` folder
- Open an issue on GitHub
