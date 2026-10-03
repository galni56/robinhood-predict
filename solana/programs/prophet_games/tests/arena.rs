mod arena_common;

use {
    anchor_lang::{prelude::Pubkey, InstructionData},
    arena_common::*,
    prophet_games::{instruction as ix, state::*, ARENA_LOBBY_DURATION, NATIVE_SOL, ARENA_RESOLUTION_GRACE},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

#[test]
fn initialize_requires_upgrade_authority() {
    let mut h = Harness::deploy();
    let stranger = h.user(10);
    let instruction = h.initialize_ix(&stranger.pubkey());
    assert_err(h.send(&[instruction], &stranger, &[]), "Unauthorized");
    let admin = h.admin.insecure_clone();
    h.send(&[h.initialize_ix(&admin.pubkey())], &admin, &[]).unwrap();
    assert_eq!(h.config().admin, admin.pubkey());
}

#[test]
fn closest_half_wins_weighted_by_accuracy() {
    let mut h = Harness::new();
    let arena_id = h.create_arena(300).unwrap();
    let arena = h.arena(arena_id);
    assert_eq!(arena.starts_at, START_TIME + ARENA_LOBBY_DURATION);
    assert_eq!(arena.deadline, arena.starts_at + 300);

    // Final price will be 1000.
    let players: Vec<Keypair> = (0..5).map(|_| h.user(10)).collect();
    let picks = [(1_000, SOL / 10), (1_010, 2 * SOL / 10), (980, SOL / 10), (1_100, 3 * SOL / 10), (900, SOL / 10)];
    for (player, (prediction, stake)) in players.iter().zip(picks) {
        h.enter(arena_id, player, prediction, stake).unwrap();
    }
    assert_eq!(h.arena(arena_id).total_pool, 8 * SOL / 10);

    let oracle = h.oracle.insecure_clone();
    let attestation = h.attestation(arena.deadline, 1_000);
    h.set_time(arena.deadline - 1);
    assert_err(h.resolve_with(arena_id, &attestation, &oracle), "TooEarly");
    h.set_time(arena.deadline + 3);
    h.resolve_with(arena_id, &attestation, &oracle).unwrap();

    let arena = h.arena(arena_id);
    assert_eq!(arena.status, ArenaStatus::Resolved);
    assert_eq!(arena.final_price, 1_000);
    assert_eq!(arena.winner_count, 2);

    // Winners: exact hit (3x) and error 10 (cutoff, 1x). Losers stake 0.5 SOL.
    let losing = 5 * SOL / 10;
    let fee = losing * 200 / 10_000;
    let distributable = losing - fee;
    let (a, b) = (h.entry_of(arena_id, &players[0].pubkey()), h.entry_of(arena_id, &players[1].pubkey()));
    assert_eq!((a.rank, a.accuracy_multiplier_bp), (1, 30_000));
    assert_eq!((b.rank, b.accuracy_multiplier_bp), (2, 10_000));
    // Scores 0.1*3 = 0.3 and 0.2*1 = 0.2 → 60% / 40% of the distributable pool.
    assert_eq!(a.payout, SOL / 10 + distributable * 3 / 5);
    assert_eq!(b.payout, 2 * SOL / 10 + distributable * 2 / 5);
    assert_eq!(h.entry_of(arena_id, &players[2].pubkey()).rank, 3);
    assert_eq!(h.entry_of(arena_id, &players[3].pubkey()).rank, 4);
    assert_eq!(h.entry_of(arena_id, &players[4].pubkey()).payout, 0);
    assert_eq!(arena.creator_fee, fee / 2);
    assert_eq!(arena.protocol_fee, fee - fee / 2);

    let before = h.balance(&players[0].pubkey());
    h.settle(ix::ClaimArena {}.data(), arena_id, &players[0]).unwrap();
    assert_eq!(h.balance(&players[0].pubkey()), before + a.payout);
    assert_err(h.settle(ix::ClaimArena {}.data(), arena_id, &players[0]), "AlreadySettled");
    assert_err(h.settle(ix::ClaimArena {}.data(), arena_id, &players[3]), "NoWinningPayout");
    assert_err(h.settle(ix::RefundArena {}.data(), arena_id, &players[3]), "ArenaNotCancelled");
    h.settle(ix::ClaimArena {}.data(), arena_id, &players[1]).unwrap();

    // Escrow is back to exactly its rent once both winners are paid.
    let account = h.svm.get_account(&arena_pda(arena_id)).unwrap();
    assert_eq!(account.lamports, h.svm.minimum_balance_for_rent_exemption(account.data.len()));
    assert_eq!(h.arena(arena_id).remaining_liability, 0);

    let treasury: Treasury = h.fetch(&treasury_pda());
    assert_eq!(treasury.accumulated_fees, fee - fee / 2);
    let earnings: CreatorEarnings = h.fetch(&creator_pda(&h.admin.pubkey()));
    assert_eq!(earnings.amount, fee / 2);
}

#[test]
fn ten_player_arena_resolves_in_one_transaction() {
    let mut h = Harness::new();
    let arena_id = h.create_arena(60).unwrap();
    let players: Vec<Keypair> = (0..10).map(|_| h.user(10)).collect();
    for (i, player) in players.iter().enumerate() {
        h.enter(arena_id, player, 1_000 + (i as u64) * 7, SOL / 10 + i as u64 * 1_000).unwrap();
    }
    let eleventh = h.user(10);
    assert_err(h.enter(arena_id, &eleventh, 1_000, SOL / 10), "ArenaFull");

    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline);
    let oracle = h.oracle.insecure_clone();
    h.resolve_with(arena_id, &h.attestation(deadline, 1_020), &oracle).unwrap();
    eprintln!("10-player resolve: {} compute units", h.last_compute_units);
    assert!(h.last_compute_units < 100_000, "resolve must stay well under the 200k default");
    let arena = h.arena(arena_id);
    assert_eq!(arena.winner_count, 5);
    let ranks: Vec<u8> = arena.entries.iter().map(|e| e.rank).collect();
    let mut sorted = ranks.clone();
    sorted.sort();
    assert_eq!(sorted, (1..=10).collect::<Vec<u8>>());

    // Every lamport is accounted for: payouts + fees == pool.
    let payouts: u64 = arena.entries.iter().map(|e| e.payout).sum();
    assert_eq!(payouts + arena.protocol_fee + arena.creator_fee, arena.total_pool);
    for player in &players {
        if h.entry_of(arena_id, &player.pubkey()).payout > 0 {
            h.settle(ix::ClaimArena {}.data(), arena_id, player).unwrap();
        }
    }
    assert_eq!(h.arena(arena_id).remaining_liability, 0);
}

