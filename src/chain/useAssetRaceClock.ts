import { useEffect, useRef, useState } from 'react'
import { useBlock } from 'wagmi'
import { assetRaceChain, isLocalAssetRace } from '@/chain/config'

/** Display-only clock anchored to the latest Anvil block, then interpolated
 * with elapsed client time. Contract timestamps remain authoritative. */
export function useAssetRaceClock() {
  const [nowMs, setNowMs] = useState(0)
  const anchor = useRef<{ chainMs: number; receivedMs: number } | null>(null)
  const block = useBlock({
    chainId: assetRaceChain.id,
    watch: isLocalAssetRace,
    query: { enabled: isLocalAssetRace },
  })

  useEffect(() => {
    if (!isLocalAssetRace || !block.data) return
    anchor.current = { chainMs: Number(block.data.timestamp) * 1_000, receivedMs: Date.now() }
  }, [block.data])

  useEffect(() => {
    const tick = () => {
      const latest = anchor.current
      setNowMs(latest ? latest.chainMs + Date.now() - latest.receivedMs : Date.now())
    }
    const timer = window.setInterval(tick, 1_000)
    return () => window.clearInterval(timer)
  }, [])

  return nowMs
}
