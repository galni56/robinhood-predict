import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { GAME_SERVER_URL, LAST_DATA_URL } from '@/solana/services'
import { registerAssetIcons } from '@/lib/assetIcons'
import pumpswapSnapshot from '@/chain/pumpswapSnapshot.json'

// Client of the game server (scripts/solana/game-server). The server holds
// the game wallet: stakes are SOL transfers to it with a `prophet:` memo
// (src/chain/gameTx.ts), and it pays winners and refunds itself. Everything
// else a player does (create a race or arena, add a lobby asset, change a
// prediction, set a nickname) is a message signed by the wallet.
//
// JSON amounts are decimal strings in lamports; prices are scaled integers.

export interface ServerPayout {
  wallet: string
  kind: 'win' | 'refund' | 'creator' | string
  amount: string
  status: 'pending' | 'sent' | 'done' | 'stuck'
  /** Set once the transfer is confirmed. */
  signature: string | null
}

export interface ServerRaceAsset {
  symbol: string
  priceSource: string
  priceDecimals: number
  active: boolean
  pool: string
  startPrice: string
  endPrice: string
  returnValue: string
}

export interface ServerRace {
  kind: 'race'
  id: number
  address: string
  /** Display unit chosen by the creator (older games: none = price). */
  unit?: 'price' | 'cap'
  status: 'lobby' | 'betting' | 'running' | 'resolved' | 'cancelled' | 'void'
  cancelReason: string | null
  origin: 'platform' | 'community'
  category: 'stock' | 'meme' | 'crypto'
  creator: string
  stakeMint: string
  title: string
  createdAt: number
  lobbyEndTime: number
  bettingWindow: number
  bettingStartTime: number
  bettingEndTime: number
  raceDuration: number
  raceEndTime: number
  startGrace: number
  resolutionGrace: number
  resolvedAt: number
  feeBp: number
  minActiveContenders: number
  activeCount: number
  winningAssetIndex: number
  minStake: string
  maxStakePerWallet: string
  totalPool: string
  winningPool: string
  distributableLosingPool: string
  protocolFee: string
  creatorFee: string
  remainingLiability: string
  endPriceTime: number
  assets: ServerRaceAsset[]
  lobbyAdders: string[]
  positions: { owner: string; assetIndex: number; stake: string; payout: string }[]
  payouts: ServerPayout[]
}

export interface ServerArenaEntry {
  player: string
  prediction: string
  stake: string
  predictionUpdatedAt: number
  predictionSeq: number
  payout: string
  rank: number
  accuracyMultiplierBp: number
}

export interface ServerArena {
  kind: 'arena'
  id: number
  address: string
  unit?: 'price' | 'cap'
  symbol: string
  priceSource: string
  priceDecimals: number
  category: 'stock' | 'meme' | 'crypto'
  creator: string
  stakeMint: string
  status: 'open' | 'resolved' | 'cancelled'
  cancelReason: string
  title: string
  createdAt: number
  startsAt: number
  deadline: number
  duration: number
  resolvedAt: number
  feeBp: number
  minStake: string
  maxStake: string
  totalPool: string
  finalPrice: string
  finalPriceTime: number
  winnerCount: number
  protocolFee: string
  creatorFee: string
  remainingLiability: string
  entries: ServerArenaEntry[]
  payouts: ServerPayout[]
}

export interface ServerState {
  cluster: string
  gameWallet: string
  now: number
  races: ServerRace[]
  arenas: ServerArena[]
}

export interface ServerConfig {
  cluster: string
  gameWallet: string
  stake: { min: string; max: string }
  race: { minAssets: number; maxAssets: number; communityDurations: number[]; communityPolicy: { lobbyDuration: number; bettingDuration: number; startGrace: number; resolutionGrace: number; feeBp: number } }
  arena: { durations: number[]; lobbyDuration: number; maxParticipants: number; feeBp: number }
  assets: ServerAsset[]
}

export interface ServerAsset {
  symbol: string
  name: string
  category: string
  priceSource: string
  priceDecimals: number
  mint?: string
  logoUrl?: string | null
  priceUrl?: string | null
  /** 'catalog' (owner-reviewed) or 'pumpswap' (added automatically). */
  source?: string
  liquidityUsd?: number
  volume24hUsd?: number
  poolCreatedAt?: string
  /** When the game server added the coin to the list. */
  addedAt?: string
  /** Price kept in the bundled snapshot (shown while the server is off). */
  price?: { raw: string; decimals: number } | null
}

export interface ServerWallet {
  wallet: string
  nickname: string | null
  deposits: { signature: string; time: number | null; amount: string | null; status: string; reason: string | null; game: { kind: string; id: number; address: string } | null }[]
  payouts: { kind: string; amount: string; status: string; signature: string | null; game: { kind: string; id: number; address: string } | null; createdAt: number; doneAt: number | null }[]
}

