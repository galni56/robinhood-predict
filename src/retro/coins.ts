import {
  coinBlue,
  coinBlueGrin,
  coinGreen,
  coinOrange,
  coinOrangeGrin,
  coinPinkGrin,
  coinPurple,
  coinPurpleGrin,
  logoCoin,
  type PxSpriteData,
} from '@/retro/spriteData'

// The mock's coin characters, one per palette. Known symbols keep the
// mock's casting; everything else picks a stable palette from its name,
// so every asset in the catalog gets a consistent character.
export interface CoinSkin {
  sprite: PxSpriteData
  /** Scoreboard swatch / accents. */
  color: string
}

const SKINS: CoinSkin[] = [
  { sprite: coinOrangeGrin, color: '#FF9F2E' },
  { sprite: coinPinkGrin, color: '#FF7AA8' },
  { sprite: coinPurpleGrin, color: '#A77BFF' },
  { sprite: coinBlueGrin, color: '#4DB5FF' },
  { sprite: coinGreen, color: '#5FD46E' },
  { sprite: logoCoin, color: '#FFD23F' },
]

const FIXED: Record<string, CoinSkin> = {
  BONK: { sprite: coinOrangeGrin, color: '#FF9F2E' },
  TRUMP: { sprite: coinOrange, color: '#FF9F2E' },
  WIF: { sprite: coinPinkGrin, color: '#FF7AA8' },
  SOL: { sprite: coinPurple, color: '#A77BFF' },
  POPCAT: { sprite: coinBlue, color: '#4DB5FF' },
  PENGU: { sprite: coinGreen, color: '#5FD46E' },
}

const ALT: Record<string, PxSpriteData> = {
  '#FF9F2E': coinOrange,
  '#A77BFF': coinPurple,
  '#4DB5FF': coinBlue,
}

export function coinSkin(symbol: string, seat = 0): CoinSkin {
  const normalized = symbol.toUpperCase()
  const fixed = FIXED[normalized]
  if (fixed) return fixed
  let hash = 0
  for (const ch of normalized) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const base = SKINS[(hash + seat) % SKINS.length]
  // Alternate the face on even seats so neighbours do not twin.
  const sprite = seat % 2 === 1 && ALT[base.color] ? ALT[base.color] : base.sprite
  return { ...base, sprite }
}
