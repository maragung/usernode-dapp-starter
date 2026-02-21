const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// Load environment variables
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const [key, val] = line.split("=");
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    });
  }
}

loadEnvFile();

const APP_PUBKEY = process.env.APP_PUBKEY || "ut1zvhmxlhmv95cgzaph6cpv0rrcrn29gr4xkdj9fuykc6648hmvgksmkfua6";
const PORT = process.env.PORT || 3300;
const LOCAL_DEV = process.argv.includes("--local-dev");

const EXPLORER_UPSTREAM = "alpha2.usernodelabs.org";
const EXPLORER_UPSTREAM_BASE = "/explorer/api";
const EXPLORER_PROXY_PREFIX = "/explorer-api/";

// WebSocket support
let WebSocket;
try {
  WebSocket = require("ws");
} catch (e) {
  console.warn("WebSocket (ws) package not installed. Battle mode will not work.");
  console.warn("Run: npm install ws");
  WebSocket = null;
}

// Mock transaction store
const mockStore = {
  transactions: [],
  nextId: 1,
};

// Import game logic
const { createSnakeGame } = require("./game-logic");
const snakeGame = createSnakeGame();

// Utility: Normalize address for comparison
function normalizeAddress(addr) {
  return addr ? String(addr).trim() : null;
}

// HTTP utility for making requests
function httpsRequest(method, urlStr, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const client = u.protocol === "https:" ? https : http;
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;

    const options = {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        host: u.hostname,
        ...(bodyBuf ? { "content-length": bodyBuf.length } : {}),
      },
    };

    const req = client.request(u, options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error(`JSON parse: ${e.message}`));
        }
      });
    });

    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

// Add mock transaction
function addMockTransaction(fromPubkey, destinationPubkey, amount, memo) {
  const id = String(mockStore.nextId++);
  const tx = {
    id,
    from_pubkey: fromPubkey,
    destination_pubkey: destinationPubkey,
    amount,
    memo,
    created_at: new Date().toISOString(),
  };

  // Simulate 5-second delay
  setTimeout(() => {
    mockStore.transactions.unshift(tx);
    snakeGame.processTransaction(tx); // Also process for mock leaderboard
  }, 5000);

  return { queued: true, tx };
}

// Query mock store
function queryMockTransactions(filterOptions = {}) {
  let results = mockStore.transactions;

  if (filterOptions.account) {
    const addr = normalizeAddress(filterOptions.account);
    results = results.filter((tx) => {
      const from = normalizeAddress(tx.from_pubkey);
      const to = normalizeAddress(tx.destination_pubkey);
      return from === addr || to === addr;
    });
  }

  const limit = filterOptions.limit || 200;
  return {
    items: results.slice(0, limit),
    has_more: results.length > limit,
  };
}

// File serving utility
function serveFile(filePath, contentType, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "content-type": contentType });
    res.end(data);
  });
}

// Chain polling
let chainId = null;
const seenTxIds = new Set();

async function pollChainTransactions() {
  if (LOCAL_DEV) return; // Don't poll real chain in local dev

  try {
    if (!chainId) {
      const activeChain = await httpsRequest("GET", `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/active_chain`);
      if (activeChain && activeChain.chain_id) {
        chainId = activeChain.chain_id;
        console.log(`Chain poller started for chain ID: ${chainId}`);
      } else {
        console.warn("Could not discover chain ID for polling.");
        return;
      }
    }

    const data = await httpsRequest(
      "POST",
      `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${chainId}/transactions`,
      { account: APP_PUBKEY, limit: 100 } // Poll for transactions to our app
    );

    const items = (data.items || []).reverse(); // Process oldest first

    let newTxs = 0;
    for (const tx of items) {
      const txId = tx.tx_id || tx.id || tx.txid || tx.hash;
      if (!txId || seenTxIds.has(txId)) continue;

      seenTxIds.add(txId);
      if (snakeGame.processTransaction(tx)) {
        newTxs++;
        try {
          const memo = JSON.parse(tx.memo);
          console.log(`[chain] Processed ${memo.type} from ${tx.source || tx.from_pubkey}`);
        } catch (e) {
          console.log(`[chain] Processed transaction ${txId}`);
        }
      }
    }
    if (newTxs > 0) {
      console.log(`[chain] Applied ${newTxs} new transaction(s).`);
    }
  } catch (e) {
    // Suppress timeout errors, log others
    if (e.message !== "Request timeout") {
      console.error("Chain poll failed:", e.message);
    }
  }
}

