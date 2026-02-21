# Snake Game - Recent Changes

## Terminal Logging (Feb 21, 2026)

### What Changed
- **Removed**: Frontend HTTP log viewer (`/__logs` endpoint)
- **Kept**: Terminal CLI logging to stdout with timestamps
- **Removed**: "Battle Logs" and "Ranked Logs" buttons from UI header
- **Added**: Clean timestamp format `[HH:MM:SS AM/PM]` for all server logs

### Terminal Output Examples
```
[2:33:54 PM] RANKED Generated 6 schedules (ranked mode)
[2:33:54 PM] BATTLE Generated 6 schedules (battle mode)
[2:33:54 PM] SERVER Listening on port 3300
[2:33:54 PM] WS WebSocket server ready
[2:34:20 PM] BATTLE Generated 6 schedules (battle mode)
```

### Why
- Terminal logs are cleaner and don't require browser access
- No unnecessary HTTP endpoints
- Developers can use `node server.js --local-dev | tee logs.txt` to save logs locally

---

## Battle Room Lifecycle (Feb 21, 2026)

### Problem Fixed
- Battle rooms were ending immediately when they started
- Players needed to see a countdown before battle actually began

### Solution - Three Phase Battle Room
1. **Countdown Phase** (10 seconds)
   - Players join waiting room
   - Server shows countdown timer
   - Message: `waiting_for_start`

2. **Playing Phase** (300 seconds / 5 minutes)
   - Game is active
   - Players move and eat food
   - Message: `game_starting`

3. **Finished Phase**
   - Battle ended
   - Room auto-cleaned up
   - Players returned to main menu

### Code Changes
- `BattleRoom` class now tracks: `countdown`, `playing`, `finished` states
- Added `startCountdown()` method that runs before `transitionToPlaying()`
- Added auto-cleanup via `cleanup()` after duration expires
- New WebSocket messages: `waiting_for_start`, `game_starting`

### Terminal Log Examples
```
[2:34:20 PM] BATTLE [Room 1] Created with 300s duration and 10s countdown
[2:34:20 PM] BATTLE [Room 1] Player abc123 joined (1/4)
[2:34:20 PM] BATTLE [Room 1] Countdown started (10s until battle)
[2:34:30 PM] BATTLE [Room 1] Battle started with 1 players (300s duration)
[2:34:45 PM] WS Player left schedule (0 remaining)
[2:39:30 PM] BATTLE [Room 1] Battle ended after 300s
```

---

## Server Startup
```bash
cd /workspaces/usernode-dapp-starter/examples/snake
node server.js --local-dev
```

Open: http://localhost:3300

## Files Modified
- **server.js**: Terminal logging, battle room phases, removed `/__logs` endpoint
- **index.html**: Removed log viewer buttons, updated WS message handlers, cleaned up UI

## No Breaking Changes
- All game modes still work (Classic, Ranked, Battle, Daily)
- All blockchain features unchanged
- Profile system unchanged
- Leaderboards unchanged
