import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mockAddress, mockHash } from '@/lib/hash'
import { RHCHAIN_META } from '@/market/tokens'
import type { ChainBlock, ChainTx, TxType, MarketSide } from '@/types'

export const GENESIS_ADDRESS = mockAddress('genesis')
const VALIDATORS = ['validator-a.rhc', 'validator-b.rhc', 'validator-c.rhc']

interface SubmitTxInput {
  from: string
  to: string
  type: TxType
  amount: number
  marketId?: string
  side?: MarketSide
  memo: string
}

interface ChainState {
  blocks: ChainBlock[]
  txs: Record<string, ChainTx>
  mempool: string[]
  balances: Record<string, number>

  ensureGenesis: () => void
  submitTx: (input: SubmitTxInput) => string
  /** Convenience wrapper around submitTx for crediting a wallet from the
   * genesis/faucet address — used for the signup grant and for "Пополнить
   * баланс". Not real money; same mock chain as everything else. */
  faucet: (to: string, amount: number, memo: string) => string
  mineBlock: () => void
  balanceOf: (address: string) => number
  txsForAddress: (address: string) => ChainTx[]
}

function applyEffects(tx: ChainTx, balances: Record<string, number>) {
  if (tx.type === 'FAUCET') {
    balances[tx.to] = (balances[tx.to] ?? 0) + tx.amount
  } else if (tx.type === 'BET') {
    balances[tx.from] = (balances[tx.from] ?? 0) - tx.amount
  } else if (tx.type === 'SETTLEMENT') {
    balances[tx.to] = (balances[tx.to] ?? 0) + tx.amount
  }
}

export const useChainStore = create<ChainState>()(
  persist(
    (set, get) => ({
      blocks: [],
      txs: {},
      mempool: [],
      balances: {},

      ensureGenesis: () => {
        if (get().blocks.length > 0) return
        const genesis: ChainBlock = {
          number: 0,
          hash: mockHash('genesis-block', RHCHAIN_META.name),
          parentHash: '0x0',
          timestamp: Date.now(),
          validator: 'genesis',
          txHashes: [],
        }
        set({ blocks: [genesis] })
      },

      submitTx: (input) => {
        const timestamp = Date.now()
        const hash = mockHash(
          `${input.from}:${input.to}:${input.type}:${input.amount}:${timestamp}:${Math.random()}`,
          'tx',
        )
        const tx: ChainTx = {
          hash,
          from: input.from,
          to: input.to,
          type: input.type,
          amount: input.amount,
          marketId: input.marketId,
          side: input.side,
          memo: input.memo,
          timestamp,
          status: 'pending',
          blockNumber: null,
        }
        set((s) => ({
          txs: { ...s.txs, [hash]: tx },
          mempool: [...s.mempool, hash],
        }))
        return hash
      },

      faucet: (to, amount, memo) =>
        get().submitTx({ from: GENESIS_ADDRESS, to, type: 'FAUCET', amount, memo }),

      mineBlock: () => {
        const { mempool, blocks, txs, balances } = get()
        if (mempool.length === 0) return
        const parent = blocks[blocks.length - 1]
        const number = parent.number + 1
        const included = mempool.slice(0, 25) // cap block size, like a real chain
        const remaining = mempool.slice(25)

        const nextTxs = { ...txs }
        const nextBalances = { ...balances }
        for (const hash of included) {
          const tx = nextTxs[hash]
          if (!tx) continue
          const confirmed: ChainTx = { ...tx, status: 'confirmed', blockNumber: number }
          nextTxs[hash] = confirmed
          applyEffects(confirmed, nextBalances)
        }

        const block: ChainBlock = {
          number,
          hash: mockHash(`${number}:${parent.hash}:${included.join(',')}`, 'block'),
          parentHash: parent.hash,
          timestamp: Date.now(),
          validator: VALIDATORS[number % VALIDATORS.length],
          txHashes: included,
        }

        set({
          blocks: [...blocks, block],
          txs: nextTxs,
          balances: nextBalances,
          mempool: remaining,
        })
      },

      balanceOf: (address) => get().balances[address] ?? 0,

      txsForAddress: (address) =>
        Object.values(get().txs)
          .filter((t) => t.from === address || t.to === address)
          .sort((a, b) => b.timestamp - a.timestamp),
    }),
    { name: 'rhchain-mock-chain' },
  ),
)
