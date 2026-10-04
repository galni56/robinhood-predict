import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { GAME_SERVER_URL } from '@/solana/services'

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
  assets: { symbol: string; name: string; category: string; priceSource: string; priceDecimals: number }[]
}

export interface ServerWallet {
  wallet: string
  nickname: string | null
  deposits: { signature: string; time: number | null; amount: string | null; status: string; reason: string | null; game: { kind: string; id: number; address: string } | null }[]
  payouts: { kind: string; amount: string; status: string; signature: string | null; game: { kind: string; id: number; address: string } | null; createdAt: number; doneAt: number | null }[]
}

/** A refusal from the game server, with its rule code (e.g. StakeBelowMinimum). */
export class GameServerError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'GameServerError'
    this.code = code
  }
}

function serverUrl(path: string) {
  if (GAME_SERVER_URL == null) throw new Error('The game server is not configured for this build')
  return `${GAME_SERVER_URL}${path}`
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(serverUrl(path))
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new GameServerError((body as { error?: string }).error ?? `HTTP${response.status}`)
  return body as T
}

async function postJson<T>(path: string, payload: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(serverUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok && response.status !== 202) throw new GameServerError((body as { error?: string }).error ?? `HTTP${response.status}`)
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
    queryFn: () => getJson<ServerConfig>('/config'),
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
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
      if (!publicKey) throw new Error('Connect a wallet first')
      if (!signMessage) throw new GameServerError('WalletCannotSignMessages')
      const cluster = config.data?.cluster ?? (await getJson<ServerConfig>('/config')).cluster
      const message = `Prophet\n${JSON.stringify({ ...fields, wallet: publicKey.toBase58(), cluster, issuedAt: Math.floor(Date.now() / 1000) })}`
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
  WalletCannotSignMessages: 'This wallet cannot sign messages. Use Phantom or Solflare.',
  InvalidNickname: 'Nicknames are 1–24 bytes, no control characters.',
  NicknameTaken: 'That nickname is taken.',
  TooManyRequests: 'Too many requests; wait a minute.',
}

export function gameServerMessage(code: string) {
  return FRIENDLY[code] ?? `Refused: ${code}`
}

/** Why a stake came back, for the message under the bet form. */
export function depositOutcomeMessage(result: DepositResult): string | null {
  if (result.status === 'accepted' || result.status === 'pending') return null
  const reason = result.reason ? gameServerMessage(result.reason) : 'It could not be applied.'
  if (result.status === 'refunded') return `${reason} Your SOL is on its way back to your wallet.`
  return reason
}
