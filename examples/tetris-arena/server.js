const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOCAL_DEV = process.argv.includes("--local-dev");
const PORT = parseInt(process.env.PORT, 10) || 3333;
const APP_PUBKEY = process.env.APP_PUBKEY || "ut1_tetrisarena_default_pubkey";
const SCORE_ATTEST_SECRET = process.env.TETRIS_ARENA_ATTEST_SECRET || process.env.SCORE_ATTEST_SECRET || "tetris-arena-dev-secret-change-me";
const EXPLORER_UPSTREAM = "alpha2.usernodelabs.org";
const EXPLORER_UPSTREAM_BASE = "/explorer/api";

const BRIDGE_PATH = (() => {
  const local = path.join(__dirname, "usernode-bridge.js");
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, "..", "..", "usernode-bridge.js");
})();

const INDEX_PATH = path.join(__dirname, "index.html");

let chainId = null;
const seenTxIds = new Set();
const leaderboard = new Map();
const usernames = new Map();

const mockTransactions = [];
let mockAddressCounter = 1;
const mockUserAddresses = {};

function generateMockAddress() {
  const counter = mockAddressCounter++;
  return `ut1_mock_user_${String(counter).padStart(6, "0")}`;
}

function getMockAddress(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : (req.socket.remoteAddress || "unknown");
  if (!mockUserAddresses[clientIp]) {
    mockUserAddresses[clientIp] = generateMockAddress();
  }
  return mockUserAddresses[clientIp];
}

function jsonRequest(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const client = urlObj.protocol === "https:" ? https : http;
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;

    const req = client.request(
      urlObj,
      {
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(bodyBuf ? { "content-length": bodyBuf.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(new Error(`JSON parse: ${error.message}`));
          }
        });
      }
    );

    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function discoverChainId() {
  if (chainId) return;
  try {
    const data = await jsonRequest("GET", `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/active_chain`);
    if (data && data.chain_id) chainId = data.chain_id;
  } catch (error) {
    console.error("[Tetris] Failed to discover chain ID:", error.message);
  }
}

function parseMemo(value) {
  if (value == null) return null;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
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
  if (!memo || memo.app !== "tetrisarena" || memo.type !== "score_attested") return false;
  if (memo.address !== sender) return false;
  const signedFields = {
    v: memo.v,
    app: memo.app,
    type: memo.type,
    address: memo.address,
    score: memo.score,
    level: memo.level,
    lines: memo.lines,
    durationMs: memo.durationMs,
    proofId: memo.proofId,
    issuedAt: memo.issuedAt,
  };
  return signAttestation(signedFields) === memo.sig;
}

function validateTetrisClaim(body) {
  const address = String(body.address || "").trim();
  const score = parseInt(body.score, 10);
  const level = parseInt(body.level, 10);
  const lines = parseInt(body.lines, 10);
  const durationMs = parseInt(body.durationMs, 10);

  if (!address) throw new Error("Missing address");
  if (!Number.isFinite(score) || score < 0 || score > 2_000_000_000) throw new Error("Invalid score");
  if (!Number.isFinite(level) || level < 1 || level > 999) throw new Error("Invalid level");
  if (!Number.isFinite(lines) || lines < 0 || lines > 20000) throw new Error("Invalid lines");
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 6 * 60 * 60 * 1000) throw new Error("Invalid duration");
  if (level !== Math.floor(lines / 10) + 1) throw new Error("Invalid level/lines relation");
  if (durationMs < lines * 180) throw new Error("Invalid run: too fast");
  if (score > 0 && lines === 0 && durationMs < 30_000) throw new Error("Invalid run");

  return { address, score, level, lines, durationMs };
}

function extractTimestamp(tx) {
  const candidates = [tx.timestamp_ms, tx.created_at, tx.timestamp];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 10_000_000_000 ? value * 1000 : value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return Date.now();
}

function upsertScore(address, memo, ts) {
  const score = parseInt(memo.score, 10);
  if (!Number.isFinite(score) || score < 0) return;

  const entry = leaderboard.get(address) || { address, score: 0, level: 1, lines: 0, ts: 0 };
  if (score > entry.score) {
    entry.score = score;
    entry.level = Number.isFinite(memo.level) ? memo.level : parseInt(memo.level, 10) || 1;
    entry.lines = Number.isFinite(memo.lines) ? memo.lines : parseInt(memo.lines, 10) || 0;
    entry.ts = ts;
    leaderboard.set(address, entry);
  }
}

function processTx(rawTx) {
  if (!rawTx || typeof rawTx !== "object") return;

  const txId = rawTx.tx_id || rawTx.id || rawTx.txid || rawTx.hash;
  if (!txId || seenTxIds.has(txId)) return;
  seenTxIds.add(txId);

  const from = rawTx.from_pubkey || rawTx.from || rawTx.source;
  const to = rawTx.destination_pubkey || rawTx.to || rawTx.destination;
  if (!from || !to || to !== APP_PUBKEY) return;

  const memo = parseMemo(rawTx.memo);
  if (!memo || memo.app !== "tetrisarena") return;

  const ts = extractTimestamp(rawTx);

  if (memo.type === "submit_score") {
    return;
  }

  if (memo.type === "score_attested") {
    if (!verifyAttestedMemo(memo, from)) return;
    upsertScore(from, memo, ts);
    return;
  }

  if (memo.type === "set_username") {
    const username = typeof memo.username === "string" ? memo.username.trim() : "";
    if (username) usernames.set(from, username);
  }
}

