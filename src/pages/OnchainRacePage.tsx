import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { parseUnits, zeroAddress, type Hex } from 'viem'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { assetRaceChain, isLocalAssetRace, wagmiConfig } from '@/chain/config'
import { erc20Abi } from '@/chain/contracts'
import {
  ASSET_RACE_ADDRESS,
  ASSET_RACE_CONFIG_ERROR,
  ASSET_RACE_STATUS,
  ASSET_RACE_ORIGIN,
  ASSET_RACE_TOKEN_LABEL,
  USDG_DECIMALS,
  assetRaceAbi,
  assetRaceCategoryLabel,
  assetRaceStatusLabel,
  raceModeForCategory,
} from '@/chain/assetRaces'
import { useAssetRace } from '@/chain/useAssetRace'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { AssetRaceBettingView } from '@/components/AssetRaceBettingView'
import { AssetRaceLiveView } from '@/components/AssetRaceLiveView'
import { AssetRaceLobbyView } from '@/components/AssetRaceLobbyView'
import { AssetRaceResultView } from '@/components/AssetRaceResultView'
import { AddressLabel } from '@/components/AddressLabel'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { TokenLogo } from '@/components/TokenLogo'
import { shortTxError } from '@/lib/format'

type TxState = { label: string } | null

function parseRaceId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

