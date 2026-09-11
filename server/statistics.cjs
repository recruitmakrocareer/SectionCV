'use strict';

// Both runtimes use the same ordering for public rankings and private history.
const boardSQL = `WITH best AS (
  SELECT r.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score_ms, misses, completed_at, id) AS personal_rank
  FROM runs r WHERE status='complete' AND json_type(r.found)='array'
) SELECT b.id, b.user_id, u.name, b.score_ms, b.misses, b.completed_at
  FROM best b JOIN users u ON u.id=b.user_id WHERE b.personal_rank=1
  ORDER BY b.score_ms, b.misses, b.completed_at, b.id`;
const rankSQL = `SELECT rank FROM (
  SELECT user_id, ROW_NUMBER() OVER (ORDER BY score_ms, misses, completed_at, id) AS rank FROM (${boardSQL})
) WHERE user_id=?`;
const summarySQL = `SELECT COUNT(*) AS completedRuns, MIN(score_ms) AS bestScoreMs
  FROM runs WHERE user_id=? AND status='complete'`;
const historySQL = `SELECT status, level, score_ms AS scoreMs, misses,
  created_at AS createdAt, completed_at AS completedAt,
  COALESCE(json_extract(found,'$.rulesVersion'),1) AS rulesVersion,
  CASE WHEN json_type(found)='array' THEN CASE WHEN status='complete' THEN 15 ELSE json_array_length(found) END
    ELSE json_extract(found,'$.totalFound') END AS foundCount
  FROM runs WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 10`;

const board90SQL = `WITH scores AS (
  SELECT id,user_id,score_ms,misses,completed_at,json_extract(found,'$.totalFound') AS found_count
  FROM runs WHERE status='complete' AND json_extract(found,'$.rulesVersion')=2
), best AS (
  SELECT *,ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY found_count DESC,score_ms,misses,completed_at,id) AS personal_rank FROM scores
) SELECT b.id,b.user_id,u.name,b.score_ms,b.misses,b.completed_at,b.found_count,
  ROW_NUMBER() OVER (ORDER BY b.found_count DESC,b.score_ms,b.misses,b.completed_at,b.id) AS rank
  FROM best b JOIN users u ON u.id=b.user_id WHERE b.personal_rank=1
  ORDER BY b.found_count DESC,b.score_ms,b.misses,b.completed_at,b.id`;
const rank90SQL = `SELECT rank FROM (${board90SQL}) WHERE user_id=?`;
const me90SQL = `SELECT rank,name,score_ms AS scoreMs,found_count AS foundCount FROM (${board90SQL}) WHERE user_id=?`;
const totals90SQL = `SELECT COUNT(*) AS totalPlayers,COALESCE(AVG(found_count),0) AS averageFound,
  (SELECT COUNT(*) FROM runs WHERE status='complete' AND json_extract(found,'$.rulesVersion')=2) AS totalRuns FROM (${board90SQL})`;
const summary90SQL = `SELECT COUNT(*) AS completedRuns FROM runs WHERE user_id=? AND status='complete' AND json_extract(found,'$.rulesVersion')=2`;
function boardPage(url) {
  const page = Number(url.searchParams.get('page') || 1);
  return Number.isSafeInteger(page) && page >= 1 ? Math.min(page, 100000) : 1;
}
function board90View(rows, totals, me, userId, page) {
  return { entries: rows.map((r) => ({ rank: r.rank, name: r.name, foundCount: r.found_count, scoreMs: r.score_ms, misses: r.misses, isMe: r.user_id === userId })),
    ...totals, me: me || null, page, pageSize: 10, totalPages: Math.max(1, Math.ceil(totals.totalPlayers / 10)) };
}

module.exports = { boardSQL, rankSQL, summarySQL, historySQL, board90SQL, rank90SQL, me90SQL, totals90SQL, summary90SQL, boardPage, board90View };