#[test]
fn equal_error_goes_to_the_earlier_prediction() {
    let mut h = Harness::new();
    let arena_id = h.create_arena(60).unwrap();
    let first = h.user(10);
    let second = h.user(10);
    let third = h.user(10);
    let fourth = h.user(10);
    h.enter(arena_id, &first, 990, SOL / 10).unwrap(); // error 10
    h.enter(arena_id, &second, 1_010, SOL / 10).unwrap(); // error 10, later
    h.enter(arena_id, &third, 2_000, SOL / 10).unwrap();
    h.enter(arena_id, &fourth, 3_000, SOL / 10).unwrap();
    // A pure top-up keeps `first` ahead.
    h.update(arena_id, &first, 0, SOL / 100).unwrap();
    assert_eq!(h.entry_of(arena_id, &first.pubkey()).prediction_seq, 0);
    // `second` re-predicts the same error later still; `first` stays ahead.
    h.update(arena_id, &second, 990, 0).unwrap();
    assert_eq!(h.entry_of(arena_id, &second.pubkey()).prediction_seq, 4);

    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline);
    let oracle = h.oracle.insecure_clone();
    h.resolve_with(arena_id, &h.attestation(deadline, 1_000), &oracle).unwrap();
    assert_eq!(h.entry_of(arena_id, &first.pubkey()).rank, 1);
    assert_eq!(h.entry_of(arena_id, &second.pubkey()).rank, 2);

    // Now `first` re-predicts: it moves behind `second`.
    let arena_id = h.create_arena(60).unwrap();
    h.enter(arena_id, &first, 990, SOL / 10).unwrap();
    h.enter(arena_id, &second, 1_010, SOL / 10).unwrap();
    h.update(arena_id, &first, 1_010, 0).unwrap();
    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline);
    h.resolve_with(arena_id, &h.attestation(deadline, 1_000), &oracle).unwrap();
    assert_eq!(h.entry_of(arena_id, &second.pubkey()).rank, 1);
    assert_eq!(h.entry_of(arena_id, &first.pubkey()).rank, 2);
}

