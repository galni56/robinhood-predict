import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  ASSET_RACE_STATUS,
  ASSET_RACE_ORIGIN,
  assetRaceCategoryLabel,
  assetRaceStatusLabel,
  raceModeForCategory,
} from '@/chain/assetRaces'
import {
  formatUsdCents,
  freezeStakeQuote,
  parseTokenAmount,
  stakeGuardrailMessage,
  stakeGuardrailViolation,
  stakeQuoteErrorMessage,
  type FrozenStakeQuote,
  type StakeInputUnit,
} from '@/chain/stakeQuote'
import {
  addLobbyAssetInstructions,
  betInstructions,
  openBettingInstructions,
  settleRaceInstructions,
  type RaceSettlementAction,
} from '@/chain/gameTx'
import { useAssetRace } from '@/chain/useAssetRace'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useLivePrices } from '@/chain/livePrices'
import { priceSourceUrlForAssetId } from '@/chain/assetRaceRegistry'
import { AssetRaceBettingView } from '@/components/AssetRaceBettingView'
import { AssetRaceLiveView } from '@/components/AssetRaceLiveView'
import { AssetRaceLobbyView } from '@/components/AssetRaceLobbyView'
import { AssetRaceResultView } from '@/components/AssetRaceResultView'
import { AddressLabel } from '@/components/AddressLabel'
import { InfoBanner } from '@/components/InfoBanner'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { TokenLogo } from '@/components/TokenLogo'
import { SOLANA_CLUSTER } from '@/solana/config'
import { useStakeBalance, useStakeToken } from '@/solana/stakeTokens'
import { usePrograms } from '@/solana/programs'
import { useSendInstructions } from '@/solana/tx'
import { formatUnits, shortTxError } from '@/lib/format'

type TxState = { label: string } | null

function parseRaceId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function hexToBytes(hex: string) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return Uint8Array.from(clean.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16))
}

