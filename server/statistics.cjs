'use strict';

// Both runtimes use the same ordering for public rankings and private history.
const boardSQL = `WITH best AS (
  SELECT r.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score_ms, misses, completed_at, id) AS personal_rank
  FROM runs r WHERE status='complete'
) SELECT b.id, b.user_id, u.name, b.score_ms, b.misses, b.completed_at
  FROM best b JOIN users u ON u.id=b.user_id WHERE b.personal_rank=1
  ORDER BY b.score_ms, b.misses, b.completed_at, b.id`;
const rankSQL = `SELECT rank FROM (
  SELECT user_id, ROW_NUMBER() OVER (ORDER BY score_ms, misses, completed_at, id) AS rank FROM (${boardSQL})
) WHERE user_id=?`;
const summarySQL = `SELECT COUNT(*) AS completedRuns, MIN(score_ms) AS bestScoreMs
  FROM runs WHERE user_id=? AND status='complete'`;
const historySQL = `SELECT status, level, score_ms AS scoreMs, misses,
  created_at AS createdAt, completed_at AS completedAt
  FROM runs WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 10`;

module.exports = { boardSQL, rankSQL, summarySQL, historySQL };
