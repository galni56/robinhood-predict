/** Release gate for the Crypto category next to Stocks and Memes. On by
 * default on Solana (the owner approved all three); set
 * VITE_ALL_ASSET_TYPES_ENABLED=false to hide Crypto. */
export const ALL_ASSET_TYPES_ENABLED = import.meta.env.VITE_ALL_ASSET_TYPES_ENABLED?.trim() !== 'false'

// Transitional alias keeps the category components small. It means "all
// three asset types", not Crypto in isolation.
// Stocks are off (owner, 2026-10-05); memes and crypto are always on.
export const CRYPTO_ASSETS_ENABLED = true
