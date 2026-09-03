/**
 * Deterministic, dependency-free pseudo-hash used ONLY to make the mock chain
 * look and behave like a real one (stable addresses, unique tx/block hashes).
 * This is NOT cryptography — do not reuse it for anything security-sensitive.
 *
 * Based on cyrb53 (public-domain, Bryc / Fedor Indutny lineage).
 */
function cyrb53(input: string, seed = 0): [number, number] {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return [h1 >>> 0, h2 >>> 0]
}

/** 0x-prefixed hex string of `bytes` bytes, deterministic for the same input+salt. */
export function mockHash(input: string, salt = '', bytes = 32): string {
  let out = ''
  let i = 0
  while (out.length < bytes * 2) {
    const [a, b] = cyrb53(`${input}:${salt}:${i}`)
    out += a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
    i++
  }
  return `0x${out.slice(0, bytes * 2)}`
}

/** Short 20-byte-style address (contract or wallet) derived from a seed string. */
export function mockAddress(seed: string): string {
  return mockHash(seed, 'address', 20)
}

export function shortHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 2) return hash
  return `${hash.slice(0, head + 2)}…${hash.slice(-tail)}`
}
