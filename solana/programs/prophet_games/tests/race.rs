mod race_common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::Instruction,
        InstructionData, ToAccountMetas,
    },
    prophet_games::{accounts as acc, instruction as ix, state::*, CommunityPolicy, NATIVE_SOL},
    race_common::*,
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
    let config = h.config();
    assert_eq!(config.admin, admin.pubkey());
    assert_eq!(config.oracle_signer, h.oracle.pubkey());

    // A second initialize cannot overwrite the config.
    assert!(h.send(&[h.initialize_ix(&admin.pubkey())], &admin, &[]).is_err());
}

#[test]
fn full_lifecycle_pays_winner_and_splits_fees() {
    let mut h = Harness::new();
    let input = h.default_platform_input();
    let (betting_end, duration) = (input.betting_end_time, input.race_duration);
    let race_id = h.create_platform_race(input, 3).unwrap();
    let race_key = race_pda(race_id);

    let alice = h.user(10);
    let bob = h.user(10);
    let carol = h.user(10);
    let dave = h.user(10);
    h.bet(race_id, &alice, 0, SOL / 2).unwrap();
    h.bet(race_id, &bob, 1, 3 * SOL / 10).unwrap();
    h.bet(race_id, &carol, 1, SOL / 10).unwrap();
    h.bet(race_id, &carol, 1, SOL / 10).unwrap(); // top-up on the same asset
    h.bet(race_id, &dave, 2, SOL / 10).unwrap();

    let race = h.race(race_id);
    assert_eq!(race.total_pool, 11 * SOL / 10);
    assert_eq!(race.assets[1].pool, SOL / 2);

    h.set_time(betting_end + 10);
    let oracle = h.oracle.insecure_clone();
    let start = h.attestation(betting_end, &[(0, 1_000), (1, 2_000), (2, 3_000)]);
    h.start_with(race_id, &start, &oracle).unwrap();
    let race = h.race(race_id);
    assert_eq!(race.status, RaceStatus::Running);
    assert_eq!(race.race_end_time, betting_end + duration);
    assert_eq!(race.active_count, 3);

    // Resolving before the end is rejected.
    let early_end = h.attestation(race.race_end_time, &[(0, 1_100), (1, 2_100), (2, 3_000)]);
    assert_err(h.resolve_with(race_id, &early_end, &oracle), "ResolutionTooEarly");

    h.set_time(race.race_end_time + 10);
    // Asset 0 returns +10%, asset 1 +5%, asset 2 flat.
    h.resolve_with(race_id, &early_end, &oracle).unwrap();
    let race = h.race(race_id);
    assert_eq!(race.status, RaceStatus::Resolved);
    assert_eq!(race.winning_asset_index, 0);

    // Losing pool 0.6 SOL, 2% fee = 0.012 SOL split evenly.
    let losing = 6 * SOL / 10;
    let fee = losing * 200 / 10_000;
    assert_eq!(race.protocol_fee, fee / 2);
    assert_eq!(race.creator_fee, fee / 2);
    assert_eq!(race.distributable_losing_pool, losing - fee);

    let position_rent = h.balance(&position_pda(&race_key, &alice.pubkey()));
    let before = h.balance(&alice.pubkey());
    h.claim(race_id, &alice).unwrap();
    let expected_payout = SOL / 2 + (losing - fee);
    assert_eq!(h.balance(&alice.pubkey()), before + expected_payout + position_rent);
    assert_eq!(h.race(race_id).remaining_liability, 0);
    assert!(h.svm.get_account(&position_pda(&race_key, &alice.pubkey())).map_or(true, |a| a.lamports == 0));

    // A closed position cannot be claimed again.
    assert!(h.claim(race_id, &alice).is_err());

    // Losers cannot claim but can recover their position rent.
    assert_err(h.claim(race_id, &bob), "NoWinningPosition");
    let close = h.settle_ix(ix::CloseLosingPosition {}.data(), race_id, &bob.pubkey());
    let before = h.balance(&bob.pubkey());
    h.send_as(&[close], &bob).unwrap();
    assert!(h.balance(&bob.pubkey()) > before);
    let close = h.settle_ix(ix::CloseLosingPosition {}.data(), race_id, &alice.pubkey());
    assert!(h.send_as(&[close], &alice).is_err());

    // The escrow keeps exactly its rent once every liability is paid.
    let race_account = h.svm.get_account(&race_key).unwrap();
    let rent = h.svm.minimum_balance_for_rent_exemption(race_account.data.len());
    assert_eq!(race_account.lamports, rent);

    // Protocol fees.
    let admin = h.admin.insecure_clone();
    let treasury: Treasury = h.fetch(&treasury_pda());
    assert_eq!(treasury.accumulated_fees, fee / 2);
    let withdraw = |amount: u64, admin: &Pubkey| h.withdraw_fees_ix(NATIVE_SOL, amount, admin, admin);
    let too_much = withdraw(fee / 2 + 1, &admin.pubkey());
    let exact = withdraw(fee / 2, &admin.pubkey());
    assert_err(h.send(&[too_much], &admin, &[]), "InsufficientFeeBalance");
    let before = h.balance(&admin.pubkey());
    h.send(&[exact], &admin, &[]).unwrap();
    assert_eq!(h.balance(&admin.pubkey()), before + fee / 2 - 5_000);
    let stranger = h.user(1);
    let stolen = h.withdraw_fees_ix(NATIVE_SOL, 1, &stranger.pubkey(), &stranger.pubkey());
    assert_err(h.send(&[stolen], &stranger, &[]), "Unauthorized");

    // Creator fees (the admin created this platform race).
    let earnings: CreatorEarnings = h.fetch(&creator_pda(&admin.pubkey()));
    assert_eq!(earnings.amount, fee / 2);
    let withdraw_creator = h.withdraw_creator_ix(NATIVE_SOL, &admin.pubkey());
    let before = h.balance(&admin.pubkey());
    h.send(&[withdraw_creator.clone()], &admin, &[]).unwrap();
    assert_eq!(h.balance(&admin.pubkey()), before + fee / 2 - 5_000);
    assert_err(h.send(&[withdraw_creator], &admin, &[]), "AmountZero");
}

