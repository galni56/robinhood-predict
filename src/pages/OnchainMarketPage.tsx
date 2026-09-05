import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodTestnet, wagmiConfig } from '@/chain/config'
import {
  BET_TOKEN_ADDRESS,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
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
      const amountWei = parseUnits(amount || '0', BET_TOKEN_DECIMALS)
      if (amountWei <= 0n) {
        setError('Сумма должна быть больше нуля')
        return
      }

      if ((allowance.data ?? 0n) < amountWei) {
        setTx({ label: 'Подтверди approve в кошельке…' })
        const approveHash = await writeContractAsync({
          address: BET_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [PREDICTION_MARKET_ADDRESS, amountWei],
        })
        setTx({ label: 'Ждём подтверждения approve…' })
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
      }

      setTx({ label: 'Подтверди ставку в кошельке…' })
      const betHash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'bet',
        args: [MARKET_ID, MarketSideOnchain[side], amountWei],
      })
      setTx({ label: 'Ждём подтверждения ставки…' })
      await waitForTransactionReceipt(wagmiConfig, { hash: betHash })

      setTx(null)
      await refetchAll()
    } catch (e) {
      setTx(null)
      setError(e instanceof Error ? e.message : 'Транзакция не прошла')
    }
  }

  async function handleResolve() {
    setError(null)
    try {
      setTx({ label: 'Подтверди resolve в кошельке…' })
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
      setError(e instanceof Error ? e.message : 'Транзакция не прошла')
    }
  }

  async function handleClaimOrRefund(fn: 'claim' | 'refund', side?: 0 | 1) {
    setError(null)
    try {
      setTx({ label: `Подтверди ${fn} в кошельке…` })
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
      setError(e instanceof Error ? e.message : 'Транзакция не прошла')
    }
  }

  const status = market.data?.status
  const deadlineMs = market.data ? Number(market.data.deadline) * 1000 : 0
  const totalPool = market.data ? market.data.poolYes + market.data.poolNo : 0n
  const yesPct = market.data && totalPool > 0n ? Number((market.data.poolYes * 10000n) / totalPool) / 100 : 50

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        ⛓️ Это <b>реальный режим</b> — настоящие транзакции на Robinhood Chain testnet через твой кошелёк
        (MetaMask/Phantom). Не мок: газ и токены здесь тестовые, но транзакции идут по-настоящему в блокчейн.
      </div>

      <Link to="/onchain" className="text-sm text-white/40 hover:text-white/70">
        ← Все ончейн-рынки
      </Link>
      <h1 className="text-xl font-semibold my-4">Ончейн-рынок #{MARKET_ID.toString()}</h1>

      {/* Market data is a public read — shown regardless of wallet connection. */}
      {market.isLoading ? (
        <p className="text-white/50">Загрузка рынка…</p>
      ) : !market.data ? (
        <p className="text-rose-400">Рынок не найден.</p>
      ) : (
        <div className="rounded-lg border border-white/10 p-4 space-y-2 mb-4">
          <div className="text-white/50 text-xs">
            Статус: {status === MarketStatusOnchain.Open ? 'открыт' : status === MarketStatusOnchain.Resolved ? 'резолвнут' : 'отменён'}
          </div>
          <div className="text-lg">
            Цель: {targetPriceUsd != null ? formatUsd(targetPriceUsd) : '…'} · Сейчас: {currentPriceUsd != null ? formatUsd(currentPriceUsd) : '…'}
          </div>
          <div className="text-sm text-white/50">{status === MarketStatusOnchain.Open ? formatCountdown(deadlineMs - Date.now()) : ''}</div>
          <div className="h-2 rounded-full bg-rose-500/30 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%` }} />
          </div>
          <div className="text-xs text-white/40">
            Пул YES: {formatUnits(market.data.poolYes, BET_TOKEN_DECIMALS)} mUSD · Пул NO: {formatUnits(market.data.poolNo, BET_TOKEN_DECIMALS)} mUSD
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
              className="w-full rounded-lg border border-white/10 px-4 py-2 text-left hover:border-emerald-400/50 transition-colors"
            >
              Подключить {c.name}
            </button>
          ))}
          {connectors.length === 0 && (
            <p className="text-sm text-white/50">Не найден ни один кошелёк (MetaMask/Phantom). Установи расширение и обнови страницу.</p>
          )}
        </div>
      ) : !onRightChain ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Неправильная сеть. Нужна Robinhood Chain Testnet.
          <button
            onClick={() => switchChain({ chainId: robinhoodTestnet.id })}
            disabled={isSwitching}
            className="ml-3 rounded-md bg-amber-500 text-black px-3 py-1 font-medium"
          >
            Переключить сеть
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>{address}</span>
            <button onClick={() => disconnect()} className="text-white/40 hover:text-white">
              Отключить
            </button>
          </div>

          {market.data && (
            <>
              {status === MarketStatusOnchain.Open && (
                <>
                  {deadlineMs <= Date.now() && (
                    <button onClick={handleResolve} className="w-full rounded-lg bg-white/10 hover:bg-white/20 py-2 text-sm">
                      Resolve сейчас (дедлайн прошёл)
                    </button>
                  )}

                  <div className="rounded-lg border border-white/10 p-4 space-y-3">
                    <div className="text-xs text-white/50">
                      Твой баланс: {betTokenBalance.data != null ? formatUnits(betTokenBalance.data, BET_TOKEN_DECIMALS) : '…'} mUSD
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSide('YES')}
                        className={`py-2 rounded-lg text-sm font-medium border ${side === 'YES' ? 'bg-emerald-500 text-black border-emerald-500' : 'border-white/10 text-white/60'}`}
                      >
                        ЗА (YES)
                      </button>
                      <button
                        onClick={() => setSide('NO')}
                        className={`py-2 rounded-lg text-sm font-medium border ${side === 'NO' ? 'bg-rose-500 text-black border-rose-500' : 'border-white/10 text-white/60'}`}
                      >
                        ПРОТИВ (NO)
                      </button>
                    </div>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                      placeholder="Сумма в mUSD"
                    />
                    <button
                      onClick={handleBet}
                      disabled={!!tx}
                      className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 text-sm disabled:opacity-50"
                    >
                      {tx ? tx.label : 'Сделать ставку (approve + bet)'}
                    </button>
                  </div>
                </>
              )}

              {status === MarketStatusOnchain.Resolved && (
                <button
                  onClick={() => handleClaimOrRefund('claim')}
                  disabled={!!tx || hasClaimed.data === true}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 text-sm disabled:opacity-50"
                >
                  {hasClaimed.data ? 'Уже забрано' : tx ? tx.label : 'Забрать выигрыш (claim)'}
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
