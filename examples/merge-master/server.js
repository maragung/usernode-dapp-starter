const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOCAL_DEV = process.argv.includes("--local-dev");
const PORT = parseInt(process.env.PORT, 10) || 3310;
const APP_PUBKEY = process.env.APP_PUBKEY || "ut1_merge_master_default_pubkey";
const EXPLORER_UPSTREAM = "alpha2.usernodelabs.org";
const EXPLORER_UPSTREAM_BASE = "/explorer/api";
const EXPLORER_PROXY_PREFIX = "/explorer-api/";
const SCORE_ATTEST_SECRET = process.env.MERGE_MASTER_ATTEST_SECRET || process.env.SCORE_ATTEST_SECRET || "merge-master-dev-secret-change-me";

const INDEX_PATH = path.join(__dirname, "index.html");
const BRIDGE_PATH = path.join(__dirname, "usernode-bridge.js");

const mockStore = {
  transactions: [],
  nextId: 1,
};

let chainId = null;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString();
      if (data.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
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
  if (!memo || memo.app !== "merge_master" || memo.type !== "score_attested") return false;
  if (memo.address !== sender) return false;
  const signedFields = {
    v: memo.v,
    app: memo.app,
    type: memo.type,
    address: memo.address,
    score: memo.score,
    maxTile: memo.maxTile,
    moves: memo.moves,
    won: memo.won,
    result: memo.result,
    durationMs: memo.durationMs,
    proofId: memo.proofId,
    issuedAt: memo.issuedAt,
  };
  return signAttestation(signedFields) === memo.sig;
}

function validateMergeClaim(body) {
  const address = String(body.address || "").trim();
  const score = parseInt(body.score, 10);
  const maxTile = parseInt(body.maxTile, 10);
  const moves = parseInt(body.moves, 10);
  const won = !!body.won;
  const result = String(body.result || (won ? "won" : "lost"));
  const durationMs = parseInt(body.durationMs, 10);

  if (!address) throw new Error("Missing address");
  if (!Number.isFinite(score) || score < 0 || score > 2_000_000_000) throw new Error("Invalid score");
  if (!Number.isFinite(maxTile) || maxTile < 2 || maxTile > 131072) throw new Error("Invalid max tile");
  if (!Number.isFinite(moves) || moves < 0 || moves > 20000) throw new Error("Invalid moves");
  if (!["won", "lost"].includes(result)) throw new Error("Invalid result");
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 6 * 60 * 60 * 1000) throw new Error("Invalid duration");
  if (score > 0 && moves === 0) throw new Error("Invalid run: zero moves with score");
  if (durationMs < moves * 25) throw new Error("Invalid run: too fast");

  return { address, score, maxTile, moves, won, result, durationMs };
}

function parseMemo(m) {
  if (m == null) return null;
  try { return JSON.parse(String(m)); } catch (_) { return null; }
}

function extractTimestamp(tx) {
  const candidates = [tx.timestamp_ms, tx.created_at, tx.createdAt, tx.timestamp, tx.time];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v < 10_000_000_000 ? v * 1000 : v;
    if (typeof v === "string" && v.trim()) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return Date.now();
}

function normalizeTx(tx) {
  if (!tx || typeof tx !== "object") return null;
  return {
    id: tx.tx_id || tx.id || tx.txid || tx.hash || null,
    from: tx.from_pubkey || tx.from || tx.source || null,
    to: tx.destination_pubkey || tx.to || tx.destination || null,
    memo: tx.memo != null ? String(tx.memo) : null,
    ts: extractTimestamp(tx),
  };
}

function httpsJson(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(urlObj, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(bodyBuf ? { "content-length": bodyBuf.length } : {}),
      },
    }, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        if ((resp.statusCode || 500) < 200 || (resp.statusCode || 500) >= 300) {
          reject(new Error(`HTTP ${resp.statusCode}: ${text.slice(0, 200)}`));
          return;
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

async function discoverChainId() {
  if (chainId) return chainId;
  const data = await httpsJson("GET", `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/active_chain`);
  if (data && data.chain_id) {
    chainId = data.chain_id;
    return chainId;
  }
  return null;
}

async function fetchAppTransactions() {
  if (LOCAL_DEV) return mockStore.transactions.slice();
  const cid = await discoverChainId();
  if (!cid) return [];

  let cursor;
  const all = [];
  const maxPages = 8;
  for (let page = 0; page < maxPages; page += 1) {
    const body = { recipient: APP_PUBKEY, limit: 80 };
    if (cursor) body.cursor = cursor;
    const data = await httpsJson("POST", `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${cid}/transactions`, body);
    const items = data.items || [];
    all.push(...items);
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return all;
}

async function buildVerifiedLeaderboard(userAddress) {
  const rawTxs = await fetchAppTransactions();
  const txs = rawTxs.map(normalizeTx).filter((tx) => tx && tx.to === APP_PUBKEY && tx.from && tx.memo);
  txs.sort((a, b) => a.ts - b.ts);

  const latestName = new Map();
  const bestScore = new Map();

  for (const tx of txs) {
    const memo = parseMemo(tx.memo);
    if (!memo || memo.app !== "merge_master") continue;

    if (memo.type === "set_username" && typeof memo.username === "string" && memo.username.trim()) {
      const prev = latestName.get(tx.from);
      if (!prev || tx.ts >= prev.ts) latestName.set(tx.from, { username: memo.username.trim(), ts: tx.ts });
      continue;
    }

    if (memo.type === "score_attested") {
      if (!verifyAttestedMemo(memo, tx.from)) continue;
      const score = parseInt(memo.score, 10);
      const maxTile = parseInt(memo.maxTile, 10) || 0;
      if (!Number.isFinite(score) || score < 0) continue;
      const prev = bestScore.get(tx.from);
      if (!prev || score > prev.score || (score === prev.score && tx.ts < prev.ts)) {
        bestScore.set(tx.from, { address: tx.from, score, maxTile, ts: tx.ts });
      }
    }
  }

  const usernames = Object.fromEntries(Array.from(latestName.entries()).map(([address, value]) => [address, value.username]));
  const rows = Array.from(bestScore.values())
    .map((row) => ({ ...row, username: usernames[row.address] || `user_${row.address.slice(-6)}` }))
    .sort((a, b) => (b.score - a.score) || (a.ts - b.ts));

  let myRank = null;
  if (userAddress) {
    const idx = rows.findIndex((r) => r.address === userAddress);
    if (idx !== -1) myRank = idx + 1;
  }

  return { rows: rows.slice(0, 200), usernames, myRank, totalEntries: rows.length };
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
  }, 5000);

  return { queued: true, tx };
}

