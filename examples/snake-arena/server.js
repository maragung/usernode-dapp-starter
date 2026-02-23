const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const [key, val] = line.split("=");
    if (key && !process.env[key]) process.env[key] = val;
  });
}

loadEnvFile();

const APP_PUBKEY = process.env.APP_PUBKEY || "ut1zvhmxlhmv95cgzaph6cpv0rrcrn29gr4xkdj9fuykc6648hmvgksmkfua6";
const SCORE_ATTEST_SECRET = process.env.SNAKE_ARENA_ATTEST_SECRET || process.env.SCORE_ATTEST_SECRET || "snake-arena-dev-secret-change-me";
const PORT = process.env.PORT || 3300;
const LOCAL_DEV = process.argv.includes("--local-dev");
const BRIDGE_PATH = (() => {
  const local = path.join(__dirname, "usernode-bridge.js");
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, "..", "..", "usernode-bridge.js");
})();

const EXPLORER_UPSTREAM = "alpha2.usernodelabs.org";
const EXPLORER_UPSTREAM_BASE = "/explorer/api";
const EXPLORER_PROXY_PREFIX = "/explorer-api/";

const mockStore = {
  transactions: [],
  nextId: 1,
};

const { createSnakeGame } = require("./game-logic");
const snakeGame = createSnakeGame();

function normalizeAddress(addr) {
  return addr ? String(addr).trim() : null;
}

function canonicalize(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return "null";
}

function signAttestation(fields) {
  return crypto.createHmac("sha256", SCORE_ATTEST_SECRET).update(canonicalize(fields)).digest("base64url");
}

function verifyAttestedMemo(memo, sender) {
  if (!memo || memo.app !== "snake" || memo.type !== "score_attested") return false;
  if (memo.address !== sender) return false;
  const signedFields = {
    v: memo.v,
    app: memo.app,
    type: memo.type,
    address: memo.address,
    mode: memo.mode,
    score: memo.score,
    durationMs: memo.durationMs,
    proofId: memo.proofId,
    issuedAt: memo.issuedAt,
  };
  return signAttestation(signedFields) === memo.sig;
}

function validateSnakeClaim(body) {
  const address = String(body.address || "").trim();
  const mode = String(body.mode || "classic").trim();
  const score = parseInt(body.score, 10);
  const durationMs = parseInt(body.durationMs, 10);

  if (!address) throw new Error("Missing address");
  if (!["classic", "ranked", "daily", "battle"].includes(mode)) throw new Error("Invalid mode");
  if (!Number.isFinite(score) || score < 0 || score > 2_000_000_000) throw new Error("Invalid score");
  if (score % 10 !== 0) throw new Error("Invalid score step");
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 4 * 60 * 60 * 1000) throw new Error("Invalid duration");
  if (durationMs < (score / 10) * 120) throw new Error("Invalid run: too fast");

  return { address, mode, score, durationMs };
}

function parseMemo(value) {
  if (value == null) return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function ingestSnakeTx(rawTx) {
  const memo = parseMemo(rawTx && rawTx.memo);
  if (!memo || memo.app !== "snake") return;

  if (memo.type === "set_username") {
    snakeGame.processTransaction(rawTx);
    return;
  }

  if (memo.type !== "score_attested") return;

  const sender = rawTx.from_pubkey || rawTx.from || rawTx.source;
  if (!sender || !verifyAttestedMemo(memo, sender)) return;

  const normalizedMemo = {
    app: "snake",
    type: memo.mode === "battle" ? "battle_victory" : "score_submission",
    score: memo.score,
    mode: memo.mode,
    timestamp: memo.issuedAt,
  };
  snakeGame.processTransaction({ ...rawTx, memo: JSON.stringify(normalizedMemo) });
}

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

  setTimeout(() => {
    mockStore.transactions.unshift(tx);
    ingestSnakeTx(tx);
  }, 5000);

  return { queued: true, tx };
}

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

let chainId = null;
const seenTxIds = new Set();

async function pollChainTransactions() {
  if (LOCAL_DEV) return;

  try {
    if (!chainId) {
      const activeChain = await httpsRequest("GET", `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/active_chain`);
      if (activeChain && activeChain.chain_id) chainId = activeChain.chain_id;
      else return;
    }

    const data = await httpsRequest(
      "POST",
      `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${chainId}/transactions`,
      { account: APP_PUBKEY, limit: 100 }
    );

    const items = (data.items || []).reverse();

    for (const tx of items) {
      const txId = tx.tx_id || tx.id || tx.txid || tx.hash;
      if (!txId || seenTxIds.has(txId)) continue;
      seenTxIds.add(txId);
      ingestSnakeTx(tx);
    }
  } catch (e) {
    if (e.message !== "Request timeout") {
      console.error("Chain poll failed:", e.message);
    }
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname.startsWith(EXPLORER_PROXY_PREFIX)) {
    const upstreamPath = pathname.substring(EXPLORER_PROXY_PREFIX.length);
    const upstreamUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${upstreamPath}${parsedUrl.search || ""}`;

    const proxyReq = https.request(
      upstreamUrl,
      {
        method: req.method,
        headers: { ...req.headers, host: EXPLORER_UPSTREAM },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Proxy error: " + err.message);
    });
    req.pipe(proxyReq, { end: true });
    return;
  }

  if (LOCAL_DEV && pathname.startsWith("/__mock/")) {
    if (pathname === "/__mock/enabled") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ enabled: true }));
      return;
    }

    if (req.method === "POST" && (pathname === "/__mock/send" || pathname === "/__mock/sendTransaction")) {
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

    if (req.method === "POST" && (pathname === "/__mock/transactions" || pathname === "/__mock/getTransactions")) {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const filterOptions = parsed.filterOptions || parsed;
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

  if (pathname === "/__snake/leaderboard") {
    const leaderboard = snakeGame.getLeaderboard();
    const battleScores = snakeGame.getBattleLeaderboard ? snakeGame.getBattleLeaderboard() : [];
    const dailyScores = snakeGame.getDailyLeaderboard ? snakeGame.getDailyLeaderboard() : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        scores: leaderboard,
        battleScores,
        dailyScores,
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

  if (pathname === "/__snake/attest-score" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const claim = validateSnakeClaim(parsed);
        const memo = {
          v: 1,
          app: "snake",
          type: "score_attested",
          address: claim.address,
          mode: claim.mode,
          score: claim.score,
          durationMs: claim.durationMs,
          proofId: crypto.randomUUID(),
          issuedAt: Date.now(),
        };
        memo.sig = signAttestation(memo);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, memo }));
      } catch (err) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/usernode-bridge.js") {
    serveFile(BRIDGE_PATH, "application/javascript", res);
    return;
  }

  const staticBasePath = path.join(__dirname, fs.existsSync(path.join(__dirname, "dist")) ? "dist" : "");
  const staticFilePath = path.join(staticBasePath, pathname === "/" ? "index.html" : pathname);

  fs.stat(staticFilePath, (err, stats) => {
    if (err || !stats.isFile()) {
      serveFile(path.join(staticBasePath, "index.html"), "text/html", res);
      return;
    }
    const ext = path.extname(staticFilePath);
    const mimeTypes = {
      ".js": "application/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
    };
    serveFile(staticFilePath, mimeTypes[ext] || "application/octet-stream", res);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
  if (LOCAL_DEV) {
    console.log("[DEV] Local dev mode enabled");
    mockStore.transactions.forEach((tx) => ingestSnakeTx(tx));
  }
  console.log(`Open http://localhost:${PORT}/`);
  setInterval(pollChainTransactions, 3000);
  pollChainTransactions();
});
