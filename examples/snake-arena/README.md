# 🐍 Snake Game - Usernode Dapp

A colorful, responsive Snake game built for the Usernode blockchain. Play in Classic or Ranked mode, connect your wallet, and compete on the leaderboard!

## Features

- 🎮 **Three Game Modes**
  - **Classic**: Play without time limits, no score saved
  - **Ranked**: Random time limits (30s - 5min), auto-submit scores to leaderboard
  - **Battle**: Real-time multiplayer mode - compete against other players using WebSocket

- 🌍 **Wrap-Around Walls**
  - Snake passes through walls!
  - Exit left side, re-enter right side
  - Exit top, re-enter bottom
  - All directional wrapping supported

- ⏸️ **Pause / Resume**
  - Press SPACE to pause/resume
  - Use the in-game button to pause/resume
  - The game freezes mid-play with a visual indicator

- 🏆 **Leaderboard System**
  - Real-time leaderboard updated from blockchain transactions
  - Per-user high score tracking
  - Separate leaderboards for Ranked and Battle modes
  - 6 ranked submissions per 24 hours, 5 battles per 24 hours

- 📱 **Responsive Design**
  - Full-screen maximized gameplay area with no hidden blocks
  - Drag/swipe gestures for mobile - smooth and intuitive
  - Keyboard controls (arrow keys or WASD) for PC
  - Perfectly optimized for both mobile and desktop screens

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

### Prerequisites

- Node.js 16+ 
- npm

### Basic Setup

```bash
cd examples/snake

# Install dependencies (required for WebSocket battle mode)
npm install

# Run development server with mock mode
npm run dev
```

The game will be available at `http://localhost:3300`

### Local Development (Detailed)

**Option 1: Quick Start (No Battle Mode)**
```bash
cd examples/snake
node server.js --local-dev
```

**Option 2: Full Setup with Battle Mode**
```bash
cd examples/snake

# First, install dependencies
npm install

# Then run the server
npm run dev

# OR manually:
node server.js --local-dev
```

When you see the output:
```
Snake game server listening on port 3300
WebSocket server ready for battle mode
Local dev mode enabled - using mock endpoints
Open http://localhost:3300/
```

The game is ready to play - open your browser to `http://localhost:3300`

### With Docker

```bash
cd examples/snake

# Build and run with local-dev mode
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build

# Open browser
open http://localhost:3300
```

## How to Play

1. **Connect Wallet**: Click "Connect Wallet" button (auto-connects for local dev)
2. **Choose Mode**: Select Classic, Ranked, or Battle mode
3. **Play**: Use keyboard or drag/swipe gestures
   - **PC**: Arrow Keys or WASD to move
   - **Mobile**: Drag/swipe your finger on the game board to direct the snake
4. **Score Points**: Eat the red food to gain points
5. **Game Over**: In Ranked/Battle modes, score auto-submits. Click Exit button to return anytime
6. **Controls Summary**:
   - Arrow Keys/WASD = Move (PC only)
   - Drag/Swipe = Move in that direction (mobile)
   - Exit button (bottom-right) = Return to menu

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
- **Real-time Multiplayer**: Players compete against actual real players, not AI
- **WebSocket Connection**: Uses persistent WebSocket connection for real-time synchronization
- **Dynamic Matchmaking**: Automatically joins available battle rooms (max 4 players per room)
- **Synchronized Game State**: All players see the same game board and food positions
- **Player Status Display**: Real-time sidebar shows all active players with:
  - Player name and ID
  - Snake color
  - Food count
  - Alive/eliminated status
- **Up to 4 Players**: Each battle room supports 1-4 concurrent real players
- **Score Submission**: Winner auto-submits battle victory to blockchain leaderboard
- **Maximum 5 battles per 24 hours**: Submission limits apply per player

### Game Session Scheduling (Ranked & Battle Modes)

Both Ranked and Battle modes use a **session-based scheduling system** that prevents concurrent game time overlaps and enables queue joining:

**How It Works:**
1. Player selects Ranked or Battle mode
2. Game displays 6 upcoming session slots with exact start times
3. Each session shows:
   - Start time (HH:MM format)
   - Time until start (e.g., "In 15 min", "Starting soon")
   - Number of players already queued
