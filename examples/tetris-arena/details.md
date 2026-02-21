# Tetris Arena - Technical & Gameplay Details

## 1. Game Overview
Tetris Arena is a decentralized, multiplayer-enabled Tetris clone built on the Usernode blockchain. It features a classic 10x20 grid gameplay where players compete for high scores on a global, immutable leaderboard.

## 2. Gameplay Mechanics

### Core Engine
- **Grid Size**: 10 columns x 20 rows.
- **Tetrominoes**: 8 standard shapes (I, J, L, O, U, S, T, Z) with specific colors.
- **Randomizer**: Random bag generator (implied standard random selection).
- **Gravity**: Pieces fall automatically; speed increases with levels.

### Controls
- **Left/Right Arrows**: Move piece horizontally.
- **Down Arrow**: Soft drop (accelerates fall).
- **Z Key**: Rotate piece 90 degrees clockwise.
- **Spacebar**: Start game / Pause game / Resume.
- **Touch**: (On mobile) Button controls for movement and rotation.

### Scoring System
- **Single Line**: 100 points × Level
- **Double Line**: 300 points × Level
- **Triple Line**: 500 points × Level
- **Tetris (4 Lines)**: 800 points × Level
- **Hard Drop**: 2 points per cell dropped.

### Progression
- **Level Up**: Occurs every 10 lines cleared.
- **Speed**: Delay between ticks decreases as level increases.

## 3. Technical Architecture

### Frontend (`index.html`)
- **Tech Stack**: Vanilla JavaScript, CSS Grid, HTML5. No frameworks (React/Vue) used.
- **Rendering**: DOM-based rendering. The grid is a container of `<div>` cells.
- **State Management**:
  - `grid`: 2D array representing the board.
  - `currentPiece` / `nextPiece`: Objects defining shape, color, and position.
  - `gameLoopInterval`: Handles the game tick.
- **Blockchain Bridge**: Uses `window.usernode` (injected) or `usernode-bridge.js` to sign and send transactions.

### Backend (`server.js`)
- **Tech Stack**: Node.js with Express.
- **Role**:
  1. **Chain Poller**: Polls the Usernode blockchain every 3 seconds for transactions sent to the game's `APP_PUBKEY`.
  2. **State Aggregator**: Reconstructs the leaderboard by processing transaction history.
     - Filters by `app: "tetrisarena"`.
     - Tracks highest score per unique sender address.
     - Resolves usernames from `set_username` transactions.
  3. **API Provider**: Serves `/__game/state` (leaderboard JSON) and proxies block explorer requests.

### Blockchain Integration
Data is stored in transaction **Memos** (JSON strings).

#### 1. Submit Score
```json
{
  "app": "tetrisarena",
  "type": "submit_score",
  "score": 15000,
  "level": 8,
  "lines": 84
}
```
- **Validation**: Server checks if the transaction is valid.
- **Logic**: Only the highest score for a given address is kept on the leaderboard.

#### 2. Set Username
```json
{
  "app": "tetrisarena",
  "type": "set_username",
  "username": "PlayerOne"
}
```
- **Display**: The UI appends the last 6 chars of the address (e.g., `PlayerOne_a1b2c3`) to ensure uniqueness.

## 4. User Interface (UI)

### Layout
- **Desktop**: Split view.
  - **Left (60%)**: Game Board.
  - **Right (40%)**: Sidebar containing Next Piece, Stats, Controls, Profile, and Leaderboard.
- **Mobile**: Stacked view. Game board on top, controls and stats below.

### Styling
- **Theme**: CSS Variables (`--bg`, `--accent`, etc.) support light and dark modes automatically via `@media (prefers-color-scheme)`.
- **Responsiveness**: Uses CSS Grid and Flexbox.

## 5. Development & Deployment

### Environment Variables
- `APP_PUBKEY`: The public address of the game account (receives score txs).
- `NODE_RPC_URL`: URL of the Usernode blockchain node.
- `PORT`: Server listening port (default 3333).

### Docker
- **Dockerfile**: Node.js alpine image. Exposes port 3333.
- **Healthcheck**: Polls `/health` endpoint.