import { useEffect, useState } from 'react'
import { parseAssetRaceLiveSnapshot, type AssetRaceLiveSnapshot } from '@/chain/assetRaceLiveDisplay'

const LIVE_URL = import.meta.env.VITE_ASSET_RACE_LIVE_URL?.trim() || '/api/asset-race/live'

export function useAssetRaceLiveDisplay({ enabled }: { enabled: boolean }) {
  const [snapshot, setSnapshot] = useState<AssetRaceLiveSnapshot>()
  const [lastEventAt, setLastEventAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    const events = new EventSource(LIVE_URL)
    events.onmessage = (event) => {
      try {
        const parsed = parseAssetRaceLiveSnapshot(JSON.parse(event.data))
        if (!parsed) return
        setSnapshot(parsed)
        setLastEventAt(Date.now())
      } catch {
        // EventSource reconnects automatically; malformed display data is ignored.
      }
    }
    return () => {
      window.clearInterval(timer)
      events.close()
    }
  }, [enabled])

  const disconnected = !snapshot || now - lastEventAt > snapshot.staleAfterMs
  return { assets: disconnected ? {} : snapshot.assets, disconnected, snapshot }
}
