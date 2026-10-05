# Repository Guidelines

Before substantial work, read `CLAUDE.md`, `README.md`, and `ROADMAP.md`.
`CLAUDE.md` is the authoritative project overview; consult more specific
documentation where it points you. Preserve all existing project conventions.
Reuse knowledge of unchanged documentation already read in the current session.

## Shared-agent workflow and source of truth

Codex is the primary coding agent; DeepSeek is the fallback. Both use the same
repository and working tree. Only one agent should edit or run state-changing
commands at a time; finish a handoff before the other agent resumes.

For factual development state, use this priority:

1. Current code and tests.
2. Current Git working tree / diff.
3. `.ai/TASK.md`.
4. `.ai/HANDOFF.md`.
5. `.ai/PROJECT_MAP.md`.
6. Deeper project documentation.
7. Previous conversation context.

Verified working-tree facts override stale handoff/documentation. This hierarchy
does not override safety rules or grant permission for actions.

## Cross-agent startup protocol

When starting or resuming implementation work:

1. Read `.ai/TASK.md` if present.
2. Read `.ai/HANDOFF.md` if present.
3. Inspect `git status --short`.
4. Inspect `git diff --stat`.
5. Use `.ai/PROJECT_MAP.md` for navigation if needed.
6. Inspect only files/diffs relevant to the current task.

The actual working tree is the source of truth. If HANDOFF conflicts with verified
code/Git, treat it as stale and reconcile only the discrepancy. Do not restart
the task from scratch or rescan the repository by default.

## Context efficiency

- Do not scan the entire repository or recursively inspect it by default.
- Search before opening large files; read relevant sections and avoid repeated
  reads of unchanged implementation. Prefer existing documentation for known facts.
- Do not read generated/build/dependency directories unless needed.
- Avoid large log dumps; prefer targeted test output.
- Do not reopen settled architecture without a concrete task-related reason.

## Safety and scope

- Never handle private keys, seed phrases, GitHub tokens, or other secrets.
- Never read or expose secrets or `.env` contents.
- Treat every real-mode blockchain interaction as real-mainnet and real-money.
- Do not broadcast transactions, start the game server against mainnet (it pays
  real money automatically), or change mainnet configuration unless the user
  explicitly requests it.
- Do not change money rules (stake amounts, fees, splits, taxes, refunds) unless
  the task explicitly requires it.
- Never change unrelated files.
- Stay within `.ai/TASK.md`; the user's explicit current request sets or updates
  scope. A neutral/missing task is not permission to resume pending implementation.
- Do not perform unrelated refactors. Preserve existing dirty-tree changes and
  never discard work belonging to the user or another agent.
- Do not install, remove, or upgrade dependencies without explicit permission.
- The user has standing authorization for Codex to commit and push validated,
  in-scope work to `dima/gonochki` without asking again. This authorization does
  not cover `main`, other branches, deployments, transactions, VPS/services or
  any production-impacting action; those still require explicit approval.
- Never perform destructive Git operations without explicit permission.
- Do not perform production-impacting actions without explicit authorization.

## Working practices

- Before modifying code, inspect the relevant implementation and explain the
  intended changes.
- After changes, run appropriate checks or tests and report exactly what
  changed.
- Visually verify structural frontend changes before considering them complete.
- Validate progressively: targeted tests, related tests, then broader checks.
  Do not repeatedly run the full suite during small implementation steps.

## Settled game-server invariants

- No program of our own. A stake is a top-level SOL transfer to the game wallet
  with one `prophet:` memo; each transaction signature is applied once; stakes
  that cannot be applied are refunded, dust under 0.001 SOL is kept.
- Every outgoing transfer goes through the payout outbox: written, signed,
  stored with its blockhash expiry, then broadcast. Done only at finalized; a
  payout is rebuilt only once finalized history proves it never landed. Never
  add a path that sends SOL outside the outbox.
- Only earned fees are swept to the cold wallet, never player stakes.
- Settlement prices are price-service attestations verified against
  `ORACLE_PUBKEY`; never settle on display prices or unsigned data.
- Duels: highest percentage return wins, exact top tie refunds; fee 2% of
  winnings only; captured prices and final states are irreversible.
- Player keys stay in the player's browser (Prophet wallet); the server never
  receives or stores them (owner decision, 2026-10-05).
- Catalog changes need the owner's approval in
  `config/solana-catalog-approved.json`; never enable an unreviewed pool.

## Automatic task tracking

- When the user assigns a NEW implementation/debugging/refactoring task, update
  `.ai/TASK.md` before making product-code changes, without waiting for a separate
  request to maintain TASK.
- Briefly record: Goal; Current state relevant to the task; Relevant components/
  files if known; Required behavior; Do not change; Already decided; Done when.
- Do not rewrite TASK for every small follow-up within the same task. Update it
  when material scope/state changes; keep it operational context, not a spec archive.
- Questions, analysis requests and discussion of options without implementation
  authorization do not create a new active TASK.
- On completion, mark TASK completed or neutral/no-active-task as appropriate.

## Automatic handoff maintenance

Keep `.ai/HANDOFF.md` usable by another coding agent at any time. Update it
automatically after meaningful implementation milestones, without requiring
a manual handoff request, especially when:

- A substantial part is completed or an important design/implementation decision
  is made.
- Tests reveal an important blocker or work becomes partially implemented.
- Work is paused or the user indicates an agent switch: "handoff", "switch to
  DeepSeek", "switch to Codex", "stop here", or equivalent.

Contain only: Completed; In progress; Relevant changed files; Important findings /
decisions; Test status; Blockers; Next exact step. Label unrun checks and historical
validation accurately. Keep it concise, ideally under ~60 lines; no conversation
history, full git-status inventories or large diffs. Git and `.ai/STATE.md` handle
mechanical working-tree state; do not assume STATE exists or is current.
Runtime TASK/HANDOFF/STATE files stay local; templates and PROJECT_MAP are trackable.

## Cross-agent continuation

Assume another compatible coding agent may continue at any time. Do not rely on
conversation-only knowledge for important task state. Record persistent task
state in TASK/HANDOFF, permanent rules in AGENTS, and navigation in PROJECT_MAP.
Do not duplicate information unnecessarily between them.

## Usage/context interruption resilience

If a practical stopping point, context limit or forced interruption is detectable,
update HANDOFF before stopping when possible. Never assume it is perfectly current:
the next agent must still verify the actual Git working tree before continuing.