async function pollChainTransactions() {
  if (!chainId) {
    await discoverChainId();
    if (!chainId) return;
  }

  try {
    const baseUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${chainId}`;
    let cursor;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page += 1) {
      const body = { recipient: APP_PUBKEY, limit: 50 };
      if (cursor) body.cursor = cursor;

      const data = await jsonRequest("POST", `${baseUrl}/transactions`, body);
      const items = data.items || [];
      if (items.length === 0) break;

      for (const tx of items) processTx(tx);

      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } catch (error) {
    console.error("[Tetris] Poll error:", error.message);
  }
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { "content-type": "application/json", ...headers });
  res.end(body);
}

function getGameState(userAddress) {
  const sorted = Array.from(leaderboard.values())
    .sort((a, b) => (b.score - a.score) || (a.ts - b.ts))
    .slice(0, 100);

  let myRank = null;
  if (userAddress) {
    const idx = sorted.findIndex((entry) => entry.address === userAddress);
    if (idx !== -1) myRank = idx + 1;
  }

  return {
    leaderboard: sorted,
    usernames: Object.fromEntries(usernames),
    totalEntries: leaderboard.size,
    myRank,
  };
}

const server = http.createServer((req, res) => {
  const urlObj = (() => {
    try {
      return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    } catch (_) {
      return new URL("http://localhost/");
    }
  })();

  const pathname = urlObj.pathname;

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(INDEX_PATH, "utf8"));
    return;
  }

  if (pathname === "/usernode-bridge.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(fs.readFileSync(BRIDGE_PATH, "utf8"));
    return;
  }

  if (pathname === "/__game/state") {
    const userAddress = urlObj.searchParams.get("address");
    send(res, 200, JSON.stringify(getGameState(userAddress)));
    return;
  }

  if (pathname === "/__tetris/attest-score" && req.method === "POST") {
    let rawBody = "";
    req.on("data", (chunk) => { rawBody += chunk; });
    req.on("end", () => {
      try {
        const body = JSON.parse(rawBody || "{}");
        const claim = validateTetrisClaim(body);
        const memo = {
          v: 1,
          app: "tetrisarena",
          type: "score_attested",
          address: claim.address,
          score: claim.score,
          level: claim.level,
          lines: claim.lines,
          durationMs: claim.durationMs,
          proofId: crypto.randomUUID(),
          issuedAt: Date.now(),
        };
        memo.sig = signAttestation(memo);
        send(res, 200, JSON.stringify({ ok: true, memo }));
      } catch (error) {
        send(res, 400, JSON.stringify({ ok: false, error: error.message }));
      }
    });
    return;
  }

  if (pathname === "/__mock/enabled") {
    if (!LOCAL_DEV) {
      send(res, 404, JSON.stringify({ error: "Not found" }));
      return;
    }
    send(res, 200, JSON.stringify({ enabled: true }));
    return;
  }

  if (pathname === "/__mock/address") {
    if (!LOCAL_DEV) {
      send(res, 404, JSON.stringify({ error: "Not found" }));
      return;
    }
    send(res, 200, JSON.stringify({ address: getMockAddress(req) }));
    return;
  }

  if (pathname === "/__mock/send" && req.method === "POST") {
    if (!LOCAL_DEV) {
      send(res, 404, JSON.stringify({ error: "Not found" }));
      return;
    }

    let rawBody = "";
    req.on("data", (chunk) => { rawBody += chunk; });
    req.on("end", () => {
      try {
        const body = JSON.parse(rawBody || "{}");
        const from = getMockAddress(req);
        const txId = `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        setTimeout(() => {
          const tx = {
            id: txId,
            from_pubkey: from,
            destination_pubkey: body.destination_pubkey,
            amount: body.amount,
            memo: body.memo,
            created_at: new Date().toISOString(),
          };
          mockTransactions.push(tx);
          processTx(tx);
        }, 5000);

        send(res, 200, JSON.stringify({ queued: true, tx: { id: txId } }));
      } catch (error) {
        send(res, 400, JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (pathname === "/__mock/transactions" && req.method === "POST") {
    if (!LOCAL_DEV) {
      send(res, 404, JSON.stringify({ error: "Not found" }));
      return;
    }

    let rawBody = "";
    req.on("data", (chunk) => { rawBody += chunk; });
    req.on("end", () => {
      try {
        const body = JSON.parse(rawBody || "{}");
        let items = mockTransactions.slice();

        if (body.account) {
          items = items.filter((tx) => tx.from_pubkey === body.account || tx.destination_pubkey === body.account);
        }

        const limit = parseInt(body.limit, 10) || 50;
        items = items.slice(-limit).reverse();

        send(res, 200, JSON.stringify({ items, has_more: false }));
      } catch (error) {
        send(res, 400, JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (pathname.startsWith("/explorer-api/")) {
    const explorerPath = pathname.replace("/explorer-api", "");
    const upstreamUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}${explorerPath}${urlObj.search || ""}`;

    let proxyBody = "";
    req.on("data", (chunk) => { proxyBody += chunk; });
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
        send(res, 502, JSON.stringify({ error: "Proxy error" }));
      });

      if (proxyBody) proxyReq.write(proxyBody);
      proxyReq.end();
    });
    return;
  }

  if (pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("OK");
    return;
  }

  send(res, 404, JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[Tetris] Server running on port ${PORT}`);
  console.log(`[Tetris] Local dev mode: ${LOCAL_DEV}`);
  console.log(`[Tetris] App address: ${APP_PUBKEY}`);

  if (!LOCAL_DEV) {
    discoverChainId().then(() => {
      setInterval(pollChainTransactions, 3000);
      pollChainTransactions();
    });
  }
});