#[test]
fn top_tie_voids_and_refunds_everyone() {
    let mut h = Harness::new();
    let input = h.default_platform_input();
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 2).unwrap();
    let alice = h.user(10);
    let bob = h.user(10);
    h.bet(race_id, &alice, 0, SOL / 2).unwrap();
    h.bet(race_id, &bob, 1, SOL / 4).unwrap();

    let oracle = h.oracle.insecure_clone();
    h.set_time(betting_end + 1);
    h.start_with(race_id, &h.attestation(betting_end, &[(0, 100), (1, 200)]), &oracle).unwrap();
    let race_end = h.race(race_id).race_end_time;
    h.set_time(race_end + 1);
    // Both assets return exactly +50%.
    h.resolve_with(race_id, &h.attestation(race_end, &[(0, 150), (1, 300)]), &oracle).unwrap();
    assert_eq!(h.race(race_id).status, RaceStatus::Void);

    assert_err(h.claim(race_id, &alice), "InvalidRaceStatus");
    let before = h.balance(&alice.pubkey());
    let rent = h.balance(&position_pda(&race_pda(race_id), &alice.pubkey()));
    h.refund(race_id, &alice).unwrap();
    assert_eq!(h.balance(&alice.pubkey()), before + SOL / 2 + rent);
    h.refund(race_id, &bob).unwrap();
    assert!(h.refund(race_id, &bob).is_err());
    assert_eq!(h.race(race_id).remaining_liability, 0);
}

#[test]
fn too_few_contenders_cancels_without_attestation() {
    let mut h = Harness::new();
    let input = h.default_platform_input();
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 3).unwrap();
    let alice = h.user(10);
    let bob = h.user(10);
    h.bet(race_id, &alice, 0, SOL / 2).unwrap();
    h.bet(race_id, &bob, 0, SOL / 4).unwrap();

    h.set_time(betting_end);
    let admin = h.admin.insecure_clone();
    h.send(&[h.start_ix(race_id)], &admin, &[]).unwrap();
    assert_eq!(h.race(race_id).status, RaceStatus::Cancelled);
    h.refund(race_id, &alice).unwrap();
    h.refund(race_id, &bob).unwrap();
}

