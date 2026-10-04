// Boundary prices from the price service (scripts/solana/price-service): the
// price of each pool at the last block before a game boundary. The response
// is a signed attestation; the game server keeps it with the game so anyone
// can check the prices against the oracle key.

export function createPriceClient(baseUrl, tag) {
  return {
    /** Display SOL/USD (for the duel spectator cap; never for settlement). */
    async solUsd() {
      const body = await (await fetch(`${baseUrl}/prices`, { signal: AbortSignal.timeout(10_000) })).json()
      const sol = body.prices?.SOL
      return sol ? { raw: BigInt(sol.raw), decimals: sol.decimals } : null
    },
    async boundary(target, sources) {
      const url = `${baseUrl}/attestation?program=${tag}&target=${target}&sources=${sources.join(',')}`
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`price service ${response.status}: ${body.error ?? 'no body'}`)
      return {
        prevSlot: body.prevSlot,
        prevBlockTime: body.prevBlockTime,
        prices: Object.fromEntries(body.entries.map((e) => [e.priceSource, BigInt(e.price)])),
        decimals: Object.fromEntries(body.entries.map((e) => [e.priceSource, e.decimals])),
        attestation: { message: body.message, instruction: body.instruction },
      }
    },
  }
}
