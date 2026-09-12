import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits, parseAbiItem, parseUnits } from 'viem'
import { useAccount, useChainId, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodMainnet, wagmiConfig } from '@/chain/config'
import { useFeedSnapshot } from '@/chain/feedCache'
import { AddressLabel } from '@/components/AddressLabel'
import { SideBadge } from '@/components/Pills'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import {
  BET_TOKEN_ADDRESS,
  BP_DENOMINATOR,
  DEPLOY_BLOCK,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  bettingWindowEndSeconds,
  currentWeightBp,
  erc20Abi,
  predictionMarketAbi,
  tickerForFeedAddress,
  tickerFromFeedDescription,
} from '@/chain/contracts'
import { formatCountdown, formatUsd, shortTxError } from '@/lib/format'
import { shortHash } from '@/lib/hash'

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals (old testnet mock token was 18)

const MARKET_CREATED_EVENT = parseAbiItem(
  'event MarketCreated(uint256 indexed id, address indexed priceFeed, int256 targetPrice, uint256 deadline)',
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

  const [side, setSide] = useState<'YES' | 'NO'>('YES')
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
      setMarketBets(
        logs
          .filter((log) => log.args.user && log.args.side != null && log.args.amount != null)
          .map((log) => ({
            user: log.args.user!,
            side: log.args.side!,
            amount: log.args.amount!,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          }))
          .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0)),
      )
    } catch {
      setMarketBets((prev) => prev ?? [])
    }
  }
  useEffect(() => {
    refetchMarketBets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, id])

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

  const feedAddress = market.data?.priceFeed

  // See src/chain/feedCache.ts -- a backend poller keeps this snapshot
  // fresh; the on-chain reads below only need to run (and poll) when this
  // market's feed isn't in it.
  const feedSnapshot = useFeedSnapshot()
  const snapEntry = feedAddress ? feedSnapshot.data?.[feedAddress] : undefined

  const feedDecimals = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'decimals',
    query: { enabled: !!feedAddress && !snapEntry },
  })

  const feedPrice = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'latestRoundData',
    query: { enabled: !!feedAddress && !snapEntry, refetchInterval: 2_000 },
  })

  const effectiveDecimals = snapEntry?.decimals ?? feedDecimals.data
  const effectivePriceAnswer = snapEntry ? BigInt(snapEntry.answer) : feedPrice.data?.[1]

  // Resolves instantly, no network call, for every allowlisted feed (which
  // is every feed a market can actually be created against) -- avoids an
  // extra description() round trip that used to leave the page's own title
  // showing "…" for a beat after the market itself had already loaded.
  const staticTicker = tickerForFeedAddress(feedAddress)
  const feedDescription = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'description',
    query: { enabled: !!feedAddress && !staticTicker },
  })
  const ticker = staticTicker ?? tickerFromFeedDescription(feedDescription.data)

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

  const targetPriceUsd = useMemo(() => {
    if (!market.data || effectiveDecimals == null) return null
    return Number(formatUnits(market.data.targetPrice, effectiveDecimals))
  }, [market.data, effectiveDecimals])

  const currentPriceUsd = useMemo(() => {
    if (effectivePriceAnswer == null || effectiveDecimals == null) return null
    return Number(formatUnits(effectivePriceAnswer, effectiveDecimals))
  }, [effectivePriceAnswer, effectiveDecimals])

  // Colors the price by whether it just ticked up or down since the last
  // poll (not by distance from target) — ref so recording it never itself
  // triggers a re-render; read during render, updated after via the effect
  // below so this render still sees the *previous* poll's value.
  const prevPriceRef = useRef<number | null>(null)
  const tickedUp = currentPriceUsd == null || prevPriceRef.current == null ? true : currentPriceUsd >= prevPriceRef.current
  useEffect(() => {
    if (currentPriceUsd != null) prevPriceRef.current = currentPriceUsd
  }, [currentPriceUsd])

  async function refetchAll() {
    await Promise.all([
      market.refetch(),
      betTokenBalance.refetch(),
      allowance.refetch(),
      myStakeYes.refetch(),
      myStakeNo.refetch(),
      hasClaimed.refetch(),
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
      setTx({ label: 'Confirm resolve in your wallet…' })
      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'resolve',
        args: [MARKET_ID],
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
  const totalPool = market.data ? market.data.poolYes + market.data.poolNo : 0n
  const yesPct = market.data && totalPool > 0n ? Number((market.data.poolYes * 10000n) / totalPool) / 100 : 50

  // Betting closes before the deadline, with an early-bet weight that decays
  // over the betting window — mirrors PredictionMarket.bettingWindowEnd()/
  // currentWeightBp() exactly (see src/chain/contracts.ts).
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  const bettingWindowEndMs = market.data ? Number(bettingWindowEndSeconds(market.data.createdAt, market.data.deadline)) * 1000 : 0
  const liveWeightBp = market.data ? currentWeightBp(market.data.createdAt, market.data.deadline, nowSeconds) : null
  const bettingClosed = liveWeightBp == null

  // One bet per side per market — mirrors the contract's `bet()` rule.
  const hasBetYes = (myStakeYes.data ?? 0n) > 0n
  const hasBetNo = (myStakeNo.data ?? 0n) > 0n
  const sideAlreadyBet = side === 'YES' ? hasBetYes : hasBetNo
  const bothSidesUsed = hasBetYes && hasBetNo

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        ⛓️ This is <b>real mode</b> — actual transactions on Robinhood Chain mainnet through your wallet
        (MetaMask/Phantom). Not a mock: gas and tokens are real, and transactions really go on-chain.
      </div>

      <Link to="/onchain" className="text-sm text-white/40 hover:text-white/70">
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
        <>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-4 mb-1">
            {ticker ?? '…'} reach {targetPriceUsd != null ? formatUsd(targetPriceUsd) : '…'}?
          </h1>
          <p className="text-white/30 text-sm mb-5 flex items-center gap-1.5 flex-wrap">
            <span>On-chain market #{MARKET_ID.toString()}</span>
            {creator && (
              <>
                <span>· created by</span>
                <AddressLabel address={creator} className="text-white/40 hover:text-white/70" />
              </>
            )}
          </p>
        </>
      )}

      {/* Market data is a public read — shown regardless of wallet connection. */}
      {market.isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-5 space-y-3 mb-5 animate-pulse">
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
        <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-5 space-y-3 mb-5">
          <div className="flex items-center justify-between">
            <span className="text-white/50 text-xs uppercase tracking-wider">
              {status === MarketStatusOnchain.Open ? 'Open' : status === MarketStatusOnchain.Resolved ? 'Resolved' : 'Cancelled'}
            </span>
            <span className="text-white/40 text-xs">
              {status === MarketStatusOnchain.Open &&
                (bettingClosed
                  ? `⏱ resolves: ${formatCountdown(deadlineMs - Date.now())}`
                  : `⏱ betting: ${formatCountdown(bettingWindowEndMs - Date.now())}`)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className={`font-mono text-2xl font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentPriceUsd != null ? formatUsd(currentPriceUsd) : '…'}
              </div>
              <div className="text-white/40 text-xs">current price</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-semibold text-white/70">{targetPriceUsd != null ? formatUsd(targetPriceUsd) : '…'}</div>
              <div className="text-white/40 text-xs">target</div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-rose-500/30 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-white/40">
            <span>YES {yesPct.toFixed(1)}%</span>
            <span>
              {formatUnits(market.data.poolYes, BET_TOKEN_DECIMALS)} vs {formatUnits(market.data.poolNo, BET_TOKEN_DECIMALS)} USDG
            </span>
            <span>NO {(100 - yesPct).toFixed(1)}%</span>
          </div>
        </div>
      )}

      <div className="mb-5">
        <h2 className="text-sm font-bold mb-2">Bets on this market</h2>
        {marketBets == null ? (
          <div className="space-y-1.5 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-white/5" />
            ))}
          </div>
        ) : marketBets.length === 0 ? (
          <p className="text-white/30 text-xs">No bets placed yet.</p>
        ) : (
          <div className="space-y-1.5">
            {marketBets.map((b) => (
              <div
                key={b.txHash}
                className="flex items-center gap-3 text-xs bg-[#12121c]/95 border border-white/10 rounded-lg px-3 py-2"
              >
                <SideBadge side={b.side === MarketSideOnchain.YES ? 'YES' : 'NO'} />
                <AddressLabel address={b.user} className="font-mono text-white/70 hover:text-white" />
                <span className="font-mono text-white/50">{formatUnits(b.amount, BET_TOKEN_DECIMALS)} USDG</span>
                <a
                  href={`${robinhoodMainnet.blockExplorers.default.url}/tx/${b.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto shrink-0 font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[#C6FF3D]/90 hover:bg-white/10 transition-colors"
                >
                  {shortHash(b.txHash)}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isConnected ? (
        <WalletOptionsList />
      ) : !onRightChain ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Wrong network. You need Robinhood Chain.
          <button
            onClick={() => switchChain({ chainId: robinhoodMainnet.id })}
            disabled={isSwitching}
            className="ml-3 rounded-md bg-amber-500 text-black px-3 py-1 font-medium"
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
                    <button onClick={handleResolve} className="w-full rounded-lg bg-white/10 hover:bg-white/20 py-2 text-sm">
                      Resolve now (deadline passed)
                    </button>
                  )}

                  {bettingClosed ? (
                    <p className="text-sm text-white/40">
                      Betting on this market is closed — waiting for the deadline so it can resolve.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>Your balance: {betTokenBalance.data != null ? formatUnits(betTokenBalance.data, BET_TOKEN_DECIMALS) : '…'} USDG</span>
                        {liveWeightBp != null && (
                          <span className="text-emerald-400/80">
                            Early-bet bonus: {(Number(liveWeightBp) / Number(BP_DENOMINATOR)).toFixed(2)}x
                          </span>
                        )}
                      </div>

                      {bothSidesUsed ? (
                        <p className="text-xs text-white/40">
                          You've already bet both YES and NO on this market — one bet per side, no more allowed.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setSide('YES')}
                              disabled={hasBetYes}
                              className={`py-2 rounded-lg text-sm font-medium border disabled:opacity-40 disabled:cursor-not-allowed ${side === 'YES' ? 'bg-emerald-500 text-black border-emerald-500' : 'border-white/10 text-white/60'}`}
                            >
                              YES{hasBetYes ? ' ✓' : ''}
                            </button>
                            <button
                              onClick={() => setSide('NO')}
                              disabled={hasBetNo}
                              className={`py-2 rounded-lg text-sm font-medium border disabled:opacity-40 disabled:cursor-not-allowed ${side === 'NO' ? 'bg-rose-500 text-black border-rose-500' : 'border-white/10 text-white/60'}`}
                            >
                              NO{hasBetNo ? ' ✓' : ''}
                            </button>
                          </div>

                          {sideAlreadyBet ? (
                            <p className="text-xs text-amber-400/80">
                              You've already bet {side === 'YES' ? 'YES' : 'NO'} on this market — pick the other side.
                            </p>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                                placeholder="Amount in USDG"
                              />
                              <p className="text-[11px] text-white/30">
                                USDG only for now — ETH support is planned for a future update. Want another token
                                supported? Let us know what you'd like next.
                              </p>
                              <button
                                onClick={handleBet}
                                disabled={!!tx}
                                className={`w-full rounded-lg text-black font-medium py-2 text-sm disabled:opacity-50 transition-colors ${
                                  side === 'YES' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'
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
                <button
                  onClick={() => handleClaimOrRefund('claim')}
                  disabled={!!tx || hasClaimed.data === true}
                  className="w-full rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold py-2 text-sm disabled:opacity-50 transition-all"
                >
                  {hasClaimed.data ? 'Already claimed' : tx ? tx.label : 'Claim winnings'}
                </button>
              )}

              {status === MarketStatusOnchain.Cancelled && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleClaimOrRefund('refund', MarketSideOnchain.YES)}
                    disabled={!!tx || (myStakeYes.data ?? 0n) === 0n}
                    className="rounded-lg bg-white/10 hover:bg-white/20 py-2 text-sm disabled:opacity-30"
                  >
                    Refund YES
                  </button>
                  <button
                    onClick={() => handleClaimOrRefund('refund', MarketSideOnchain.NO)}
                    disabled={!!tx || (myStakeNo.data ?? 0n) === 0n}
                    className="rounded-lg bg-white/10 hover:bg-white/20 py-2 text-sm disabled:opacity-30"
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
  )
}