// Main HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Explorer API Proxy
  if (pathname.startsWith(EXPLORER_PROXY_PREFIX)) {
    const upstreamPath = pathname.substring(EXPLORER_PROXY_PREFIX.length);
    const upstreamUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${upstreamPath}${parsedUrl.search || ""}`;

    const proxyReq = https.request(upstreamUrl, {
      method: req.method,
      headers: { ...req.headers, host: EXPLORER_UPSTREAM },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy error: ' + err.message);
    });
    req.pipe(proxyReq, { end: true });
    return;
  }

  // Mock endpoints (local-dev only)
  if (LOCAL_DEV && pathname.startsWith("/__mock/")) {
    if (pathname === "/__mock/enabled") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ enabled: true }));
      return;
    }

    if (req.method === "POST" && pathname === "/__mock/send") {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const result = addMockTransaction(
            parsed.from_pubkey,
            parsed.destination_pubkey,
            parsed.amount,
            parsed.memo
          );
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/__mock/transactions") {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          const filterOptions = JSON.parse(body);
          const result = queryMockTransactions(filterOptions);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // Schedule API
  if (pathname === "/__schedule") {
    const mode = parsedUrl.query.mode || 'battle';
    const list = generateServerSchedules(mode);
    const listWithCounts = list.map(s => ({
      ...s,
      playerCount: waitingRooms.get(s.id)?.sockets?.size || 0
    }));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ schedules: listWithCounts }));
    return;
  }

  // Snake game API endpoints
  if (pathname === "/__snake/leaderboard") {
    const leaderboard = snakeGame.getLeaderboard();
    const battleScores = snakeGame.getBattleLeaderboard ? snakeGame.getBattleLeaderboard() : [];
    const dailyScores = snakeGame.getDailyLeaderboard ? snakeGame.getDailyLeaderboard() : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        scores: leaderboard,
        battleScores: battleScores,
        dailyScores: dailyScores,
        timestamp: Date.now(),
      })
    );
    return;
  }

  if (pathname === "/__snake/profile") {
    const addr = parsedUrl.query.address;
    const username = snakeGame.getUsername(addr);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ username }));
    return;
  }

  // Static file serving
  if (pathname === "/usernode-bridge.js") {
    const bridgePath = path.join(__dirname, "..", "..", "usernode-bridge.js");
    serveFile(bridgePath, "application/javascript", res);
    return;
  }

  // Serve static files from 'dist' or root, with fallback to index.html for SPA routing
  const staticBasePath = path.join(__dirname, fs.existsSync(path.join(__dirname, 'dist')) ? 'dist' : '');
  let staticFilePath = path.join(staticBasePath, pathname === '/' ? 'index.html' : pathname);

  fs.stat(staticFilePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for any path that doesn't match a file
      serveFile(path.join(staticBasePath, 'index.html'), 'text/html', res);
    } else {
      const ext = path.extname(staticFilePath);
      const mimeTypes = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
      serveFile(staticFilePath, mimeTypes[ext] || 'application/octet-stream', res);
    }
  });
});

// ============ BATTLE MODE WEBSOCKET ============

// Schedule management
const schedulesByMode = { ranked: [], battle: [] };
const scheduleHistory = new Map(); // scheduleId -> Set<playerId>

function generateServerSchedules(mode) {
  const now = Date.now();
  const result = [];
  let t = now;
  const count = 6;
  if (mode === 'ranked') {
    const interval = 4 * 60 * 60 * 1000; // 4 hours
    for (let i = 0; i < count; i++) {
      t += interval;
      result.push({
        id: `${mode}_${t}`,
        startTime: t
      });
    }
  } else if (mode === 'battle') {
    for (let i = 0; i < count; i++) {
      const offset = (3 + Math.random() * 2) * 60 * 60 * 1000; // 3-5 hours
      t += offset;
      result.push({
        id: `${mode}_${t}`,
        startTime: t
      });
    }
  }
  schedulesByMode[mode] = result;
  return result;
}

// initialize schedules
generateServerSchedules('ranked');
generateServerSchedules('battle');

// refresh periodically
setInterval(() => {
  generateServerSchedules('ranked');
  generateServerSchedules('battle');

  const activeIds = new Set([
    ...schedulesByMode.ranked.map(s => s.id),
    ...schedulesByMode.battle.map(s => s.id)
  ]);
  for (const id of scheduleHistory.keys()) {
    if (!activeIds.has(id)) {
      scheduleHistory.delete(id);
    }
  }
}, 60 * 60 * 1000);

// Battle room management
const battleRooms = new Map();
let nextRoomId = 1;

class BattleRoom {
  constructor(id, maxPlayers = 4) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.players = new Map();
    this.gameState = {
      food: { x: 10, y: 10 },
      activePlayers: 0,
      status: 'waiting' // waiting, playing, finished
    };
    this.createdAt = Date.now();
    console.log(`[Battle] Created room ${this.id}`);
  }

  addPlayer(playerId, playerName) {
    if (this.players.size >= this.maxPlayers) return false;
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }],
      dir: 'RIGHT',
      nextDir: 'RIGHT',
      food: 0,
      alive: true,
      score: 0,
      joinedAt: Date.now()
    });
    console.log(`[Battle Room ${this.id}] Player ${playerName} added. Total: ${this.players.size}`);
    return true;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    console.log(`[Battle Room ${this.id}] Player ${playerId} removed. Total: ${this.players.size}`);
  }

  canStart() {
    return this.players.size >= 1 && this.gameState.status === 'waiting';
  }

  start() {
    this.gameState.status = 'playing';
    this.gameState.activePlayers = this.players.size;
    console.log(`[Battle Room ${this.id}] Game started with ${this.players.size} players.`);
  }

  getState() {
    return {
      roomId: this.id,
      players: Array.from(this.players.values()),
      gameState: this.gameState,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers
    };
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  isEmpty() {
    return this.players.size === 0;
  }
}

// Maps for socket tracking
const roomsToSockets = new Map();
const waitingRooms = new Map(); // scheduleId -> { sockets: Map<playerId,socket>, startTime, timer }

function setupWebSocketServer(server) {
  if (!WebSocket) {
    console.warn("WebSocket server not available (ws package not installed)");
    return null;
  }

  const wsServer = new WebSocket.Server({ server });

  wsServer.on('connection', (socket, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${clientIp}`);

    let playerId = null;
    let roomId = null;

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'join_schedule') {
          const sid = message.scheduleId;
          const mode = message.mode || 'battle';

          if (socket.scheduleId || socket.roomId) {
            socket.send(JSON.stringify({ type: 'error', message: 'Already in a session' }));
            return;
          }

          if (scheduleHistory.has(sid) && scheduleHistory.get(sid).has(message.playerId)) {
            socket.send(JSON.stringify({ type: 'error', message: 'You have already played in this schedule' }));
            return;
          }

          // ensure not already queued in another schedule
          for (const [otherId, wr] of waitingRooms) {
            if (wr.sockets.has(message.playerId)) {
              socket.send(JSON.stringify({ type: 'error', message: 'Already queued in another schedule' }));
              return;
            }
          }

          const schedules = schedulesByMode[mode] || [];
          const sched = schedules.find(s => s.id === sid);
          if (!sched) {
            socket.send(JSON.stringify({ type: 'error', message: 'Schedule not found' }));
            return;
          }

          let wr = waitingRooms.get(sid);
          if (!wr) {
            wr = { sockets: new Map(), startTime: sched.startTime, timer: null };
            waitingRooms.set(sid, wr);
          }

          wr.sockets.set(message.playerId, socket);
          socket.scheduleId = sid;
          socket.playerId = message.playerId;

          console.log(`[WS] Player ${message.playerId.slice(0,10)}... joined schedule ${sid}`);
          socket.send(JSON.stringify({ type: 'joined_schedule', scheduleId: sid, startTime: wr.startTime }));

          if (!wr.timer) {
            const delay = Math.max(0, wr.startTime - Date.now());
            wr.timer = setTimeout(() => startBattleSchedule(sid), delay);
          }

          broadcastScheduleState(sid);
          return;
        }

        if (message.type === 'join_room') {
          const room = findOrCreateBattleRoom();
          if (room.addPlayer(message.playerId, message.playerName)) {
            playerId = message.playerId;
            roomId = room.id;
            socket.roomId = roomId;
            mapSocketToRoom(socket, roomId);

            broadcastToRoom(room.id, { type: 'room_state', state: room.getState() });
            socket.send(JSON.stringify({ type: 'joined', roomId: room.id, playerId }));
          } else {
            socket.send(JSON.stringify({ type: 'error', message: 'Could not join room - room full' }));
          }
          return;
        }

        if (message.type === 'start_game' && roomId) {
          const room = battleRooms.get(roomId);
          if (room && room.canStart()) {
            room.start();
            broadcastToRoom(roomId, {
              type: 'game_started',
              state: room.getState()
            });
          }
        }

        if (message.type === 'move' && roomId && playerId) {
          const room = battleRooms.get(roomId);
          if (room) {
            const player = room.players.get(playerId);
            if (player && player.alive) {
              player.nextDir = message.direction;
              broadcastToRoom(roomId, {
                type: 'player_move',
                playerId: playerId,
                direction: message.direction
              });
            }
          }
        }

        if (message.type === 'leave_schedule' && socket.scheduleId) {
          const sid = socket.scheduleId;
          const wr = waitingRooms.get(sid);
          if (wr) {
            wr.sockets.delete(socket.playerId);
            if (wr.sockets.size === 0) waitingRooms.delete(sid);
            else broadcastScheduleState(sid);
          }
          socket.scheduleId = null;
          return;
        }

        if (message.type === 'leave' && roomId) {
          const room = battleRooms.get(roomId);
          if (room) {
            room.removePlayer(playerId);
            unmapSocketFromRoom(socket, roomId);
            if (room.isEmpty()) {
              battleRooms.delete(roomId);
              console.log(`[Battle] Room ${roomId} is empty and has been deleted.`);
            } else {
              broadcastToRoom(roomId, {
                type: 'player_left',
                playerId,
                state: room.getState()
              });
            }
          }
        }
      } catch (error) {
        console.error('[WS] Message error:', error);
      }
    });

    socket.on('close', () => {
      if (socket.scheduleId) {
        const wr = waitingRooms.get(socket.scheduleId);
        if (wr) {
          wr.sockets.delete(socket.playerId);
          if (wr.sockets.size === 0) waitingRooms.delete(socket.scheduleId);
          else broadcastScheduleState(socket.scheduleId);
        }
      }
      if (roomId && playerId) {
        const room = battleRooms.get(roomId);
        if (room) {
          room.removePlayer(playerId);
          unmapSocketFromRoom(socket, roomId);
          if (room.isEmpty()) {
            battleRooms.delete(roomId);
            console.log(`[Battle] Room ${roomId} is empty and has been deleted.`);
          } else {
            broadcastToRoom(roomId, {
              type: 'player_left',
              playerId,
              state: room.getState()
            });
          }
        }
      }
      console.log(`[WS] Client disconnected`);
    });

    socket.on('error', (error) => {
      console.error('[WS] Socket error:', error);
    });
  });

  return wsServer;
}

