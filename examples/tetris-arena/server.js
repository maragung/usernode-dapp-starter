#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const APP_PUBKEY = process.env.APP_PUBKEY || 'ut1_tetris_arena_demo_pk_';
const NODE_RPC_URL = process.env.NODE_RPC_URL || 'http://localhost:3000';
const EXPLORER_UPSTREAM = process.env.EXPLORER_UPSTREAM || 'alpha2.usernodelabs.org';
const EXPLORER_UPSTREAM_BASE = '/explorer/api';
const PORT = process.env.PORT || 3333;
const APP_NAME = 'tetris_arena';

console.log(`🎮 Tetris Arena Server (Fully Integrated Blockchain)`);
console.log(`📍 App Address: ${APP_PUBKEY}`);
console.log(`🔗 RPC Endpoint: ${NODE_RPC_URL}`);

// ---- HTTPS helper ----
function httpsJson(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const parsedUrl = new URL(urlStr);
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(parsedUrl, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'Tetris-Arena/1.0',
        ...(bodyBuf ? { 'content-length': bodyBuf.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300)
          return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ---- Game Data Structure ----
let chainId = null;
const seenTxIds = new Set();
const leaderboard = []; // Array of { from, username, score, level, lines, ts, txId, rank }
const usernames = {}; // Map of pubkey -> username
const scoresByPlayer = {}; // Map of pubkey -> { score, level, lines, ts }
const txsByPlayer = {}; // Map of pubkey -> array of transactions
const pollStats = { txCount: 0, scoreCount: 0, usernameCount: 0, lastPoll: Date.now() };

function sortLeaderboard() {
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard.forEach((item, idx) => item.rank = idx + 1);
}

async function discoverChainId() {
  try {
    const data = await httpsJson('GET',
      `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/active_chain`);
    if (data && data.chain_id) {
      chainId = data.chain_id;
      console.log(`✅ Chain ID discovered: ${chainId}`);
    }
  } catch (e) {
    console.error('❌ Chain discovery error:', e.message);
  }
}

function parseMemo(m) {
  if (m == null) return null;
  try { return JSON.parse(String(m)); } catch (_) { return null; }
}

function extractTimestamp(tx) {
  const candidates = [tx.timestamp_ms, tx.created_at, tx.createdAt, tx.timestamp, tx.time];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v))
      return v < 10_000_000_000 ? v * 1000 : v;
    if (typeof v === 'string' && v.trim()) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

function displayName(pubkey) {
  if (usernames[pubkey]) return usernames[pubkey];
  return `player_${pubkey.slice(-6)}`;
}

function normalizeTx(tx) {
  if (!tx || typeof tx !== 'object') return null;
  return {
    id: tx.tx_id || tx.id || tx.txid || tx.hash || null,
    from: tx.from_pubkey || tx.from || tx.source || null,
    to: tx.destination_pubkey || tx.to || tx.destination || null,
    amount: tx.amount || null,
    memo: tx.memo != null ? String(tx.memo) : null,
    ts: extractTimestamp(tx) || Date.now(),
  };
}

function processTransaction(rawTx) {
  const tx = normalizeTx(rawTx);
  if (!tx || !tx.from || !tx.to || tx.to !== APP_PUBKEY) return;

  const txId = tx.id;
  if (!txId || seenTxIds.has(txId)) return;
  seenTxIds.add(txId);

  const memo = parseMemo(tx.memo);
  if (!memo || memo.app !== APP_NAME) return;

  // Track player transactions
  if (!txsByPlayer[tx.from]) txsByPlayer[tx.from] = [];
  txsByPlayer[tx.from].push(tx);

  if (memo.type === 'submit_score') {
    pollStats.scoreCount++;
    const entry = {
      from: tx.from,
      username: usernames[tx.from] || null,
      score: memo.score || 0,
      level: memo.level || 1,
      lines: memo.lines || 0,
      ts: tx.ts,
      txId: txId,
    };

    // If this player's score is higher, update leaderboard
    const currentBest = scoresByPlayer[tx.from];
    if (!currentBest || entry.score > currentBest.score) {
      scoresByPlayer[tx.from] = entry;

      // Remove old entry if exists
      const idx = leaderboard.findIndex(e => e.from === tx.from);
      if (idx >= 0) leaderboard.splice(idx, 1);

      // Add new entry
      leaderboard.push(entry);
      sortLeaderboard();
      console.log(`📊 New score: ${displayName(tx.from)} scored ${entry.score} points`);
    }
  } else if (memo.type === 'set_username') {
    pollStats.usernameCount++;
    const newUsername = memo.username;
    usernames[tx.from] = newUsername;

    // Update leaderboard entry with new username
    const entry = leaderboard.find(e => e.from === tx.from);
    if (entry) entry.username = newUsername;
    console.log(`👤 Username set: ${tx.from.slice(0, 14)}... → ${newUsername}`);
  }
}

async function pollChainTransactions() {
  if (!chainId) {
    const wasNull = !chainId;
    await discoverChainId();
    if (!chainId) {
      if (wasNull) console.log('⏳ Waiting for chain connection...');
      return;
    }
  }

  const baseUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${chainId}`;
  let cursor = undefined;
  const MAX_PAGES = 15;
  let pageCount = 0;
  let newTxCount = 0;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = { recipient: APP_PUBKEY, limit: 100 };
      if (cursor) body.cursor = cursor;
      const data = await httpsJson('POST', `${baseUrl}/transactions`, body);
      const items = data.items || [];
      if (items.length === 0) break;

      pageCount++;
      let allSeen = true;
      for (const tx of items) {
        const txId = tx.tx_id || tx.id;
        if (!txId || seenTxIds.has(txId)) continue;
        allSeen = false;
        newTxCount++;
        processTransaction(tx);
      }

      if (allSeen || !data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }

    pollStats.lastPoll = Date.now();
    if (newTxCount > 0) console.log(`📝 Processed ${newTxCount} new transaction(s)`);
  } catch (e) {
    console.error('❌ Chain poll error:', e.message);
  }
}

// Initial poll + periodic polling
(async () => {
  await discoverChainId();
  await pollChainTransactions();
  console.log(`🔄 Starting automatic chain polling every 3 seconds...\n`);
  setInterval(() => {
    pollChainTransactions().catch(e => console.error('❌ Poll error:', e));
  }, 3000);
})();

// ---- HTTP Server ----
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      chainId: chainId || null,
      leaderboardSize: leaderboard.length,
      uniquePlayers: Object.keys(usernames).length,
      uptime: process.uptime(),
    }));
    return;
  }

  // Main game state endpoint
  if (pathname === '/__game/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      appPubkey: APP_PUBKEY,
      appName: APP_NAME,
      chainId: chainId,
      leaderboard: leaderboard.slice(0, 200).map(e => ({
        rank: e.rank,
        from: e.from,
        username: e.username || `player_${e.from.slice(-6)}`,
        score: e.score,
        level: e.level,
        lines: e.lines,
        ts: e.ts,
        txId: e.txId,
      })),
      usernames: usernames,
      stats: {
        totalScores: pollStats.scoreCount,
        totalUsernames: pollStats.usernameCount,
        totalTransactions: seenTxIds.size,
        uniquePlayers: leaderboard.length,
      },
    }));
    return;
  }

  // Player stats endpoint
  if (pathname === '/__game/player-stats') {
    const pubkey = query.pubkey;
    if (!pubkey) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing pubkey parameter' }));
      return;
    }

    const playerScore = scoresByPlayer[pubkey];
    const playerTxs = txsByPlayer[pubkey] || [];
    const entry = leaderboard.find(e => e.from === pubkey);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      pubkey: pubkey,
      username: usernames[pubkey],
      bestScore: playerScore?.score || 0,
      bestLevel: playerScore?.level || 0,
      bestLines: playerScore?.lines || 0,
      rank: entry?.rank || null,
      transactionCount: playerTxs.length,
    }));
    return;
  }

  // Full leaderboard with pagination
  if (pathname === '/__game/leaderboard') {
    const limit = Math.min(parseInt(query.limit) || 100, 500);
    const offset = parseInt(query.offset) || 0;

    const filtered = leaderboard.slice(offset, offset + limit).map(e => ({
      rank: e.rank,
      from: e.from,
      username: e.username || `player_${e.from.slice(-6)}`,
      score: e.score,
      level: e.level,
      lines: e.lines,
      ts: e.ts,
    }));

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      leaderboard: filtered,
      total: leaderboard.length,
      offset: offset,
      limit: limit,
    }));
    return;
  }

  // Explorer proxy
  if (pathname.startsWith('/explorer-api/')) {
    const proxyPath = pathname.substring('/explorer-api'.length);
    const proxyUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}${proxyPath}`;

    let body = '';
    if (req.method === 'POST') {
      req.on('data', chunk => body += chunk);
      req.on('end', () => proxyRequest());
    } else {
      proxyRequest();
    }

    function proxyRequest() {
      const https = require('https');
      const parsedProxyUrl = new URL(proxyUrl);
      const bodyBuf = body ? Buffer.from(body) : null;
      const proxyReq = https.request(parsedProxyUrl, {
        method: req.method,
        headers: {
          'content-type': 'application/json',
          ...(bodyBuf ? { 'content-length': bodyBuf.length } : {}),
        },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (e) => {
        res.writeHead(502);
        res.end('Bad Gateway');
      });

      if (bodyBuf) proxyReq.write(bodyBuf);
      proxyReq.end();
    }
    return;
  }

  // Static files (served from current directory)
  if (pathname === '/' || pathname === '') {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (pathname === '/usernode-bridge.js') {
    const local = path.join(__dirname, 'usernode-bridge.js');
    const root = path.join(__dirname, '..', '..', 'usernode-bridge.js');
    const filePath = fs.existsSync(local) ? local : root;
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🎮 Tetris Arena running: http://localhost:${PORT}`);
  console.log(`📊 Game state: http://localhost:${PORT}/__game/state`);
  console.log(`🔗 App address: ${APP_PUBKEY}`);
});
