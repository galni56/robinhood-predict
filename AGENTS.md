# Repository Guidelines

Before substantial work, read `CLAUDE.md`, `README.md`, and `ROADMAP.md`.
`CLAUDE.md` is the authoritative project overview; consult more specific
documentation where it points you. Preserve all existing project conventions.

## Safety and scope

- Never handle private keys, seed phrases, GitHub tokens, or other secrets.
- Treat every real-mode blockchain interaction as real-mainnet and real-money.
- Do not broadcast transactions, deploy contracts, or change mainnet
  configuration unless the user explicitly requests it.
- Do not modify smart contracts unless the task explicitly requires contract
  changes.
- Never change unrelated files.
- Do not install new packages without asking first.
- Never commit or push unless the user explicitly asks.

## Working practices

- Before modifying code, inspect the relevant implementation and explain the
  intended changes.
- After changes, run appropriate checks or tests and report exactly what
  changed.
- Visually verify structural frontend changes before considering them complete.
