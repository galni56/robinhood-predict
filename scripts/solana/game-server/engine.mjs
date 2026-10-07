// The game server's engine: turns SOL that reaches the game wallet into
// bets and arena entries, runs every game through its timers with boundary
// prices from the price service, and pays winners, refunds and creator fees
// from the game wallet.
//
// Money rules:
// - A stake is a top-level System transfer to the game wallet with one
//   `prophet:` memo (rules.mjs). Each transaction signature is applied once.
// - Anything that cannot be applied (late, wrong game, over the limit, no
//   memo...) is refunded to the sender, minus nothing, when it is at least
//   MIN_REFUND; smaller dust is kept so nobody can make us pay fees in a loop.
// - Every transfer we owe is first written to the payouts outbox. It is
//   signed, its signature and blockhash expiry are stored, and only then is
//   it broadcast. A stored transaction is only rebuilt once its blockhash has
//   expired without it landing, so a crash or a lost send never pays twice.
// - Everything beyond what players are owed (Prophet's fees) can be swept to
//   the owner's cold wallet, so the hot wallet holds as little as possible.
// - Top-ups of the game wallet itself (fee money) come from the cold wallet
//   or the admin, or carry the memo `prophet:fund`; they are never refunded.

import { createPublicKey, verify, createHash } from 'node:crypto'
import {
  ARENA,
  COMMUNITY_POLICY,
  COMMUNITY_RACE_DURATIONS,
  RACE,
  RuleError,
  STAKE,
  addLobbyAsset,
  arenaDeposit,
  arenaNeedsResolve,
  arenaSettlements,
  arenaTimers,
  changePrediction,
  createArena,
  createCommunityRace,
  createPlatformRace,
  placeBet,
  raceActiveCount,
  raceNeedsResolve,
  raceNeedsStart,
  raceSettlements,
  raceTimers,
  resolveArena,
  resolveRace,
  startRace,
} from './rules.mjs'
import { fromBase58, isAddress } from './chain.mjs'
import { DUEL, backDuel, createDuel, duelNeedsResolve, duelNeedsStart, duelSettlements, duelTimers, joinDuel, leaveDuel, payDuel, prepareDuel, readyDuel, resolveDuel, startDuel } from './duel.mjs'
import { SHOT, aimShot, createShot, joinShot, leaveShot, lockShot, readyShot, resolveShot, shotNeedsResolve, shotSettlements, shotTimers } from './shot.mjs'
import { FINAL_STATUSES } from './db.mjs'
import { createPayouts } from './payouts.mjs'
import { createDeposits } from './deposits.mjs'

const LAMPORTS_PER_SOL = 1_000_000_000n

export const DEFAULTS = {
  /** Wait this long past a boundary for late stakes to show up and for the
   * boundary's slots to finalize (~13s on mainnet) before settling. */
  settleDelay: 15,
  /** Smaller unusable deposits are kept instead of refunded. */
  minRefund: LAMPORTS_PER_SOL / 1_000n,
  /** Creator fees are sent once they reach this (must exceed rent exemption). */
  creatorPayoutMin: LAMPORTS_PER_SOL / 1_000n,
  /** Kept in the hot wallet above what is owed, for transaction fees. */
  reserve: LAMPORTS_PER_SOL / 50n,
  /** Sweep surplus to the cold wallet once it reaches this. */
  sweepMin: LAMPORTS_PER_SOL / 10n,
  sweepEverySeconds: 3_600,
  /** Signed actions must be this fresh. */
  messageMaxAge: 300,
  maxOpenGamesPerWallet: 3,
  maxOpenCommunityGames: 50,
  maxPayoutAttempts: 6,
  rebroadcastEverySeconds: 8,
  arenaLobbyDuration: ARENA.lobbyDuration,
  /** A listed signature still unreadable this many slots below the
   * finalized slot is marked dropped instead of blocking settlement. */
  unreadableAfterSlots: 300,
  /** Signature pages (1000 each) one deposit scan reads before it continues next time. */
  scanPages: 20,
  /** Spectators may back one duel racer with up to this much (USD cents). */
  duelBackCapUsdCents: 10_000,
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Verifies a wallet's ed25519 signature over `message` (UTF-8). */
export function verifyWalletSignature(wallet, message, signatureBase64) {
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(fromBase58(wallet))]), format: 'der', type: 'spki' })
  const signature = Buffer.from(signatureBase64, 'base64')
  return signature.length === 64 && verify(null, Buffer.from(message, 'utf8'), key, signature)
}

