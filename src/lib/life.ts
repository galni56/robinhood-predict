import type { CSSProperties } from 'react'

// "Life" for lobby cards and race lanes: every animated element gets its own
// duration and starting phase, derived from a seed (a lobby id, a seat), so
// nothing on the page moves in sync and the timing is stable across renders.

/** Deterministic pseudo-random number in [0, 1) for a seed and a channel. */
export function seeded(seed: number, channel = 0) {
  const x = Math.sin(seed * 12.9898 + channel * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Inline timing for the `rx-life-*` classes (index.css): a duration between
 * `min` and `max` seconds and a negative delay, so the element starts at a
 * random point of its cycle.
 */
export function life(seed: number, channel: number, min: number, max: number): CSSProperties {
  const duration = min + seeded(seed, channel) * (max - min)
  const offset = -seeded(seed, channel + 17) * duration
  return { ['--d' as string]: `${duration.toFixed(2)}s`, ['--o' as string]: `${offset.toFixed(2)}s` }
}