/** A refusal from the game server, with its rule code (e.g. StakeBelowMinimum). */
/** Converts server rows, dropping (and logging) any that do not parse
 * instead of letting one malformed row take the whole page down. */
export function convertRows<In, Out>(rows: readonly In[] | undefined, convert: (row: In) => Out, label: string): Out[] {
  const out: Out[] = []
  for (const row of rows ?? []) {
    try {
      out.push(convert(row))
    } catch (error) {
      console.warn(`[game-server] dropped a malformed ${label}`, error, row)
    }
  }
  return out
}

/** The server answered and refused (a rule code in `error`). */
export class GameServerError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'GameServerError'
    this.code = code
  }
}

/** The server could not be reached or answered without a rule code (proxy
 * 502/504 page, timeout, offline). Never a refusal - the action may still
 * be fine, so the UI must not say it was rejected. */
export class GameServerUnavailableError extends Error {
  readonly status: number | null

  constructor(status: number | null) {
    super(status == null ? 'Game server unreachable' : `Game server unavailable (${status})`)
    this.name = 'GameServerUnavailableError'
    this.status = status
  }
}

async function request(path: string, init?: RequestInit): Promise<{ response: Response; body: unknown }> {
  let response: Response
  try {
    response = await fetch(serverUrl(path), init)
  } catch {
    throw new GameServerUnavailableError(null)
  }
  const body = await response.json().catch(() => null)
  return { response, body }
}

function failure(response: Response, body: unknown): Error {
  const code = (body as { error?: unknown } | null)?.error
  return typeof code === 'string' ? new GameServerError(code) : new GameServerUnavailableError(response.status)
}

function serverUrl(path: string) {
  if (GAME_SERVER_URL == null) throw new Error('The game server is not configured for this build')
  return `${GAME_SERVER_URL}${path}`
}

export async function getJson<T>(path: string): Promise<T> {
  const { response, body } = await request(path)
  if (!response.ok) throw failure(response, body)
  return body as T
}

async function postJson<T>(path: string, payload: unknown): Promise<{ status: number; body: T }> {
  const { response, body } = await request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok && response.status !== 202) throw failure(response, body)
  return { status: response.status, body: body as T }
}

const enabled = GAME_SERVER_URL != null

