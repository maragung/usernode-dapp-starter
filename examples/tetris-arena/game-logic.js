/* ── Tetris Arena Game Logic ────────────────────────────── */

const APP_NAME = "tetrisarena";

// Parse memos safely
function parseMemo(m) {
  if (m == null) return null;
  try { return JSON.parse(String(m)); } catch (_) { return null; }
}

// Extract timestamp from various transaction formats
function extractTimestamp(tx) {
  const candidates = [tx.timestamp_ms, tx.created_at, tx.createdAt, tx.timestamp, tx.time];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v))
      return v < 10_000_000_000 ? v * 1000 : v;
    if (typeof v === "string" && v.trim()) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

// Normalize transaction to standard format
function normalizeTx(tx) {
  if (!tx || typeof tx !== "object") return null;
  return {
    id:     tx.tx_id || tx.id || tx.txid || tx.hash || null,
    from:   tx.from_pubkey || tx.from || tx.source || null,
    to:     tx.destination_pubkey || tx.to || tx.destination || null,
    amount: tx.amount || null,
    memo:   tx.memo != null ? String(tx.memo) : null,
    ts:     extractTimestamp(tx) || Date.now(),
  };
}

// Parse and validate a game transaction
function parseGameTx(rawTx, appPubkey) {
  const tx = normalizeTx(rawTx);
  if (!tx || !tx.from || !tx.to || tx.to !== appPubkey) return null;
  const memo = parseMemo(tx.memo);
  if (!memo || memo.app !== APP_NAME) return null;
  return { tx, memo };
}

// Build the authoritative leaderboard from transactions
function buildLeaderboard(txs, appPubkey) {
  const scoresByPlayer = {}; // { pubkey: { score, level, lines, ts, txId }, ... }
  const usernames = {}; // { pubkey: "name_suffix", ... }

  // Sort chronologically (oldest first) to replay in order
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);

  for (const entry of sorted) {
    const parsed = parseGameTx(entry, appPubkey);
    if (!parsed) continue;

    const { tx, memo } = parsed;
    const pubkey = tx.from;

    if (memo.type === "submit_score") {
      // Latest score per player wins (or earliest if they're tied)
      if (!scoresByPlayer[pubkey]) {
        scoresByPlayer[pubkey] = {
          score: memo.score,
          level: memo.level,
          lines: memo.lines,
          ts: tx.ts,
          txId: tx.id,
        };
      } else {
        // Latest timestamp wins
        if (tx.ts >= scoresByPlayer[pubkey].ts) {
          scoresByPlayer[pubkey] = {
            score: memo.score,
            level: memo.level,
            lines: memo.lines,
            ts: tx.ts,
            txId: tx.id,
          };
        }
      }
    } else if (memo.type === "set_username") {
      // Latest username per player wins
      usernames[pubkey] = memo.username || `player_${pubkey.slice(-6)}`;
    }
  }

  // Build ranked leaderboard
  const entries = Object.entries(scoresByPlayer)
    .map(([from, data]) => ({
      from,
      score: data.score,
      level: data.level,
      lines: data.lines,
      ts: data.ts,
      txId: data.txId,
      username: usernames[from] || `player_${from.slice(-6)}`,
    }))
    .sort((a, b) => {
      // Sort by score descending, then by lines, then by timestamp (earliest first)
      if (a.score !== b.score) return b.score - a.score;
      if (a.lines !== b.lines) return b.lines - a.lines;
      return a.ts - b.ts;
    });

  // Add ranks
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  return { leaderboard: entries, usernames, scoresByPlayer };
}

// Process a single transaction (used during polling)
function processTransaction(tx, appPubkey, state) {
  const parsed = parseGameTx(tx, appPubkey);
  if (!parsed) return false;

  const { tx: normalTx, memo } = parsed;
  const pubkey = normalTx.from;
  const isNew = !state.seenTxIds || !state.seenTxIds.has(normalTx.id);

  if (normalTx.id) {
    (state.seenTxIds = state.seenTxIds || new Set()).add(normalTx.id);
  }

  if (memo.type === "submit_score") {
    if (!state.scoresByPlayer) state.scoresByPlayer = {};
    if (!state.scoresByPlayer[pubkey] || normalTx.ts >= state.scoresByPlayer[pubkey].ts) {
      state.scoresByPlayer[pubkey] = {
        score: memo.score,
        level: memo.level,
        lines: memo.lines,
        ts: normalTx.ts,
        txId: normalTx.id,
      };
      state.pollStats = state.pollStats || {};
      state.pollStats.scoreCount = (state.pollStats.scoreCount || 0) + (isNew ? 1 : 0);
    }
  } else if (memo.type === "set_username") {
    if (!state.usernames) state.usernames = {};
    state.usernames[pubkey] = memo.username || `player_${pubkey.slice(-6)}`;
    state.pollStats = state.pollStats || {};
    state.pollStats.usernameCount = (state.pollStats.usernameCount || 0) + (isNew ? 1 : 0);
  }

  return isNew;
}

// Export for Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    APP_NAME,
    parseMemo,
    extractTimestamp,
    normalizeTx,
    parseGameTx,
    buildLeaderboard,
    processTransaction,
  };
}
