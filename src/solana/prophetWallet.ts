import { ed25519 } from '@noble/curves/ed25519'
import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  WalletConnectionError,
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
//
// At rest the key is encrypted with the player's password (PBKDF2-SHA256 ->
// AES-256-GCM, WebCrypto): a copy of localStorage - another page on the same
// origin, malware reading browser files, a shared computer - is useless
// without it. After the password, the decrypted key is kept for this tab
// only (sessionStorage, 12 hours) so a refresh does not log the player out;
// closing the tab, logging out or the expiry clears it, and a new tab asks
// for the password again. It does not stop code running inside our own page
// (XSS), which could read the password as it is typed.

export const ProphetWalletName = 'HasteFun Wallet' as WalletName<'HasteFun Wallet'>

/** Legacy: the base58 secret key in clear (accounts created before passwords). */
const STORAGE_KEY = 'prophet_wallet_v1'
/** The password-encrypted key. */
const VAULT_KEY = 'prophet_wallet_v2'
const BACKUP_KEY = 'prophet_wallet_backed_up_v1'
/** This tab's unlocked key: survives a refresh, not a closed tab. */
const SESSION_KEY = 'prophet_wallet_session_v1'
const SESSION_HOURS = 12
const PBKDF2_ITERATIONS = 600_000
export const MIN_PASSWORD_LENGTH = 8

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

interface Vault {
  v: 2
  publicKey: string
  salt: string
  iv: string
  data: string
  iterations: number
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function seal(keypair: Keypair, password: string): Promise<Vault> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error('PasswordTooShort')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new Uint8Array(keypair.secretKey)))
  return { v: 2, publicKey: keypair.publicKey.toBase58(), salt: toB64(salt), iv: toB64(iv), data: toB64(data), iterations: PBKDF2_ITERATIONS }
}

async function openVault(vault: Vault, password: string): Promise<Keypair> {
  const key = await deriveKey(password, fromB64(vault.salt), vault.iterations)
  let secret: Uint8Array
  try {
    secret = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data)))
  } catch {
    throw new Error('WrongPassword')
  }
  const keypair = Keypair.fromSecretKey(secret)
  if (keypair.publicKey.toBase58() !== vault.publicKey) throw new Error('WrongPassword')
  return keypair
}

function readVault(): Vault | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    const vault = raw ? (JSON.parse(raw) as Vault) : null
    return vault?.v === 2 ? vault : null
  } catch {
    return null
  }
}

function readPlain(): Keypair | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Keypair.fromSecretKey(decodeBase58(raw)) : null
  } catch {
    return null
  }
}

function writeVault(vault: Vault) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault))
  // The clear-text copy goes once the encrypted one is saved.
  localStorage.removeItem(STORAGE_KEY)
}

function readSession(): Keypair | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as { secret: string; expiresAt: number }
    const keypair = Keypair.fromSecretKey(decodeBase58(session.secret))
    // Only the account saved on this device, and only until it expires.
    if (Date.now() > session.expiresAt || readVault()?.publicKey !== keypair.publicKey.toBase58()) throw new Error('stale')
    return keypair
  } catch {
    clearSession()
    return null
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage blocked: nothing was kept */
  }
}

/** Remembers the unlocked key for this tab. */
function setUnlocked(keypair: Keypair) {
  unlocked = keypair
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ secret: encodeBase58(keypair.secretKey), expiresAt: Date.now() + SESSION_HOURS * 3_600_000 }))
  } catch {
    /* storage blocked: the key stays in memory only */
  }
}

/** The decrypted key of this tab. */
let unlocked: Keypair | null = readSession()

export const prophetWalletStore = {
  hasWallet: () => readVault() != null || readPlain() != null,
  /** A legacy account whose key is still stored in clear: ask for a password. */
  needsPassword: () => readVault() == null && readPlain() != null,
  /** True when the adapter can connect without asking for anything. */
  canConnect: () => unlocked != null || (readVault() == null && readPlain() != null),
  isBackedUp: () => {
    try {
      return localStorage.getItem(BACKUP_KEY) === '1'
    } catch {
      return false
    }
  },
  markBackedUp: () => localStorage.setItem(BACKUP_KEY, '1'),
  /** A new account, encrypted with `password`. */
  create: async (password: string) => {
    const keypair = Keypair.generate()
    writeVault(await seal(keypair, password))
    localStorage.removeItem(BACKUP_KEY)
    setUnlocked(keypair)
    return keypair.publicKey.toBase58()
  },
  /** Decrypts the saved account for this tab. Throws WrongPassword. */
  unlock: async (password: string) => {
    const vault = readVault()
    if (!vault) throw new Error('NoAccount')
    const keypair = await openVault(vault, password)
    setUnlocked(keypair)
    return keypair.publicKey.toBase58()
  },
  /** Encrypts a legacy clear-text key (or re-encrypts the unlocked one). */
  setPassword: async (password: string) => {
    const keypair = unlocked ?? readPlain()
    if (!keypair) throw new Error('NoAccount')
    writeVault(await seal(keypair, password))
    setUnlocked(keypair)
  },
  /** Base58 secret key - the same format Phantom and Solflare import. */
  exportSecret: (): string | null => {
    const keypair = unlocked ?? readPlain()
    return keypair ? encodeBase58(keypair.secretKey) : null
  },
  /** Replaces the stored wallet with an imported base58 secret key. */
  importSecret: async (secret: string, password: string) => {
    const keypair = Keypair.fromSecretKey(decodeBase58(secret.trim()))
    writeVault(await seal(keypair, password))
    localStorage.setItem(BACKUP_KEY, '1')
    setUnlocked(keypair)
    return keypair.publicKey.toBase58()
  },
  /** Removes the key from this browser. Funds stay on-chain but are lost
   * unless the key was backed up - callers must confirm that first. */
  forget: () => {
    unlocked = null
    clearSession()
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(VAULT_KEY)
    localStorage.removeItem(BACKUP_KEY)
  },
}

// -------------------------------------------------------------- adapter

export class ProphetWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = ProphetWalletName
  url = 'https://hastefun.xyz'
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

  /** Uses the account unlocked in this tab (the UI creates or unlocks it first). */
  async connect() {
    const keypair = unlocked ?? (readVault() == null ? readPlain() : null)
    if (!keypair) throw new WalletConnectionError('Locked')
    this.keypair = keypair
    this.emit('connect', keypair.publicKey)
  }

  /** Signs out of this session; the saved (encrypted) key stays on the device. */
  async disconnect() {
    this.keypair = null
    unlocked = null
    clearSession()
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
