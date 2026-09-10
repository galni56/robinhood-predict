// Deterministic per-address "avatar" — no backend, no image, no library.
// Same wallet address always renders the same two-tone gradient circle, a
// common web3 pattern (blockies/Jazzicon do the same thing with more visual
// complexity) so a connected wallet has a recognizable glanceable identity.
function hashToHue(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

export function AddressAvatar({ address, size = 28 }: { address: string; size?: number }) {
  const lower = address.toLowerCase()
  const hue1 = hashToHue(lower)
  const hue2 = (hue1 + 45 + (hashToHue(lower.slice(2)) % 90)) % 360
  return (
    <span
      className="inline-block rounded-full shrink-0 ring-1 ring-white/10"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue1} 75% 55%), hsl(${hue2} 75% 45%))`,
      }}
    />
  )
}