function queryMockTransactions(filterOptions = {}) {
  let results = mockStore.transactions;

  if (filterOptions.account) {
    const account = String(filterOptions.account || "").trim();
    results = results.filter((tx) => tx.from_pubkey === account || tx.destination_pubkey === account);
  }

  const limit = Number.isFinite(filterOptions.limit) ? filterOptions.limit : 200;
  return {
    items: results.slice(0, limit),
    has_more: results.length > limit,
  };
}

function send(res, code, contentType, body) {
  res.writeHead(code, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 200, "text/plain", "ok");
  }

  const pathname = (() => {
    try { return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname; }
    catch (_) { return req.url || "/"; }
  })();

  const query = (() => {
    try { return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).search; }
    catch (_) { return ""; }
  })();

  if (pathname === "/" || pathname === "/index.html") {
    return send(res, 200, "text/html; charset=utf-8", fs.readFileSync(INDEX_PATH));
  }

  if (pathname === "/usernode-bridge.js") {
    return send(res, 200, "application/javascript; charset=utf-8", fs.readFileSync(BRIDGE_PATH));
  }

  if (req.method === "POST" && pathname === "/__merge/attest-score") {
    readJson(req).then((body) => {
      const claim = validateMergeClaim(body || {});
      const issuedAt = Date.now();
      const proofId = crypto.randomUUID();
      const memo = {
        v: 1,
        app: "merge_master",
        type: "score_attested",
        address: claim.address,
        score: claim.score,
        maxTile: claim.maxTile,
        moves: claim.moves,
        won: claim.won,
        result: claim.result,
        durationMs: claim.durationMs,
        proofId,
        issuedAt,
      };
      memo.sig = signAttestation(memo);
      send(res, 200, "application/json", JSON.stringify({ ok: true, memo }));
    }).catch((e) => {
      send(res, 400, "application/json", JSON.stringify({ ok: false, error: e.message }));
    });
    return;
  }

  if (req.method === "GET" && pathname === "/__merge/leaderboard") {
    const userAddress = (() => {
      try {
        const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        return String(u.searchParams.get("address") || "").trim() || null;
      } catch (_) {
        return null;
      }
    })();

    buildVerifiedLeaderboard(userAddress).then((data) => {
      send(res, 200, "application/json", JSON.stringify(data));
    }).catch((e) => {
      send(res, 500, "application/json", JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (LOCAL_DEV && pathname.startsWith("/__mock/")) {
    if (pathname === "/__mock/enabled") {
      return send(res, 200, "application/json", JSON.stringify({ enabled: true }));
    }
    if (req.method === "POST" && pathname === "/__mock/sendTransaction") {
      readJson(req).then((body) => {
        const result = addMockTransaction(
          String(body.from_pubkey || ""),
          String(body.destination_pubkey || ""),
          body.amount,
          body.memo == null ? null : String(body.memo)
        );
        send(res, 200, "application/json", JSON.stringify(result));
      }).catch((e) => {
        send(res, 400, "application/json", JSON.stringify({ error: e.message }));
      });
      return;
    }
    if (req.method === "POST" && pathname === "/__mock/getTransactions") {
      readJson(req).then((body) => {
        const result = queryMockTransactions(body.filterOptions || {});
        send(res, 200, "application/json", JSON.stringify(result));
      }).catch((e) => {
        send(res, 400, "application/json", JSON.stringify({ error: e.message }));
      });
      return;
    }
  }

  if (pathname.startsWith(EXPLORER_PROXY_PREFIX)) {
    const upstreamPath = pathname.substring(EXPLORER_PROXY_PREFIX.length);
    const upstreamUrl = `https://${EXPLORER_UPSTREAM}${EXPLORER_UPSTREAM_BASE}/${upstreamPath}${query || ""}`;

    const proxyReq = https.request(
      upstreamUrl,
      {
        method: req.method,
        headers: { ...req.headers, host: EXPLORER_UPSTREAM },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      send(res, 502, "text/plain; charset=utf-8", "Proxy error: " + err.message);
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  return send(res, 404, "text/plain; charset=utf-8", "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Merge Master running at http://localhost:${PORT}`);
  console.log(`Mock API (--local-dev): ${LOCAL_DEV ? "ENABLED" : "disabled"}`);
  console.log(`App address: ${APP_PUBKEY}`);
});