#[test]
fn rejects_forged_or_malformed_attestations() {
    let mut h = Harness::new();
    let input = h.default_platform_input();
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 2).unwrap();
    let alice = h.user(10);
    let bob = h.user(10);
    h.bet(race_id, &alice, 0, SOL / 2).unwrap();
    h.bet(race_id, &bob, 1, SOL / 4).unwrap();
    h.set_time(betting_end + 5);

    let oracle = h.oracle.insecure_clone();
    let admin = h.admin.insecure_clone();
    let good = h.attestation(betting_end, &[(0, 100), (1, 200)]);

    // Missing signature instruction.
    assert_err(h.send(&[h.start_ix(race_id)], &admin, &[]), "MissingSignatureInstruction");

    // Signed by someone other than the race's oracle signer.
    let impostor = Keypair::new();
    assert_err(h.start_with(race_id, &good, &impostor), "InvalidAttestationSigner");

    // Boundary: parent block not strictly before the target.
    let mut bad = good.clone();
    bad.prev_block_time = betting_end;
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidAttestationBoundary");

    // Boundary: child block does not descend from the parent.
    let mut bad = good.clone();
    bad.next_parent_blockhash = [9u8; 32];
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidAttestationBoundary");

    // Boundary: child block lies in the future.
    let mut bad = good.clone();
    bad.next_block_time = betting_end + 60;
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidAttestationBoundary");

    // Wrong target time.
    let bad = h.attestation(betting_end - 60, &[(0, 100), (1, 200)]);
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidAttestationBoundary");

    // Replay protection: attestation bound to another program.
    let mut bad = good.clone();
    bad.program_id = Pubkey::new_unique();
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidAttestation");

    // Missing an active asset.
    let bad = h.attestation(betting_end, &[(0, 100)]);
    assert_err(h.start_with(race_id, &bad, &oracle), "MissingAssetPrice");

    // Decimals mismatch.
    let mut bad = good.clone();
    bad.entries[1].decimals = 6;
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidOracleDecimals");

    // Zero price.
    let bad = h.attestation(betting_end, &[(0, 100), (1, 0)]);
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidOraclePrice");

    // Duplicate entries for one source.
    let mut bad = good.clone();
    bad.entries.push(bad.entries[0].clone());
    assert_err(h.start_with(race_id, &bad, &oracle), "InvalidAttestation");

    // Signature instruction that points at data in another instruction.
    let message = encode(&good);
    let mut sig_ix = ed25519_ix(&oracle, &message);
    sig_ix.data[14..16].copy_from_slice(&0u16.to_le_bytes()); // message_instruction_index = 0
    assert_err(h.send(&[sig_ix, h.start_ix(race_id)], &admin, &[]), "InvalidSignatureInstruction");

    // The genuine attestation still works.
    h.start_with(race_id, &good, &oracle).unwrap();
    assert_eq!(h.race(race_id).status, RaceStatus::Running);
    assert_eq!(h.race(race_id).start_slot, 1_000);
}

#[test]
fn bet_rules() {
    let mut h = Harness::new();
    let input = h.default_platform_input();
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 2).unwrap();
    let alice = h.user(10);

    assert_err(h.bet(race_id, &alice, 0, SOL / 1_000), "StakeBelowMinimum");
    assert_err(h.bet(race_id, &alice, 0, 2 * SOL), "StakeExceedsMaximum");
    assert_err(h.bet(race_id, &alice, 5, SOL / 10), "InvalidCandidate");
    assert_err(h.bet(race_id, &alice, 0, 0), "AmountZero");
    h.bet(race_id, &alice, 0, SOL / 10).unwrap();
    assert_err(h.bet(race_id, &alice, 1, SOL / 10), "WrongAsset");
    // A top-up below the minimum is allowed; only the first stake must meet it.
    h.bet(race_id, &alice, 0, SOL / 1_000).unwrap();
    assert_err(h.bet(race_id, &alice, 0, SOL), "StakeExceedsMaximum");

    // Pause blocks new bets.
    let admin = h.admin.insecure_clone();
    let pause = |paused: bool, h: &Harness| h.admin_config_ix(ix::SetPaused { paused }.data(), &h.admin.pubkey());
    h.send(&[pause(true, &h)], &admin, &[]).unwrap();
    let bob = h.user(10);
    assert_err(h.bet(race_id, &bob, 1, SOL / 10), "ActivityPaused");
    h.send(&[pause(false, &h)], &admin, &[]).unwrap();
    h.bet(race_id, &bob, 1, SOL / 10).unwrap();

    h.set_time(betting_end);
    let carol = h.user(10);
    assert_err(h.bet(race_id, &carol, 1, SOL / 10), "BettingNotOpen");
}

