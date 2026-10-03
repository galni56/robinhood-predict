import { useQuery } from '@tanstack/react-query'
import { PublicKey, type Connection } from '@solana/web3.js'
import { useConnection } from '@solana/wallet-adapter-react'
import { makePrograms } from '@/solana/programs'
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

async function flush(connection: Connection) {
  const batch = pendingByConnection.get(connection) ?? []
  pendingByConnection.delete(connection)
  const coder = makePrograms(connection).nicknameRegistry.coder.accounts
  for (let start = 0; start < batch.length; start += 100) {
    const chunk = batch.slice(start, start + 100)
    try {
      const keys = chunk.map((item) => nicknamePda(parseOwner(item.owner) ?? PublicKey.default))
      const infos = await connection.getMultipleAccountsInfo(keys, 'confirmed')
      chunk.forEach((item, index) => {
        const info = infos[index]
        if (!info || !parseOwner(item.owner)) return item.resolve(null)
        try {
          const decoded = coder.decode('nickname', info.data) as { nickname: string }
          item.resolve(decoded.nickname || null)
        } catch {
          item.resolve(null)
        }
      })
    } catch (error) {
      chunk.forEach((item) => item.reject(error))
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
