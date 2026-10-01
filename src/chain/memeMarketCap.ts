import { useMemo } from 'react'
import { formatUnits, parseAbi, type Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { assetRaceCatalog } from '@/chain/assetRaceRegistry'
import { robinhoodMainnet } from '@/chain/config'
import type { EthUsdQuote } from '@/chain/ethUsd'

const supplyAbi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
])

const MEME_TOKENS = assetRaceCatalog
  .filter((asset) => asset.category === 'MEME' && asset.canonicalTokenAddress)
  .map((asset) => ({ symbol: asset.symbol, address: asset.canonicalTokenAddress as Address }))

export interface MemeSupply {
  supply: bigint
  decimals: number
}

/** totalSupply()/decimals() for every approved meme token, read from
 * Robinhood mainnet (where the canonical contracts live) and cached for ten
 * minutes - supplies barely move, so this stays at two multicalls per visit.
 * Display-only data; never feeds settlement. */
export function useMemeTokenSupplies(enabled = true): Map<string, MemeSupply> {
  const reads = useReadContracts({
    contracts: MEME_TOKENS.flatMap(
      (token) =>
        [
          { address: token.address, chainId: robinhoodMainnet.id, abi: supplyAbi, functionName: 'totalSupply' },
          { address: token.address, chainId: robinhoodMainnet.id, abi: supplyAbi, functionName: 'decimals' },
        ] as const,
    ),
    query: { enabled: enabled && MEME_TOKENS.length > 0, staleTime: 600_000, refetchInterval: 600_000, retry: 1 },
  })
  return useMemo(() => {
    const bySymbol = new Map<string, MemeSupply>()
    MEME_TOKENS.forEach((token, index) => {
      const supplyRead = reads.data?.[index * 2]
      const decimalsRead = reads.data?.[index * 2 + 1]
      if (supplyRead?.status === 'success' && decimalsRead?.status === 'success') {
        bySymbol.set(token.symbol, { supply: supplyRead.result as bigint, decimals: Number(decimalsRead.result) })
      }
    })
    return bySymbol
  }, [reads.data])
}

/** Market cap in USD from a meme's price (quoted in ETH, the meme quote
 * universe) and its onchain supply. Returns undefined until every input is
 * available, so callers can simply hide the label. */
export function memeMarketCapUsd({
  priceRaw,
  priceDecimals,
  supply,
  ethUsd,
}: {
  priceRaw: bigint
  priceDecimals: number
  supply?: MemeSupply
  ethUsd?: EthUsdQuote
}): number | undefined {
  if (!supply || !ethUsd || ethUsd.stale || priceRaw <= 0n) return undefined
  const priceEth = Number(formatUnits(priceRaw, priceDecimals))
  const tokens = Number(formatUnits(supply.supply, supply.decimals))
  const usd = priceEth * tokens * Number(ethUsd.priceUsd)
  return Number.isFinite(usd) && usd > 0 ? usd : undefined
}

export function formatCompactUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}
