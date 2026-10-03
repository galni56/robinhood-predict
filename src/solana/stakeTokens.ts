import { PublicKey, type AccountInfo } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import stakeTokensJson from '../../config/stake-tokens.json'
import { NATIVE_SOL, SOL_DECIMALS, SOLANA_CLUSTER } from '@/solana/config'
import { usePrograms } from '@/solana/programs'
import { formatCompactUnits, formatUnits } from '@/lib/format'

// Stake currencies: native SOL, or an SPL mint the admin accepted with
// `set_stake_mint`. Every game stores its stake mint; amounts display in it.

export interface StakeToken {
  mint: string
  symbol: string
  decimals: number
  native: boolean
  /** Token program that owns the mint (SPL only). */
  tokenProgram?: string
}

export interface StakeCurrency extends StakeToken {
  enabled: boolean
  minStake: bigint
  maxStake: bigint
}

export const SOL_STAKE_TOKEN: StakeToken = { mint: NATIVE_SOL.toBase58(), symbol: 'SOL', decimals: SOL_DECIMALS, native: true }

interface KnownToken { mint: string; symbol: string; clusters: string[] }

// Display names for SPL stake mints; anything unlisted shows a short address.
const KNOWN_SYMBOLS = new Map(
  (stakeTokensJson.tokens as KnownToken[]).filter((t) => t.clusters.includes(SOLANA_CLUSTER)).map((t) => [t.mint, t.symbol]),
)

const big = (value: { toString(): string }) => BigInt(value.toString())

// Mint layout (SPL Token and Token-2022): decimals u8 at offset 44.
function splToken(mint: string, info: AccountInfo<Buffer> | null | undefined): StakeToken {
  return {
    mint,
    symbol: KNOWN_SYMBOLS.get(mint) ?? `${mint.slice(0, 4)}…`,
    decimals: info && info.data.length >= 45 ? info.data[44] : 0,
    native: false,
    tokenProgram: info?.owner.toBase58(),
  }
}

/** Every stake currency the program knows (enabled or not), keyed by mint. */
export function useStakeCurrencies() {
  const { games } = usePrograms()
  const { connection } = useConnection()
  return useQuery({
    queryKey: ['stake-currencies', games.programId.toBase58()],
    queryFn: async () => {
      const configs = await games.account.stakeMintConfig.all()
      const splMints = configs.map((c) => c.account.mint).filter((mint) => !mint.equals(NATIVE_SOL))
      const infos = splMints.length > 0 ? await connection.getMultipleAccountsInfo(splMints) : []
      const infoByMint = new Map(splMints.map((mint, i) => [mint.toBase58(), infos[i]]))
      return new Map(configs.map(({ account }): [string, StakeCurrency] => {
        const mint = account.mint.toBase58()
        const token = account.mint.equals(NATIVE_SOL) ? SOL_STAKE_TOKEN : splToken(mint, infoByMint.get(mint))
        return [mint, { ...token, enabled: account.enabled, minStake: big(account.minStake), maxStake: big(account.maxStake) }]
      }))
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

/** Resolves a game's stake mint to its display token (undefined while loading). */
export function useStakeTokenLookup() {
  const currencies = useStakeCurrencies()
  return (mint?: string): StakeToken | undefined => {
    if (!mint) return undefined
    if (mint === SOL_STAKE_TOKEN.mint) return SOL_STAKE_TOKEN
    return currencies.data?.get(mint)
  }
}

export function useStakeToken(mint?: string) {
  return useStakeTokenLookup()(mint)
}

/** "0.05 SOL" / "120 PROPHET"; "…" until an SPL token's decimals are known. */
export function formatStakeAmount(raw: bigint, token: StakeToken | undefined, fractionalSignificantDigits = 4) {
  return token ? formatCompactUnits(raw, token.decimals, token.symbol, fractionalSignificantDigits) : '…'
}

export function formatStakeExact(raw: bigint, token: StakeToken | undefined) {
  return token ? `${formatUnits(raw, token.decimals)} ${token.symbol}` : '…'
}

/** The connected wallet's balance in `token` (lamports or token base units). */
export function useStakeBalance(token?: StakeToken) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  return useQuery({
    queryKey: ['stake-balance', connection.rpcEndpoint, token?.mint, publicKey?.toBase58()],
    queryFn: async () => {
      if (token!.native) return BigInt(await connection.getBalance(publicKey!, 'confirmed'))
      const ata = getAssociatedTokenAddressSync(new PublicKey(token!.mint), publicKey!, true, new PublicKey(token!.tokenProgram!))
      try {
        return BigInt((await connection.getTokenAccountBalance(ata, 'confirmed')).value.amount)
      } catch {
        return 0n // no token account yet
      }
    },
    enabled: !!publicKey && !!token && (token.native || !!token.tokenProgram),
    refetchInterval: 15_000,
  })
}
