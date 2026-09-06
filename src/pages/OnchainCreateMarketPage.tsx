import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, useReadContract, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodTestnet, wagmiConfig } from '@/chain/config'
import { DEFAULT_PRICE_FEED_ADDRESS, DEFAULT_PRICE_FEED_LABEL, PREDICTION_MARKET_ADDRESS, aggregatorV3Abi, predictionMarketAbi } from '@/chain/contracts'
import { formatUsd } from '@/lib/format'

const MAX_TARGET_PRICE_USD = 500

const DURATION_PRESETS = [
  { label: '1 час', seconds: 60 * 60 },
  { label: '24 часа', seconds: 24 * 60 * 60 },
  { label: '7 дней', seconds: 7 * 24 * 60 * 60 },
] as const

export function OnchainCreateMarketPage() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { writeContractAsync } = useWriteContract()

  const [target, setTarget] = useState('400')
  const [durationIdx, setDurationIdx] = useState(1)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const feedDecimals = useReadContract({
    address: DEFAULT_PRICE_FEED_ADDRESS,
    abi: aggregatorV3Abi,
    functionName: 'decimals',
  })

  const onRightChain = chainId === robinhoodTestnet.id

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const targetNum = Number(target)
    if (!(targetNum > 0) || targetNum > MAX_TARGET_PRICE_USD) {
      setError(`Целевая цена должна быть больше 0 и не больше ${formatUsd(MAX_TARGET_PRICE_USD, 0)}`)
      return
    }
    if (feedDecimals.data == null) {
      setError('Не удалось прочитать decimals() фида — попробуй ещё раз')
      return
    }

    try {
      setPending(true)
      const targetScaled = parseUnits(target, feedDecimals.data)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DURATION_PRESETS[durationIdx].seconds)

      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'createMarket',
        args: [DEFAULT_PRICE_FEED_ADDRESS, targetScaled, deadline, 0n, 0n],
      })
      await waitForTransactionReceipt(wagmiConfig, { hash })

      navigate('/onchain')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Транзакция не прошла')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">Создать ончейн-рынок</h1>
      <p className="text-white/50 text-sm mb-6">
        Реальная транзакция на тестнете. Целевая цена не выше {formatUsd(MAX_TARGET_PRICE_USD, 0)}. Пулы ЗА/ПРОТИВ
        стартуют с $0 — если к дедлайну ставки будут только с одной стороны, рынок отменится и деньги вернутся
        полностью.
      </p>

      {!isConnected ? (
        <p className="text-amber-400 text-sm">Сначала подключи кошелёк на странице списка рынков.</p>
      ) : !onRightChain ? (
        <p className="text-amber-400 text-sm">Переключись на Robinhood Chain Testnet.</p>
      ) : (
        <form onSubmit={onSubmit} className="bg-[#12121c]/95 border border-white/10 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Price feed</label>
            <div className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/70">
              {DEFAULT_PRICE_FEED_LABEL}
            </div>
            <p className="text-[11px] text-white/30 mt-1">
              Единственный allowlisted фид на тестнете сейчас — feed'ы добавляет только owner контракта.
            </p>
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1.5">Целевая цена, $ (макс. {formatUsd(MAX_TARGET_PRICE_USD, 0)})</label>
            <input
              type="number"
              min={1}
              max={MAX_TARGET_PRICE_USD}
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1.5">Дедлайн</label>
            <select
              value={durationIdx}
              onChange={(e) => setDurationIdx(Number(e.target.value))}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
            >
              {DURATION_PRESETS.map((d, i) => (
                <option key={d.label} value={i}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 text-sm transition-colors disabled:opacity-50"
          >
            {pending ? 'Подтверди в кошельке…' : 'Создать рынок'}
          </button>
        </form>
      )}
    </div>
  )
}
