import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  ASSET_RACE_STATUS,
  ASSET_RACE_ORIGIN,
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
import { AssetRaceBettingView } from '@/components/AssetRaceBettingView'
import { AssetRaceLobbyView } from '@/components/AssetRaceLobbyView'
import { AssetRaceResultView } from '@/components/AssetRaceResultView'
import { AddressLabel } from '@/components/AddressLabel'
import { ClusterBanner } from '@/components/ClusterBanner'
import { ShareInviteButton } from '@/components/ShareInviteButton'

import { useStakeBalance, useStakeToken } from '@/solana/stakeTokens'
import { usePrograms } from '@/solana/programs'
import { TxUnconfirmedError, useSendInstructions } from '@/solana/tx'
import { formatUnits, formatCountdown, shortTxError } from '@/lib/format'
import { formatStakeAmount } from '@/solana/stakeTokens'
import { CREAM, INK, PINK, SKY, YELLOW } from '@/retro/scene'
import { PIXEL, RaceBoard, ScoreBoard, TimerBox, YourBetCard, raceLanes } from '@/retro/race'

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
      setTx({ label: 'Preparing race bet…' })
      const instructions = await betInstructions(games, {
        race: race.address,
        stakeMint: race.stakeMint,
        bettor: publicKey,
        assetIndex,
        amount: betAmount,
      })
      await send(instructions, {
        onPhase: (phase) =>
          setTx({ label: phase === 'signing' ? 'Confirm race bet in wallet…' : 'Waiting for bet confirmation…' }),
      })
      setTx(null)
      setFrozenBetQuote(null)
      setAmount('')
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setFrozenBetQuote(null)
      setError(stakeQuoteErrorMessage(cause) ?? shortTxError(cause, 'race-bet'))
      // Unknown outcome: the bet may have landed. Refresh so the UI shows
      // the real position instead of inviting a duplicate bet.
      if (cause instanceof TxUnconfirmedError) void refetchAll()
    }
  }

  async function handleSettlement(action: RaceSettlementAction) {
    setError(null)
    try {
      if (!race || !publicKey) return
      const label = action === 'claim' ? 'claim' : action === 'refund' ? 'refund' : 'close'
      setTx({ label: `Preparing ${label}…` })
      const instructions = await settleRaceInstructions(games, { race: race.address, stakeMint: race.stakeMint, owner: publicKey, action })
      await send(instructions, {
        onPhase: (phase) =>
          setTx({ label: phase === 'signing' ? `Confirm ${label} in wallet…` : `Waiting for ${label} confirmation…` }),
      })
      setTx(null)
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(shortTxError(cause, 'race-settlement'))
      if (cause instanceof TxUnconfirmedError) void refetchAll()
    }
  }

  async function handleLobbyAction(kind: 'addLobbyAsset' | 'openBetting', assetId?: string) {
    setError(null)
    try {
      if (!race || !publicKey) return
      setTx({ label: kind === 'addLobbyAsset' ? 'Preparing asset addition…' : 'Preparing betting transition…' })
      const instructions = kind === 'addLobbyAsset'
        ? await addLobbyAssetInstructions(games, { race: race.address, adder: publicKey, assetId: hexToBytes(assetId!) })
        : await openBettingInstructions(games, { race: race.address })
      await send(instructions, {
        onPhase: (phase) =>
          setTx({ label: phase === 'signing' ? 'Confirm in wallet…' : 'Waiting for confirmation…' }),
      })
      setTx(null)
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(shortTxError(cause, 'race-lobby'))
      if (cause instanceof TxUnconfirmedError) void refetchAll()
    }
  }

  if (raceId == null) {
    return <div style={{ padding: 48, textAlign: 'center', fontFamily: PIXEL, fontSize: 12 }}>INVALID RACE ID</div>
  }

  const statusChip = race
    ? race.status === ASSET_RACE_STATUS.RUNNING
      ? { text: 'LIVE', bg: PINK, blink: true }
      : race.status === ASSET_RACE_STATUS.BETTING
        ? { text: 'BETTING', bg: YELLOW, blink: true }
        : race.status === ASSET_RACE_STATUS.LOBBY
          ? { text: 'LOBBY', bg: SKY, blink: false }
          : { text: assetRaceStatusLabel(race.status), bg: CREAM, blink: false }
    : null

  const timer = race
    ? race.status === ASSET_RACE_STATUS.BETTING
      ? { label: 'betting closes', value: raceNowMs ? formatCountdown(Number(race.bettingEndTime) * 1_000 - raceNowMs) : '…' }
      : race.status === ASSET_RACE_STATUS.RUNNING
        ? { label: 'to finish', value: raceNowMs ? formatCountdown(Number(race.raceEndTime) * 1_000 - raceNowMs) : '…' }
        : null
    : null

  const yourLane = race && position?.exists ? raceLanes(race, race.status >= 2).lanes.find((lane) => lane.assetIndex === position.assetIndex) : undefined
  const yourRank = race && position?.exists
    ? [...raceLanes(race, race.status >= 2).lanes].sort((a, b) => (a.returnValue > b.returnValue ? -1 : 1)).findIndex((lane) => lane.assetIndex === position.assetIndex) + 1
    : 0
  const rankSuffix = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

  return (
    <div style={{ minHeight: '100%', fontFamily: "'Pixelify Sans', 'Courier New', monospace", color: INK, background: SKY }}>
      <main style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 32, padding: '32px clamp(16px, 4vw, 64px) 48px' }}>
        <div style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ClusterBanner />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 24px' }}>
            <Link to={`/onchain/races${race ? `?mode=${raceModeForCategory(race.category)}` : ''}`} style={{ fontSize: 20, fontWeight: 600 }}>
              ← All races
            </Link>
            {race && <ShareInviteButton kind="race" id={race.id} />}
          </div>

          {isLoading ? (
            <p style={{ padding: '64px 0', textAlign: 'center', fontFamily: PIXEL, fontSize: 12 }}>LOADING RACE…</p>
          ) : readError ? (
            <div className="rx-raised" style={{ background: CREAM, padding: 20, fontSize: 20, fontWeight: 600 }}>Could not read race #{raceId.toString()}. Refresh to retry.</div>
          ) : !race ? (
            <div className="rx-raised" style={{ background: CREAM, padding: 20, fontSize: 20, fontWeight: 600 }}>Race not found.</div>
          ) : (
            <>
              {/* Mock header row: RACE #N + status chip | timer */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px 24px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
                  <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2vw, 28px)', fontWeight: 400, lineHeight: 1.3, textShadow: `4px 4px 0 ${YELLOW}` }}>
                    RACE #{race.id.toString()}
                  </h1>
                  {statusChip && (
                    <span
                      className="rx-plate"
                      style={{ fontFamily: PIXEL, fontSize: 12, lineHeight: 1, background: statusChip.bg, padding: '10px 12px', ...(statusChip.blink ? { animation: 'rx-blink 1s steps(1) infinite' } : {}) }}
                    >
                      {statusChip.text}
                    </span>
                  )}
                </div>
                {timer && <TimerBox label={timer.label} value={timer.value} />}
              </div>

              {(race.title || race.origin === ASSET_RACE_ORIGIN.COMMUNITY) && (
                <p style={{ margin: '-8px 0 0', fontSize: 20, fontWeight: 600 }}>
                  {race.title}
                  {race.origin === ASSET_RACE_ORIGIN.COMMUNITY && (
                    <span style={{ fontWeight: 500, opacity: 0.7 }}> · by <AddressLabel address={race.creator} /></span>
                  )}
                </p>
              )}

              {!token ? (
                <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 20 }}>Loading stake currency…</p>
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
              ) : (
                <>
                  <RaceBoard race={race} final={race.status >= 2} />

                  {race.status === ASSET_RACE_STATUS.BETTING && (
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
                  )}

                  {race.status === ASSET_RACE_STATUS.RUNNING && (
                    <div className="rx-raised" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 24px', background: CREAM, padding: '16px 20px' }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Betting is closed - the field is racing.</p>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 500, opacity: 0.7 }}>Winners split the losing pools after the finish.</p>
                    </div>
                  )}

                  {race.status >= 2 && (
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
                </>
              )}
            </>
          )}
        </div>

        {race && token && race.status !== ASSET_RACE_STATUS.LOBBY && (
          <aside style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {position?.exists && yourLane && (
              <YourBetCard
                symbol={yourLane.symbol}
                line1={`${formatStakeAmount(position.stake, token)} on ${yourLane.symbol}`}
                line2={race.status === ASSET_RACE_STATUS.BETTING ? 'Locked until the finish' : yourRank > 0 ? `Now in ${yourRank}${rankSuffix(yourRank)} place` : ''}
              />
            )}
            <ScoreBoard race={race} final={race.status >= 2} bank={formatStakeAmount(race.totalPool, token)} />
          </aside>
        )}
      </main>
    </div>
  )
}
