// web3.js and the Anchor coder expect Node's Buffer. Imported first from
// main.tsx so it is defined before any Solana module evaluates.
import { Buffer } from 'buffer'

if (!(globalThis as { Buffer?: unknown }).Buffer) {
  ;(globalThis as { Buffer?: unknown }).Buffer = Buffer
}