function findOrCreateBattleRoom() {
  // Find a room that's not full and waiting
  for (const room of battleRooms.values()) {
    if (room.gameState.status === 'waiting' && !room.isFull()) {
      console.log(`[Battle] Found waiting room ${room.id}. Joining.`);
      return room;
    }
  }
  
  // Create a new room
  const room = new BattleRoom(nextRoomId++, 4);
  battleRooms.set(room.id, room);
  return room;
}

function mapSocketToRoom(socket, roomId) {
  if (!roomsToSockets.has(roomId)) {
    roomsToSockets.set(roomId, new Set());
  }
  roomsToSockets.get(roomId).add(socket);
}

function unmapSocketFromRoom(socket, roomId) {
  if (!roomId) return;
  const set = roomsToSockets.get(roomId);
  if (set) {
    set.delete(socket);
    if (set.size === 0) roomsToSockets.delete(roomId);
  }
}

function broadcastToRoom(roomId, message) {
  const set = roomsToSockets.get(roomId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const sock of set) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(data);
    }
  }
}

function broadcastScheduleState(scheduleId) {
  const wr = waitingRooms.get(scheduleId);
  if (!wr) return;
  const players = Array.from(wr.sockets.keys()).map(id => ({ playerId: id }));
  const msg = { type: 'schedule_state', scheduleId, players, startTime: wr.startTime };
  for (const sock of wr.sockets.values()) {
    if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
  }
}

