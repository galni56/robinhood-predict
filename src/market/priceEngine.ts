// Simple geometric random-walk price simulator. Deterministic-ish per tick
// via Math.random() — this is a mock feed, not a forecast of anything real.

const VOLATILITY = 0.012 // ~1.2% typical move per tick
const DRIFT = 0.0006 // gentle mock upward drift so markets aren't dead

function gaussian(): number {
  // Box-Muller
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function stepPrice(price: number): number {
  const change = DRIFT + VOLATILITY * gaussian()
  const next = price * (1 + change)
  return Math.max(0.05, Number(next.toFixed(4)))
}
