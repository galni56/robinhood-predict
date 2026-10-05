// Storage of the game server: one SQLite file (Node's built-in node:sqlite).
//
// - games: every race and arena as a JSON document shaped like the program's
//   accounts (amounts as decimal strings on disk, BigInt in memory).
// - deposits: every transaction that touched the game wallet, keyed by
//   signature, so a stake is applied at most once.
// - payouts: the outbox of every transfer the server owes. A row is written
//   before anything is sent and carries the signed transaction's signature and
//   expiry, so a crash can never pay twice (see engine.mjs, processPayouts).
// - nicknames, used_messages (signed-message replay guard), creator_balances
//   (creator fees too small to send yet).

import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS games (
  kind TEXT NOT NULL, id INTEGER NOT NULL, status TEXT NOT NULL,
  state TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS games_status ON games (status);
CREATE TABLE IF NOT EXISTS deposits (
  signature TEXT PRIMARY KEY, slot INTEGER, block_time INTEGER,
  wallet TEXT, amount TEXT, memo TEXT,
  status TEXT NOT NULL, reason TEXT,
  game_kind TEXT, game_id INTEGER, seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deposits_wallet ON deposits (wallet);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  wallet TEXT NOT NULL, amount TEXT NOT NULL,
  game_kind TEXT, game_id INTEGER,
  status TEXT NOT NULL,
  signature TEXT, last_valid_height INTEGER, tx TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
  created_at INTEGER NOT NULL, sent_at INTEGER, done_at INTEGER
);
CREATE INDEX IF NOT EXISTS payouts_status ON payouts (status);
CREATE INDEX IF NOT EXISTS payouts_wallet ON payouts (wallet);
CREATE TABLE IF NOT EXISTS nicknames (
  wallet TEXT PRIMARY KEY, nickname TEXT NOT NULL, lower TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS used_messages (signature TEXT PRIMARY KEY, wallet TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS creator_balances (wallet TEXT PRIMARY KEY, amount TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS duel_kicks (wallet TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS duel_kicks_wallet ON duel_kicks (wallet, at);
`

// Game-state fields that hold BigInt values (amounts and prices).
const BIGINT_KEYS = new Set([
  'minStake', 'maxStakePerWallet', 'maxStake', 'totalPool', 'winningPool', 'distributableLosingPool',
  'protocolFee', 'creatorFee', 'remainingLiability', 'pool', 'startPrice', 'endPrice', 'returnValue',
  'stake', 'payout', 'prediction', 'finalPrice', 'paidAmount', 'amount', 'tax',
])

export const toJson = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
export const fromJson = (text) =>
  JSON.parse(text, (key, v) => (BIGINT_KEYS.has(key) && typeof v === 'string' ? BigInt(v) : v))

// Stored game state tags every BigInt ({"$n":"123"}) so it comes back as a
// BigInt whatever its field is called: reviving by field name alone turned
// any new amount field missing from BIGINT_KEYS into a string, and string +
// or < on money fails silently. Rows written before tagging still revive
// through BIGINT_KEYS.
const isTagged = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.$n === 'string' && Object.keys(v).length === 1
export const encodeState = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? { $n: v.toString() } : v))
export const decodeState = (text) =>
  JSON.parse(text, (key, v) => (isTagged(v) ? BigInt(v.$n) : BIGINT_KEYS.has(key) && typeof v === 'string' ? BigInt(v) : v))

/** Statuses after which a game holds no stakes of its own (payout rows do). */
export const FINAL_STATUSES = new Set(['resolved', 'cancelled', 'void'])

export function openDatabase(path) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  const q = (sql) => db.prepare(sql)
  const s = {
    getMeta: q('SELECT value FROM meta WHERE key = ?'),
    setMeta: q('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    getGame: q('SELECT state FROM games WHERE kind = ? AND id = ?'),
    gamesByKind: q('SELECT state FROM games WHERE kind = ? ORDER BY id'),
    liveGames: q("SELECT state FROM games WHERE status NOT IN ('resolved', 'cancelled', 'void') ORDER BY kind, id"),
    allGames: q('SELECT state FROM games ORDER BY kind, id'),
    putGame: q(`INSERT INTO games (kind, id, status, state, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (kind, id) DO UPDATE SET status = excluded.status, state = excluded.state, updated_at = excluded.updated_at`),
    getDeposit: q('SELECT * FROM deposits WHERE signature = ?'),
    putDeposit: q(`INSERT INTO deposits (signature, slot, block_time, wallet, amount, memo, status, reason, game_kind, game_id, seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    depositsByWallet: q('SELECT * FROM deposits WHERE wallet = ? ORDER BY block_time DESC LIMIT ?'),
    recentDeposits: q("SELECT * FROM deposits WHERE status IN ('accepted', 'refunded') ORDER BY block_time DESC LIMIT ?"),
    acceptedDeposits: q("SELECT wallet, amount, game_kind, game_id FROM deposits WHERE status = 'accepted'"),
    addPayout: q(`INSERT INTO payouts (key, kind, wallet, amount, game_kind, game_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT (key) DO NOTHING`),
    payoutsByStatus: q('SELECT * FROM payouts WHERE status = ? ORDER BY id'),
    payoutsByWallet: q('SELECT * FROM payouts WHERE wallet = ? ORDER BY id DESC LIMIT ?'),
    payoutsByGame: q('SELECT * FROM payouts WHERE game_kind = ? AND game_id = ? ORDER BY id'),
    recentPayouts: q("SELECT * FROM payouts WHERE status = 'done' ORDER BY done_at DESC LIMIT ?"),
    donePayouts: q("SELECT wallet, amount, kind, game_kind, game_id FROM payouts WHERE status = 'done'"),
    markSent: q("UPDATE payouts SET status = 'sent', signature = ?, last_valid_height = ?, tx = ?, attempts = attempts + 1, sent_at = ?, error = NULL WHERE id = ? AND status = 'pending'"),
    markDone: q("UPDATE payouts SET status = 'done', done_at = ? WHERE id = ? AND status = 'sent'"),
    markRetry: q("UPDATE payouts SET status = ?, error = ? WHERE id = ? AND status = 'sent'"),
    owedTotal: q("SELECT amount FROM payouts WHERE status IN ('pending', 'sent', 'stuck')"),
    getCreator: q('SELECT amount FROM creator_balances WHERE wallet = ?'),
    putCreator: q('INSERT INTO creator_balances (wallet, amount) VALUES (?, ?) ON CONFLICT (wallet) DO UPDATE SET amount = excluded.amount'),
    allCreators: q('SELECT wallet, amount FROM creator_balances'),
    getNickname: q('SELECT wallet, nickname FROM nicknames WHERE wallet = ?'),
    nicknameOwner: q('SELECT wallet FROM nicknames WHERE lower = ?'),
    putNickname: q(`INSERT INTO nicknames (wallet, nickname, lower, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (wallet) DO UPDATE SET nickname = excluded.nickname, lower = excluded.lower, updated_at = excluded.updated_at`),
    allNicknames: q('SELECT wallet, nickname FROM nicknames'),
    dropNickname: q('DELETE FROM nicknames WHERE wallet = ?'),
    useMessage: q('INSERT INTO used_messages (signature, wallet, at) VALUES (?, ?, ?)'),
    pruneMessages: q('DELETE FROM used_messages WHERE at < ?'),
    addKick: q('INSERT INTO duel_kicks (wallet, at) VALUES (?, ?)'),
    kicksSince: q('SELECT COUNT(*) AS n FROM duel_kicks WHERE wallet = ? AND at >= ?'),
  }

  let depth = 0
  /** Runs `fn` in one write transaction (nested calls join the outer one). */
  function transaction(fn) {
    if (depth > 0) return fn()
    db.exec('BEGIN IMMEDIATE')
    depth++
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    } finally {
      depth--
    }
  }

  const now = () => Math.floor(Date.now() / 1000)

  return {
    raw: db,
    transaction,
    close: () => db.close(),
    /** Deposits that need a manual look (SOL that arrived outside a plain
     * transfer, or a signature that never became readable). */
    attentionCount: () => db.prepare("SELECT COUNT(*) AS n FROM deposits WHERE status IN ('unmatched', 'dropped')").get().n,
    /** Consistent online copy of the whole database (VACUUM INTO). */
    backup: (target) => db.exec(`VACUUM INTO '${String(target).replaceAll("'", "''")}'`),

    nextId(kind) {
      const key = `next_${kind}_id`
      const id = Number(s.getMeta.get(key)?.value ?? 0)
      s.setMeta.run(key, String(id + 1))
      return id
    },
    getMeta: (key) => s.getMeta.get(key)?.value ?? null,
    setMeta: (key, value) => s.setMeta.run(key, String(value)),

    getGame(kind, id) {
      const row = s.getGame.get(kind, id)
      return row ? decodeState(row.state) : null
    },
    games: (kind) => s.gamesByKind.all(kind).map((r) => decodeState(r.state)),
    liveGames: () => s.liveGames.all().map((r) => decodeState(r.state)),
    allGames: () => s.allGames.all().map((r) => decodeState(r.state)),
    saveGame(game) {
      s.putGame.run(game.kind, game.id, game.status, encodeState(game), now())
    },

    getDeposit: (signature) => s.getDeposit.get(signature) ?? null,
    putDeposit(d) {
      s.putDeposit.run(d.signature, d.slot ?? null, d.blockTime ?? null, d.wallet ?? null, d.amount != null ? String(d.amount) : null,
        d.memo ?? null, d.status, d.reason ?? null, d.gameKind ?? null, d.gameId ?? null, now())
    },
    depositsByWallet: (wallet, limit = 200) => s.depositsByWallet.all(wallet, limit),
    recentDeposits: (limit = 500) => s.recentDeposits.all(limit),
    acceptedDeposits: () => s.acceptedDeposits.all(),

    /** Queues a transfer; a second call with the same key is a no-op. */
    addPayout({ key, kind, wallet, amount, gameKind = null, gameId = null }) {
      if (amount <= 0n) return false
      return s.addPayout.run(key, kind, wallet, amount.toString(), gameKind, gameId, now()).changes > 0
    },
    payouts: (status) => s.payoutsByStatus.all(status),
    payoutsByWallet: (wallet, limit = 200) => s.payoutsByWallet.all(wallet, limit),
    payoutsByGame: (kind, id) => s.payoutsByGame.all(kind, id),
    recentPayouts: (limit = 500) => s.recentPayouts.all(limit),
    donePayouts: () => s.donePayouts.all(),
    markSent: (id, signature, lastValidHeight, tx) => s.markSent.run(signature, lastValidHeight, tx, now(), id).changes > 0,
    markDone: (id) => s.markDone.run(now(), id).changes > 0,
    /** Back to `pending` (safe to rebuild) or to `stuck` (needs a person). */
    markRetry: (id, status, error) => s.markRetry.run(status, error, id).changes > 0,
    owedTotal: () => s.owedTotal.all().reduce((sum, r) => sum + BigInt(r.amount), 0n),

    creatorBalance: (wallet) => BigInt(s.getCreator.get(wallet)?.amount ?? 0),
    setCreatorBalance: (wallet, amount) => s.putCreator.run(wallet, amount.toString()),
    creatorBalancesTotal: () => s.allCreators.all().reduce((sum, r) => sum + BigInt(r.amount), 0n),

    nickname: (wallet) => s.getNickname.get(wallet)?.nickname ?? null,
    nicknameOwner: (lower) => s.nicknameOwner.get(lower)?.wallet ?? null,
    setNickname: (wallet, nickname) => s.putNickname.run(wallet, nickname, nickname.toLowerCase(), now()),
    clearNickname: (wallet) => s.dropNickname.run(wallet),
    nicknames: () => Object.fromEntries(s.allNicknames.all().map((r) => [r.wallet, r.nickname])),

    addKick: (wallet, at) => s.addKick.run(wallet, at),
    kicksSince: (wallet, since) => Number(s.kicksSince.get(wallet, since)?.n ?? 0),

    /** Records a signed message; throws on replay (PRIMARY KEY). */
    useMessage: (signature, wallet) => s.useMessage.run(signature, wallet, now()),
    pruneMessages: (before) => s.pruneMessages.run(before),
  }
}