4. Player can:
   - **Join a session** by clicking any available time slot
   - **Queue for future sessions** without waiting
   - **Confirm & Start** when ready to play

**Session Features:**
- Sessions start at randomized intervals (10-20 minutes apart)
- No overlapping session times - only one session per mode running at a time
- Queue shows visual indicator when player is in queue for a session
- Auto-start countdown when session begins
- Failed to join? Queue for next available session

**Benefits:**
- ✅ No time conflicts between sessions
- ✅ Fair access - everyone joins same-time sessions
- ✅ Plan ahead - queue for future times
- ✅ Real-time matchmaking within each session
- ✅ Prevents server overload via time-slotted gameplay

### WebSocket Server (Battle Mode)
- **Real-time Communication**: Uses WebSocket (ws package) for low-latency synchronization
- **Battle Room Management**: Groups players into matchmaking rooms
- **Message Broadcasting**: All player moves synchronized across connected clients
- **Connection Pooling**: Handles multiple concurrent battle rooms and players
- **Automatic Cleanup**: Empty rooms are removed to conserve server resources
- **Persistent Connection**: WebSocket server runs continuously for always-on battle mode

### Responsive Display Layouts

**PC Layout (1024px+) - Split Screen:**
- **Left 50%**: Full-size game canvas with maximized playable area
- **Right 50%**: Information panels showing:
  - Game info (current score, time remaining, active players)
  - Battle player list with individual stats
  - Control guide and tips
- **Advantage**: See full game context and opponent stats without blocking gameplay area

**Mobile Layout (< 1024px) - Full Canvas:**
- Canvas fills 100% of screen for maximum gameplay area
- Score and time display positioned **below canvas** (not overlaying game board)
- Mobile stats bar shows:
  - Current score
  - Time remaining (for Ranked mode)
  - Active player count (for Battle mode)
- **Advantage**: Unobstructed gameplay; stats never interfere with food or snake movement

**Responsive Breakpoints:**
- **Layout switches at 1024px viewport width**
- **Smooth transitions** between portrait and landscape
- **Touch-optimized** controls on mobile
- **Keyboard controls** prioritized on PC (arrow keys, WASD)

## Architecture

### Frontend (index.html)
- React-based UI (via CDN)
- 2D Canvas rendering (20x20 grid)
- **Split-Screen Layout** for PC (50% canvas + 50% info panels)
- **Full-Canvas Layout** for mobile (100% canvas, stats below)
- Responsive CSS Grid with media query breakpoints (1024px)
- Real-time game loop (200ms ticks)
- WebSocket client for battle mode multiplayer synchronization
- Session scheduling UI with queue management
- Touch/drag gesture support for mobile
- Keyboard input handling for PC

### Backend (server.js)
- Node.js HTTP server (port 3300)
- Static file serving with SPA fallback
- Explorer API proxy for blockchain queries (CORS-friendly)
- Mock transaction endpoints for local development
- Leaderboard API (`/__snake/leaderboard`)
- Chain polling for transaction processing (3-second intervals)
- **WebSocket Server** for real-time battle mode with room management
- Battle room matchmaking and player session management

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

## WebSocket Protocol (Battle Mode)