#[test]
fn timeouts_cancel_or_void_and_allow_refunds() {
    let mut h = Harness::new();
    let admin = h.admin.insecure_clone();
    let oracle = h.oracle.insecure_clone();

    // Never started: cancel after the start grace.
    let input = h.default_platform_input();
    let (betting_end, start_grace) = (input.betting_end_time, input.start_grace);
    let race_a = h.create_platform_race(input, 2).unwrap();
    let alice = h.user(10);
    let bob = h.user(10);
    h.bet(race_a, &alice, 0, SOL / 2).unwrap();
    h.bet(race_a, &bob, 1, SOL / 2).unwrap();
    let cancel = h.timeout_ix(ix::CancelUnstartedRace {}.data(), race_a);
    h.set_time(betting_end + start_grace);
    assert_err(h.send(&[cancel.clone()], &admin, &[]), "StartWindowStillOpen");
    h.set_time(betting_end + start_grace + 1);
    let late = h.attestation(betting_end, &[(0, 100), (1, 200)]);
    assert_err(h.start_with(race_a, &late, &oracle), "StartWindowExpired");
    h.send(&[cancel], &admin, &[]).unwrap();
    assert_eq!(h.race(race_a).status, RaceStatus::Cancelled);
    h.refund(race_a, &alice).unwrap();

    // Started but never resolved: void after the resolution grace.
    let input = h.default_platform_input();
    let (betting_end, grace) = (input.betting_end_time, input.resolution_grace);
    let race_b = h.create_platform_race(input, 2).unwrap();
    h.bet(race_b, &alice, 0, SOL / 2).unwrap();
    h.bet(race_b, &bob, 1, SOL / 2).unwrap();
    h.set_time(betting_end + 1);
    h.start_with(race_b, &h.attestation(betting_end, &[(0, 100), (1, 200)]), &oracle).unwrap();
    let race_end = h.race(race_b).race_end_time;
    let void = h.timeout_ix(ix::VoidExpiredRace {}.data(), race_b);
    h.set_time(race_end + grace);
    assert_err(h.send(&[void.clone()], &admin, &[]), "ResolutionWindowStillOpen");
    h.set_time(race_end + grace + 1);
    let late = h.attestation(race_end, &[(0, 110), (1, 200)]);
    assert_err(h.resolve_with(race_b, &late, &oracle), "ResolutionWindowExpired");
    h.send(&[void], &admin, &[]).unwrap();
    assert_eq!(h.race(race_b).status, RaceStatus::Void);
    h.refund(race_b, &alice).unwrap();
    h.refund(race_b, &bob).unwrap();
}

