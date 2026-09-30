export interface SettledGameStake<AddressType extends string = string> {
  gameId: bigint
  user: AddressType
  stake: bigint
}

export interface SettledGameClaim<AddressType extends string = string> {
  gameId: bigint
  user: AddressType
  payout: bigint
}

export interface SettledGameUserStats<AddressType extends string = string> {
  address: AddressType
  staked: bigint
  claimed: bigint
  bets: number
}

/**
 * Build realised P&L inputs from terminal, resolved games only.
 *
 * Open stakes are still locked positions, not losses. Cancelled games return
 * principal and therefore contribute zero P&L. A resolved game contributes
 * the player's final cumulative stake once, plus any confirmed claim payout.
 */
export function settledGameUserStats<AddressType extends string>(
  finalStakes: readonly SettledGameStake<AddressType>[],
  claims: readonly SettledGameClaim<AddressType>[],
  resolvedGameIds: ReadonlySet<string>,
): SettledGameUserStats<AddressType>[] {
  const byUser = new Map<string, SettledGameUserStats<AddressType>>()

  function get(user: AddressType) {
    const key = user.toLowerCase()
    const existing = byUser.get(key)
    if (existing) return existing
    const created = { address: user, staked: 0n, claimed: 0n, bets: 0 }
    byUser.set(key, created)
    return created
  }

  for (const position of finalStakes) {
    if (!resolvedGameIds.has(position.gameId.toString())) continue
    const stats = get(position.user)
    stats.staked += position.stake
    stats.bets += 1
  }

  for (const claim of claims) {
    if (!resolvedGameIds.has(claim.gameId.toString())) continue
    get(claim.user).claimed += claim.payout
  }

  return [...byUser.values()]
}
