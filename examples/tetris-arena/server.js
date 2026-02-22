/**
 * Tetris Arena — Standalone server.
 *
 * Polls the Usernode blockchain for score submissions and username changes,
 * aggregates the leaderboard, and serves it via the /__game/state API.
 *
 * Usage:
 *   node server.js              # production mode (connects to real node)
 *   node server.js --local-dev  # enables mock transaction endpoints
 *
 * Environment variables:
 *   PORT             — HTTP port (default 3333)
 *   APP_PUBKEY       — game address (required for chain mode)
 *   NODE_RPC_URL     — node RPC base URL (default http://localhost:3000)
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

// ── Config ───────────────────────────────────────────────────────────────────
const LOCAL_DEV = process.argv.includes("--local-dev");
const PORT = parseInt(process.env.PORT, 10) || 3333;
const APP_PUBKEY = process.env.APP_PUBKEY || "ut1_tetrisarena_default_pubkey";
const NODE_RPC_URL = process.env.NODE_RPC_URL || "http://localhost:3000";
const EXPLORER_UPSTREAM = "alpha2.usernodelabs.org";
const EXPLORER_UPSTREAM_BASE = "/explorer/api";

// ── Paths ────────────────────────────────────────────────────────────────────
const BRIDGE_PATH = (() => {
  const local = path.join(__dirname, "usernode-bridge.js");
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, "..", "..", "usernode-bridge.js");
})();

const INDEX_PATH = path.join(__dirname, "index.html");

// ── Game State ───────────────────────────────────────────────────────────────
let chainId = null;
const seenTxIds = new Set();
const leaderboard = new Map(); // pubkey -> { pubkey, score, level, lines, ts }
const usernames = new Map();  // pubkey -> username

// Mock transaction store (for --local-dev)
const mockTransactions = [];
let mockAddressCounter = 1;
const mockUserAddresses = {};

// ── Mock API Endpoints ───────────────────────────────────────────────────────
function generateMockAddress() {
  const counter = mockAddressCounter++;
  return `ut1_mock_user_${String(counter).padStart(6, '0')}`;
}

function getMockAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  if (!mockUserAddresses[clientIp]) {
    mockUserAddresses[clientIp] = generateMockAddress();
  }
  return mockUserAddresses[clientIp];
}

// ── Helper: HTTPS JSON request ───────────────────────────────────────────────
function httpsJson(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;

    const req = client.request(urlObj, {
      method,
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        ...(bodyBuf ? { "content-length": bodyBuf.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });

    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ── Discover Chain ID ────────────────────────────────────────────────────────
async function discoverChainId() {
  if (chainId) return;
  try {
    const data = await httpsJson("GET", `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/active_chain`);
    if (data && data.chain_id) {
      chainId = data.chain_id;
      console.log(`[Tetris] Discovered chainId: ${chainId}`);
    }
  } catch (e) {
    console.error("[Tetris] Failed to discover chain ID:", e.message);
  }
}

// ── Transaction helpers ──────────────────────────────────────────────────────
function parseMemo(m) {
  if (m == null) return null;
  try { return JSON.parse(String(m)); } catch (_) { return null; }
}

function extractTimestamp(tx) {
  const candidates = [tx.timestamp_ms, tx.created_at, tx.timestamp];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) {
      return v < 10_000_000_000 ? v * 1000 : v;
    }
  }
  return Date.now();
}

// ── Process transaction from chain ───────────────────────────────────────────
function processChainTransaction(rawTx) {
  if (!rawTx || typeof rawTx !== "object") return;

  const txId = rawTx.tx_id || rawTx.id;
  if (!txId || seenTxIds.has(txId)) return;
  seenTxIds.add(txId);

  const fromPubkey = rawTx.from_pubkey || rawTx.source;
  const toPubkey = rawTx.destination_pubkey || rawTx.destination;
  const memo = parseMemo(rawTx.memo);
  const ts = extractTimestamp(rawTx);

  if (toPubkey !== APP_PUBKEY) return; // Not for us
  if (!memo || memo.app !== "tetrisarena") return;

  if (memo.type === "submit_score") {
    const entry = leaderboard.get(fromPubkey) || { pubkey: fromPubkey, score: 0, level: 1, lines: 0, ts: 0 };
    if (memo.score > entry.score) {
      entry.score = memo.score;
      entry.level = memo.level || 1;
      entry.lines = memo.lines || 0;
      entry.ts = ts;
      leaderboard.set(fromPubkey, entry);
    }
  } else if (memo.type === "set_username") {
    usernames.set(fromPubkey, memo.username);
  }
}

// ── Process transaction from mock store ──────────────────────────────────────
function processMockTransaction(rawTx) {
  if (!rawTx || typeof rawTx !== "object") return;

  const txId = rawTx.id;
  if (!txId || seenTxIds.has(txId)) return;
  seenTxIds.add(txId);

  if (rawTx.destination_pubkey !== APP_PUBKEY) return;

  const memo = parseMemo(rawTx.memo);
  if (!memo || memo.app !== "tetrisarena") return;

  const ts = extractTimestamp(rawTx);

  if (memo.type === "submit_score") {
    const entry = leaderboard.get(rawTx.from_pubkey) || { pubkey: rawTx.from_pubkey, score: 0, level: 1, lines: 0, ts: 0 };
    if (memo.score > entry.score) {
      entry.score = memo.score;
      entry.level = memo.level || 1;
      entry.lines = memo.lines || 0;
      entry.ts = ts;
      leaderboard.set(rawTx.from_pubkey, entry);
    }
  } else if (memo.type === "set_username") {
    usernames.set(rawTx.from_pubkey, memo.username);
  }
}

// ── Poll chain transactions ──────────────────────────────────────────────────
async function pollChainTransactions() {
  if (!chainId) {
    await discoverChainId();
    if (!chainId) return;
  }

  try {
    const baseUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${chainId}`;
    let cursor = undefined;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = { recipient: APP_PUBKEY, limit: 50 };
      if (cursor) body.cursor = cursor;

      const data = await httpsJson("POST", `${baseUrl}/transactions`, body);
      const items = data.items || [];

      if (items.length === 0) break;

      let allSeen = true;
      for (const tx of items) {
        processChainTransaction(tx);
        if (!seenTxIds.has(tx.tx_id || tx.id)) allSeen = false;
      }

      if (allSeen || !data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } catch (e) {
    console.error("[Tetris] Poll error:", e.message);
  }
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
function send(res, code, headers, body) {
  res.writeHead(code, { "content-type": "application/json", ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlObj = (() => {
    try { return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`); }
    catch (_) { return new URL("http://localhost/"); }
  })();

  const pathname = urlObj.pathname;

  // ── Static files ─────────────────────────────────────────────────────────
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(INDEX_PATH, "utf8"));
  }

  if (pathname === "/usernode-bridge.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    return res.end(fs.readFileSync(BRIDGE_PATH, "utf8"));
  }

  // ── Game state API ───────────────────────────────────────────────────────
  if (pathname === "/__game/state") {
    const queryParams = new URLSearchParams(urlObj.search);
    const userAddress = queryParams.get('address');

    const sorted = Array.from(leaderboard.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);

    let myRank = null;
    if (userAddress) {
      const rankIdx = sorted.findIndex(e => e.address === userAddress);
      if (rankIdx !== -1) {
        myRank = rankIdx + 1;
      }
    }

    const gameState = {
      leaderboard: sorted,
      usernames: Object.fromEntries(usernames),
      totalEntries: leaderboard.size,
      myRank: myRank,
    };

    return send(res, 200, {}, JSON.stringify(gameState));
  }

  // ── Mock API: check if enabled ───────────────────────────────────────────
  if (pathname === "/__mock/enabled") {
    if (LOCAL_DEV) {
      return send(res, 200, {}, JSON.stringify({ enabled: true }));
    }
    return send(res, 404, {}, JSON.stringify({ error: "Not found" }));
  }

  // ── Mock API: getNodeAddress ─────────────────────────────────────────────
  if (pathname === "/__mock/address") {
    if (!LOCAL_DEV) return send(res, 404, {}, JSON.stringify({ error: "Not found" }));
    const addr = getMockAddress(req);
    return send(res, 200, {}, JSON.stringify({ address: addr }));
  }

  // ── Mock API: sendTransaction ────────────────────────────────────────────
  if (pathname === "/__mock/send" && req.method === "POST") {
    if (!LOCAL_DEV) return send(res, 404, {}, JSON.stringify({ error: "Not found" }));

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const from = getMockAddress(req);
        const txId = `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        setTimeout(() => {
          const mockTx = {
            id: txId,
            from_pubkey: from,
            destination_pubkey: data.destination_pubkey,
            amount: data.amount,
            memo: data.memo,
            created_at: new Date().toISOString(),
          };
          mockTransactions.push(mockTx);
          processMockTransaction(mockTx);
        }, 5000);

        send(res, 200, {}, JSON.stringify({ queued: true, tx: { id: txId } }));
      } catch (e) {
        send(res, 400, {}, JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Mock API: getTransactions ────────────────────────────────────────────
  if (pathname === "/__mock/transactions" && req.method === "POST") {
    if (!LOCAL_DEV) return send(res, 404, {}, JSON.stringify({ error: "Not found" }));

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const query = JSON.parse(body);
        let items = mockTransactions.slice();

        if (query.account) {
          items = items.filter((tx) => tx.from_pubkey === query.account || tx.destination_pubkey === query.account);
        }

        const limit = query.limit || 50;
        items = items.slice(-limit).reverse();

        send(res, 200, {}, JSON.stringify({ items, has_more: false }));
      } catch (e) {
        send(res, 400, {}, JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Explorer API proxy ───────────────────────────────────────────────────
  if (pathname.startsWith("/explorer-api/")) {
    const explorerPath = pathname.replace("/explorer-api", "");
    const upstreamUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}${explorerPath}`;

    let proxy = "";
    req.on("data", (chunk) => { proxy += chunk; });
    req.on("end", () => {
      const proxyReq = https.request(
        upstreamUrl,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: EXPLORER_UPSTREAM,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", () => {
        send(res, 502, {}, JSON.stringify({ error: "Proxy error" }));
      });

      if (proxy) proxyReq.write(proxy);
      proxyReq.end();
    });
    return;
  }

  // ── Health check ─────────────────────────────────────────────────────────
  if (pathname === "/health") {
    return send(res, 200, { "content-type": "text/plain" }, "OK");
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  send(res, 404, {}, JSON.stringify({ error: "Not found" }));
});

// ── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[Tetris] Server running on port ${PORT}`);
  console.log(`[Tetris] Local dev mode: ${LOCAL_DEV}`);
  console.log(`[Tetris] App address: ${APP_PUBKEY}`);

  // Discover chain ID and start polling
  if (!LOCAL_DEV) {
    discoverChainId().then(() => {
      setInterval(pollChainTransactions, 3000);
      pollChainTransactions(); // Initial poll
    });
  }
});
