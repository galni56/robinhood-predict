import { ed25519 } from '@noble/curves/ed25519'
import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  WalletNotConnectedError,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
  type WalletName,
} from '@solana/wallet-adapter-base'
import { Keypair, type TransactionVersion } from '@solana/web3.js'

// The platform wallet ("personal account"): a keypair generated and kept in
// this browser, so players never connect an external wallet and never see a
// wallet-extension "unsafe site" warning. Non-custodial - the secret key never
// leaves the device and the game server never sees it. The trade-off is that
// clearing site data loses the key, so the UI forces a backup after creation
// and offers export/import at any time.

export const ProphetWalletName = 'Prophet Wallet' as WalletName<'Prophet Wallet'>

const STORAGE_KEY = 'prophet_wallet_v1'
const BACKUP_KEY = 'prophet_wallet_backed_up_v1'

// --------------------------------------------------------------- base58

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function encodeBase58(bytes: Uint8Array): string {
  let value = 0n
  for (const byte of bytes) value = value * 256n + BigInt(byte)
  let out = ''
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    out = '1' + out
  }
  return out
}

function decodeBase58(text: string): Uint8Array {
  let value = 0n
  for (const char of text) {
    const digit = ALPHABET.indexOf(char)
    if (digit < 0) throw new Error('InvalidKey')
    value = value * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (value > 0n) {
    bytes.unshift(Number(value % 256n))
    value /= 256n
  }
  for (const char of text) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

// -------------------------------------------------------------- storage

function readStored(): Keypair | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Keypair.fromSecretKey(decodeBase58(raw)) : null
  } catch {
    return null
  }
}

function writeStored(keypair: Keypair) {
  localStorage.setItem(STORAGE_KEY, encodeBase58(keypair.secretKey))
}

export const prophetWalletStore = {
  hasWallet: () => readStored() != null,
  isBackedUp: () => {
    try {
      return localStorage.getItem(BACKUP_KEY) === '1'
    } catch {
      return false
    }
  },
  markBackedUp: () => localStorage.setItem(BACKUP_KEY, '1'),
  /** Base58 secret key - the same format Phantom and Solflare import. */
  exportSecret: (): string | null => {
    const keypair = readStored()
    return keypair ? encodeBase58(keypair.secretKey) : null
  },
  /** Replaces the stored wallet with an imported base58 secret key. */
  importSecret: (secret: string) => {
    const keypair = Keypair.fromSecretKey(decodeBase58(secret.trim()))
    writeStored(keypair)
    localStorage.setItem(BACKUP_KEY, '1')
    return keypair.publicKey.toBase58()
  },
  /** Removes the key from this browser. Funds stay on-chain but are lost
   * unless the key was backed up - callers must confirm that first. */
  forget: () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(BACKUP_KEY)
  },
}

// -------------------------------------------------------------- adapter

export class ProphetWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = ProphetWalletName
  url = 'https://prophetmarkets.fun'
  icon =
    'data:image/svg+xml;base64,' +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 17" shape-rendering="crispEdges"><rect x="1" y="5" width="14" height="4" fill="#1B1340"/><rect x="2" y="3" width="12" height="8" fill="#1B1340"/><rect x="4" y="1" width="8" height="12" fill="#1B1340"/><rect x="2" y="5" width="12" height="4" fill="#FFD23F"/><rect x="3" y="3" width="10" height="8" fill="#FFD23F"/><rect x="4" y="2" width="8" height="10" fill="#FFD23F"/><rect x="6" y="4" width="2" height="3" fill="#fff"/><rect x="10" y="4" width="2" height="3" fill="#fff"/><rect x="7" y="9" width="4" height="1" fill="#1B1340"/></svg>',
    )
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0])

  private keypair: Keypair | null = null

  get connecting() {
    return false
  }

  get publicKey() {
    return this.keypair?.publicKey ?? null
  }

  get readyState() {
    return typeof window === 'undefined' ? WalletReadyState.Unsupported : WalletReadyState.Loadable
  }

  /** Loads the wallet saved in this browser, creating one on first use. */
  async connect() {
    let keypair = readStored()
    if (!keypair) {
      keypair = Keypair.generate()
      writeStored(keypair)
    }
    this.keypair = keypair
    this.emit('connect', keypair.publicKey)
  }

  /** Signs out of this session only; the saved key stays on the device. */
  async disconnect() {
    this.keypair = null
    this.emit('disconnect')
  }

  async signTransaction<T extends TransactionOrVersionedTransaction<this['supportedTransactionVersions']>>(transaction: T): Promise<T> {
    if (!this.keypair) throw new WalletNotConnectedError()
    if (isVersionedTransaction(transaction)) transaction.sign([this.keypair])
    else transaction.partialSign(this.keypair)
    return transaction
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.keypair) throw new WalletNotConnectedError()
    return ed25519.sign(message, this.keypair.secretKey.slice(0, 32))
  }
}