#[test]
fn community_race_lobby_flow() {
    let mut h = Harness::new();
    let admin = h.admin.insecure_clone();
    let policy = CommunityPolicy {
        lobby_duration: 300,
        betting_duration: 600,
        start_grace: 300,
        resolution_grace: 300,
        fee_bp: 200,
        min_active_contenders: 2,
    };
    let creator = h.user(10);
    let community = |h: &Harness, race_id: u64, creator: &Pubkey, duration: i64, assets: &[usize]| {
        h.create_community_ix(race_id, creator, duration, NATIVE_SOL, assets)
    };

    assert_err(
        h.send_as(&[community(&h, 0, &creator.pubkey(), 3_600, &[0])], &creator),
        "CommunityPolicyNotConfigured",
    );
    h.send(&[h.admin_config_ix(ix::SetCommunityPolicy { policy }.data(), &admin.pubkey())], &admin, &[]).unwrap();
    assert_err(
        h.send_as(&[community(&h, 0, &creator.pubkey(), 3_600, &[0])], &creator),
        "DurationNotApproved",
    );
    h.send(
        &[h.admin_config_ix(ix::SetDurationPreset { duration: 3_600, enabled: true }.data(), &admin.pubkey())],
        &admin,
        &[],
    )
    .unwrap();
    h.send_as(&[community(&h, 0, &creator.pubkey(), 3_600, &[0])], &creator).unwrap();
    let race = h.race(0);
    assert_eq!(race.status, RaceStatus::Lobby);
    assert_eq!(race.creator, creator.pubkey());
    assert_eq!(race.assets.len(), 1);

    let add = |h: &Harness, adder: &Pubkey, asset: usize| {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::AddLobbyAsset {}.data(),
            acc::AddLobbyAsset {
                adder: *adder,
                config: config_pda(),
                race: race_pda(0),
                approved_asset: asset_pda(&h.assets[asset].id),
            }
            .to_account_metas(None),
        )
    };
    let xavier = h.user(1);
    assert_err(h.send_as(&[add(&h, &xavier.pubkey(), 0)], &xavier), "DuplicateAsset");
    h.send_as(&[add(&h, &xavier.pubkey(), 1)], &xavier).unwrap();
    assert_err(h.send_as(&[add(&h, &xavier.pubkey(), 2)], &xavier), "LobbyAdditionAlreadyUsed");

    let open = Instruction::new_with_bytes(
        prophet_games::ID,
        &ix::OpenBetting {}.data(),
        acc::OpenBetting { race: race_pda(0) }.to_account_metas(None),
    );
    assert_err(h.send(&[open.clone()], &admin, &[]), "LobbyStillOpen");
    h.set_time(race.lobby_end_time);
    let yuri = h.user(1);
    assert_err(h.send_as(&[add(&h, &yuri.pubkey(), 2)], &yuri), "LobbyClosed");
    h.send(&[open], &admin, &[]).unwrap();
    let race = h.race(0);
    assert_eq!(race.status, RaceStatus::Betting);
    assert_eq!(race.betting_end_time, race.lobby_end_time + 600);

    // The community creator earns half of the fee.
    let alice = h.user(10);
    let bob = h.user(10);
    h.bet(0, &alice, 0, SOL / 2).unwrap();
    h.bet(0, &bob, 1, SOL / 2).unwrap();
    let oracle = h.oracle.insecure_clone();
    h.set_time(race.betting_end_time + 1);
    h.start_with(0, &h.attestation(race.betting_end_time, &[(0, 100), (1, 100)]), &oracle).unwrap();
    let race_end = h.race(0).race_end_time;
    h.set_time(race_end + 1);
    h.resolve_with(0, &h.attestation(race_end, &[(0, 90), (1, 120)]), &oracle).unwrap();
    assert_eq!(h.race(0).winning_asset_index, 1);
    let earnings: CreatorEarnings = h.fetch(&creator_pda(&creator.pubkey()));
    assert_eq!(earnings.amount, (SOL / 2) * 200 / 10_000 / 2);

    // A lobby that never reaches two assets is cancelled at opening.
    h.send_as(&[community(&h, 1, &creator.pubkey(), 3_600, &[2])], &creator).unwrap();
    h.set_time(h.race(1).lobby_end_time);
    let open = Instruction::new_with_bytes(
        prophet_games::ID,
        &ix::OpenBetting {}.data(),
        acc::OpenBetting { race: race_pda(1) }.to_account_metas(None),
    );
    h.send(&[open], &admin, &[]).unwrap();
    assert_eq!(h.race(1).status, RaceStatus::Cancelled);
}

#[test]
fn platform_race_validation() {
    let mut h = Harness::new();
    let mut input = h.default_platform_input();
    input.fee_bp = 1_001;
    assert_err(h.create_platform_race(input, 2).map(|_| ()), "FeeExceedsMaximum");

    let mut input = h.default_platform_input();
    input.min_active_contenders = 3;
    assert_err(h.create_platform_race(input, 2).map(|_| ()), "InvalidConfiguration");

    let input = h.default_platform_input();
    assert_err(h.create_platform_race(input, 1).map(|_| ()), "InvalidCandidateCount");

    // A disabled asset cannot join new races.
    let asset = h.assets[1].clone();
    h.approve_asset(&asset, Category::Stock, false).unwrap();
    let input = h.default_platform_input();
    assert_err(h.create_platform_race(input, 2).map(|_| ()), "AssetNotApproved");

    // An asset approved for another category cannot join a Stock race.
    h.approve_asset(&asset, Category::Meme, true).unwrap();
    let input = h.default_platform_input();
    assert_err(h.create_platform_race(input, 2).map(|_| ()), "AssetNotApproved");
}

