// Coin logos often live on IPFS. ipfs.io (and dweb.link) now refuse to serve
// images to other sites (403 / 429), so IPFS links are rewritten to a gateway
// that does. A logo that still fails falls back to the ticker's letter.

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'
const IPFS_PATH = /^https?:\/\/(?:ipfs\.io|dweb\.link|cloudflare-ipfs\.com|nftstorage\.link|w3s\.link|cf-ipfs\.com)\/ipfs\/(.+)$/i
const IPFS_SUBDOMAIN = /^https?:\/\/([a-z0-9]+)\.ipfs\.(?:dweb\.link|w3s\.link|nftstorage\.link|cf-ipfs\.com)(\/.*)?$/i

/** The same image through a gateway that allows cross-site use; other URLs pass through. */
export function ipfsImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('ipfs://')) return GATEWAY + url.slice('ipfs://'.length).replace(/^ipfs\//, '')
  const path = IPFS_PATH.exec(url)
  if (path) return GATEWAY + path[1]
  const sub = IPFS_SUBDOMAIN.exec(url)
  if (sub) return GATEWAY + sub[1] + (sub[2] ?? '')
  return url
}
