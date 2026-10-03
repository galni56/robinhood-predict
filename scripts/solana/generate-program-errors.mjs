// Regenerates src/solana/programErrors.ts from the IDL error tables, so the
// transaction layer can name program errors without bundling the full IDLs
// (the games IDL alone is ~84 KB and must stay out of the shared chunks).
// Run after `anchor build` copies fresh IDLs: node scripts/solana/generate-program-errors.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const table = (file) =>
  Object.fromEntries(
    JSON.parse(readFileSync(new URL(`src/solana/idl/${file}`, root), 'utf8')).errors.map((e) => [e.code, e.name]),
  )

const render = (name, entries) =>
  `export const ${name}: Record<number, string> = {\n${Object.entries(entries)
    .map(([code, errorName]) => `  ${code}: '${errorName}',`)
    .join('\n')}\n}\n`

writeFileSync(
  new URL('src/solana/programErrors.ts', root),
  `// Generated from src/solana/idl/*.json - do not edit by hand.\n// Regenerate: node scripts/solana/generate-program-errors.mjs\n\n${render('GAMES_ERRORS', table('prophet_games.json'))}\n${render('NICKNAME_ERRORS', table('nickname_registry.json'))}`,
)
console.log('wrote src/solana/programErrors.ts')
