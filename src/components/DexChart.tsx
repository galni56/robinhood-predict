import { INK } from '@/retro/scene'

/** Live price chart of a Solana pool from DexScreener (display only; games
 * settle on our signed pool price, not on this chart). */
export function DexChart({ pool, height = 360 }: { pool: string; height?: number }) {
  const params = 'embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=1'
  return (
    <div className="rx-raised" style={{ background: INK, lineHeight: 0 }}>
      <iframe
        title="Price chart"
        src={`https://dexscreener.com/solana/${pool}?${params}`}
        loading="lazy"
        style={{ width: '100%', height, border: 0 }}
      />
    </div>
  )
}
