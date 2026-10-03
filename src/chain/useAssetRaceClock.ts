import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConnection } from '@solana/wallet-adapter-react'

/** Display-only clock anchored to the cluster's latest block time, then
 * interpolated with elapsed client time. Program timestamps stay
 * authoritative; this only keeps countdowns honest when the cluster clock
 * (a local validator, devnet) drifts from the visitor's clock. */
export function useAssetRaceClock() {
  const { connection } = useConnection()
  const anchor = useQuery({
    queryKey: ['cluster-clock', connection.rpcEndpoint],
    queryFn: async () => {
      const slot = await connection.getSlot('confirmed')
      const blockTime = await connection.getBlockTime(slot)
      return blockTime == null ? null : { chainMs: blockTime * 1_000, receivedMs: Date.now() }
    },
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 1,
  })
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const tick = () => {
      const latest = anchor.data
      setNowMs(latest ? latest.chainMs + Date.now() - latest.receivedMs : Date.now())
    }
    tick()
    const timer = window.setInterval(tick, 1_000)
    return () => window.clearInterval(timer)
  }, [anchor.data])

  return nowMs
}
