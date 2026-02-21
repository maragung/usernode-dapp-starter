# Snake Game - Implemented Features

## Schedule System ✅

### Battle Mode
- **Frequency**: Random 3-5 hours apart
- **Join Limit**: Player cannot join multiple battle schedules simultaneously
- **Waiting Room**: Visual indicator with live countdown to session start
- **Leave Confirmation**: Dialog confirms before leaving a waiting room
- **Player Count**: Real-time display of waiting players

### Ranked Mode  
- **Frequency**: Every 4 hours
- **Join Limit**: Player can only play ONCE per schedule
- **Waiting Room**: Same countdown and player count as Battle mode
- **Leave Confirmation**: Same confirmation dialog as Battle mode

### Daily Challenge
- **Frequency**: Runs continuously (no schedule)
- **Seed**: Deterministic RNG seeded by date → all players get identical food positions each day
- **Gameplay**: Standard rules with fixed seed for fair competition

## Local Time Display ✅
- All schedule times shown in device local timezone (uses `toLocaleString()`)
- No manual conversion needed
- Countdown timer refreshes every second (HH:MM format or Hh MMm format)

## Server Logs ✅

Access logs via HTTP API:
```bash
curl http://localhost:3300/__logs?type=battle
curl http://localhost:3300/__logs?type=ranked
curl http://localhost:3300/__logs?type=ws
curl http://localhost:3300/__logs?type=system
curl http://localhost:3300/__logs?type=chain
```

**Quick UI buttons** (in header when connected):
- "Battle Logs" → Opens `/__logs?type=battle` in new tab
- "Ranked Logs" → Opens `/__logs?type=ranked` in new tab

## Profile & Nickname ✅

**Profile Menu** (top-right "Profile" button):
- Edit display name
- **Save locally**: Stores in browser localStorage (instant)
- **Save to chain**: Sends transaction via Usernode bridge, persists on-chain (requires connection)

**Automatic Load**: On app load, fetches username from blockchain via `/__snake/profile?address=...`

## Classic Mode Save Prompt ✅

**Trigger**: When Classic mode game ends (exit or lose):
- Modal appears: "Save Classic Score?"
- **Save**: Submits score to blockchain via transaction
- **No**: Closes without saving
- Progress bar shows transaction submission status

## Implementation Details

### Files Modified
- **Server**: `/examples/snake/server.js`
  - Added `logs` buffer with `pushLog()` helper
  - Added `/__logs` endpoint with type filtering
  - Added `/__snake/profile` endpoint (returns username for address)
  - Instrumented all room/schedule/WS events

- **Client**: `/examples/snake/index.html`
  - Added DAILY mode constant
  - Added state: `showProfile`, `username`, `waitingInfo`, `showLeaveConfirm`, `showClassicSave`
  - Added functions: `formatCountdown()`, `saveClassicScore()`, `saveUsernameToChain()`, `seededRandom()`, `getDailySeed()`
  - Added Profile, Leave Queue, and Save Classic Score modals
  - Added live countdown refresh interval (1s)
  - Added Battle/Ranked server log buttons
  - All schedules display local time + countdown + player count

### API Endpoints

| Endpoint | Method | Query | Returns |
|---|---|---|---|
| `/__schedule` | GET | `?mode=battle\|ranked\|daily` | `{ schedules: [ {id, startTime, playerCount} ] }` |
| `/__logs` | GET | `?type=battle\|ranked\|ws\|system\|chain` | `{ logs: [ {ts, type, message} ] }` |
| `/__snake/leaderboard` | GET | — | `{ scores, battleScores, dailyScores, timestamp }` |
| `/__snake/profile` | GET | `?address=...` | `{ username }` |
| `/usernode-bridge.js` | GET | — | Bridge script for transaction handling |

### No Code Comments
- All code is clean and self-documenting
- No inline comments as requested
- Clear naming conventions for variables and functions

## Running Locally

```bash
cd examples/snake
npm install
node server.js --local-dev
open http://localhost:3300
```

## Testing Checklist

- [ ] Select Ranked → See 6 schedules in local time
- [ ] Join a ranked schedule → See "You are in queue" status
- [ ] View countdown → Decrements every second
- [ ] Click "Leave Queue" → Confirmation dialog appears
- [ ] Select Battle → See 6 random-interval schedules
- [ ] Join battle → See player count updates from WebSocket
- [ ] Click Profile → Edit name, save locally or to-chain
- [ ] Play Classic → On exit/lose, save prompt appears
- [ ] Select Daily Challenge → Play with deterministic food positions
- [ ] Open Battle Logs → New tab shows recent battle mode events
- [ ] Open Ranked Logs → New tab shows recent ranked mode events
