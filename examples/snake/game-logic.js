// Snake Game Logic - Shared between client and server

function createSnakeGame(opts = {}) {
  const state = {
    scores: [], // Array to store ranked scores
    battleScores: [], // Array to store battle victories
    usernames: {}, // Map of pubkey to username
    dailySubmissionCount: new Map(), // Track daily ranked submissions per sender
    dailyBattleCount: new Map(), // Track daily battle participations per sender
  };

  const SUBMISSIONS_PER_DAY = 6;
  const BATTLES_PER_DAY = 5;
  const MAX_CLASSIC_SCORE = 1000;

  function parseMemo(m) {
    if (m == null) return null;
    try {
      return JSON.parse(String(m));
    } catch (_) {
      return null;
    }
  }

  function normalizeTx(tx) {
    if (!tx || typeof tx !== "object") return null;
    return {
      id: tx.tx_id || tx.id || tx.txid || tx.hash || null,
      from: tx.from_pubkey || tx.from || tx.source || null,
      to: tx.destination_pubkey || tx.to || tx.destination || null,
      amount: tx.amount || null,
      memo: tx.memo != null ? String(tx.memo) : null,
      ts: Date.now(), // Simplified for mock
    };
  }

  /**
   * Process a transaction
   */
  function processTransaction(rawTx) {
    const tx = normalizeTx(rawTx);
    if (!tx || !tx.from || !tx.to || !tx.memo) return false;

    const memo = parseMemo(tx.memo);
    if (!memo || memo.app !== "snake") return false;

    // Handle username update
    if (memo.type === "set_username") {
      state.usernames[tx.from] = memo.username;
      return true;
    }

    // Handle score submission
    if (memo.type === "score_submission") {
      return processScoreSubmission(tx, memo);
    }

    // Handle battle victory
    if (memo.type === "battle_victory") {
      return processBattleVictory(tx, memo);
    }

    return false;
  }

  /**
   * Process score submission with validation
   */
  function processScoreSubmission(tx, memo) {
    const sender = tx.from;
    const score = parseInt(memo.score, 10);
    const mode = memo.mode || "classic";
    const timestamp = memo.timestamp || tx.ts;

    // Validate score
    if (!Number.isFinite(score) || score < 0) {
      return false;
    }

    // Check if ranked mode
    if (mode === "ranked") {
      const dailyKey = `${sender}_${new Date(timestamp).toDateString()}`;
      const count = state.dailySubmissionCount.get(dailyKey) || 0;

      if (count >= SUBMISSIONS_PER_DAY) {
        return false; // Daily limit reached
      }

      state.dailySubmissionCount.set(dailyKey, count + 1);
    }

    // Add to leaderboard (ranked only)
    if (mode === "ranked") {
      const username = state.usernames[sender] || `user_${sender.slice(-6)}`;

      // Check if this is a new high score for this user
      const existingScore = state.scores.find((s) => s.address === sender);
      if (existingScore && existingScore.score >= score) {
        return true; // Don't update if not a high score
      }

      // Remove old score if exists
      state.scores = state.scores.filter((s) => s.address !== sender);

      // Add new score
      state.scores.push({
        address: sender,
        username: username,
        score: score,
        timestamp: timestamp,
        txId: tx.id,
      });

      // Sort by score descending
      state.scores.sort((a, b) => b.score - a.score);
      state.scores = state.scores.slice(0, 100);
    }

    return true;
  }

  /**
   * Process battle victory
   */
  function processBattleVictory(tx, memo) {
    const sender = tx.from;
    const food = parseInt(memo.food, 10) || 0;
    const timestamp = memo.timestamp || tx.ts;

    const username = state.usernames[sender] || `user_${sender.slice(-6)}`;

    state.battleScores.push({
      address: sender,
      username: username,
      score: food,
      timestamp: timestamp,
      txId: tx.id,
    });

    state.battleScores.sort((a, b) => b.score - a.score);
    state.battleScores = state.battleScores.slice(0, 100);

    return true;
  }

  function getLeaderboard() {
    return state.scores;
  }

  function getBattleLeaderboard() {
    return state.battleScores;
  }

  return {
    processTransaction,
    getLeaderboard,
    getBattleLeaderboard,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createSnakeGame };
}