export function OnchainRacePage() {
  const { raceId: routeRaceId } = useParams()
  const raceId = parseRaceId(routeRaceId)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { race, position, isPreview, isLoading, error: readError, refetch } = useAssetRace(raceId, address)
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0)
  const betFormOwner = `${raceId?.toString() ?? ''}:${address ?? ''}`
  const [amountState, setAmountState] = useState({ owner: betFormOwner, value: '' })
  const amount = amountState.owner === betFormOwner ? amountState.value : ''
  const setAmount = (value: string) => setAmountState({ owner: betFormOwner, value })
  const [tx, setTx] = useState<TxState>(null)
  const [error, setError] = useState<string | null>(null)
  const raceNowMs = useAssetRaceClock()

  const readRaceAddress = ASSET_RACE_ADDRESS ?? zeroAddress
  const betTokenQuery = useReadContract({
    address: readRaceAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'betToken',
    query: { enabled: !!ASSET_RACE_ADDRESS },
  })
  const betTokenAddress = betTokenQuery.data ?? zeroAddress
  const tokenDecimalsQuery = useReadContract({
    address: betTokenAddress,
    chainId: assetRaceChain.id,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: !!betTokenQuery.data },
  })
  const tokenDecimals = Number(tokenDecimalsQuery.data ?? USDG_DECIMALS)
  const allowance = useReadContract({
    address: betTokenAddress,
    chainId: assetRaceChain.id,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && ASSET_RACE_ADDRESS ? [address, ASSET_RACE_ADDRESS] : undefined,
    query: { enabled: !!address && !!ASSET_RACE_ADDRESS && !!betTokenQuery.data },
  })
  const balance = useReadContract({
    address: betTokenAddress,
    chainId: assetRaceChain.id,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!ASSET_RACE_ADDRESS && !!betTokenQuery.data },
  })
  const lobbyAddition = useReadContract({
    address: readRaceAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'lobbyAssetAddedByWallet',
    args: raceId != null && address ? [raceId, address] : undefined,
    query: { enabled: !!ASSET_RACE_ADDRESS && raceId != null && !!address },
  })

  const onRightChain = chainId === assetRaceChain.id

  async function refetchAll() {
    await Promise.all([refetch(), allowance.refetch(), balance.refetch(), betTokenQuery.refetch(), tokenDecimalsQuery.refetch(), lobbyAddition.refetch()])
  }

  async function handleBet() {
    setError(null)
    try {
      if (!ASSET_RACE_ADDRESS || raceId == null || !race) return
      const amountRaw = parseUnits(amount || '0', tokenDecimals)
      if (amountRaw <= 0n) throw new Error('Amount must be greater than zero')
      const assetIndex = position?.exists ? position.assetIndex : selectedAssetIndex

      if ((allowance.data ?? 0n) < amountRaw) {
        setTx({ label: 'Confirm approval in wallet…' })
        const approvalHash = await writeContractAsync({
          address: betTokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ASSET_RACE_ADDRESS, amountRaw],
        })
        setTx({ label: 'Waiting for approval…' })
        await waitForTransactionReceipt(wagmiConfig, { hash: approvalHash })
      }

      setTx({ label: 'Confirm race bet in wallet…' })
      const betHash = await writeContractAsync({
        address: ASSET_RACE_ADDRESS,
        abi: assetRaceAbi,
        functionName: 'bet',
        args: [raceId, assetIndex, amountRaw],
      })
      setTx({ label: 'Waiting for bet confirmation…' })
      await waitForTransactionReceipt(wagmiConfig, { hash: betHash })
      setTx(null)
      setAmount('')
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(cause instanceof Error && cause.message === 'Amount must be greater than zero' ? cause.message : shortTxError(cause))
    }
  }

  async function handleSettlement(functionName: 'claim' | 'refund') {
    setError(null)
    try {
      if (!ASSET_RACE_ADDRESS || raceId == null) return
      setTx({ label: `Confirm ${functionName} in wallet…` })
      const hash = await writeContractAsync({
        address: ASSET_RACE_ADDRESS,
        abi: assetRaceAbi,
        functionName,
        args: [raceId],
      })
      setTx({ label: `Waiting for ${functionName} confirmation…` })
      await waitForTransactionReceipt(wagmiConfig, { hash })
      setTx(null)
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(shortTxError(cause))
    }
  }

  async function handleLobbyAction(functionName: 'addLobbyAsset' | 'openBetting', assetId?: Hex) {
    setError(null)
    try {
      if (!ASSET_RACE_ADDRESS || raceId == null) return
      setTx({ label: functionName === 'addLobbyAsset' ? 'Confirm asset addition…' : 'Confirm betting transition…' })
      const hash = functionName === 'addLobbyAsset'
        ? await writeContractAsync({
            address: ASSET_RACE_ADDRESS,
            chainId: assetRaceChain.id,
            abi: assetRaceAbi,
            functionName,
            args: [raceId, assetId!],
          })
        : await writeContractAsync({
            address: ASSET_RACE_ADDRESS,
            chainId: assetRaceChain.id,
            abi: assetRaceAbi,
            functionName,
            args: [raceId],
          })
      setTx({ label: 'Waiting for confirmation…' })
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      setTx(null)
      await refetchAll()
    } catch (cause) {
      setTx(null)
      setError(shortTxError(cause))
    }
  }

  if (raceId == null) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-rose-300">Invalid race ID.</div>
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      {isPreview ? (
        <div className="mb-5 rounded-2xl border border-[#F2A65A]/25 bg-[#F2A65A]/10 px-4 py-3 text-sm font-medium text-[#F2A65A]">
          Preview race - not onchain, no wallet transaction will be sent.
          {ASSET_RACE_CONFIG_ERROR && <span className="mt-1 block text-rose-300">{ASSET_RACE_CONFIG_ERROR}</span>}
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-[#8B7CF7]/25 bg-[#8B7CF7]/10 px-4 py-3 text-sm font-medium text-[#B3A7FA]">
          {isLocalAssetRace
            ? 'Local test network - contract state and transactions come from this Mac’s Anvil chain using fake USDG.'
            : 'Real AssetRace contract mode on Robinhood Chain. Wallet actions use real gas and USDG.'}
        </div>
      )}

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
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 -space-x-2 pt-1">
                {race.assets.slice(0, 4).map((asset) => <TokenLogo key={asset.assetIndex} ticker={asset.symbol} className="h-10 w-10 rounded-xl border-2 border-[#17111f]" />)}
              </div>
              <div>
              <p className={`flex flex-wrap items-center gap-2 text-sm font-bold ${race.category === 1 ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>
                {assetRaceCategoryLabel(race.category)} race #{race.id.toString()}
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${race.origin === ASSET_RACE_ORIGIN.PLATFORM ? 'bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'bg-white/5 text-white/50'}`}>
                  {race.origin === ASSET_RACE_ORIGIN.PLATFORM ? 'Featured' : 'Community'}
                </span>
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{race.title || race.assets.map((asset) => asset.symbol).join(' vs ')}</h1>
              {race.origin === ASSET_RACE_ORIGIN.PLATFORM ? (
                <p className="mt-1 text-xs font-medium text-white/40">Created by Prophet</p>
              ) : (
                <p className="mt-1 text-xs font-medium text-white/40">Created by <AddressLabel address={race.creator} link={!isLocalAssetRace} className="font-bold text-white/65" /></p>
              )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ShareInviteButton kind="race" id={race.id} />
              <span className="rounded-full bg-[#8B7CF7]/15 px-3 py-1 text-xs font-bold text-[#B3A7FA]">{assetRaceStatusLabel(race.status)}</span>
            </div>
          </div>

          {race.status === ASSET_RACE_STATUS.LOBBY ? (
            <AssetRaceLobbyView
              race={race}
              nowMs={raceNowMs}
              isConnected={isConnected}
              onRightChain={onRightChain}
              isSwitching={isSwitching}
              onSwitchChain={() => switchChain({ chainId: assetRaceChain.id })}
              hasAddedAsset={lobbyAddition.data ?? false}
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
              balance={balance.data}
              isConnected={isConnected}
              onRightChain={onRightChain}
              isSwitching={isSwitching}
              onSwitchChain={() => switchChain({ chainId: assetRaceChain.id })}
              onBet={handleBet}
              txLabel={tx?.label ?? null}
              error={error}
              nowMs={raceNowMs}
              tokenDecimals={tokenDecimals}
              tokenLabel={ASSET_RACE_TOKEN_LABEL}
            />
          ) : race.status === ASSET_RACE_STATUS.RUNNING ? (
            <AssetRaceLiveView race={race} position={position} nowMs={raceNowMs} tokenDecimals={tokenDecimals} tokenLabel={ASSET_RACE_TOKEN_LABEL} />
          ) : (
            <AssetRaceResultView
              race={race}
              position={position}
              isConnected={isConnected}
              onRightChain={onRightChain}
              isSwitching={isSwitching}
              onSwitchChain={() => switchChain({ chainId: assetRaceChain.id })}
              onClaim={() => handleSettlement('claim')}
              onRefund={() => handleSettlement('refund')}
              txLabel={tx?.label ?? null}
              error={error}
              tokenDecimals={tokenDecimals}
              tokenLabel={ASSET_RACE_TOKEN_LABEL}
            />
          )}
        </div>
      )}
    </div>
  )
}