/** Every race and arena, one shared poll. */
export function useGameState() {
  return useQuery({
    queryKey: ['game-state'],
    queryFn: () => getJson<ServerState>('/state'),
    enabled,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

/** Stake limits, durations, the game wallet and the approved assets. */
export function useGameServerConfig() {
  return useQuery({
    queryKey: ['game-config'],
    queryFn: async () => {
      const config = await getJson<ServerConfig>('/config')
      registerAssetIcons(config.assets)
      return config
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

registerAssetIcons(pumpswapSnapshot.assets)

interface PumpSwapSnapshot {
  capturedAt: string
  assets: ServerAsset[]
}

/** PumpSwap coins the game server added to the meme category, most liquid
 * first. While the server is off: the last data the VPS keeps publishing
 * (LAST_DATA_URL/pumpswap.json), else the bundled snapshot - never empty. */
export function usePumpSwapAssets() {
  const config = useGameServerConfig()
  const live = (config.data?.assets ?? []).filter((a) => a.source === 'pumpswap')
  const needFallback = live.length === 0 && !config.isLoading
  const last = useQuery({
    queryKey: ['pumpswap-last'],
    queryFn: async () => {
      const response = await fetch(`${LAST_DATA_URL}/pumpswap.json`)
      if (!response.ok) throw new GameServerUnavailableError(response.status)
      return (await response.json()) as PumpSwapSnapshot
    },
    enabled: needFallback && LAST_DATA_URL != null,
    staleTime: 60_000,
    retry: 1,
  })
  const fallback = last.data?.assets?.length ? last.data : (pumpswapSnapshot as PumpSwapSnapshot)
  if (needFallback && fallback === last.data) registerAssetIcons(fallback.assets)
  const assets = (needFallback ? fallback.assets : live).slice().sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
  return { assets, snapshotAt: needFallback ? fallback.capturedAt : null, isLoading: (config.isLoading && GAME_SERVER_URL != null) || (needFallback && last.isLoading) }
}

/** One wallet's stakes and payouts. */
export function useServerWallet(wallet?: string | null) {
  return useQuery({
    queryKey: ['game-wallet', wallet],
    queryFn: () => getJson<ServerWallet>(`/wallet/${wallet}`),
    enabled: enabled && !!wallet,
    refetchInterval: 10_000,
  })
}

export interface DepositResult {
  signature: string
  status: 'pending' | 'accepted' | 'refunded' | 'kept' | 'ignored' | string
  reason: string | null
}

/**
 * Tells the server about a confirmed stake so it is applied at once (the
 * server also finds it on its own within seconds). Retries while the
 * transaction is not yet visible to the server's RPC.
 */
export async function reportDeposit(signature: string): Promise<DepositResult> {
  let last: DepositResult = { signature, status: 'pending', reason: null }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { status, body } = await postJson<DepositResult>('/deposit', { signature })
    last = body
    if (status !== 202) return body
    await new Promise((r) => setTimeout(r, 1_500))
  }
  return last
}

/** Signs `fields` as a Prophet action with the connected wallet and sends it. */
export function useSignedAction() {
  const { publicKey, signMessage } = useWallet()
  const config = useGameServerConfig()
  return useCallback(
    async <T = unknown>(fields: Record<string, unknown>): Promise<T> => {
      if (!publicKey) throw new Error('Log in first')
      if (!signMessage) throw new GameServerError('WalletCannotSignMessages')
      const cluster = config.data?.cluster ?? (await getJson<ServerConfig>('/config')).cluster
      // domain: binds the signature to this site (the server rejects other
      // hosts); nonce: makes every signed message unique.
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
      const message = `Prophet\n${JSON.stringify({ ...fields, wallet: publicKey.toBase58(), cluster, domain: window.location.host, nonce, issuedAt: Math.floor(Date.now() / 1000) })}`
      const signature = await signMessage(new TextEncoder().encode(message))
      let binary = ''
      signature.forEach((b) => { binary += String.fromCharCode(b) })
      const { body } = await postJson<T>('/action', { message, signature: btoa(binary) })
      return body
    },
    [config.data?.cluster, publicKey, signMessage],
  )
}

// Rule codes the UI can explain in plain words.
const FRIENDLY: Record<string, string> = {
  WrongDomain: 'This action was signed for another website. Make sure you are on prophetmarkets.fun.',
  BettingNotOpen: 'Betting is not open for this race.',
  StakeBelowMinimum: 'The stake is below the minimum.',
  StakeExceedsMaximum: 'That would exceed the per-wallet maximum.',
  InvalidStake: 'The stake is outside this arena’s limits.',
  WrongAsset: 'You already backed another asset in this race.',
  LobbyClosed: 'The lobby has closed.',
  ArenaFull: 'This arena is full.',
  NothingChanged: 'Nothing to change.',
  NotEntered: 'Enter the arena first.',
  InvalidPrediction: 'Enter a price above zero.',
  InvalidTitle: 'Give it a title (up to 64 bytes).',
  DurationNotApproved: 'Pick one of the offered durations.',
  UnsupportedDuration: 'Pick one of the offered durations.',
  AssetNotApproved: 'That asset is not available here.',
  DuplicateAsset: 'That asset is already in the race.',
  DuplicatePriceSource: 'That asset is already in the race.',
  InvalidCandidateCount: 'A race holds up to six assets.',
  LobbyAdditionAlreadyUsed: 'You already added an asset to this lobby.',
  InvalidRaceStatus: 'The race is past that stage.',
  ArenaNotOpen: 'The arena is past that stage.',
  GameNotFound: 'Game not found.',
  TooManyOpenGames: 'Too many open games right now; wait until one finishes.',
  MessageExpired: 'Your device clock looks off; check the time and retry.',
  MessageReused: 'That request was already sent.',
  BadSignature: 'The wallet signature did not check out. Try again.',
  WalletCannotSignMessages: 'This wallet cannot sign messages. Log in with your Prophet account.',
  InvalidNickname: 'Nicknames are 1–24 bytes, no control characters.',
  NicknameTaken: 'That nickname is taken.',
  TooManyRequests: 'Too many requests; wait a minute.',
}

export function gameServerMessage(code: string) {
  return FRIENDLY[code] ?? `Refused: ${code}`
}

/** Reports a landed stake transfer. If the server cannot be reached, the
 * transfer is still on-chain and the server's own scan applies it - say
 * that instead of staying silent. */
export async function reportDepositSafely(signature: string): Promise<string | null> {
  try {
    return depositOutcomeMessage(await reportDeposit(signature))
  } catch (cause) {
    if (cause instanceof GameServerError) return gameServerMessage(cause.code)
    return `Your SOL was sent (${signature.slice(0, 8)}…). The game server is slow to confirm it - it will be applied automatically within a minute.`
  }
}

/** Why a stake came back, for the message under the bet form. */
export function depositOutcomeMessage(result: DepositResult): string | null {
  if (result.status === 'accepted' || result.status === 'pending') return null
  const reason = result.reason ? gameServerMessage(result.reason) : 'It could not be applied.'
  if (result.status === 'refunded') return `${reason} Your SOL is on its way back to your wallet.`
  return reason
}
