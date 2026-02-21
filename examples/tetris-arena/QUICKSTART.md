# 🎮 Tetris Arena - Quick Start Guide

Welcome to **Tetris Arena**, a competitive Tetris game on the Usernode blockchain! This guide will get you up and running in minutes.

## 📋 Prerequisites

- **Node.js 16+** (download from https://nodejs.org)
- **Docker & Docker Compose** (optional, for containerized setup)
- A **Usernode wallet** (or use mock mode for testing)

## 🚀 Start in 30 Seconds

### Option 1: Node.js (Development)

```bash
# Clone and navigate to Tetris Arena
cd examples/tetris-arena

# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3333
# Or: http://localhost:3333 (copy-paste into your browser)
```

### Option 2: Docker (Production-like)

```bash
cd examples/tetris-arena

# Build and run
docker compose up --build

# Open http://localhost:3333
```

**That's it!** 🎉 The game is now running.

---

## 🕹️ Play Your First Game

1. **Open** http://localhost:3333 in your browser
2. **Click** "Connect Wallet" (uses mock wallet for testing)
3. **Click** "START" button to begin
4. **Use arrow keys** to move and rotate pieces:
   - `← →` = Move left/right
   - `↓` = Drop piece down quickly
   - `Z` = Rotate piece
5. **Clear lines** to gain points
6. **Survive** until pieces reach the top

---

## 📤 Submit Your Score

1. **Finish a game** by letting pieces stack to the top
2. **Click** "Submit Score to Blockchain"
3. **Wait** 30-90 seconds for confirmation ⏳
4. **See your score** on the leaderboard! 🏆

---

## 👤 Set Your Username

1. **Click** "Edit" next to Username (in Profile section)
2. **Type** your desired name (e.g., "coolplayer")
3. **Click** "Save"
4. **Wait** for confirmation
5. **Your name** appears on leaderboard with address suffix

Example: You type "coolplayer" → becomes "coolplayer_a1b2c3" (unique per player)

---

## 🌐 View Leaderboard

1. **Click** "Leaderboard" button at the top
2. **See** top 100 scores worldwide
3. **Find** your score and rank
4. **Close** modal to return to game

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in `examples/tetris-arena/`:

```env
# Your game's unique blockchain address
APP_PUBKEY=ut1_xxxxxxxxxxxx

# Usernode RPC (for blockchain connection)
NODE_RPC_URL=http://localhost:3000

# Block explorer
EXPLORER_UPSTREAM=alpha2.usernodelabs.org

# Server port
PORT=3333
```

### Generate New App Address

If you need a new address for your game instance:

```bash
cd ../..
node scripts/generate-keypair.js --env

# This updates your .env file with APP_PUBKEY, APP_SECRET_KEY, NODE_RPC_URL
```

---

## 📱 Mobile & Responsive

Tetris Arena works great on any device:

- **Desktop** (1200px+): Video game view with sidebar
- **Tablet** (768-1200px): Optimized layout
- **Mobile** (<768px): Touch-friendly, portrait-optimized

Just open http://localhost:3333 on your phone! 📱

---

## 🧪 Test Multiplayer Locally

Test multiple players on the same leaderboard:

1. **Open** http://localhost:3333 in normal window (Player 1)
2. **Open** http://localhost:3333 in incognito/private window (Player 2)
3. **Both** get different mock addresses automatically
4. **Play** games in both windows
5. **Submit scores** from each - they appear on the shared leaderboard

Each window has its own player identity!

---

## 📊 Leaderboard Features

| Feature | Description |
|---------|-------------|
| **Rank** | Your position (1st, 2nd, 3rd...) |
| **Personal Best** | Your highest score |
| **Your Rank** | What rank you hold |
| **Top 5** | Quick view in sidebar |
| **Full List** | See all top 100 scores |
| **Real-time** | Updates every 5 seconds |

---

## 🎯 Scoring Guide

| Action | Points |
|--------|--------|
| Drop piece quickly (hard drop) | +2 per cell |
| Clear 1 line | +100 |
| Clear 2 lines | +300 |
| Clear 3 lines | +500 |
| Clear 4 lines (Tetris) | +800 |

**How to score more:**
- Clear multiple lines at once (Tetris is worth 8x single line!)
- Use hard drop strategically
- Move fast early (score multiplier increases with level)

---

## 🔗 Blockchain Integration

### What's Stored On-Chain?

Your **scores** and **username** are stored as immutable transactions on the Usernode blockchain:

```
Player: ut1_abcd1234...
Transaction 1: Submit Score 2500 (March 1, 2:30 PM)
Transaction 2: Set Username "coolgamer_abcd1234" (March 1, 2:20 PM)
Transaction 3: Submit Score 1800 (March 1, 12:15 PM)
Transaction 4: Submit Score 3200 (Feb 28, 9:45 AM)
```

Only the **highest score** appears on leaderboard, but all are preserved on-chain forever! ♾️

### How Scores Are Validated

1. You play and finish a game
2. You click "Submit Score to Blockchain"
3. A transaction is sent to `APP_PUBKEY` with your score in the memo
4. Server polls the blockchain every 3 seconds
5. Transaction is confirmed by multiple nodes
6. Server processes your score and updates leaderboard
7. Your rank updates in real-time

All transparent, all verifiable on-chain! ✅

---

## 🐛 Troubleshooting

### "Connection failed" when pressing Connect Wallet

**Solution:**
- Make sure you're in **mock mode** or running in the **Usernode Flutter app**
- In development, the game auto-enables mock mode
- Check browser console (F12) for errors

### Scores not appearing on leaderboard

**Solution:**
1. Verify transaction was confirmed (progress bar showed "Confirmed!")
2. Wait 5 seconds for leaderboard refresh
3. Check server is still running: `ps aux | grep "node server.js"`
4. Restart server if needed

### Port 3333 already in use

**Solution:**
```bash
# Use different port
PORT=3334 npm start

# Or kill the process
lsof -i :3333
kill -9 <PID>
```

### Game runs too slowly

**Solution:**
- Close other browser tabs
- Check browser developer tools (F12 → Performance)
- Try on a faster device or in incognito mode

### Docker won't build

**Solution:**
```bash
# Clean and rebuild
docker compose down
docker system prune -a
docker compose up --build
```

---

## 📚 Learn More

- **Tetris Rules**: https://en.wikipedia.org/wiki/Tetris
- **Usernode Docs**: Check AGENTS.md in parent directory
- **Block Explorer**: View transactions on chain
- **Source Code**: Edit `index.html` and `server.js` to customize

---

## 🎮 Game Modes

### Practice Mode
- Start with "START" button
- No blockchain needed
- High score saved locally
- Perfect for learning

### Competitive Mode
- Connect wallet
- Submit scores to blockchain
- Compete on global leaderboard
- Scores verified on-chain

### Multiplayer Mode (Local Testing)
- Open in multiple windows/devices on same network
- Each player has unique address
- All scores on same leaderboard
- Real-time synchronization

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `← →` | Move piece |
| `↓` | Drop fast |
| `Z` | Rotate |
| `SPACE` | Start/Reset |
| `P` | Pause (when enabled) |

---

## 🚀 Advanced Setup

### Production Deployment

```bash
# Build Docker image
docker compose build

# Run in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Custom Configuration

Edit `server.js` to modify:
- Polling interval
- Leaderboard size
- Explorer endpoint
- Port

Edit `index.html` to modify:
- Game colors
- Scoring rules
- Grid size
- UI layout

### Connect to Real Blockchain

1. Get a real `APP_PUBKEY`:
   ```bash
   node ../../scripts/generate-keypair.js --env
   ```

2. Update `.env` with real values

3. Players can now submit real blockchain transactions!

---

## 📞 Need Help?

- **Discord**: Join the Usernode community
- **GitHub**: Create an issue in the parent repo
- **Docs**: Read AGENTS.md for detailed architecture
- **Logs**: Check `server.log` for errors

---

## 🎉 You're All Set!

**Enjoy Tetris Arena!** 🎮

- **Play**: Start a game and master the blocks
- **Compete**: Submit scores and climb the leaderboard
- **Customize**: Set your username and profile
- **Share**: Challenge friends and family

**Game on! 🏆**

---

**Made with ❤️ by Usernode Labs**

For more information about the Usernode dapp starter, see the main [README.md](../../README.md).