/** Catalog assets (config/solana-assets.json) the games may use. */
export function catalogAssets(catalog) {
  return catalog.assets
    // Stocks are off (owner decision, 2026-10-05): memes and crypto only.
    .filter((a) => a.approved !== false && a.category !== 'STOCK')
    .map((a) => ({
      symbol: a.symbol,
      name: a.name,
      category: a.category.toLowerCase(),
      priceSource: a.pool,
      priceDecimals: a.priceDecimals,
      enabled: true,
      mint: a.mint,
      logoUrl: a.icon ?? null,
      priceUrl: a.priceUrl ?? null,
      source: a.source ?? 'catalog',
      ...(a.source === 'pumpswap' ? { liquidityUsd: a.liquidityUsd, volume24hUsd: a.volume24hUsd, poolCreatedAt: a.poolCreatedAt, addedAt: a.addedAt, launchedOnProphet: a.launchedOnProphet === true, ...(a.onCurve === true ? { onCurve: true } : {}) } : {}),
    }))
}

/**
 * @param {object} o
 * @param {ReturnType<import('./db.mjs').openDatabase>} o.db
 * @param {ReturnType<import('./chain.mjs').createChain>} o.chain
 * @param {{ boundary(target: number, sources: string[]): Promise<{prevSlot:number, prevBlockTime:number, prices:Record<string,bigint>, decimals:Record<string,number>, attestation:object}> }} o.prices
 * @param {ReturnType<typeof catalogAssets>} o.assets
 * @param {string} o.cluster
 * @param {string|null} [o.coldWallet] owner's wallet that receives swept surplus
 * @param {string} [o.admin] wallet credited as creator of platform races
 * @param {() => number} [o.clock] unix seconds
 */
