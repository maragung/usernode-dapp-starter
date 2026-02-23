function createSnakeGame() {
  const state = {
    scores: [],
    battleScores: [],
    dailyScores: [],
    usernames: {},
  };

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
      ts: Date.now(),
    };
  }

  function processTransaction(rawTx) {
    const tx = normalizeTx(rawTx);
    if (!tx || !tx.from || !tx.to || !tx.memo) return false;

    const memo = parseMemo(tx.memo);
    if (!memo || memo.app !== "snake") return false;

    if (memo.type === "set_username") {
      state.usernames[tx.from] = memo.username;
      return true;
    }

    if (memo.type === "score_submission") {
      return processScoreSubmission(tx, memo);
    }

    if (memo.type === "battle_victory") {
      return processBattleVictory(tx, memo);
    }

    return false;
  }

  function processScoreSubmission(tx, memo) {
    const sender = tx.from;
    const score = parseInt(memo.score, 10);
    const mode = memo.mode || "classic";
    const timestamp = memo.timestamp || tx.ts;

    if (!Number.isFinite(score) || score < 0) {
      return false;
    }

    if (mode === "ranked") {
      const username = state.usernames[sender] || `user_${sender.slice(-6)}`;

      const existingScore = state.scores.find((s) => s.address === sender);
      if (existingScore && existingScore.score >= score) {
        return true;
      }

      state.scores = state.scores.filter((s) => s.address !== sender);

      state.scores.push({
        address: sender,
        username: username,
        score: score,
        timestamp: timestamp,
        txId: tx.id,
      });

      state.scores.sort((a, b) => b.score - a.score);
      state.scores = state.scores.slice(0, 100);
    }

    if (mode === "daily") {
      const username = state.usernames[sender] || `user_${sender.slice(-6)}`;

      const today = new Date().toDateString();
      state.dailyScores = state.dailyScores.filter(s => new Date(s.timestamp).toDateString() === today);

      const existingScore = state.dailyScores.find((s) => s.address === sender);
      if (existingScore && existingScore.score >= score) {
        return true;
      }

      state.dailyScores = state.dailyScores.filter((s) => s.address !== sender);
      state.dailyScores.push({
        address: sender,
        username: username,
        score: score,
        timestamp: timestamp,
        txId: tx.id,
      });
      state.dailyScores.sort((a, b) => b.score - a.score);
    }

    return true;
  }

  function processBattleVictory(tx, memo) {
    const sender = tx.from;
    const points = parseInt(memo.score, 10);
    const legacyFood = parseInt(memo.food, 10);
    const battleScore = Number.isFinite(points) ? points : (Number.isFinite(legacyFood) ? legacyFood : 0);
    const timestamp = memo.timestamp || tx.ts;

    const username = state.usernames[sender] || `user_${sender.slice(-6)}`;

    state.battleScores.push({
      address: sender,
      username: username,
      score: battleScore,
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

  function getDailyLeaderboard() {
    return state.dailyScores;
  }

  function getUsername(address) {
    return state.usernames[address] || null;
  }

  return {
    processTransaction,
    getLeaderboard,
    getBattleLeaderboard,
    getDailyLeaderboard,
    getUsername,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createSnakeGame };
}