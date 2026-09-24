import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { formatUnits, parseAbiItem, parseUnits } from 'viem'
import { useAccount, useChainId, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodMainnet, wagmiConfig } from '@/chain/config'
import { DEMO_USERS, demoBetLogs, demoPools, isDemoMode } from '@/chain/demo'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { AddressLabel } from '@/components/AddressLabel'
import { ClockIcon } from '@/components/icons'
import { SideBadge } from '@/components/Pills'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import {
  BET_TOKEN_ADDRESS,
  BP_DENOMINATOR,
  DEPLOY_BLOCK,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  bettingWindowEndSeconds,
  currentWeightBp,
  erc20Abi,
  predictionMarketAbi,
} from '@/chain/contracts'
import { formatCountdown, formatUsd, shortTxError } from '@/lib/format'
import { shortHash } from '@/lib/hash'

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals (old testnet mock token was 18)

const MARKET_CREATED_EVENT = parseAbiItem(
  'event MarketCreated(uint256 indexed id, bytes32 indexed assetId, bytes32 indexed oracleId, int256 targetPrice, uint256 deadline)',
)
const BET_PLACED_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)

interface MarketBet {
  user: `0x${string}`
  side: number
  amount: bigint
  txHash: `0x${string}`
  blockNumber: bigint
}

type TxState = { label: string } | null

