// Everything the game server does on Solana: read what reached the game
// wallet, and send SOL from it. The game wallet's keypair is loaded by the
// caller and only used here to sign; it is never printed or logged.

import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
/** A system account must keep at least this much (rent exemption, 0-byte account). */
export const RENT_EXEMPT_MINIMUM = 890_880n
export const BASE_FEE = 5_000n

// ----------------------------------------------------------------- base58

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58(bytes) {
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let out = ''
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out
  }
  return out
}

export function fromBase58(text) {
  let n = 0n
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) throw new Error('invalid base58')
    n = n * 58n + BigInt(v)
  }
  const bytes = []
  while (n > 0n) {
    bytes.unshift(Number(n % 256n))
    n /= 256n
  }
  for (const ch of text) {
    if (ch !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

/** A valid base58 public key (32 bytes); system accounts and PDAs alike. */
export function isAddress(text) {
  try {
    return typeof text === 'string' && fromBase58(text).length === 32
  } catch {
    return false
  }
}

export const memoInstruction = (text, signer) =>
  new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, 'utf8'),
  })

// ------------------------------------------------------------------ chain

/**
 * @param {object} o
 * @param {string} o.rpcUrl game cluster RPC
 * @param {import('@solana/web3.js').Keypair} o.wallet the game wallet
 * @param {number} [o.priorityMicroLamports] optional priority fee per CU
 */
export function createChain({ rpcUrl, wallet, priorityMicroLamports = 0 }) {
  const connection = new Connection(rpcUrl, 'confirmed')
  const address = wallet.publicKey
  const self = address.toBase58()

  /**
   * What a confirmed transaction moved to or from the game wallet. Only
   * top-level System transfers count as stakes; transfers made by other
   * programs (inner instructions) are reported separately.
   * Returns null while the transaction is not visible yet.
   */
  async function readTransaction(signature) {
    const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    if (!tx) return null
    const keys = tx.transaction.message.accountKeys
    const signers = new Set(keys.filter((k) => k.signer).map((k) => k.pubkey.toBase58()))
    const inbound = []
    const outbound = []
    const memos = []
    for (const ix of tx.transaction.message.instructions) {
      if (ix.program === 'spl-memo' && typeof ix.parsed === 'string') memos.push(ix.parsed)
      if (ix.program !== 'system' || ix.parsed?.type !== 'transfer') continue
      const { source, destination, lamports } = ix.parsed.info
      if (destination === self && source !== self) inbound.push({ from: source, lamports: BigInt(lamports), signed: signers.has(source) })
      if (source === self) outbound.push({ to: destination, lamports: BigInt(lamports) })
    }
    const innerInbound = []
    for (const group of tx.meta?.innerInstructions ?? []) {
      for (const ix of group.instructions) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer' && ix.parsed.info.destination === self) {
          innerInbound.push({ from: ix.parsed.info.source, lamports: BigInt(ix.parsed.info.lamports) })
        }
      }
    }
    // SOL that reached us some other way (transferWithSeed, a program
    // closing an account to us, ...): visible only as a balance change.
    const index = keys.findIndex((k) => k.pubkey.toBase58() === self)
    const balanceDelta = index >= 0 && tx.meta ? BigInt(tx.meta.postBalances[index]) - BigInt(tx.meta.preBalances[index]) : 0n
    return {
      slot: tx.slot,
      blockTime: tx.blockTime,
      /** False for transactions that never involved the game wallet. */
      touchesWallet: index >= 0,
      failed: tx.meta?.err != null,
      feePayer: keys[0]?.pubkey.toBase58(),
      inbound,
      outbound,
      memos,
      innerInbound,
      balanceDelta,
    }
  }

  /**
   * Signs (without sending) a transfer from the game wallet. The caller
   * stores the signature and expiry before broadcasting, so a crash between
   * the two can be told apart from a lost transaction.
   */
  async function preparePayout({ to, lamports, memo }) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    const tx = new Transaction({ feePayer: address, blockhash, lastValidBlockHeight })
    if (priorityMicroLamports > 0) {
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }))
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }))
    }
    tx.add(SystemProgram.transfer({ fromPubkey: address, toPubkey: new PublicKey(to), lamports }))
    if (memo) tx.add(memoInstruction(memo, address))
    tx.sign(wallet)
    return {
      signature: base58(tx.signature),
      lastValidBlockHeight,
      serialized: tx.serialize().toString('base64'),
    }
  }

  async function broadcast(serialized) {
    return connection.sendRawTransaction(Buffer.from(serialized, 'base64'), { skipPreflight: false, maxRetries: 0 })
  }

  return {
    connection,
    address: self,
    readTransaction,
    preparePayout,
    broadcast,
    balance: async () => BigInt(await connection.getBalance(address, 'confirmed')),
    blockHeight: () => connection.getBlockHeight('confirmed'),
    finalizedBlockHeight: () => connection.getBlockHeight('finalized'),
    finalizedSlot: () => connection.getSlot('finalized'),
    /** The transaction as finalized history knows it, or null. Unlike a
     * signature-status lookup, this does not depend on the node's recent
     * status cache, so a null here really means "never landed". */
    finalizedTransaction: async (signature) => {
      const tx = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 })
      return tx ? { err: tx.meta?.err ?? null } : null
    },
    statuses: async (signatures) => (await connection.getSignatureStatuses(signatures, { searchTransactionHistory: true })).value,
    /** Newest first; `before` pages further back. */
    signatures: (before, limit = 1000) => connection.getSignaturesForAddress(address, { before, limit }, 'confirmed'),
  }
}