#[test]
fn lobby_rules() {
    let mut h = Harness::new();
    let arena_id = h.create_arena(60).unwrap();
    let alice = h.user(10);
    assert_err(h.enter(arena_id, &alice, 0, SOL / 10), "InvalidPrediction");
    assert_err(h.enter(arena_id, &alice, 1_000, MIN_STAKE - 1), "InvalidStake");
    assert_err(h.enter(arena_id, &alice, 1_000, MAX_STAKE + 1), "InvalidStake");
    assert_err(h.update(arena_id, &alice, 1_000, 0), "NotEntered");
    h.enter(arena_id, &alice, 1_000, SOL / 10).unwrap();
    assert_err(h.enter(arena_id, &alice, 1_000, SOL / 10), "AlreadyEntered");
    assert_err(h.update(arena_id, &alice, 1_000, 0), "NothingChanged");
    assert_err(h.update(arena_id, &alice, 0, MAX_STAKE), "InvalidStake");
    h.update(arena_id, &alice, 0, SOL / 10).unwrap();
    assert_eq!(h.entry_of(arena_id, &alice.pubkey()).stake, 2 * SOL / 10);
    assert_eq!(h.arena(arena_id).total_pool, 2 * SOL / 10);

    let admin = h.admin.insecure_clone();
    h.send(&[h.admin_config_ix(ix::SetPaused { paused: true }.data())], &admin, &[]).unwrap();
    let bob = h.user(10);
    assert_err(h.enter(arena_id, &bob, 1_000, SOL / 10), "ActivityPaused");
    assert_err(h.create_arena(60).map(|_| ()), "ActivityPaused");
    h.send(&[h.admin_config_ix(ix::SetPaused { paused: false }.data())], &admin, &[]).unwrap();

    let starts_at = h.arena(arena_id).starts_at;
    h.set_time(starts_at);
    assert_err(h.enter(arena_id, &bob, 1_000, SOL / 10), "LobbyClosed");
    assert_err(h.update(arena_id, &alice, 999, 0), "LobbyClosed");
}

#[test]
fn creation_validation() {
    let mut h = Harness::new();
    assert_err(h.create_arena(120).map(|_| ()), "UnsupportedDuration");
    let (asset_id, source) = (h.asset_id, h.source);
    h.approve_asset(asset_id, source, Category::Stock, false).unwrap();
    assert_err(h.create_arena(60).map(|_| ()), "AssetNotApproved");

    // Anyone can create; the creator earns half of the fee.
    h.approve_asset(asset_id, source, Category::Stock, true).unwrap();
    let creator = h.user(10);
    let arena_id = h.create_arena_as(&creator, asset_id, 60).unwrap();
    let a = h.user(10);
    let b = h.user(10);
    h.enter(arena_id, &a, 1_000, SOL / 2).unwrap();
    h.enter(arena_id, &b, 2_000, SOL / 2).unwrap();
    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline);
    let oracle = h.oracle.insecure_clone();
    h.resolve_with(arena_id, &h.attestation(deadline, 1_000), &oracle).unwrap();
    let earnings: CreatorEarnings = h.fetch(&creator_pda(&creator.pubkey()));
    assert_eq!(earnings.amount, (SOL / 2) * 200 / 10_000 / 2);

    let withdraw = h.withdraw_creator_ix(NATIVE_SOL, &creator.pubkey());
    let before = h.balance(&creator.pubkey());
    h.send_as(&[withdraw], &creator).unwrap();
    assert_eq!(h.balance(&creator.pubkey()), before + earnings.amount);
}

