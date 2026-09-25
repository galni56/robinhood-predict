import { useState } from 'react'
import { formatUnits } from 'viem'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { assetRaceChain, robinhoodMainnet, wagmiConfig } from '@/chain/config'
import {
  LEGACY_ASSET_RACE_ADDRESS,
  LEGACY_CHAINLINK_PREDICTION_MARKET_ADDRESS,
  LEGACY_PRICE_ARENA_ADDRESS,
  LEGACY_USDG_ADDRESS,
  erc20Abi,
  predictionMarketAbi,
  USDG_DEADLINE_PREDICTION_MARKET_ADDRESS,
} from '@/chain/contracts'
import { assetRaceAbi } from '@/chain/assetRaces'
import { priceArenaAbi } from '@/chain/priceArena'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { shortTxError } from '@/lib/format'

type LegacyProduct = 'deadlineMarket' | 'chainlinkMarket' | 'race' | 'arena'

const PRODUCT = {
  deadlineMarket: { label: 'Deadline Prediction Market', address: USDG_DEADLINE_PREDICTION_MARKET_ADDRESS },
  chainlinkMarket: { label: 'Older Chainlink Market', address: LEGACY_CHAINLINK_PREDICTION_MARKET_ADDRESS },
  race: { label: 'Asset Race', address: LEGACY_ASSET_RACE_ADDRESS },
  arena: { label: 'Price Arena', address: LEGACY_PRICE_ARENA_ADDRESS },
} as const

function parseGameId(value: string) {
  if (!/^\d+$/.test(value.trim())) throw new Error('Enter a valid non-negative game ID')
  return BigInt(value.trim())
}

function LegacyClaimCard({ product }: { product: LegacyProduct }) {
  const { writeContractAsync } = useWriteContract()
  const [gameId, setGameId] = useState('')
  const [side, setSide] = useState<0 | 1>(0)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const meta = PRODUCT[product]

  async function submit(action: 'claim' | 'refund') {
    setError(null)
    try {
      const id = parseGameId(gameId)
      setPending(`Confirm legacy ${action}…`)
      const hash = product === 'deadlineMarket' || product === 'chainlinkMarket'
        ? action === 'claim'
          ? await writeContractAsync({ address: meta.address, chainId: assetRaceChain.id, abi: predictionMarketAbi, functionName: 'claim', args: [id] })
          : await writeContractAsync({ address: meta.address, chainId: assetRaceChain.id, abi: predictionMarketAbi, functionName: 'refund', args: [id, side] })
        : product === 'race'
          ? await writeContractAsync({ address: meta.address, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: action, args: [id] })
          : await writeContractAsync({ address: meta.address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: action, args: [id] })
      setPending('Waiting for confirmation…')
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      setPending(null)
    } catch (cause) {
      setPending(null)
      setError(shortTxError(cause))
    }
  }

  return (
    <section className="rounded-3xl border border-white/5 bg-[#241b2f] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{meta.label}</h2>
          <p className="mt-1 text-xs text-white/35">USDG claim/refund contract</p>
        </div>
        <a href={`${robinhoodMainnet.blockExplorers.default.url}/address/${meta.address}`} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-[#B3A7FA] hover:text-white">{meta.address}</a>
      </div>
      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm text-white/50">{product === 'deadlineMarket' || product === 'chainlinkMarket' ? 'Market' : product === 'race' ? 'Race' : 'Arena'} ID</span>
        <input value={gameId} onChange={(event) => setGameId(event.target.value)} inputMode="numeric" placeholder="0" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono outline-none focus:border-[#8B7CF7]" />
      </label>
      {(product === 'deadlineMarket' || product === 'chainlinkMarket') && (
        <div className="mt-4">
          <div className="mb-1.5 text-sm text-white/50">Refund side</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSide(0)} className={`rounded-xl border px-4 py-2 text-sm font-bold ${side === 0 ? 'border-[#8B7CF7] bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'border-white/10 text-white/45'}`}>YES</button>
            <button onClick={() => setSide(1)} className={`rounded-xl border px-4 py-2 text-sm font-bold ${side === 1 ? 'border-[#F2A65A] bg-[#F2A65A]/10 text-[#F2A65A]' : 'border-white/10 text-white/45'}`}>NO</button>
          </div>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={() => submit('claim')} disabled={!!pending || !gameId.trim()} className="rounded-xl bg-[#8B7CF7] px-4 py-3 text-sm font-bold disabled:opacity-40">{pending ?? 'Claim USDG'}</button>
        <button onClick={() => submit('refund')} disabled={!!pending || !gameId.trim()} className="rounded-xl bg-[#F2A65A] px-4 py-3 text-sm font-bold text-[#3b2416] disabled:opacity-40">{pending ?? 'Refund USDG'}</button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
    </section>
  )
}

export function LegacyUsdRecoveryPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const balance = useReadContract({
    address: LEGACY_USDG_ADDRESS,
    chainId: assetRaceChain.id,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm font-bold text-[#F2A65A]">Legacy recovery</p>
      <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Claim or refund old USDG positions.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50">New native-ETH deployments use ETH. This page preserves access to both PredictionMarket generations and the USDG Race/Arena contracts so existing positions are not stranded. It never creates a new bet and does not require an approval.</p>

      <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
        Verify the product and numeric ID before signing. A claim works for a resolved winning position; a refund works only for a cancelled game. Failed eligibility checks revert without transferring USDG.
      </div>

      {!isConnected ? <div className="mt-6 max-w-xl"><WalletOptionsList /></div>
        : chainId !== assetRaceChain.id ? <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="mt-6 rounded-xl bg-[#F2A65A] px-6 py-3 font-bold text-[#3b2416]">Switch to {assetRaceChain.name}</button>
          : <>
            <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-sm text-white/60">Legacy USDG wallet balance: <span className="font-mono font-bold text-white">{balance.data == null ? '…' : formatUnits(balance.data, 6)} USDG</span></div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <LegacyClaimCard product="deadlineMarket" />
              <LegacyClaimCard product="chainlinkMarket" />
              <LegacyClaimCard product="race" />
              <LegacyClaimCard product="arena" />
            </div>
          </>}
    </div>
  )
}
