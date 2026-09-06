import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodTestnet, wagmiConfig } from '@/chain/config'
import {
  BET_TOKEN_ADDRESS,
  BP_DENOMINATOR,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  bettingWindowEndSeconds,
  currentWeightBp,
  erc20Abi,
  predictionMarketAbi,
} from '@/chain/contracts'
import { formatCountdown, formatUsd } from '@/lib/format'

const BET_TOKEN_DECIMALS = 18

type TxState = { label: string } | null

export function OnchainMarketPage() {
  const { id = '0' } = useParams()
  const MARKET_ID = BigInt(id)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connectors, connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('10')
  const [tx, setTx] = useState<TxState>(null)
  const [error, setError] = useState<string | null>(null)

  const onRightChain = chainId === robinhoodTestnet.id

  const market = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'getMarket',
    args: [MARKET_ID],
  })

  const feedAddress = market.data?.priceFeed

  const feedDecimals = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'decimals',
    query: { enabled: !!feedAddress },
  })

  const feedPrice = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'latestRoundData',
    query: { enabled: !!feedAddress, refetchInterval: 15_000 },
  })

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
    if (!market.data || feedDecimals.data == null) return null
    return Number(formatUnits(market.data.targetPrice, feedDecimals.data))
  }, [market.data, feedDecimals.data])

  const currentPriceUsd = useMemo(() => {
    if (!feedPrice.data || feedDecimals.data == null) return null
    return Number(formatUnits(feedPrice.data[1], feedDecimals.data))
  }, [feedPrice.data, feedDecimals.data])

  async function refetchAll() {
    await Promise.all([market.refetch(), betTokenBalance.refetch(), allowance.refetch(), myStakeYes.refetch(), myStakeNo.refetch(), hasClaimed.refetch()])
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
      setError(e instanceof Error ? e.message : 'Transaction failed')
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
      setError(e instanceof Error ? e.message : 'Transaction failed')
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
      setError(e instanceof Error ? e.message : 'Transaction failed')
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        ⛓️ This is <b>real mode</b> — actual transactions on Robinhood Chain testnet through your wallet
        (MetaMask/Phantom). Not a mock: gas and tokens are test units, but the transactions really go on-chain.
      </div>

      <Link to="/onchain" className="text-sm text-white/40 hover:text-white/70">
        ← All on-chain markets
      </Link>
      <h1 className="text-xl font-semibold my-4">On-chain market #{MARKET_ID.toString()}</h1>

      {/* Market data is a public read — shown regardless of wallet connection. */}
      {market.isLoading ? (
        <p className="text-white/50">Loading market…</p>
      ) : !market.data ? (
        <p className="text-rose-400">Market not found.</p>
      ) : (
        <div className="rounded-lg border border-white/10 p-4 space-y-2 mb-4">
          <div className="text-white/50 text-xs">
            Status: {status === MarketStatusOnchain.Open ? 'open' : status === MarketStatusOnchain.Resolved ? 'resolved' : 'cancelled'}
          </div>
          <div className="text-lg">
            Target: {targetPriceUsd != null ? formatUsd(targetPriceUsd) : '…'} · Now: {currentPriceUsd != null ? formatUsd(currentPriceUsd) : '…'}
          </div>
          <div className="text-sm text-white/50">
            {status === MarketStatusOnchain.Open &&
              (bettingClosed
                ? `Betting closed, waiting to resolve: ${formatCountdown(deadlineMs - Date.now())}`
                : `Betting open for: ${formatCountdown(bettingWindowEndMs - Date.now())}`)}
          </div>
          <div className="h-2 rounded-full bg-rose-500/30 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%` }} />
          </div>
          <div className="text-xs text-white/40">
            YES pool: {formatUnits(market.data.poolYes, BET_TOKEN_DECIMALS)} mUSD · NO pool: {formatUnits(market.data.poolNo, BET_TOKEN_DECIMALS)} mUSD
          </div>
        </div>
      )}

      {!isConnected ? (
        <div className="space-y-2">
          {connectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => connect({ connector: c })}
              disabled={isConnecting}
              className="w-full rounded-lg border border-white/10 px-4 py-2 text-left hover:border-[#C6FF3D]/50 transition-colors"
            >
              Connect {c.name}
            </button>
          ))}
          {connectors.length === 0 && (
            <p className="text-sm text-white/50">No wallet found (MetaMask/Phantom). Install the extension and reload the page.</p>
          )}
        </div>
      ) : !onRightChain ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Wrong network. You need Robinhood Chain Testnet.
          <button
            onClick={() => switchChain({ chainId: robinhoodTestnet.id })}
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
                        <span>Your balance: {betTokenBalance.data != null ? formatUnits(betTokenBalance.data, BET_TOKEN_DECIMALS) : '…'} mUSD</span>
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
                                placeholder="Amount in mUSD"
                              />
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
