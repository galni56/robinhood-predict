// Boundary price sanity check: before a boundary price is signed, it is
// compared with the time-weighted median of the same pool over a window
// around the boundary. A price pushed for a block or two (a cheap trick on a
// thin pool) sits far from that median and is refused; a real move persists
// after the boundary and moves the median with it. Refusing means the game
// gets no signed price and, by its own rules, voids with full refunds.

/**
 * Time-weighted median of price samples.
 * `samples`: [{ slot, price: bigint }] ascending by slot; each price holds
 * until the next sample's slot, the last one until `endSlot`.
 */
export function weightedMedian(samples, endSlot) {
  const weighted = []
  for (let i = 0; i < samples.length; i++) {
    const until = i + 1 < samples.length ? samples[i + 1].slot : endSlot + 1
    const weight = until - samples[i].slot
    if (weight > 0) weighted.push({ price: samples[i].price, weight })
  }
  if (weighted.length === 0) return null
  weighted.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0))
  const total = weighted.reduce((sum, w) => sum + w.weight, 0)
  let seen = 0
  for (const w of weighted) {
    seen += w.weight
    if (seen * 2 >= total) return w.price
  }
  return weighted[weighted.length - 1].price
}

/** Deviation of `price` from `reference` in basis points (rounded down). */
export function deviationBp(price, reference) {
  if (reference <= 0n) return Infinity
  const diff = price > reference ? price - reference : reference - price
  return Number((diff * 10_000n) / reference)
}

/**
 * Checks one boundary price. Returns null when it passes, or a reason.
 * `maxDeviationBp` 0 disables the check.
 */
export function checkBoundaryPrice({ price, samples, endSlot, maxDeviationBp }) {
  if (!maxDeviationBp) return null
  const median = weightedMedian(samples, endSlot)
  if (median == null) return 'no price samples around the boundary'
  const deviation = deviationBp(price, median)
  if (deviation > maxDeviationBp) return `boundary price is ${(deviation / 100).toFixed(2)}% from the ${median} median (limit ${(maxDeviationBp / 100).toFixed(2)}%)`
  return null
}
