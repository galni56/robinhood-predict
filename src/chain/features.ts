/** Atomic release gate for the complete Stocks + Memes + Crypto product set. */
export const ALL_ASSET_TYPES_ENABLED = import.meta.env.VITE_ALL_ASSET_TYPES_ENABLED === 'true'

// Transitional alias keeps the category components small while the release is
// prepared. It now means "all three asset types", not Crypto in isolation.
export const CRYPTO_ASSETS_ENABLED = ALL_ASSET_TYPES_ENABLED