#[test]
fn cancellations_refund_everyone() {
    let mut h = Harness::new();
    let oracle = h.oracle.insecure_clone();

    // One player only: cancel after the lobby.
    let arena_id = h.create_arena(60).unwrap();
    let alice = h.user(10);
    h.enter(arena_id, &alice, 1_000, SOL / 10).unwrap();
    assert_err(h.timeout(ix::CancelArenaIfInsufficient {}.data(), arena_id), "LobbyStillOpen");
    h.set_time(h.arena(arena_id).starts_at);
    h.timeout(ix::CancelArenaIfInsufficient {}.data(), arena_id).unwrap();
    let arena = h.arena(arena_id);
    assert_eq!((arena.status, arena.cancel_reason), (ArenaStatus::Cancelled, ArenaCancelReason::InsufficientParticipants));
    let before = h.balance(&alice.pubkey());
    h.settle(ix::RefundArena {}.data(), arena_id, &alice).unwrap();
    assert_eq!(h.balance(&alice.pubkey()), before + SOL / 10);
    assert_err(h.settle(ix::RefundArena {}.data(), arena_id, &alice), "AlreadySettled");

    // Stale deadline price: the newest block before the deadline is > 60s old.
    let arena_id = h.create_arena(60).unwrap();
    let bob = h.user(10);
    h.enter(arena_id, &alice, 1_000, SOL / 10).unwrap();
    h.enter(arena_id, &bob, 1_100, SOL / 10).unwrap();
    h.set_time(h.arena(arena_id).starts_at);
    assert_err(h.timeout(ix::CancelArenaIfInsufficient {}.data(), arena_id), "EnoughParticipants");
    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline + 5);
    let mut stale = h.attestation(deadline, 1_000);
    stale.prev_block_time = deadline - 61;
    h.resolve_with(arena_id, &stale, &oracle).unwrap();
    assert_eq!(h.arena(arena_id).cancel_reason, ArenaCancelReason::StaleDeadlinePrice);
    h.settle(ix::RefundArena {}.data(), arena_id, &alice).unwrap();
    h.settle(ix::RefundArena {}.data(), arena_id, &bob).unwrap();

    // Nobody resolves in time: anyone can cancel after the grace period.
    let arena_id = h.create_arena(60).unwrap();
    h.enter(arena_id, &alice, 1_000, SOL / 10).unwrap();
    h.enter(arena_id, &bob, 1_100, SOL / 10).unwrap();
    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline + ARENA_RESOLUTION_GRACE);
    assert_err(h.timeout(ix::CancelExpiredArena {}.data(), arena_id), "ResolutionWindowStillOpen");
    h.set_time(deadline + ARENA_RESOLUTION_GRACE + 1);
    let late = h.attestation(deadline, 1_000);
    assert_err(h.resolve_with(arena_id, &late, &oracle), "ResolutionWindowExpired");
    h.timeout(ix::CancelExpiredArena {}.data(), arena_id).unwrap();
    assert_eq!(h.arena(arena_id).cancel_reason, ArenaCancelReason::ResolutionWindowExpired);
    h.settle(ix::RefundArena {}.data(), arena_id, &alice).unwrap();
    h.settle(ix::RefundArena {}.data(), arena_id, &bob).unwrap();
    assert_eq!(h.arena(arena_id).remaining_liability, 0);
}

#[test]
fn rejects_forged_attestations() {
    let mut h = Harness::new();
    let arena_id = h.create_arena(60).unwrap();
    let alice = h.user(10);
    let bob = h.user(10);
    h.enter(arena_id, &alice, 1_000, SOL / 10).unwrap();
    h.enter(arena_id, &bob, 1_100, SOL / 10).unwrap();
    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline + 2);
    let oracle = h.oracle.insecure_clone();
    let admin = h.admin.insecure_clone();
    let good = h.attestation(deadline, 1_000);

    assert_err(h.send(&[h.resolve_ix(arena_id)], &admin, &[]), "MissingSignatureInstruction");
    assert_err(h.resolve_with(arena_id, &good, &Keypair::new()), "InvalidAttestationSigner");
    let mut bad = good.clone();
    bad.next_block_time = deadline - 1;
    assert_err(h.resolve_with(arena_id, &bad, &oracle), "InvalidAttestationBoundary");
    let mut bad = good.clone();
    bad.entries[0].price_source = Pubkey::new_unique();
    assert_err(h.resolve_with(arena_id, &bad, &oracle), "MissingAssetPrice");
    // An attestation signed for Asset Race cannot settle an arena.
    let mut bad = good.clone();
    bad.program_id = Pubkey::new_unique();
    assert_err(h.resolve_with(arena_id, &bad, &oracle), "InvalidAttestation");

    h.resolve_with(arena_id, &good, &oracle).unwrap();
    assert_eq!(h.arena(arena_id).status, ArenaStatus::Resolved);
}

#[test]
fn stake_limits_apply_to_new_arenas_only() {
    let mut h = Harness::new();
    let old_arena = h.create_arena(60).unwrap();
    h.set_stake_mint(NATIVE_SOL, true, SOL / 2, 2 * SOL).unwrap();
    let new_arena = h.create_arena(60).unwrap();

    let alice = h.user(10);
    h.enter(old_arena, &alice, 1_000, SOL / 10).unwrap();
    assert_err(h.enter(new_arena, &alice, 1_000, SOL / 10), "InvalidStake");
    h.enter(new_arena, &alice, 1_000, 2 * SOL).unwrap();

    assert_err(h.set_stake_mint(NATIVE_SOL, true, 0, SOL), "InvalidConfiguration");
    // Disabling SOL blocks new SOL arenas.
    h.set_stake_mint(NATIVE_SOL, false, SOL / 2, 2 * SOL).unwrap();
    assert_err(h.create_arena(60).map(|_| ()), "UnsupportedStakeMint");
}
