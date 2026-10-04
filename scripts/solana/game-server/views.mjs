// What the API serves: games with their payouts, per-wallet history,
// activity and leaderboards. Amounts are decimal strings in lamports.

import { toJson } from './db.mjs'

const NATIVE_SOL = '11111111111111111111111111111111'

export const gameAddress = (kind, id) => `${kind}-${id}`

const plain = (value) => JSON.parse(toJson(value))

/** A game as the frontend reads it, with the state of every payout it owes. */
export function gameView(db, game) {
  const { startAttestation, endAttestation, finalAttestation, ...state } = game
  const payouts = db.payoutsByGame(game.kind, game.id).map((p) => ({
    wallet: p.wallet,
    kind: p.kind,
    amount: p.amount,
    status: p.status,
    signature: p.status === 'done' ? p.signature : null,
  }))
  return {
    ...plain(state),
    address: gameAddress(game.kind, game.id),
    stakeMint: NATIVE_SOL,
    payouts,
    // The signed boundary prices, for anyone who wants to check them.
    attestations: plain({ start: startAttestation ?? null, end: endAttestation ?? null, final: finalAttestation ?? null }),
  }
}

function symbolsOf(game, wallet) {
  if (game.kind === 'arena') return [game.symbol]
  const position = game.positions.find((p) => p.owner === wallet)
  return position ? [game.assets[position.assetIndex].symbol] : []
}

/** Activity feed, wallet totals and leaderboards (same shape as the indexer's /history). */
export function historyView(db, cluster, gameWallet, games) {
  const byKey = new Map(games.map((g) => [gameAddress(g.kind, g.id), g]))
  const activity = []
  for (const d of db.recentDeposits(500)) {
    if (d.status !== 'accepted') continue
    const game = byKey.get(gameAddress(d.game_kind, d.game_id))
    const position = game?.kind === 'race' ? game.positions.find((p) => p.owner === d.wallet) : null
    activity.push({
      signature: d.signature,
      slot: d.slot,
      time: d.block_time,
      type: d.game_kind === 'race' ? 'bet' : 'entry',
      game: d.game_kind,
      gameId: d.game_id,
      gameAddress: gameAddress(d.game_kind, d.game_id),
      wallet: d.wallet,
      amount: d.amount,
      assetIndex: position?.assetIndex,
      symbol: game ? symbolsOf(game, d.wallet)[0] ?? null : null,
      stakeMint: NATIVE_SOL,
    })
  }
  for (const p of db.recentPayouts(500)) {
    if (!p.game_kind || (p.kind !== 'win' && p.kind !== 'refund')) continue
    activity.push({
      signature: p.signature,
      slot: null,
      time: p.done_at,
      type: p.kind === 'win' ? 'claim' : 'refund',
      game: p.game_kind,
      gameId: p.game_id,
      gameAddress: gameAddress(p.game_kind, p.game_id),
      wallet: p.wallet,
      amount: p.amount,
      stakeMint: NATIVE_SOL,
    })
  }
  activity.sort((a, b) => (b.time ?? 0) - (a.time ?? 0))

  const wallets = new Map()
  const kinds = { race: new Map(), arena: new Map() }
  const total = (map, wallet) => {
    if (!map.has(wallet)) map.set(wallet, { staked: 0n, claimed: 0n, refunded: 0n, games: new Set(), wins: 0, lastActive: 0, symbols: new Set() })
    return map.get(wallet)
  }
  for (const d of db.acceptedDeposits()) {
    const key = gameAddress(d.game_kind, d.game_id)
    for (const w of [total(wallets, d.wallet), total(kinds[d.game_kind], d.wallet)]) {
      w.staked += BigInt(d.amount)
      w.games.add(key)
      const game = byKey.get(key)
      if (game) symbolsOf(game, d.wallet).forEach((s) => w.symbols.add(s))
    }
  }
  for (const p of db.donePayouts()) {
    if (!p.game_kind || (p.kind !== 'win' && p.kind !== 'refund')) continue
    for (const w of [total(wallets, p.wallet), total(kinds[p.game_kind], p.wallet)]) {
      if (p.kind === 'win') {
        w.claimed += BigInt(p.amount)
        w.wins++
      } else {
        w.refunded += BigInt(p.amount)
      }
    }
  }
  for (const a of activity) {
    const w = wallets.get(a.wallet)
    if (w) w.lastActive = Math.max(w.lastActive, a.time ?? 0)
  }
  const row = (wallet, w) => ({
    wallet,
    staked: w.staked.toString(),
    claimed: w.claimed.toString(),
    refunded: w.refunded.toString(),
    // Everything received back minus everything staked; open stakes count as staked.
    net: (w.claimed + w.refunded - w.staked).toString(),
    games: w.games.size,
    wins: w.wins,
    lastActive: w.lastActive || null,
  })
  const byNet = (a, b) => (BigInt(b.net) > BigInt(a.net) ? 1 : BigInt(b.net) < BigInt(a.net) ? -1 : 0)
  const walletRows = Object.fromEntries([...wallets].map(([wallet, w]) => [wallet, row(wallet, w)]))
  const board = (map) => [...map].map(([wallet, w]) => ({ ...row(wallet, w), symbols: [...w.symbols].slice(0, 4) })).sort(byNet).slice(0, 100)
  return {
    cluster,
    programId: gameWallet,
    updatedAt: Date.now(),
    eventCount: activity.length,
    activity: activity.slice(0, 500),
    wallets: walletRows,
    leaderboard: Object.values(walletRows).sort(byNet).slice(0, 100),
    leaderboards: { race: board(kinds.race), arena: board(kinds.arena) },
  }
}

/** One wallet's stakes, payouts and refunds of rejected deposits. */
export function walletView(db, wallet) {
  return {
    wallet,
    nickname: db.nickname(wallet),
    deposits: db.depositsByWallet(wallet).map((d) => ({
      signature: d.signature,
      time: d.block_time,
      amount: d.amount,
      status: d.status,
      reason: d.reason,
      game: d.game_kind ? { kind: d.game_kind, id: d.game_id, address: gameAddress(d.game_kind, d.game_id) } : null,
    })),
    payouts: db.payoutsByWallet(wallet).map((p) => ({
      kind: p.kind,
      amount: p.amount,
      status: p.status,
      signature: p.status === 'done' ? p.signature : null,
      game: p.game_kind ? { kind: p.game_kind, id: p.game_id, address: gameAddress(p.game_kind, p.game_id) } : null,
      createdAt: p.created_at,
      doneAt: p.done_at,
    })),
  }
}
