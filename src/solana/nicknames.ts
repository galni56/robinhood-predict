import { useQuery } from '@tanstack/react-query'
import { PublicKey, type Connection } from '@solana/web3.js'
import { useConnection } from '@solana/wallet-adapter-react'
import { nicknamePda } from '@/solana/pda'

// Nicknames live in one PDA per wallet (nickname_registry). Every
// <AddressLabel> on a page asks for its own address; requests made in the
// same tick are batched into a single getMultipleAccountsInfo call.

export const MAX_NICKNAME_BYTES = 24

type Pending = { owner: string; resolve: (value: string | null) => void; reject: (error: unknown) => void }
const pendingByConnection = new WeakMap<Connection, Pending[]>()

function parseOwner(owner: string) {
  try {
    return new PublicKey(owner)
  } catch {
    return null
  }
}

// The accounts coder depends only on the IDL, so build it once - and import
// Anchor plus the IDL lazily. AddressLabel sits in the always-mounted navbar,
// and a static import here used to pull @anchor-lang/core and both IDLs into
// the entry chunk (and rebuild both Program objects on every flush).
let coderPromise: Promise<{ decode: (name: string, data: Buffer) => unknown }> | undefined
function nicknameCoder() {
  coderPromise ??= Promise.all([import('@anchor-lang/core'), import('@/solana/idl/nickname_registry.json')]).then(
    ([anchor, idl]) => new anchor.BorshAccountsCoder(idl.default as never),
  )
  return coderPromise
}

async function flush(connection: Connection) {
  const batch = pendingByConnection.get(connection) ?? []
  pendingByConnection.delete(connection)
  const coder = await nicknameCoder()
  for (let start = 0; start < batch.length; start += 100) {
    const chunk = batch.slice(start, start + 100)
    // Invalid owners resolve to null up front instead of costing an RPC read
    // against the placeholder PDA.
    const valid = chunk
      .map((item) => ({ item, owner: parseOwner(item.owner) }))
      .filter((entry): entry is { item: Pending; owner: PublicKey } => {
        if (entry.owner) return true
        entry.item.resolve(null)
        return false
      })
    if (valid.length === 0) continue
    try {
      const infos = await connection.getMultipleAccountsInfo(valid.map((entry) => nicknamePda(entry.owner)), 'confirmed')
      valid.forEach(({ item }, index) => {
        const info = infos[index]
        if (!info) return item.resolve(null)
        try {
          const decoded = coder.decode('nickname', info.data) as { nickname: string }
          item.resolve(decoded.nickname || null)
        } catch {
          item.resolve(null)
        }
      })
    } catch (error) {
      valid.forEach(({ item }) => item.reject(error))
    }
  }
}

function loadNickname(connection: Connection, owner: string) {
  return new Promise<string | null>((resolve, reject) => {
    const queue = pendingByConnection.get(connection)
    if (queue) {
      queue.push({ owner, resolve, reject })
      return
    }
    pendingByConnection.set(connection, [{ owner, resolve, reject }])
    setTimeout(() => void flush(connection), 0)
  })
}

export function nicknameQueryKey(owner?: string) {
  return ['nickname', owner] as const
}

/** The wallet's on-chain nickname, or null when it has none. */
export function useNickname(owner?: string, enabled = true) {
  const { connection } = useConnection()
  return useQuery({
    queryKey: nicknameQueryKey(owner),
    queryFn: () => loadNickname(connection, owner!),
    enabled: enabled && !!owner,
    staleTime: 60_000,
  })
}