export function createEngine({ db, chain, prices, assets, cluster, coldWallet = null, admin = null, adoptWallet = false, signingDomains = null, clock, log = console, options = {} }) {
  const opts = { ...DEFAULTS, ...options }
  const now = clock ?? (() => Math.floor(Date.now() / 1000))
  // Replaced when the PumpSwap catalog refreshes (setAssets).
  let currentAssets = assets
  let assetBySymbol = new Map(assets.map((a) => [a.symbol, a]))
  const platformCreator = admin ?? chain.address
  const funders = new Set([coldWallet, admin].filter(Boolean))
  let lastScan = { at: 0, pending: 0 }

  // ------------------------------------------------------------ deposits

  const { ingest, init, scanDeposits } = createDeposits({
    db, chain, opts, log, now, funders, adoptWallet,
    applyStake: (memo, stake) => applyStake(memo, stake),
    setLastScan: (scan) => { lastScan = scan },
  })

  // -------------------------------------------------------------- games

  /** Applies a parsed stake memo to its game (throws RuleError to refuse). */
  function applyStake(memo, stake) {
    const game = db.getGame(memo.kind, memo.id)
    if (!game) throw new RuleError('GameNotFound')
    if (memo.kind === 'race') placeBet(game, { ...stake, assetIndex: memo.assetIndex })
    else if (memo.kind === 'arena') arenaDeposit(game, { ...stake, prediction: memo.prediction })
    else if (memo.kind === 'shot') lockShot(game, stake)
    else if (memo.seat === 0) payDuel(game, stake)
    else backDuel(game, { ...stake, seat: memo.seat, maxPerWallet: duelBackCap() })
    db.saveGame(game)
  }


  /** Loads a game fresh, applies `fn`, saves it and queues what it now owes. */
  function mutate(kind, id, fn) {
    return db.transaction(() => {
      const game = db.getGame(kind, id)
      if (!game) throw new RuleError('GameNotFound')
      const wasFinal = FINAL_STATUSES.has(game.status)
      const result = fn(game)
      db.saveGame(game)
      if (!wasFinal && FINAL_STATUSES.has(game.status)) queueSettlements(game)
      return result
    })
  }

  /** Money the duel rules moved outside settlement (leaves, kicks, tax shares). */
  function queueDuelTransfers(duel, transfers, tag) {
    transfers.forEach((tr, i) => {
      db.addPayout({ key: `duel:${duel.id}:${tag}:${i}:${tr.reason}:${tr.wallet}`, kind: tr.reason === 'tax-share' ? 'tax-share' : 'refund', wallet: tr.wallet, amount: tr.amount, gameKind: 'duel', gameId: duel.id })
    })
  }

  function queueSettlements(game) {
    const raw = game.kind === 'race' ? raceSettlements(game) : game.kind === 'arena' ? arenaSettlements(game) : game.kind === 'shot' ? shotSettlements(game) : duelSettlements(game)
    // One payout per wallet and reason (a spectator may have backed twice).
    const merged = new Map()
    for (const s of raw) {
      const key = `${s.reason}:${s.wallet}`
      merged.set(key, { ...s, amount: (merged.get(key)?.amount ?? 0n) + s.amount })
    }
    const settlements = [...merged.values()]
    for (const s of settlements) {
      db.addPayout({ key: `${game.kind}:${game.id}:${s.reason}:${s.wallet}`, kind: s.reason, wallet: s.wallet, amount: s.amount, gameKind: game.kind, gameId: game.id })
    }
    // Platform races and duels credit Prophet; their creator half stays with the fees.
    const creatorPaid = game.kind === 'arena' || game.kind === 'shot' || (game.kind === 'race' && game.origin === 'community')
    if (game.status === 'resolved' && creatorPaid && game.creatorFee > 0n) {
      const balance = db.creatorBalance(game.creator) + game.creatorFee
      if (balance >= opts.creatorPayoutMin) {
        db.addPayout({ key: `creator:${game.creator}:${game.kind}:${game.id}`, kind: 'creator', wallet: game.creator, amount: balance, gameKind: game.kind, gameId: game.id })
        db.setCreatorBalance(game.creator, 0n)
      } else {
        db.setCreatorBalance(game.creator, balance)
      }
    }
    log.log(`${game.kind} #${game.id}: ${game.status}${game.cancelReason && game.cancelReason !== 'none' ? ` (${game.cancelReason})` : ''}, ${settlements.length} payout(s) queued`)
  }

  /**
   * Prices at a boundary, in the precision each game stored for its assets.
   * A PumpSwap coin's precision can change between joining and the boundary
   * (it left the list and came back, or its price moved by orders of
   * magnitude); the signed price is the same value, so it is rescaled rather
   * than refused - refusing voided every such game at its start.
   */
  async function boundaryPrices(target, assetsNeeded) {
    const result = await prices.boundary(target, [...new Set(assetsNeeded.map((a) => a.priceSource))])
    const scaled = { ...result.prices }
    for (const a of assetsNeeded) {
      const signed = result.decimals[a.priceSource]
      if (signed === a.priceDecimals || typeof scaled[a.priceSource] !== 'bigint') continue
      const shift = a.priceDecimals - signed
      scaled[a.priceSource] = shift > 0 ? result.prices[a.priceSource] * 10n ** BigInt(shift) : result.prices[a.priceSource] / 10n ** BigInt(-shift)
      log.warn(`${a.symbol}: signed price has ${signed} decimals, game uses ${a.priceDecimals}; rescaled`)
    }
    return { ...result, prices: scaled }
  }

  const attestationRecord = (b) => ({ prevSlot: b.prevSlot, prevBlockTime: b.prevBlockTime, ...b.attestation })

  /** Every stake confirmed before `boundary` is visible once this is true. */
  const settledPast = (boundary, t) => t >= boundary + opts.settleDelay && lastScan.at >= boundary + opts.settleDelay && lastScan.pending === 0

  async function advanceRace(race, t) {
    const { id } = race
    if (race.status === 'lobby') {
      if (t >= race.lobbyEndTime) mutate('race', id, (r) => raceTimers(r, t))
      return
    }
    if (race.status === 'betting') {
      if (!settledPast(race.bettingEndTime, t)) {
        // A stuck scan must not freeze stakes: once the start window has
        // expired the race cancels and refunds anyway (late-ingested stakes
        // on a cancelled race are refunded as they arrive).
        if (t >= race.bettingEndTime + race.startGrace) mutate('race', id, (r) => raceTimers(r, t))
        return
      }
      if (!raceNeedsStart(race, t) || raceActiveCount(race) < race.minActiveContenders) {
        // Past the start window, or too few backed assets: cancel and refund.
        mutate('race', id, (r) => raceTimers(r, t) ?? startRace(r, { prices: {}, prevSlot: 0, prevBlockTime: 0 }, t))
        return
      }
      const active = race.assets.filter((a) => a.pool > 0n)
      const b = await boundaryPrices(race.bettingEndTime, active)
      mutate('race', id, (r) => {
        if (!raceNeedsStart(r, t)) return null
        r.startAttestation = attestationRecord(b)
        return startRace(r, b, t)
      })
      return
    }
    if (race.status === 'running' && t >= race.raceEndTime) {
      if (!raceNeedsResolve(race, t)) {
        mutate('race', id, (r) => raceTimers(r, t))
        return
      }
      const b = await boundaryPrices(race.raceEndTime, race.assets.filter((a) => a.active))
      mutate('race', id, (r) => {
        if (!raceNeedsResolve(r, t)) return null
        r.endAttestation = attestationRecord(b)
        return resolveRace(r, b, t)
      })
    }
  }

  async function advanceArena(arena, t) {
    const { id } = arena
    if (arena.status !== 'open') return
    if (t >= arena.startsAt && arena.entries.length < ARENA.minParticipants) {
      if (settledPast(arena.startsAt, t)) mutate('arena', id, (a) => arenaTimers(a, t))
      return
    }
    if (t < arena.deadline) return
    if (!arenaNeedsResolve(arena, t)) {
      mutate('arena', id, (a) => arenaTimers(a, t))
      return
    }
    const asset = { symbol: arena.symbol, priceSource: arena.priceSource, priceDecimals: arena.priceDecimals }
    const b = await boundaryPrices(arena.deadline, [asset])
    mutate('arena', id, (a) => {
      if (!arenaNeedsResolve(a, t)) return null
      a.finalAttestation = attestationRecord(b)
      return resolveArena(a, { price: b.prices[a.priceSource], prevSlot: b.prevSlot, prevBlockTime: b.prevBlockTime }, t)
    })
  }

  async function advanceShot(shot, t) {
    const { id } = shot
    if (shot.status === 'aim' && t >= shot.aimEndsAt) {
      // Stakes confirmed before the aim ended must all be in before deciding
      // who plays; a stuck scan holds this back at most SHOT.startGrace.
      if (!settledPast(shot.aimEndsAt, t) && t < shot.aimEndsAt + SHOT.startGrace) return
      mutate('shot', id, (s) => shotTimers(s, t))
      return
    }
    if (shot.status === 'open' || (shot.status === 'live' && t > shot.deadline + SHOT.resolutionGrace)) {
      mutate('shot', id, (s) => shotTimers(s, t))
      return
    }
    if (shot.status !== 'live' || t < shot.deadline + 2 || !shotNeedsResolve(shot, t)) return
    const asset = { symbol: shot.symbol, priceSource: shot.priceSource, priceDecimals: shot.priceDecimals }
    const b = await boundaryPrices(shot.deadline, [asset])
    mutate('shot', id, (s) => {
      if (!shotNeedsResolve(s, t)) return null
      s.finalAttestation = attestationRecord(b)
      return resolveShot(s, { price: b.prices[s.priceSource], prevSlot: b.prevSlot, prevBlockTime: b.prevBlockTime }, t)
    })
  }

  // ------------------------------------------------------------- payouts

  const { processPayouts, liabilities, solvency, maybeSweep } = createPayouts({ db, chain, opts, log, now, coldWallet, lastScan: () => lastScan })

  // --------------------------------------------------------------- duels

  // SOL/USD for the spectator cap; refreshed every tick when the service has it.
  let solUsd = null
  const duelBackCap = () => (solUsd ? (BigInt(opts.duelBackCapUsdCents) * LAMPORTS_PER_SOL * 10n ** BigInt(solUsd.decimals)) / (solUsd.raw * 100n) : LAMPORTS_PER_SOL / 2n)
  const kicksThisWeek = (wallet) => db.kicksSince(wallet, now() - 7 * 24 * 3600)

  async function advanceDuel(duel, t) {
    const { id } = duel
    if (duel.status === 'open' || duel.status === 'ready' || duel.status === 'starting' || duel.status === 'running') {
      mutate('duel', id, (d) => {
        const { transfers, kicked } = duelTimers(d, t, kicksThisWeek)
        for (const wallet of kicked) db.addKick(wallet, t)
        if (transfers.length) queueDuelTransfers(d, transfers, `t${t}`)
      })
    }
    const fresh = db.getGame('duel', id)
    if (fresh.status === 'starting' && t >= fresh.startTime + 2 && duelNeedsStart(fresh, t)) {
      const b = await boundaryPrices(fresh.startTime, fresh.racers.map((r) => ({ symbol: r.symbol, priceSource: r.priceSource, priceDecimals: r.priceDecimals })))
      mutate('duel', id, (d) => {
        if (!duelNeedsStart(d, t)) return null
        d.startAttestation = attestationRecord(b)
        return startDuel(d, b, t)
      })
    } else if (fresh.status === 'running' && duelNeedsResolve(fresh, t)) {
      const b = await boundaryPrices(fresh.endTime, fresh.racers.map((r) => ({ symbol: r.symbol, priceSource: r.priceSource, priceDecimals: r.priceDecimals })))
      mutate('duel', id, (d) => {
        if (!duelNeedsResolve(d, t)) return null
        d.endAttestation = attestationRecord(b)
        return resolveDuel(d, b, t)
      })
    }
  }

  /** Keeps DUEL.emptyLobbies empty lobbies waiting for racers. */
  /** Empty lobbies older than this beyond DUEL.emptyLobbies are closed (they hold no money). */
  const SPARE_LOBBY_SECONDS = 600

  function fillDuelLobbies(t) {
    const empty = db.liveGames().filter((g) => g.kind === 'duel' && g.status === 'open' && g.racers.length === 0 && g.backers.length === 0)
    for (let i = empty.length; i < DUEL.emptyLobbies; i++) {
      db.transaction(() => db.saveGame(createDuel(db.nextId('duel'), t)))
    }
    // Lobbies players opened and left pile up otherwise: keep the oldest
    // DUEL.emptyLobbies, close the rest once they have been idle a while.
    const spare = empty.sort((a, b) => a.id - b.id).slice(DUEL.emptyLobbies).filter((g) => t - g.createdAt > SPARE_LOBBY_SECONDS)
    for (const g of spare) {
      mutate('duel', g.id, (d) => {
        if (d.status !== 'open' || d.racers.length > 0 || d.backers.length > 0) return
        d.status = 'cancelled'
        d.cancelReason = 'emptyLobby'
        d.resolvedAt = t
      })
    }
  }

  // ---------------------------------------------------------------- tick

  let running = false
  async function tick() {
    if (running) return
    running = true
    // Each stage is isolated: an RPC error in the scan or a slow price
    // service must never stop winners from being paid (or vice versa).
    const stage = async (name, fn) => {
      try {
        await fn()
      } catch (error) {
        log.warn(`tick ${name}: ${error.message.split('\n')[0]}`)
      }
    }
    try {
      await stage('scan', scanDeposits)
      // Payouts run before game advancement: boundary price fetches can take
      // seconds each, and they must never hold up winners being paid.
      await stage('payouts', processPayouts)
      const t = now()
      if (prices?.solUsd) solUsd = await prices.solUsd().catch(() => solUsd)
      await stage('lobbies', async () => fillDuelLobbies(t))
      for (const game of db.liveGames()) {
        try {
          if (game.kind === 'race') await advanceRace(game, t)
          else if (game.kind === 'arena') await advanceArena(game, t)
          else if (game.kind === 'shot') await advanceShot(game, t)
          else await advanceDuel(game, t)
        } catch (error) {
          log.warn(`${game.kind} #${game.id}: ${error.message}`)
        }
      }
      // Second pass: settlements queued by this tick go out right away.
      await stage('payouts', processPayouts)
      // Older than twice the message lifetime: any replay is rejected as expired.
      await stage('replay-guard', async () => db.pruneMessages(t - 2 * opts.messageMaxAge))
      await stage('sweep', () => maybeSweep(t))
    } finally {
      running = false
    }
  }

  // ------------------------------------------------------------- actions

  const openGamesBy = (wallet) => db.liveGames().filter((g) => g.creator === wallet)
  const openCommunityGames = () => db.liveGames().filter((g) => g.kind === 'arena' || g.kind === 'shot' || g.origin === 'community')

  function requireAsset(symbol) {
    const asset = assetBySymbol.get(symbol)
    if (!asset) throw new RuleError('AssetNotApproved')
    return asset
  }

  function requireCreationRoom(wallet) {
    if (openGamesBy(wallet).length >= opts.maxOpenGamesPerWallet) throw new RuleError('TooManyOpenGames')
    if (openCommunityGames().length >= opts.maxOpenCommunityGames) throw new RuleError('TooManyOpenGames')
  }

  /**
   * A wallet-signed action. `message` is "Prophet\n" + JSON with `action`,
   * `wallet`, `cluster`, `issuedAt` and the action's fields; the signature is
   * the wallet's signMessage over it (base64).
   */
  function act({ message, signature }) {
    // The brand line the site signs: 'HasteFun' since the rename (2026-10-07), 'Prophet' before.
    const prefix = typeof message === 'string' ? ['HasteFun\n', 'Prophet\n'].find((p) => message.startsWith(p)) : undefined
    if (!prefix) throw new RuleError('BadMessage')
    let payload
    try {
      payload = JSON.parse(message.slice(prefix.length))
    } catch {
      throw new RuleError('BadMessage')
    }
    const { action, wallet, issuedAt } = payload
    if (!isAddress(wallet) || payload.cluster !== cluster) throw new RuleError('BadMessage')
    // Domain binding: a signature collected on a look-alike site is useless
    // here. The nonce makes every signed message unique, so two identical
    // actions in the same second are not mistaken for a replay.
    if (signingDomains && !signingDomains.includes(payload.domain)) throw new RuleError('WrongDomain')
    if (typeof payload.nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(payload.nonce)) throw new RuleError('BadMessage')
    if (!Number.isInteger(issuedAt) || Math.abs(now() - issuedAt) > opts.messageMaxAge) throw new RuleError('MessageExpired')
    if (typeof signature !== 'string' || !verifyWalletSignature(wallet, message, signature)) throw new RuleError('BadSignature')
    const t = now()
    return db.transaction(() => {
      // Keyed on the signed message itself, not the signature string: base64
      // decoding is lenient (padding, url-safe alphabet, whitespace), so one
      // signature has many spellings and keying on the text let a replay
      // through within the message lifetime.
      try {
        db.useMessage(`msg:${createHash('sha256').update(message).digest('hex')}`, wallet)
      } catch {
        throw new RuleError('MessageReused')
      }
      switch (action) {
        case 'create-race': {
          requireCreationRoom(wallet)
          const symbols = Array.isArray(payload.assets) ? payload.assets : []
          const race = createCommunityRace(db.nextId('race'), {
            title: payload.title, category: payload.category, creator: wallet, raceDuration: payload.duration, unit: payload.unit,
          }, symbols.map(requireAsset), t)
          db.saveGame(race)
          return { kind: 'race', id: race.id }
        }
        case 'add-lobby-asset':
          mutate('race', Number(payload.race), (r) => addLobbyAsset(r, wallet, requireAsset(payload.asset), t))
          return { kind: 'race', id: Number(payload.race) }
        case 'create-arena': {
          requireCreationRoom(wallet)
          const arena = createArena(db.nextId('arena'), { title: payload.title, creator: wallet, duration: payload.duration, unit: payload.unit }, requireAsset(payload.asset), t, opts.arenaLobbyDuration)
          db.saveGame(arena)
          return { kind: 'arena', id: arena.id }
        }
        case 'change-prediction': {
          if (!/^\d{1,30}$/.test(String(payload.prediction))) throw new RuleError('InvalidPrediction')
          mutate('arena', Number(payload.arena), (a) => changePrediction(a, { wallet, prediction: BigInt(payload.prediction), time: t }))
          return { kind: 'arena', id: Number(payload.arena) }
        }
        case 'set-nickname': {
          const nickname = String(payload.nickname ?? '').trim()
          if (nickname === '') {
            db.clearNickname(wallet)
            return { nickname: null }
          }
          const bytes = Buffer.byteLength(nickname, 'utf8')
          if (bytes > 24 || /[\u0000-\u001f\u007f]/.test(nickname)) throw new RuleError('InvalidNickname')
          const owner = db.nicknameOwner(nickname.toLowerCase())
          if (owner && owner !== wallet) throw new RuleError('NicknameTaken')
          db.setNickname(wallet, nickname)
          return { nickname }
        }
        case 'shot-create': {
          requireCreationRoom(wallet)
          const shot = createShot(db.nextId('shot'), { title: payload.title, creator: wallet, duration: payload.duration }, requireAsset(payload.asset), t)
          joinShot(shot, wallet, t)
          db.saveGame(shot)
          return { kind: 'shot', id: shot.id }
        }
        case 'shot-join':
          mutate('shot', Number(payload.shot), (g) => joinShot(g, wallet, t))
          return { kind: 'shot', id: Number(payload.shot) }
        case 'shot-leave':
          mutate('shot', Number(payload.shot), (g) => leaveShot(g, wallet))
          return { kind: 'shot', id: Number(payload.shot) }
        case 'shot-ready':
          mutate('shot', Number(payload.shot), (g) => readyShot(g, wallet, payload.ready !== false, t))
          return { kind: 'shot', id: Number(payload.shot) }
        case 'shot-aim': {
          // Lock Shot, step 1: the price stays on the server (hidden) until the
          // stake transfer (memo prophet:shot:<id>:0) locks it in.
          if (!/^\d{1,30}$/.test(String(payload.prediction))) throw new RuleError('InvalidPrediction')
          mutate('shot', Number(payload.shot), (g) => aimShot(g, { wallet, prediction: BigInt(payload.prediction) }, t))
          return { kind: 'shot', id: Number(payload.shot) }
        }
        case 'duel-create': {
          // Only lobbies someone is in count: an empty one a player opened and left is spare.
          if (openGamesBy(wallet).filter((g) => g.kind === 'duel' && (g.racers.length > 0 || g.backers.length > 0)).length >= opts.maxOpenGamesPerWallet) throw new RuleError('TooManyOpenGames')
          const duel = createDuel(db.nextId('duel'), t, wallet)
          db.saveGame(duel)
          return { kind: 'duel', id: duel.id }
        }
        case 'duel-join': {
          const stake = payload.stake != null && /^\d{1,20}$/.test(String(payload.stake)) ? BigInt(payload.stake) : undefined
          mutate('duel', Number(payload.duel), (d) => joinDuel(d, { wallet, asset: requireAsset(payload.asset), stake, duration: payload.duration, title: payload.title }, t))
          return { kind: 'duel', id: Number(payload.duel) }
        }
        case 'duel-leave':
          mutate('duel', Number(payload.duel), (d) => queueDuelTransfers(d, leaveDuel(d, wallet), `leave${t}`))
          return { kind: 'duel', id: Number(payload.duel) }
        case 'duel-ready':
          mutate('duel', Number(payload.duel), (d) => readyDuel(d, wallet, t))
          return { kind: 'duel', id: Number(payload.duel) }
        case 'duel-prepare':
          mutate('duel', Number(payload.duel), (d) => prepareDuel(d, wallet, t))
          return { kind: 'duel', id: Number(payload.duel) }
        default:
          throw new RuleError('UnknownAction')
      }
    })
  }

  /** A platform race (admin CLI or the schedule). */
  function createPlatform(input) {
    return db.transaction(() => {
      const race = createPlatformRace(db.nextId('race'), {
        startGrace: 300,
        resolutionGrace: 600,
        feeBp: 200,
        minActiveContenders: 2,
        minStake: STAKE.min,
        maxStakePerWallet: STAKE.max,
        ...input,
        creator: platformCreator,
      }, input.symbols.map(requireAsset), now())
      db.saveGame(race)
      return race
    })
  }

  /** Keeps one race per schedule entry open for betting (config/platform-races.json). */
  function fillSchedule(schedule) {
    if (schedule?.enabled !== true) return
    const t = now()
    const live = db.liveGames().filter((g) => g.kind === 'race' && g.origin === 'platform')
    for (const entry of schedule.races) {
      const open = live.some((r) => r.title === entry.title && r.status === 'betting' && r.bettingEndTime > t)
      if (open) continue
      const race = createPlatform({
        title: entry.title,
        category: entry.category.toLowerCase(),
        symbols: entry.symbols,
        bettingStartTime: t,
        bettingEndTime: t + entry.bettingSeconds,
        raceDuration: entry.raceSeconds,
        startGrace: schedule.defaults?.startGraceSeconds ?? 300,
        resolutionGrace: schedule.defaults?.resolutionGraceSeconds ?? 600,
        feeBp: schedule.defaults?.feeBp ?? 200,
        minActiveContenders: schedule.defaults?.minActiveContenders ?? 2,
      })
      log.log(`schedule: race #${race.id} "${race.title}" created`)
    }
  }

  /** A free cheer for a racer (no wallet; the server rate-limits per address). */
  function cheer(duelId, seat) {
    return mutate('duel', Number(duelId), (d) => {
      const r = d.racers.find((x) => x.seat === Number(seat))
      if (!r || d.status === 'resolved' || d.status === 'void') throw new RuleError('NoSuchRacer')
      r.cheers += 1
      return r.cheers
    })
  }

  return {
    init,
    cheer,
    ingest,
    scanDeposits,
    tick,
    act,
    createPlatform,
    fillSchedule,
    processPayouts,
    solvency,
    liabilities,
    get lastScan() {
      return lastScan
    },
    config: () => ({
      cluster,
      gameWallet: chain.address,
      stake: { min: STAKE.min, max: STAKE.max },
      race: { minAssets: RACE.minAssets, maxAssets: RACE.maxAssets, communityDurations: COMMUNITY_RACE_DURATIONS, communityPolicy: COMMUNITY_POLICY },
      arena: { durations: ARENA.durations, lobbyDuration: ARENA.lobbyDuration, maxParticipants: ARENA.maxParticipants, feeBp: ARENA.feeBp },
      shot: { minPlayers: SHOT.minPlayers, maxPlayers: SHOT.maxPlayers, aimSeconds: SHOT.aimSeconds, durations: SHOT.durations, feeBp: SHOT.feeBp },
      duel: { minRacers: DUEL.minRacers, maxRacers: DUEL.maxRacers, durations: DUEL.durations, payWindow: DUEL.payWindow, readyWindow: DUEL.readyWindow, prepareExtra: DUEL.prepareExtra, backCap: duelBackCap(), racerShareBp: Number(DUEL.racerShareBp), feeBp: Number(DUEL.feeBp) },
      assets: currentAssets,
    }),
    setAssets(list) {
      currentAssets = list
      assetBySymbol = new Map(list.map((a) => [a.symbol, a]))
    },
    /** Symbols of assets used by games that are not final yet. */
    liveSymbols() {
      // Duels keep their coins in racers[], races in assets[], arenas in symbol.
      return new Set(db.liveGames().flatMap((g) => (g.kind === 'race' ? g.assets.map((a) => a.symbol) : g.kind === 'duel' ? (g.racers ?? []).map((r) => r.symbol) : [g.symbol])))
    },
  }
}
