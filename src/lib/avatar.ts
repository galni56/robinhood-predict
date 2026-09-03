export const AVATAR_COLORS = [
  '#34d399', // emerald
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#fb923c', // orange
  '#fb7185', // rose
  '#f87171', // red
  '#facc15', // yellow
  '#818cf8', // indigo
] as const

export function colorForSeed(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
