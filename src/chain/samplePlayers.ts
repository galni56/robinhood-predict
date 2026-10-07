import type { HistoryActivity, HistoryGameStanding, HistorySnapshot, HistoryWallet } from '@/chain/history'

// Test players shown in the leaderboards, the podium and the recent-bets
// feeds while the team tests the site. Display only: they never join a game
// and no game's pot or result includes them. Turn off before launch by
// setting SAMPLE_PLAYERS_ENABLED to false.
export const SAMPLE_PLAYERS_ENABLED = true

const SOL = (value: number) => BigInt(Math.round(value * 1e9))

const PLAYERS = [
  { wallet: '7nYabs9dUhvxYwYTzrSrBeyzDGfuQmYx4mBc7WEDGmhq', nickname: 'moonboy', staked: 4.2, won: 6.9, games: 23, wins: 11, symbols: ['WIF', 'BONK', 'POPCAT'] },
  { wallet: 'Gq4ZcPj8nX2vRtw6KdYhUL3sAeFb9MmN5oTyWuJkzBVr', nickname: 'pepe_whale', staked: 7.5, won: 9.1, games: 31, wins: 13, symbols: ['PUMP', 'FARTCOIN'] },
  { wallet: '3KmwQe8RtYvBn5cXzLp2HsAdUf7gJo9WiTkNqE4bVyhM', nickname: 'degenqueen', staked: 2.1, won: 3.4, games: 17, wins: 9, symbols: ['TRUMP', 'WIF'] },
  { wallet: 'BxR7tNm3qWvE9yLkP2sDhFc5uGj8aZo4XiKeT6nYbVwU', nickname: 'solsniper', staked: 3.3, won: 3.9, games: 14, wins: 6, symbols: ['SOL', 'BONK'] },
  { wallet: '9aHkYv2NwQe7tRmB4xLcJp8sZdUf3gKoW5iTnE6yVbMq', nickname: 'frogmaxi', staked: 1.4, won: 1.7, games: 12, wins: 5, symbols: ['POPCAT', 'PUMP'] },
  { wallet: 'EwT5nVb8kQy2mRxL7cHp4sJdAf9gZo3WuKiN6eYtBvMa', nickname: 'wenlambo', staked: 2.8, won: 2.2, games: 19, wins: 6, symbols: ['FARTCOIN', 'TRUMP'] },
  { wallet: '5qLmXe4RtNvB8yKcWp2sHdJf7gUo9AiTzE3nYwVbQkMr', nickname: 'bonkdad', staked: 1.9, won: 1.1, games: 10, wins: 3, symbols: ['BONK'] },
  { wallet: 'Hc8vNq2WmXeR5tYkLp7sBdJf4gUo3AzTiE9nKwVbMyQa', nickname: 'ratbag', staked: 0.9, won: 0.4, games: 8, wins: 2, symbols: ['WIF', 'PUMP'] },
]

/** Nicknames of the test players (merged into the server's nickname map). */
export const SAMPLE_NICKNAMES: Record<string, string> = Object.fromEntries(PLAYERS.map((p) => [p.wallet, p.nickname]))

const loadedAt = Math.floor(Date.now() / 1000)

function walletRow(p: (typeof PLAYERS)[number], index: number): HistoryWallet {
  const staked = SOL(p.staked)
  const claimed = SOL(p.won)
  return {
    wallet: p.wallet,
    staked: staked.toString(),
    claimed: claimed.toString(),
    refunded: '0',
    net: (claimed - staked).toString(),
    games: p.games,
    wins: p.wins,
    lastActive: loadedAt - 60 * (index + 1),
  }
}

function standing(p: (typeof PLAYERS)[number], index: number, share: number): HistoryGameStanding {
  const row = walletRow(p, index)
  const staked = (BigInt(row.staked) * BigInt(Math.round(share * 100))) / 100n
  const claimed = (BigInt(row.claimed) * BigInt(Math.round(share * 100))) / 100n
  return { wallet: p.wallet, staked: staked.toString(), claimed: claimed.toString(), refunded: '0', net: (claimed - staked).toString(), symbols: p.symbols }
}

function activity(): HistoryActivity[] {
  const kinds: Array<['duel' | 'entry' | 'claim', 'race' | 'arena']> = [['duel', 'race'], ['entry', 'arena'], ['claim', 'race'], ['duel', 'race'], ['entry', 'arena'], ['claim', 'arena']]
  return Array.from({ length: 18 }, (_, i) => {
    const p = PLAYERS[(i * 3) % PLAYERS.length]
    const [type, game] = kinds[i % kinds.length]
    return {
      signature: `sample-${i}`,
      slot: 0,
      time: loadedAt - 47 * i - 20,
      type,
      game,
      gameId: null,
      gameAddress: '',
      wallet: p.wallet,
      amount: SOL([0.05, 0.12, 0.3, 0.08, 0.2, 0.5][i % 6]).toString(),
      symbol: p.symbols[i % p.symbols.length],
      stakeMint: null,
    } as HistoryActivity
  })
}

const byNet = (a: { net: string }, b: { net: string }) => (BigInt(b.net) > BigInt(a.net) ? 1 : BigInt(b.net) < BigInt(a.net) ? -1 : 0)

/** The server's history snapshot with the test players mixed in. */
export function withSamplePlayers(snapshot: HistorySnapshot | undefined): HistorySnapshot {
  const base: HistorySnapshot = snapshot ?? { cluster: '', programId: '', updatedAt: Date.now(), eventCount: 0, activity: [], wallets: {}, leaderboard: [] }
  const rows = PLAYERS.map(walletRow)
  const race = PLAYERS.map((p, i) => standing(p, i, 0.6))
  const arena = PLAYERS.map((p, i) => standing(p, i, 0.4))
  return {
    ...base,
    activity: [...(base.activity ?? []), ...activity()].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)),
    wallets: { ...Object.fromEntries(rows.map((r) => [r.wallet, r])), ...base.wallets },
    leaderboard: [...(base.leaderboard ?? []), ...rows].sort(byNet),
    leaderboards: {
      race: [...(base.leaderboards?.race ?? []), ...race].sort(byNet),
      arena: [...(base.leaderboards?.arena ?? []), ...arena].sort(byNet),
    },
  }
}