export function OnchainRacePage() {
  const { raceId: routeRaceId } = useParams()
  const raceId = parseRaceId(routeRaceId)
  const { publicKey, connected } = useWallet()
  const { games } = usePrograms()
  const send = useSendInstructions()
  const queryClient = useQueryClient()
  const { race, position, settlement, isLoading, error: readError, refetch } = useAssetRace(raceId, publicKey)
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0)
  const betFormOwner = `${raceId?.toString() ?? ''}:${publicKey?.toBase58() ?? ''}`
  const [amountState, setAmountState] = useState({ owner: betFormOwner, value: '' })
  const amount = amountState.owner === betFormOwner ? amountState.value : ''
  const setAmount = (value: string) => setAmountState({ owner: betFormOwner, value })
  const [stakeInputUnit, setStakeInputUnit] = useState<StakeInputUnit>('USD')
  const [tx, setTx] = useState<TxState>(null)
  const [frozenBetQuote, setFrozenBetQuote] = useState<FrozenStakeQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const raceNowMs = useAssetRaceClock()
  const live = useLivePrices()
  // SOL stakes are entered in USD or SOL at the live rate; SPL stakes in their own units.
  const token = useStakeToken(race?.stakeMint)
  const usdQuoted = token?.native ?? true
  const balance = useStakeBalance(token)

  let quotedBet: FrozenStakeQuote | undefined
  try {
    quotedBet = live.solUsd ? freezeStakeQuote(amount, stakeInputUnit, live.solUsd) : undefined
  } catch {
    quotedBet = undefined
  }
  const displayedBetQuote = frozenBetQuote ?? quotedBet
  let tokenBetAmount = 0n
  try {
    tokenBetAmount = !usdQuoted && token && amount.trim() ? parseTokenAmount(amount, token.decimals) : 0n
  } catch {
    tokenBetAmount = 0n
  }
  const displayedBetAmount = usdQuoted ? displayedBetQuote?.lamports ?? 0n : tokenBetAmount

  async function refetchAll() {
    await Promise.all([
      refetch(),
      balance.refetch(),
      queryClient.invalidateQueries({ queryKey: ['history'] }),
    ])
  }

  async function handleBet() {
    setError(null)
    try {
      if (raceId == null || !race || !publicKey || !token) return
      let frozen: FrozenStakeQuote | null = null
      if (usdQuoted) {
        if (!live.solUsd) throw new Error('SolUsdQuoteStale')
        frozen = freezeStakeQuote(amount, stakeInputUnit, live.solUsd)
      }
      const betAmount = frozen ? frozen.lamports : parseTokenAmount(amount, token.decimals)
      const violation = stakeGuardrailViolation(betAmount, {
        minInitial: race.minStake,
        maxCumulative: race.maxStakePerWallet,
        existingStake: position?.stake ?? 0n,
        initialStake: !position?.exists,
      })
      if (violation) {
        setError(stakeGuardrailMessage(violation))
        return
      }
      setFrozenBetQuote(frozen)
      const assetIndex = position?.exists ? position.assetIndex : selectedAssetIndex
      setTx({ label: 'Confirm race bet in wallet…' })
      const instructions = await betInstructions(games, {
        race: race.address,
        stakeMint: race.stakeMint,
        bettor: publicKey,
        assetIndex,
        amount: betAmount,
      })
      setTx({ label: 'Waiting for bet confirmation…' })
      await send(instructions)
      setTx(null)
      setFrozenBetQuote(null)
      setAmount('')
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setFrozenBetQuote(null)
      setError(stakeQuoteErrorMessage(cause) ?? shortTxError(cause, 'race-bet'))
    }
  }

  async function handleSettlement(action: RaceSettlementAction) {
    setError(null)
    try {
      if (!race || !publicKey) return
      const label = action === 'claim' ? 'claim' : action === 'refund' ? 'refund' : 'close'
      setTx({ label: `Confirm ${label} in wallet…` })
      const instructions = await settleRaceInstructions(games, { race: race.address, stakeMint: race.stakeMint, owner: publicKey, action })
      setTx({ label: `Waiting for ${label} confirmation…` })
      await send(instructions)
      setTx(null)
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(shortTxError(cause, 'race-settlement'))
    }
  }

  async function handleLobbyAction(kind: 'addLobbyAsset' | 'openBetting', assetId?: string) {
    setError(null)
    try {
      if (!race || !publicKey) return
      setTx({ label: kind === 'addLobbyAsset' ? 'Confirm asset addition…' : 'Confirm betting transition…' })
      const instructions = kind === 'addLobbyAsset'
        ? await addLobbyAssetInstructions(games, { race: race.address, adder: publicKey, assetId: hexToBytes(assetId!) })
        : await openBettingInstructions(games, { race: race.address })
      setTx({ label: 'Waiting for confirmation…' })
      await send(instructions)
      setTx(null)
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(shortTxError(cause, 'race-lobby'))
    }
  }

  if (raceId == null) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-rose-300">Invalid race ID.</div>
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <InfoBanner tone="warning" className="mb-5">
        {SOLANA_CLUSTER === 'mainnet-beta'
          ? 'Live Asset Race on Solana. Enter the stake in USD or SOL; your wallet sends SOL directly to the race account.'
          : `Solana ${SOLANA_CLUSTER} test race - test SOL only, no real funds. Prices come from live mainnet pools.`}
      </InfoBanner>

      <Link to={`/onchain/races${race ? `?mode=${raceModeForCategory(race.category)}` : ''}`} className="text-sm font-bold text-white/40 transition-colors hover:text-white/70">← All races</Link>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-white/40">Loading race…</p>
      ) : readError ? (
        <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read race #{raceId.toString()}.</div>
      ) : !race ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-[#241b2f]/95 p-8 text-center text-white/45">Race not found.</div>
      ) : (
        <div className={race.category === 1 ? 'asset-race-meme' : ''}>
          <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex shrink-0 -space-x-2 pt-1">
                {race.assets.slice(0, 4).map((asset) => <TokenLogo key={asset.assetIndex} ticker={asset.symbol} className="h-10 w-10 rounded-xl border-2 border-[#17111f]" />)}
              </div>
              <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#F2A65A]">
                {assetRaceCategoryLabel(race.category)} race #{race.id.toString()}
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${race.origin === ASSET_RACE_ORIGIN.PLATFORM ? 'bg-[#F2A65A]/15 text-[#F2A65A]' : 'bg-white/5 text-white/50'}`}>
                  {race.origin === ASSET_RACE_ORIGIN.PLATFORM ? 'Featured' : 'Community'}
                </span>
              </p>
              <h1 className="mt-1 break-words font-display text-2xl font-bold tracking-tight sm:text-4xl">{race.title || race.assets.map((asset) => asset.symbol).join(' vs ')}</h1>
              {race.origin === ASSET_RACE_ORIGIN.PLATFORM ? (
                <p className="mt-1 text-xs font-medium text-white/40">Created by Prophet</p>
              ) : (
                <p className="mt-1 text-xs font-medium text-white/40">Created by <AddressLabel address={race.creator} className="font-bold text-white/65" /></p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Participating asset price charts">
                {race.assets.map((asset) => (
                  <PriceSourceLink
                    key={asset.assetIndex}
                    href={priceSourceUrlForAssetId(asset.assetId)}
                    symbol={asset.symbol}
                    tone="race"
                    label={`${asset.symbol} chart`}
                    className="bg-[#F2A65A]/10 px-2.5 py-1"
                  />
                ))}
              </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ShareInviteButton kind="race" id={race.id} />
              <span className="rounded-full bg-[#F2A65A]/15 px-3 py-1 text-xs font-bold text-[#F2A65A]">{assetRaceStatusLabel(race.status)}</span>
            </div>
          </div>

          {!token ? (
            <p className="py-10 text-center text-sm text-white/40">Loading stake currency…</p>
          ) : race.status === ASSET_RACE_STATUS.LOBBY ? (
            <AssetRaceLobbyView
              race={race}
              nowMs={raceNowMs}
              isConnected={connected}
              hasAddedAsset={!!publicKey && race.lobbyAdders.includes(publicKey.toBase58())}
              onAddAsset={(assetId) => handleLobbyAction('addLobbyAsset', assetId)}
              onOpenBetting={() => handleLobbyAction('openBetting')}
              txLabel={tx?.label ?? null}
              error={error}
            />
          ) : race.status === ASSET_RACE_STATUS.BETTING ? (
            <AssetRaceBettingView
              race={race}
              position={position}
              selectedAssetIndex={position?.exists ? position.assetIndex : selectedAssetIndex}
              setSelectedAssetIndex={setSelectedAssetIndex}
              amount={amount}
              setAmount={setAmount}
              inputUnit={stakeInputUnit}
              setInputUnit={(unit) => {
                if (unit === stakeInputUnit) return
                setStakeInputUnit(unit)
                setAmount('')
                setFrozenBetQuote(null)
                setError(null)
              }}
              balance={balance.data}
              isConnected={connected}
              onBet={handleBet}
              txLabel={tx?.label ?? null}
              error={error}
              nowMs={raceNowMs}
              tokenDecimals={token.decimals}
              tokenLabel={token.symbol}
              amountRaw={displayedBetAmount}
              exactAmount={displayedBetAmount > 0n ? formatUnits(displayedBetAmount, token.decimals) : null}
              equivalentUsd={usdQuoted && displayedBetQuote ? formatUsdCents(displayedBetQuote.usdCents) : null}
              quoteReady={!usdQuoted || !!live.solUsd}
              usdQuoted={usdQuoted}
            />
          ) : race.status === ASSET_RACE_STATUS.RUNNING ? (
            <AssetRaceLiveView race={race} position={position} nowMs={raceNowMs} tokenDecimals={token.decimals} tokenLabel={token.symbol} />
          ) : (
            <AssetRaceResultView
              race={race}
              position={position}
              settlement={settlement}
              isConnected={connected}
              onClaim={() => handleSettlement('claim')}
              onRefund={() => handleSettlement('refund')}
              onCloseLosing={() => handleSettlement('closeLosing')}
              txLabel={tx?.label ?? null}
              error={error}
              tokenDecimals={token.decimals}
              tokenLabel={token.symbol}
            />
          )}
        </div>
      )}
    </div>
  )
}