#[test]
fn oracle_rotation_does_not_affect_existing_races() {
    let mut h = Harness::new();
    let admin = h.admin.insecure_clone();
    let input = h.default_platform_input();
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 2).unwrap();
    let alice = h.user(10);
    let bob = h.user(10);
    h.bet(race_id, &alice, 0, SOL / 2).unwrap();
    h.bet(race_id, &bob, 1, SOL / 2).unwrap();

    let new_oracle = Keypair::new();
    h.send(
        &[h.admin_config_ix(ix::SetOracleSigner { oracle_signer: new_oracle.pubkey() }.data(), &admin.pubkey())],
        &admin,
        &[],
    )
    .unwrap();
    h.set_time(betting_end + 1);
    let attestation = h.attestation(betting_end, &[(0, 100), (1, 200)]);
    assert_err(h.start_with(race_id, &attestation, &new_oracle), "InvalidAttestationSigner");
    let old_oracle = h.oracle.insecure_clone();
    h.start_with(race_id, &attestation, &old_oracle).unwrap();
}

#[test]
fn admin_handover_is_two_step() {
    let mut h = Harness::new();
    let admin = h.admin.insecure_clone();
    let successor = h.user(1);
    let stranger = h.user(1);
    let accept = |new_admin: &Pubkey| {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::AcceptAdmin {}.data(),
            acc::AcceptAdmin { new_admin: *new_admin, config: config_pda() }.to_account_metas(None),
        )
    };
    assert_err(h.send_as(&[accept(&successor.pubkey())], &successor), "NoPendingAdmin");
    h.send(
        &[h.admin_config_ix(ix::ProposeAdmin { new_admin: successor.pubkey() }.data(), &admin.pubkey())],
        &admin,
        &[],
    )
    .unwrap();
    assert_err(h.send_as(&[accept(&stranger.pubkey())], &stranger), "Unauthorized");
    h.send_as(&[accept(&successor.pubkey())], &successor).unwrap();
    assert_eq!(h.config().admin, successor.pubkey());

    let pause = h.admin_config_ix(ix::SetPaused { paused: true }.data(), &admin.pubkey());
    assert_err(h.send(&[pause], &admin, &[]), "Unauthorized");
    let pause = h.admin_config_ix(ix::SetPaused { paused: true }.data(), &successor.pubkey());
    h.send_as(&[pause], &successor).unwrap();
    assert!(h.config().paused);
}

#[test]
fn race_operator_creates_platform_races_only() {
    let mut h = Harness::new();
    let admin = h.admin.insecure_clone();
    let operator = h.user(10);
    let stranger = h.user(10);

    let input = h.default_platform_input();
    assert_err(h.create_platform_race_as(input, 2, &operator).map(|_| ()), "Unauthorized");

    let set = h.admin_config_ix(ix::SetRaceOperator { race_operator: operator.pubkey() }.data(), &admin.pubkey());
    h.send(&[set], &admin, &[]).unwrap();
    let input = h.default_platform_input();
    let race_id = h.create_platform_race_as(input, 2, &operator).unwrap();
    // Fees of operator-created races credit the admin.
    assert_eq!(h.race(race_id).creator, admin.pubkey());

    let input = h.default_platform_input();
    assert_err(h.create_platform_race_as(input, 2, &stranger).map(|_| ()), "Unauthorized");
    // The operator holds no admin power.
    let pause = h.admin_config_ix(ix::SetPaused { paused: true }.data(), &operator.pubkey());
    assert_err(h.send(&[pause], &operator, &[]), "Unauthorized");

    let revoke = h.admin_config_ix(ix::SetRaceOperator { race_operator: Pubkey::default() }.data(), &admin.pubkey());
    h.send(&[revoke], &admin, &[]).unwrap();
    let input = h.default_platform_input();
    assert_err(h.create_platform_race_as(input, 2, &operator).map(|_| ()), "Unauthorized");
}