export function OnchainMarketPage() {
  const { id = '0' } = useParams()
  const MARKET_ID = BigInt(id)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  // Arriving from a YES/NO button on the markets-list card (e.g.
  // /onchain/9?side=NO) preselects that side instead of always defaulting
  // to YES, so the click there actually carries through instead of landing
  // on a coin flip.
  const [searchParams] = useSearchParams()
  const [side, setSide] = useState<'YES' | 'NO'>(searchParams.get('side') === 'NO' ? 'NO' : 'YES')
  const [amount, setAmount] = useState('10')
  const [tx, setTx] = useState<TxState>(null)
  const [error, setError] = useState<string | null>(null)

  // Who bet what on THIS market, scanned from the contract's own BetPlaced
  // events (filtered to this market's id) -- public data, shown regardless
  // of wallet connection, same as the pool totals above.
  const publicClient = usePublicClient()
  const [marketBets, setMarketBets] = useState<MarketBet[] | null>(null)
  async function refetchMarketBets() {
    if (!publicClient) return
    try {
      const logs = await publicClient.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: BET_PLACED_EVENT,
        args: { id: MARKET_ID },
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      })
      const real = logs
        .filter((log) => log.args.user && log.args.side != null && log.args.amount != null)
        .map((log) => ({
          user: log.args.user!,
          side: log.args.side!,
          amount: log.args.amount!,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        }))
      const all = isDemoMode() ? [...real, ...demoBetLogs([MARKET_ID])] : real
      setMarketBets(all.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0)))
    } catch {
      setMarketBets((prev) => prev ?? (isDemoMode() ? demoBetLogs([MARKET_ID]) : []))
    }
  }
  useEffect(() => {
    refetchMarketBets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, id])

  // Demo-mode heartbeat for this market: every so often a synthetic bet
  // drops into the list and its side's pool grows, so the page visibly
  // lives during a presentation. Display-only, nothing touches the chain.
  const [demoExtraBets, setDemoExtraBets] = useState<MarketBet[]>([])
  const [demoPoolExtra, setDemoPoolExtra] = useState<{ yes: bigint; no: bigint }>({ yes: 0n, no: 0n })
  useEffect(() => {
    setDemoExtraBets([])
    setDemoPoolExtra({ yes: 0n, no: 0n })
    if (!isDemoMode()) return
    let stop = false
    let timer: number
    const randHex = (len: number) => {
      let s = ''
      for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16)
      return s
    }
    const tick = () => {
      if (stop) return
      const amount = BigInt((2 + Math.floor(Math.random() * 46)) * 1e6)
      const side = Math.random() < 0.5 ? MarketSideOnchain.YES : MarketSideOnchain.NO
      setDemoExtraBets((prev) =>
        [
          {
            user: DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)],
            side,
            amount,
            txHash: `0x${randHex(64)}` as `0x${string}`,
            blockNumber: BigInt(10_500_000 + Math.floor(Math.random() * 1000)),
          },
          ...prev,
        ].slice(0, 10),
      )
      setDemoPoolExtra((prev) => (side === MarketSideOnchain.YES ? { yes: prev.yes + amount, no: prev.no } : { yes: prev.yes, no: prev.no + amount }))
      timer = window.setTimeout(tick, 14_000 + Math.random() * 22_000)
    }
    timer = window.setTimeout(tick, 4_000 + Math.random() * 4_000)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [id])

  // MarketCreated doesn't carry a creator field (see PredictionMarket.sol),
  // so the only way to know who created a market is the `from` of the
  // transaction that emitted it -- one extra call beyond a plain log scan,
  // but only once per market (not polled).
  const [creator, setCreator] = useState<`0x${string}` | null | undefined>(undefined)
  useEffect(() => {
    if (!publicClient) return
    let cancelled = false
    publicClient
      .getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: MARKET_CREATED_EVENT,
        args: { id: MARKET_ID },
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      })
      .then(async (logs) => {
        if (cancelled || logs.length === 0) return
        const tx = await publicClient.getTransaction({ hash: logs[0].transactionHash })
        if (!cancelled) setCreator(tx.from)
      })
      .catch(() => {
        if (!cancelled) setCreator(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, id])

  const onRightChain = chainId === robinhoodMainnet.id

  const market = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'getMarket',
    args: [MARKET_ID],
  })

  const ticker = tickerForPredictionAssetId(market.data?.assetId)
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const livePrice = ticker ? live.assets[ticker] : undefined
  const effectiveDecimals = market.data?.priceDecimals
  const effectivePriceAnswer = livePrice && !livePrice.stale ? BigInt(livePrice.priceRaw) : undefined

  const betTokenBalance = useReadContract({
    address: BET_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const allowance = useReadContract({
    address: BET_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, PREDICTION_MARKET_ADDRESS] : undefined,
    query: { enabled: !!address },
  })

  const myStakeYes = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'stakes',
    args: address ? [MARKET_ID, address, MarketSideOnchain.YES] : undefined,
    query: { enabled: !!address },
  })
  const myStakeNo = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'stakes',
    args: address ? [MARKET_ID, address, MarketSideOnchain.NO] : undefined,
    query: { enabled: !!address },
  })

  const hasClaimed = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'claimed',
    args: address ? [MARKET_ID, address] : undefined,
    query: { enabled: !!address },
  })

  const settlement = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'settlements',
    args: [MARKET_ID],
    query: { enabled: market.data?.status === MarketStatusOnchain.Resolved },
  })

  const targetPriceUsd = useMemo(() => {
    if (!market.data || effectiveDecimals == null) return null
    return Number(formatUnits(market.data.targetPrice, effectiveDecimals))
  }, [market.data, effectiveDecimals])

  const currentPriceUsd = useMemo(() => {
    if (effectivePriceAnswer == null || effectiveDecimals == null) return null
    return Number(formatUnits(effectivePriceAnswer, effectiveDecimals))
  }, [effectivePriceAnswer, effectiveDecimals])

  const settlementPriceUsd = useMemo(() => {
    if (!settlement.data || effectiveDecimals == null) return null
    return Number(formatUnits(settlement.data[0], effectiveDecimals))
  }, [settlement.data, effectiveDecimals])

  const displayedPriceUsd = market.data?.status === MarketStatusOnchain.Resolved
    ? settlementPriceUsd
    : currentPriceUsd

  // Colors the price by whether it just ticked up or down since the last
  // poll (not by distance from target) - ref so recording it never itself
  // triggers a re-render; read during render, updated after via the effect
  // below so this render still sees the *previous* poll's value.
  const prevPriceRef = useRef<number | null>(null)
  const tickedUp = displayedPriceUsd == null || prevPriceRef.current == null ? true : displayedPriceUsd >= prevPriceRef.current
  useEffect(() => {
    if (displayedPriceUsd != null) prevPriceRef.current = displayedPriceUsd
  }, [displayedPriceUsd])

  async function refetchAll() {
    await Promise.all([
      market.refetch(),
      betTokenBalance.refetch(),
      allowance.refetch(),
      myStakeYes.refetch(),
      myStakeNo.refetch(),
      hasClaimed.refetch(),
      settlement.refetch(),
      refetchMarketBets(),
    ])
  }

  async function handleBet() {
    setError(null)
    try {
      if (bettingClosed) {
        setError('Betting on this market is already closed')
        return
      }
      if (sideAlreadyBet) {
        setError(`You already bet ${side === 'YES' ? 'YES' : 'NO'} on this market`)
        return
      }
      const amountWei = parseUnits(amount || '0', BET_TOKEN_DECIMALS)
      if (amountWei <= 0n) {
        setError('Amount must be greater than zero')
        return
      }

      if ((allowance.data ?? 0n) < amountWei) {
        setTx({ label: 'Confirm approve in your wallet…' })
        const approveHash = await writeContractAsync({
          address: BET_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [PREDICTION_MARKET_ADDRESS, amountWei],
        })
        setTx({ label: 'Waiting for approve confirmation…' })
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
      }

      setTx({ label: 'Confirm bet in your wallet…' })
      const betHash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'bet',
        args: [MARKET_ID, MarketSideOnchain[side], amountWei],
      })
      setTx({ label: 'Waiting for bet confirmation…' })
      await waitForTransactionReceipt(wagmiConfig, { hash: betHash })

      setTx(null)
      await refetchAll()
    } catch (e) {
      setTx(null)
      setError(shortTxError(e))
    }
  }

  async function handleResolve() {
    setError(null)
    try {
      if (!market.data) {
        setError('Market data is not ready yet')
        return
      }
      if (market.data.poolYes > 0n && market.data.poolNo > 0n) {
        setError('The keeper is collecting the signed StockToken/USDG deadline price. No wallet action is needed.')
        return
      }
      setTx({ label: 'Confirm resolve in your wallet…' })
      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'resolve',
        args: [MARKET_ID, '0x'],
      })
      await waitForTransactionReceipt(wagmiConfig, { hash })
      setTx(null)
      await refetchAll()
    } catch (e) {
      setTx(null)
      setError(shortTxError(e))
    }
  }

  async function handleClaimOrRefund(fn: 'claim' | 'refund', side?: 0 | 1) {
    setError(null)
    if (fn === 'claim' && (winningStake ?? 0n) === 0n) {
      setError('This wallet has no winning stake to claim')
      return
    }
    try {
      setTx({ label: `Confirm ${fn} in your wallet…` })
      const hash = await writeContractAsync(
        fn === 'claim'
          ? { address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'claim', args: [MARKET_ID] }
          : { address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'refund', args: [MARKET_ID, side!] },
      )
      await waitForTransactionReceipt(wagmiConfig, { hash })
      setTx(null)
      await refetchAll()
    } catch (e) {
      setTx(null)
      setError(shortTxError(e))
    }
  }

  const status = market.data?.status
  const deadlineMs = market.data ? Number(market.data.deadline) * 1000 : 0
  const basePools = market.data
    ? isDemoMode()
      ? demoPools(MARKET_ID)
      : { poolYes: market.data.poolYes, poolNo: market.data.poolNo }
    : { poolYes: 0n, poolNo: 0n }
  const pools = { poolYes: basePools.poolYes + demoPoolExtra.yes, poolNo: basePools.poolNo + demoPoolExtra.no }
  const totalPool = pools.poolYes + pools.poolNo
  const yesPct = totalPool > 0n ? Number((pools.poolYes * 10000n) / totalPool) / 100 : 50

  // Betting closes before the deadline, with an early-bet weight that decays
  // over the betting window - mirrors PredictionMarket.bettingWindowEnd()/
  // currentWeightBp() exactly (see src/chain/contracts.ts).
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  const bettingWindowEndMs = market.data ? Number(bettingWindowEndSeconds(market.data.createdAt, market.data.deadline)) * 1000 : 0
  const liveWeightBp = market.data ? currentWeightBp(market.data.createdAt, market.data.deadline, nowSeconds) : null
  const bettingClosed = liveWeightBp == null

  // One bet per side per market - mirrors the contract's `bet()` rule.
  const hasBetYes = (myStakeYes.data ?? 0n) > 0n
  const hasBetNo = (myStakeNo.data ?? 0n) > 0n
  const sideAlreadyBet = side === 'YES' ? hasBetYes : hasBetNo
  const bothSidesUsed = hasBetYes && hasBetNo
  const hasAnyStake = hasBetYes || hasBetNo
  const winningSide = market.data?.outcome === MarketSideOnchain.YES ? 'YES' : 'NO'
  const winningStake = market.data?.outcome === MarketSideOnchain.YES ? myStakeYes.data : myStakeNo.data
  const positionReady = myStakeYes.data !== undefined && myStakeNo.data !== undefined && hasClaimed.data !== undefined

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <Link to="/onchain" className="text-sm font-bold text-white/40 hover:text-white/70">
        ← All on-chain markets
      </Link>

      {/* A skeleton that mirrors the loaded layout's shape, rather than a
          bare "…" title or "Loading market…" line, so navigating to a market
          reads as "this is loading" instead of "this is broken/empty" for
          the beat before the first useReadContract call resolves. */}
      {!market.data ? (
        <>
          <div className="h-8 sm:h-9 w-72 max-w-full rounded-lg bg-white/5 animate-pulse mt-4 mb-2" />
          <div className="h-4 w-40 rounded bg-white/5 animate-pulse mb-5" />
        </>
      ) : (
        <div className="mt-4 mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Will {ticker ?? '…'} be at or above {targetPriceUsd != null ? formatUsd(targetPriceUsd) : '…'} at the deadline?
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/30">
              <span>On-chain market #{MARKET_ID.toString()}</span>
              {creator && (
                <>
                  <span>· created by</span>
                  <AddressLabel address={creator} className="text-white/40 hover:text-white/70" />
                </>
              )}
            </p>
          </div>
          <ShareInviteButton kind="market" id={MARKET_ID} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start mt-2">
        <div>
      {/* Market data is a public read - shown regardless of wallet connection. */}
      {market.isLoading ? (
        <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-5 space-y-3 mb-5 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-3 w-14 rounded bg-white/10" />
            <div className="h-3 w-24 rounded bg-white/10" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="space-y-2">
              <div className="h-7 w-24 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/5" />
            </div>
            <div className="space-y-2 text-right">
              <div className="h-7 w-24 rounded bg-white/10 ml-auto" />
              <div className="h-3 w-14 rounded bg-white/5 ml-auto" />
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/10" />
          <div className="flex justify-between">
            <div className="h-3 w-16 rounded bg-white/5" />
            <div className="h-3 w-16 rounded bg-white/5" />
          </div>
        </div>
      ) : !market.data ? (
        <p className="text-rose-400">Market not found.</p>
      ) : (
        <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-5 space-y-3 mb-5">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                status === MarketStatusOnchain.Open
                  ? 'bg-[#8B7CF7]/15 text-[#B3A7FA]'
                  : status === MarketStatusOnchain.Resolved
                    ? 'bg-[#f7f1e3]/10 text-[#f7f1e3]/80'
                    : 'bg-white/10 text-white/50'
              }`}
            >
              {status === MarketStatusOnchain.Open ? 'Open' : status === MarketStatusOnchain.Resolved ? 'Resolved' : 'Cancelled'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-white/40 text-xs font-bold">
              {status === MarketStatusOnchain.Open && (
                <>
                  <ClockIcon className="w-3.5 h-3.5" />
                  {bettingClosed
                    ? `resolves: ${formatCountdown(deadlineMs - Date.now())}`
                    : `betting: ${formatCountdown(bettingWindowEndMs - Date.now())}`}
                </>
              )}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8B7CF7]/60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#8B7CF7]" />
                </span>
                <span className={`font-mono text-3xl font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {displayedPriceUsd != null ? formatUsd(displayedPriceUsd) : '…'}
                </span>
              </div>
              <div className="text-white/40 text-xs font-bold mt-1">
                {status === MarketStatusOnchain.Resolved ? 'deadline price · final' : 'current price · live'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-semibold text-white/70">{targetPriceUsd != null ? formatUsd(targetPriceUsd) : '…'}</div>
              <div className="text-white/40 text-xs font-bold mt-1">
                target
                {displayedPriceUsd != null && targetPriceUsd != null && displayedPriceUsd > 0 && (
                  <span className={targetPriceUsd >= displayedPriceUsd ? 'text-[#B3A7FA]' : 'text-[#F2A65A]'}>
                    {' '}
                    · {targetPriceUsd >= displayedPriceUsd ? '+' : ''}
                    {(((targetPriceUsd - displayedPriceUsd) / displayedPriceUsd) * 100).toFixed(1)}% away
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-[#3b2a20] overflow-hidden">
            <div className="h-full rounded-full bg-[#8B7CF7] transition-[width] duration-700" style={{ width: `${yesPct}%` }} />
          </div>
          <div className="flex justify-between text-xs font-bold">
            <span className="text-[#B3A7FA]">YES {yesPct.toFixed(1)}%</span>
            <span className="text-white/40">
              {formatUnits(pools.poolYes, BET_TOKEN_DECIMALS)} vs {formatUnits(pools.poolNo, BET_TOKEN_DECIMALS)} USDG
            </span>
            <span className="text-[#F2A65A]">NO {(100 - yesPct).toFixed(1)}%</span>
          </div>
        </div>
      )}

      <div className="mb-5">
        <h2 className="font-display text-base font-bold mb-2">Bets on this market</h2>
        {marketBets == null ? (
          <div className="space-y-1.5 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-white/5" />
            ))}
          </div>
        ) : marketBets.length === 0 && demoExtraBets.length === 0 ? (
          <p className="text-white/30 text-xs">No bets placed yet.</p>
        ) : (
          <div className="space-y-1.5">
            {[...demoExtraBets, ...marketBets].map((b) => (
              <div
                key={b.txHash}
                style={{ animation: 'row-in 0.5s ease' }}
                className="flex items-center gap-3 text-xs bg-[#241b2f] border border-white/5 rounded-xl px-3 py-2"
              >
                <SideBadge side={b.side === MarketSideOnchain.YES ? 'YES' : 'NO'} />
                <AddressLabel address={b.user} className="font-mono text-white/70 hover:text-white" />
                <span className="font-mono text-white/50">{formatUnits(b.amount, BET_TOKEN_DECIMALS)} USDG</span>
                <a
                  href={`${robinhoodMainnet.blockExplorers.default.url}/tx/${b.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto shrink-0 font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[#B3A7FA] hover:bg-white/10 transition-colors"
                >
                  {shortHash(b.txHash)}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
        </div>

        <div className="lg:sticky lg:top-24 space-y-4">
          <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-5 flex items-center gap-4">
            <img
              src={`${import.meta.env.BASE_URL}brand/mascot-small.png`}
              alt=""
              className="w-14 shrink-0"
              style={{ animation: 'mascot-float 5s ease-in-out infinite' }}
            />
            <div className="-rotate-1 rounded-2xl rounded-bl-sm bg-[#fdf9ee] px-3.5 py-2 shadow-md text-xs font-bold text-[#241a33]">
              Pick a side.
              <br />
              The future is listening.
            </div>
          </div>

      {!isConnected ? (
        <div className="space-y-4">
          {/* Inactive preview of the bet form - the real one appears once a
              wallet is connected. Shows what betting looks like instead of
              hiding it entirely. */}
          {market.data && status === MarketStatusOnchain.Open && !bettingClosed && (
            <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled
                  className="py-2.5 rounded-xl text-sm font-extrabold border border-white/10 text-white/25 cursor-not-allowed"
                >
                  YES ↗
                </button>
                <button
                  disabled
                  className="py-2.5 rounded-xl text-sm font-extrabold border border-white/10 text-white/25 cursor-not-allowed"
                >
                  NO ↘
                </button>
              </div>
              <input
                disabled
                placeholder="Amount in USDG"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm placeholder:text-white/25 cursor-not-allowed"
              />
              <button
                disabled
                className="w-full rounded-xl bg-white/10 text-white/30 font-bold py-2.5 text-sm cursor-not-allowed"
              >
                Place bet
              </button>
              <p className="text-[11px] font-bold text-[#B3A7FA] text-center">Connect a wallet below to place a real bet ↓</p>
            </div>
          )}
          <WalletOptionsList />
        </div>
      ) : !onRightChain ? (
        <div className="rounded-2xl border border-[#F2A65A]/30 bg-[#F2A65A]/10 p-4 text-sm text-[#F2A65A]">
          Wrong network. You need Robinhood Chain.
          <button
            onClick={() => switchChain({ chainId: robinhoodMainnet.id })}
            disabled={isSwitching}
            className="ml-3 rounded-full bg-[#F2A65A] text-[#3b2416] px-3.5 py-1 font-bold"
          >
            Switch network
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>{address}</span>
            <button onClick={() => disconnect()} className="text-white/40 hover:text-white">
              Disconnect
            </button>
          </div>

          {market.data && (
            <>
              {status === MarketStatusOnchain.Open && (
                <>
                  {deadlineMs <= Date.now() && (
                    market.data.poolYes === 0n || market.data.poolNo === 0n ? (
                      <button onClick={handleResolve} className="w-full rounded-xl bg-white/10 hover:bg-white/20 py-2.5 text-sm font-bold transition-colors">
                        Cancel one-sided market and enable refunds
                      </button>
                    ) : (
                      <p className="rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white/50">
                        Deadline passed. The keeper is fixing the signed StockToken/USDG pool price automatically.
                      </p>
                    )
                  )}

                  {bettingClosed ? (
                    <p className="text-sm text-white/40">
                      Betting on this market is closed - waiting for the deadline so it can resolve.
                    </p>
                  ) : (
                    <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-white/50 font-medium">
                        <span>Your balance: {betTokenBalance.data != null ? formatUnits(betTokenBalance.data, BET_TOKEN_DECIMALS) : '…'} USDG</span>
                        {liveWeightBp != null && (
                          <span className="font-bold text-[#B3A7FA]">
                            Early-bet bonus: {(Number(liveWeightBp) / Number(BP_DENOMINATOR)).toFixed(2)}x
                          </span>
                        )}
                      </div>

                      {bothSidesUsed ? (
                        <p className="text-xs text-white/40">
                          You've already bet both YES and NO on this market - one bet per side, no more allowed.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setSide('YES')}
                              disabled={hasBetYes}
                              className={`py-2.5 rounded-xl text-sm font-extrabold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${side === 'YES' ? 'bg-[#8B7CF7] text-[#f7f1e3] border-[#8B7CF7]' : 'border-white/10 text-white/60 hover:border-[#8B7CF7]/40'}`}
                            >
                              YES ↗{hasBetYes ? ' ✓' : ''}
                            </button>
                            <button
                              onClick={() => setSide('NO')}
                              disabled={hasBetNo}
                              className={`py-2.5 rounded-xl text-sm font-extrabold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${side === 'NO' ? 'bg-[#F2A65A] text-[#3b2416] border-[#F2A65A]' : 'border-white/10 text-white/60 hover:border-[#F2A65A]/40'}`}
                            >
                              NO ↘{hasBetNo ? ' ✓' : ''}
                            </button>
                          </div>

                          {sideAlreadyBet ? (
                            <p className="text-xs font-bold text-[#F2A65A]/80">
                              You've already bet {side === 'YES' ? 'YES' : 'NO'} on this market - pick the other side.
                            </p>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-[#8B7CF7]/50 transition-colors"
                                placeholder="Amount in USDG"
                              />
                              <p className="text-[11px] text-white/30">
                                USDG only for now - ETH support is planned for a future update. Want another token
                                supported? Let us know what you'd like next.
                              </p>
                              <button
                                onClick={handleBet}
                                disabled={!!tx}
                                className={`w-full rounded-xl font-bold py-2.5 text-sm disabled:opacity-50 transition-all ${
                                  side === 'YES'
                                    ? 'bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white'
                                    : 'bg-gradient-to-r from-[#F2A65A] to-[#ED8F3A] hover:brightness-110 text-[#3b2416]'
                                }`}
                              >
                                {tx ? tx.label : 'Place bet (approve + bet)'}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {status === MarketStatusOnchain.Resolved && (
                !positionReady ? (
                  <div className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-center text-sm font-bold text-white/40">
                    Checking your position…
                  </div>
                ) : hasClaimed.data ? (
                  <div className="w-full rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center text-sm font-bold text-emerald-300">
                    Already claimed
                  </div>
                ) : (winningStake ?? 0n) > 0n ? (
                  <button
                    onClick={() => handleClaimOrRefund('claim')}
                    disabled={!!tx}
                    className="w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white font-bold py-2.5 text-sm disabled:opacity-50 transition-all"
                  >
                    {tx ? tx.label : 'Claim winnings'}
                  </button>
                ) : hasAnyStake ? (
                  <div className="w-full rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 text-center">
                    <p className="text-sm font-bold text-rose-300">Your position lost</p>
                    <p className="text-xs text-white/40 mt-0.5">{winningSide} won this market. There is no payout to claim.</p>
                  </div>
                ) : (
                  <div className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-center">
                    <p className="text-sm font-bold text-white/60">No winning position</p>
                    <p className="text-xs text-white/35 mt-0.5">This wallet did not place a winning bet on this market.</p>
                  </div>
                )
              )}

              {status === MarketStatusOnchain.Cancelled && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleClaimOrRefund('refund', MarketSideOnchain.YES)}
                    disabled={!!tx || (myStakeYes.data ?? 0n) === 0n}
                    className="rounded-xl bg-[#372a4f] text-[#B3A7FA] font-bold hover:bg-[#433460] py-2.5 text-sm disabled:opacity-30 transition-colors"
                  >
                    Refund YES
                  </button>
                  <button
                    onClick={() => handleClaimOrRefund('refund', MarketSideOnchain.NO)}
                    disabled={!!tx || (myStakeNo.data ?? 0n) === 0n}
                    className="rounded-xl bg-[#3b2a20] text-[#F2A65A] font-bold hover:bg-[#4a3428] py-2.5 text-sm disabled:opacity-30 transition-colors"
                  >
                    Refund NO
                  </button>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
