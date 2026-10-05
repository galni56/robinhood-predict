/** `5VfY…k3Qx`-style shortening for signatures and addresses. */
export function shortHash(hash: string, head = 4, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}
