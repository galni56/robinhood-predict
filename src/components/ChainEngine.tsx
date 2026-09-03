import { useEffect } from 'react'
import { RHCHAIN_META } from '@/market/tokens'
import { useChainStore } from '@/store/chainStore'
import { useMarketStore } from '@/store/marketStore'

const PRICE_TICK_MS = 2_500
const RESOLUTION_CHECK_MS = 5_000

/**
 * Headless engine that drives the whole mock simulation:
 *  - random-walk price ticks
 *  - block production (bundles pending txs from the mempool)
 *  - prediction-market resolution once a deadline passes
 *
 * Mounted once near the app root. No network calls, no servers — everything
 * runs client-side in the browser tab.
 */
export function ChainEngine() {
  useEffect(() => {
    useChainStore.getState().ensureGenesis()
    useMarketStore.getState().init()

    const priceInterval = window.setInterval(() => {
      useMarketStore.getState().tick()
    }, PRICE_TICK_MS)

    const blockInterval = window.setInterval(() => {
      useChainStore.getState().mineBlock()
    }, RHCHAIN_META.blockTimeMs)

    const resolutionInterval = window.setInterval(() => {
      useMarketStore.getState().checkResolutions()
    }, RESOLUTION_CHECK_MS)

    return () => {
      window.clearInterval(priceInterval)
      window.clearInterval(blockInterval)
      window.clearInterval(resolutionInterval)
    }
  }, [])

  return null
}