function startBattleSchedule(scheduleId) {
  const wr = waitingRooms.get(scheduleId);
  if (!wr) return;

  // Ranked Mode: Just release players to play locally
  if (scheduleId.startsWith('ranked')) {
    console.log(`[Ranked] Schedule ${scheduleId} starting. Releasing ${wr.sockets.size} players.`);
    if (!scheduleHistory.has(scheduleId)) scheduleHistory.set(scheduleId, new Set());
    const history = scheduleHistory.get(scheduleId);

    for (const [pid, sock] of wr.sockets) {
      history.add(pid); // Mark as played
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: 'game_started', scheduleId, mode: 'ranked' }));
      }
      sock.scheduleId = null;
    }
    waitingRooms.delete(scheduleId);
    return;
  }

  // Battle Mode: Create multiplayer rooms
  console.log(`[Battle] Schedule ${scheduleId} starting. Creating room for ${wr.sockets.size} players.`);
  const room = new BattleRoom(nextRoomId++, 4);
  battleRooms.set(room.id, room);
  for (const [pid, sock] of wr.sockets) {
    room.addPlayer(pid, pid);
    sock.scheduleId = null;
    sock.roomId = room.id;
    mapSocketToRoom(sock, room.id);
  }
  broadcastToRoom(room.id, { type: 'room_state', state: room.getState() });
  broadcastToRoom(room.id, { type: 'game_started', state: room.getState() });
  waitingRooms.delete(scheduleId);
}

server.listen(PORT, () => {
  console.log(`Snake game server listening on port ${PORT}`);
  
  // Setup WebSocket server
  const wsServer = setupWebSocketServer(server);
  if (wsServer) {
    console.log(`WebSocket server ready for battle mode`);
  }
  
  if (LOCAL_DEV) {
    console.log("Local dev mode enabled - using mock endpoints");
    // Pre-populate game state with mock transactions on start
    mockStore.transactions.forEach(tx => snakeGame.processTransaction(tx));
    console.log(`Processed ${mockStore.transactions.length} initial mock transactions.`);
  }
  console.log(`Open http://localhost:${PORT}/`);
  // Start polling the chain for real transactions
  setInterval(pollChainTransactions, 3000);
  pollChainTransactions(); // Initial poll
});