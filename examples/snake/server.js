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

  // Snake game API endpoints
  if (pathname === "/__snake/leaderboard") {
    const leaderboard = snakeGame.getLeaderboard();
    const battleScores = snakeGame.getBattleLeaderboard ? snakeGame.getBattleLeaderboard() : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        scores: leaderboard,
        battleScores: battleScores,
        timestamp: Date.now(),
      })
    );
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

server.listen(PORT, () => {
  console.log(`Snake game server listening on port ${PORT}`);
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