### Connection
```javascript
const ws = new WebSocket(`${protocol}://${host}/__battle`);
// protocol = "ws" for HTTP, "wss" for HTTPS
// host = window.location.host (auto-detects server)
```

### Client → Server Messages

**Join Battle Room**:
```json
{"type": "join_room", "playerId": "ut1_user_abc123", "playerName": "Alice"}
```

**Player Move**:
```json
{"type": "move", "direction": "UP", "timestamp": 1699564320000}
```

**Leave Battle Room**:
```json
{"type": "leave"}
```

**Start Game**:
```json
{"type": "start_game"}
```

### Server → Client Messages

**Room State Update** (sent when player joins or room state changes):
```json
{
  "type": "room_state",
  "roomId": "room_1",
  "players": [
    {"id": "ut1_user_abc123", "name": "Alice", "status": "alive", "foodCount": 0},
    {"id": "ut1_user_def456", "name": "Bob", "status": "alive", "foodCount": 2}
  ],
  "gameState": {"status": "waiting", "food": {"x": 5, "y": 10}},
  "playersLimit": 4
}
```

**Game Started**:
```json
{"type": "game_started", "roomId": "room_1", "timestamp": 1699564320000}
```

**Player Move Broadcast**:
```json
{
  "type": "player_move",
  "playerId": "ut1_user_def456",
  "position": {"x": 10, "y": 15},
  "direction": "RIGHT"
}
```

**Player Eliminated** (optional):
```json
{
  "type": "player_eliminated",
  "playerId": "ut1_user_abc123",
  "reason": "wall_collision"
}
```

**Player Left**:
```json
{"type": "player_left", "playerId": "ut1_user_abc123"}
```

**Game Ended**:
```json
{
  "type": "game_ended",
  "winner": "ut1_user_def456",
  "scores": [
    {"playerId": "ut1_user_def456", "foodCount": 8},
    {"playerId": "ut1_user_abc123", "foodCount": 3}
  ]
}
```

### Connection Pooling
- Maximum 4 players per battle room
- Automatic room creation when joining
- Rooms persist until all players disconnect
- Orphaned rooms cleaned up after 5 minutes of inactivity

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
- `GRID_SIZE = 20` - Grid cells per side (20x20 total)
- `GAME_LOOP_INTERVAL = 200` - Milliseconds per game tick
- `TX_SEND_OPTS.timeoutMs = 90000` - 90 second timeout for score submission
- `TX_SEND_OPTS.pollIntervalMs = 1500` - Poll interval for transaction confirmation

### Ranked Mode Limits (game-logic.js)
- `SUBMISSIONS_PER_DAY = 6` - Max ranked games per 24 hours
- `MAX_CLASSIC_SCORE = 1000` - Validation limit for classic mode

## Docker

Build the image:
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml build
```

Run the container:
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up
```

Open http://localhost:3333 in your browser. The server will:
- Serve the game at `/`
- Mock transaction endpoints at `/__mock/*`
- Proxy explorer API at `/explorer-api/*`
- Proxy blockchain queries at `/__snake/leaderboard`
- WebSocket server at `ws://localhost:3333/__battle` for battle mode multiplayer

Stop the container:
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

### Docker Port Mappings

By default, the server runs on port 3300 (or 3333 in Docker). Verify the correct port:

**Direct Node.js**:
```bash
npm run dev
# Server runs on http://localhost:3300
# WebSocket: ws://localhost:3300/__battle
```

**Docker Container**:
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up
# Server runs on http://localhost:3333
# WebSocket: ws://localhost:3333/__battle
```

Check the output logs to confirm the serve port and see "WebSocket server ready for battle mode" message.

## Keyboard Controls

| Control | Action |
|---------|--------|
| ↑ / W | Move Up (PC) |
| ↓ / S | Move Down (PC) |
| ← / A | Move Left (PC) |
| → / D | Move Right (PC) |
| Drag Up | Move Up (Mobile) |
| Drag Down | Move Down (Mobile) |
| Drag Left | Move Left (Mobile) |
| Drag Right | Move Right (Mobile) |
| Exit Button | Return to menu anytime |

The Exit button is positioned at the bottom-right corner and doesn't interfere with gameplay.

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
- The game will automatically generate a local wallet address for testing
- In local dev mode, you can play without connecting to a real wallet
- To use a real wallet, ensure usernode-bridge.js is loaded
- Check browser console for detailed error messages

### Game Board Shows Hidden Areas
- The game board now fills 100% of the available space
- Exit button positioned at bottom-right to never block gameplay
- Battle panel positioned below stats to not obscure game area
- Canvas scales automatically to fit both PC and mobile screens

### Scores Not Appearing
- Check network tab for `/__snake/leaderboard` API calls
- Verify APP_PUBKEY matches between client and server
- Wait for server to process (5-second intervals)
- Ensure score was submitted successfully (check browser console)

### Drag/Swipe Not Working on Mobile
- Make sure you're dragging on the game canvas (black play area)
- Use smooth dragging motion (not just tapping)
- Check browser console for JavaScript errors
- Try a different browser or device

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

- [x] Multiplayer mode (WebSocket + real-time battle rooms)
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
