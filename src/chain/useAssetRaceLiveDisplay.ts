import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { parseAssetRaceLiveSnapshot, type AssetRaceLiveSnapshot } from '@/chain/assetRaceLiveDisplay'

const LIVE_URL = import.meta.env.VITE_ASSET_RACE_LIVE_URL?.trim() || '/api/asset-race/live'
const LIVE_ENABLED = import.meta.env.VITE_ASSET_RACE_LIVE_ENABLED?.trim() !== 'false'

interface AssetRaceLiveDisplayState {
  assets: AssetRaceLiveSnapshot['assets']
  ethUsd: AssetRaceLiveSnapshot['ethUsd']
  disconnected: boolean
  snapshot: AssetRaceLiveSnapshot | undefined
}

const AssetRaceLiveDisplayContext = createContext<AssetRaceLiveDisplayState | undefined>(undefined)

function useLiveConnection(enabled: boolean): AssetRaceLiveDisplayState {
  const [snapshot, setSnapshot] = useState<AssetRaceLiveSnapshot>()
  const [lastEventAt, setLastEventAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled || !LIVE_ENABLED) return
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
  return {
    assets: disconnected ? {} : snapshot.assets,
    ethUsd: disconnected ? undefined : snapshot.ethUsd,
    disconnected,
    snapshot,
  }
}

/**
 * Owns the single browser SSE connection used by Markets, Races and Arena.
 * The server already polls every configured pool once and fans that snapshot
 * out to all clients; sharing it here also prevents individual components from
 * opening duplicate EventSource connections.
 */
export function AssetRaceLiveDisplayProvider({
  children,
  enabled,
}: {
  children: ReactNode
  enabled: boolean
}) {
  const value = useLiveConnection(enabled)
  return createElement(AssetRaceLiveDisplayContext.Provider, { value }, children)
}

export function useAssetRaceLiveDisplay({ enabled }: { enabled: boolean }) {
  const shared = useContext(AssetRaceLiveDisplayContext)
  // Keep the hook usable in isolated component tests/previews that do not mount
  // App's provider, while disabling this fallback in the real application.
  const standalone = useLiveConnection(enabled && shared == null)
  if (!enabled) return { assets: {}, ethUsd: undefined, disconnected: true, snapshot: shared?.snapshot }
  return shared ?? standalone
}
