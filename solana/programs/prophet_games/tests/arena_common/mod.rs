#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{bpf_loader_upgradeable, instruction::Instruction, program_pack::Pack, system_instruction, system_program},
        AccountDeserialize, AnchorSerialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{
            get_associated_token_address_with_program_id, spl_associated_token_account::instruction as ata_ix,
        },
        token_2022::spl_token_2022::{instruction as token_ix, state::Mint as MintState},
        token_interface::TokenAccount,
    },
    litesvm::LiteSVM,
    prophet_games::{
        accounts as acc,
        attestation::{PoolAttestation, PriceEntry},
        constants::*,
        instruction as ix,
        state::*,
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const SOL: u64 = 1_000_000_000;
pub const START_TIME: i64 = 1_800_000_000;
pub const DECIMALS: u8 = 9;
pub const MIN_STAKE: u64 = SOL / 100;
pub const MAX_STAKE: u64 = SOL;
pub const TOKEN_DECIMALS: u8 = 6;

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &prophet_games::ID).0
}

pub fn stake_mint_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[STAKE_MINT_SEED, mint.as_ref()], &prophet_games::ID).0
}

pub fn treasury_pda_for(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_SEED, mint.as_ref()], &prophet_games::ID).0
}

pub fn treasury_pda() -> Pubkey {
    treasury_pda_for(&NATIVE_SOL)
}

pub fn asset_pda(asset_id: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[ASSET_SEED, asset_id.as_ref()], &prophet_games::ID).0
}

pub fn arena_pda(arena_id: u64) -> Pubkey {
    Pubkey::find_program_address(&[ARENA_SEED, arena_id.to_le_bytes().as_ref()], &prophet_games::ID).0
}

pub fn creator_pda_for(mint: &Pubkey, creator: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[CREATOR_SEED, mint.as_ref(), creator.as_ref()], &prophet_games::ID).0
}

pub fn creator_pda(creator: &Pubkey) -> Pubkey {
    creator_pda_for(&NATIVE_SOL, creator)
}

pub fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[prophet_games::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

/// An SPL mint created in the test VM.
#[derive(Clone, Copy)]
pub struct Token {
    pub mint: Pubkey,
    pub program: Pubkey,
}

impl Token {
    pub fn ata(&self, owner: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, &self.mint, &self.program)
    }
}

pub struct Harness {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub oracle: Keypair,
    pub asset_id: [u8; 32],
    pub source: Pubkey,
    pub tokens: Vec<Token>,
    pub last_compute_units: u64,
}

impl Harness {
    /// Deploys the program with `admin` as upgrade authority. Does not initialize.
    pub fn deploy() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/prophet_games.so"));
        svm.add_program(prophet_games::ID, bytes).unwrap();
        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 1_000 * SOL).unwrap();

        // LiteSVM deploys with no upgrade authority. Patch the ProgramData
        // header (bincode: u32 tag, u64 slot, Option<Pubkey>) to name `admin`.
        let program_data = program_data_pda();
        let mut account = svm.get_account(&program_data).unwrap();
        account.data[12] = 1;
        account.data[13..45].copy_from_slice(admin.pubkey().as_ref());
        svm.set_account(program_data, account).unwrap();

        let mut harness = Harness {
            svm,
            admin,
            oracle: Keypair::new(),
            asset_id: [1u8; 32],
            source: Pubkey::new_unique(),
            tokens: Vec::new(),
            last_compute_units: 0,
        };
        harness.set_time(START_TIME);
        harness
    }

    /// Deploys, initializes, accepts native SOL and approves one Stock asset.
    pub fn new() -> Self {
        let mut h = Self::deploy();
        let admin = h.admin.insecure_clone();
        h.send(&[h.initialize_ix(&admin.pubkey())], &admin, &[]).unwrap();
        h.set_stake_mint(NATIVE_SOL, true, MIN_STAKE, MAX_STAKE).unwrap();
        let (asset_id, source) = (h.asset_id, h.source);
        h.approve_asset(asset_id, source, Category::Stock, true).unwrap();
        h
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        clock.slot += 1;
        self.svm.set_sysvar(&clock);
    }

    pub fn user(&mut self, sol: u64) -> Keypair {
        let user = Keypair::new();
        self.svm.airdrop(&user.pubkey(), sol * SOL).unwrap();
        user
    }

    pub fn balance(&self, key: &Pubkey) -> u64 {
        self.svm.get_account(key).map(|a| a.lamports).unwrap_or(0)
    }

    pub fn send(&mut self, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let message = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend(extra.iter().copied());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &signers)
            .map_err(|e| e.to_string())?;
        self.svm
            .send_transaction(tx)
            .map(|meta| self.last_compute_units = meta.compute_units_consumed)
            .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
    }

    /// Sends with the admin paying fees, so `signer` balances move only by
    /// program transfers.
    pub fn send_as(&mut self, ixs: &[Instruction], signer: &Keypair) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        if signer.pubkey() == admin.pubkey() {
            self.send(ixs, &admin, &[])
        } else {
            self.send(ixs, &admin, &[signer])
        }
    }

    // ---------------------------------------------------------------- tokens

    pub fn create_token(&mut self, program: Pubkey) -> Token {
        let admin = self.admin.insecure_clone();
        let mint = Keypair::new();
        let rent = self.svm.minimum_balance_for_rent_exemption(MintState::LEN);
        let create =
            system_instruction::create_account(&admin.pubkey(), &mint.pubkey(), rent, MintState::LEN as u64, &program);
        let init = token_ix::initialize_mint2(&program, &mint.pubkey(), &admin.pubkey(), None, TOKEN_DECIMALS).unwrap();
        self.send(&[create, init], &admin, &[&mint]).unwrap();
        let token = Token { mint: mint.pubkey(), program };
        self.tokens.push(token);
        token
    }

    pub fn fund_token(&mut self, token: &Token, owner: &Pubkey, amount: u64) {
        let admin = self.admin.insecure_clone();
        let create =
            ata_ix::create_associated_token_account_idempotent(&admin.pubkey(), owner, &token.mint, &token.program);
        let mint_to =
            token_ix::mint_to(&token.program, &token.mint, &token.ata(owner), &admin.pubkey(), &[], amount).unwrap();
        self.send(&[create, mint_to], &admin, &[]).unwrap();
    }

    pub fn token_balance(&self, account: &Pubkey) -> u64 {
        let data = self.svm.get_account(account).expect("token account exists").data;
        TokenAccount::try_deserialize(&mut &data[..]).unwrap().amount
    }

    pub fn token_of(&self, mint: &Pubkey) -> Option<Token> {
        self.tokens.iter().copied().find(|t| t.mint == *mint)
    }

    fn arena_token(&self, arena_id: u64) -> Option<Token> {
        self.token_of(&self.arena(arena_id).stake_mint)
    }

    // ------------------------------------------------------------- admin ixs

    pub fn initialize_ix(&self, admin: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::Initialize { oracle_signer: self.oracle.pubkey() }.data(),
            acc::Initialize {
                admin: *admin,
                config: config_pda(),
                program: prophet_games::ID,
                program_data: program_data_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn set_stake_mint(&mut self, stake_mint: Pubkey, enabled: bool, min_stake: u64, max_stake: u64) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        let token = self.token_of(&stake_mint);
        let treasury = treasury_pda_for(&stake_mint);
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::SetStakeMint { stake_mint, enabled, min_stake, max_stake }.data(),
            acc::SetStakeMint {
                admin: admin.pubkey(),
                config: config_pda(),
                stake_mint_config: stake_mint_pda(&stake_mint),
                treasury,
                token_mint: token.map(|t| t.mint),
                treasury_vault: token.map(|t| t.ata(&treasury)),
                token_program: token.map(|t| t.program),
                associated_token_program: token.map(|_| anchor_spl::associated_token::ID),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[instruction], &admin, &[])
    }

    pub fn admin_config_ix(&self, data: Vec<u8>) -> Instruction {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::AdminConfig { admin: self.admin.pubkey(), config: config_pda() }.to_account_metas(None),
        )
    }

    pub fn approve_asset(
        &mut self,
        asset_id: [u8; 32],
        source: Pubkey,
        category: Category,
        enabled: bool,
    ) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::SetApprovedAsset { asset_id, category, price_source: source, price_decimals: DECIMALS, enabled }
                .data(),
            acc::SetApprovedAsset {
                admin: admin.pubkey(),
                config: config_pda(),
                approved_asset: asset_pda(&asset_id),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[instruction], &admin, &[])
    }

    pub fn withdraw_fees_ix(&self, stake_mint: Pubkey, amount: u64, recipient: &Pubkey) -> Instruction {
        let token = self.token_of(&stake_mint);
        let treasury = treasury_pda_for(&stake_mint);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::WithdrawFees { stake_mint, amount }.data(),
            acc::WithdrawFees {
                admin: self.admin.pubkey(),
                config: config_pda(),
                treasury,
                recipient: *recipient,
                token_mint: token.map(|t| t.mint),
                treasury_vault: token.map(|t| t.ata(&treasury)),
                recipient_token: token.map(|t| t.ata(recipient)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn withdraw_creator_ix(&self, stake_mint: Pubkey, creator: &Pubkey) -> Instruction {
        let token = self.token_of(&stake_mint);
        let earnings = creator_pda_for(&stake_mint, creator);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::WithdrawCreatorFees { stake_mint }.data(),
            acc::WithdrawCreatorFees {
                creator: *creator,
                creator_earnings: earnings,
                token_mint: token.map(|t| t.mint),
                creator_vault: token.map(|t| t.ata(&earnings)),
                creator_token: token.map(|t| t.ata(creator)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn config(&self) -> Config {
        self.fetch(&config_pda())
    }

    pub fn arena(&self, arena_id: u64) -> Arena {
        self.fetch(&arena_pda(arena_id))
    }

    pub fn fetch<T: AccountDeserialize>(&self, key: &Pubkey) -> T {
        let account = self.svm.get_account(key).expect("account exists");
        T::try_deserialize(&mut &account.data[..]).unwrap()
    }

    // ------------------------------------------------------------- arena ixs

    pub fn create_arena_in(
        &mut self,
        creator: &Keypair,
        asset_id: [u8; 32],
        duration: i64,
        stake_mint: Pubkey,
    ) -> Result<u64, String> {
        let arena_id = self.config().arena_count;
        let arena = arena_pda(arena_id);
        let token = self.token_of(&stake_mint);
        let earnings = creator_pda_for(&stake_mint, &creator.pubkey());
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::CreateArena { title: "Where will it close?".into(), duration, stake_mint }.data(),
            acc::CreateArena {
                creator: creator.pubkey(),
                config: config_pda(),
                stake_mint_config: stake_mint_pda(&stake_mint),
                approved_asset: asset_pda(&asset_id),
                arena,
                creator_earnings: earnings,
                token_mint: token.map(|t| t.mint),
                arena_vault: token.map(|t| t.ata(&arena)),
                creator_vault: token.map(|t| t.ata(&earnings)),
                token_program: token.map(|t| t.program),
                associated_token_program: token.map(|_| anchor_spl::associated_token::ID),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send_as(&[instruction], creator)?;
        Ok(arena_id)
    }

    pub fn create_arena_as(&mut self, creator: &Keypair, asset_id: [u8; 32], duration: i64) -> Result<u64, String> {
        self.create_arena_in(creator, asset_id, duration, NATIVE_SOL)
    }

    pub fn create_arena(&mut self, duration: i64) -> Result<u64, String> {
        let admin = self.admin.insecure_clone();
        let asset_id = self.asset_id;
        self.create_arena_as(&admin, asset_id, duration)
    }

    fn entry_ix(&self, data: Vec<u8>, arena_id: u64, player: &Pubkey) -> Instruction {
        let arena = arena_pda(arena_id);
        let token = self.arena_token(arena_id);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::PlayerEntry {
                player: *player,
                config: config_pda(),
                arena,
                token_mint: token.map(|t| t.mint),
                player_token: token.map(|t| t.ata(player)),
                arena_vault: token.map(|t| t.ata(&arena)),
                token_program: token.map(|t| t.program),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn enter(&mut self, arena_id: u64, player: &Keypair, prediction: u64, amount: u64) -> Result<(), String> {
        let instruction = self.entry_ix(ix::EnterArena { prediction, amount }.data(), arena_id, &player.pubkey());
        self.send(&[instruction], player, &[])
    }

    pub fn update(&mut self, arena_id: u64, player: &Keypair, new_prediction: u64, additional_amount: u64) -> Result<(), String> {
        let instruction = self.entry_ix(
            ix::UpdateArenaEntry { new_prediction, additional_amount }.data(),
            arena_id,
            &player.pubkey(),
        );
        self.send(&[instruction], player, &[])
    }

    pub fn attestation(&self, target: i64, price: u64) -> PoolAttestation {
        PoolAttestation {
            domain: ATTESTATION_DOMAIN,
            version: ATTESTATION_VERSION,
            program_id: prophet_games::ID,
            target_timestamp: target,
            prev_slot: 2_000,
            prev_blockhash: [3u8; 32],
            prev_block_time: target - 1,
            next_slot: 2_001,
            next_parent_slot: 2_000,
            next_parent_blockhash: [3u8; 32],
            next_block_time: target,
            entries: vec![PriceEntry { price_source: self.source, price, decimals: DECIMALS }],
        }
    }

    pub fn resolve_ix_with(&self, arena_id: u64, treasury_vault_override: Option<Pubkey>) -> Instruction {
        let state = self.arena(arena_id);
        let arena = arena_pda(arena_id);
        let token = self.token_of(&state.stake_mint);
        let treasury = treasury_pda_for(&state.stake_mint);
        let earnings = creator_pda_for(&state.stake_mint, &state.creator);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::ResolveArena {}.data(),
            acc::ResolveArena {
                arena,
                treasury,
                creator_earnings: earnings,
                instructions: solana_sdk_ids::sysvar::instructions::ID,
                token_mint: token.map(|t| t.mint),
                arena_vault: token.map(|t| t.ata(&arena)),
                treasury_vault: token.map(|t| treasury_vault_override.unwrap_or(t.ata(&treasury))),
                creator_vault: token.map(|t| t.ata(&earnings)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn resolve_ix(&self, arena_id: u64) -> Instruction {
        self.resolve_ix_with(arena_id, None)
    }

    pub fn resolve_with(&mut self, arena_id: u64, attestation: &PoolAttestation, signer: &Keypair) -> Result<(), String> {
        let ixs = [ed25519_ix(signer, &encode(attestation)), self.resolve_ix(arena_id)];
        let admin = self.admin.insecure_clone();
        self.send(&ixs, &admin, &[])
    }

    pub fn settle(&mut self, data: Vec<u8>, arena_id: u64, player: &Keypair) -> Result<(), String> {
        let arena = arena_pda(arena_id);
        let token = self.arena_token(arena_id);
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::SettleEntry {
                player: player.pubkey(),
                arena,
                token_mint: token.map(|t| t.mint),
                arena_vault: token.map(|t| t.ata(&arena)),
                player_token: token.map(|t| t.ata(&player.pubkey())),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        );
        self.send_as(&[instruction], player)
    }

    /// Keeper payout of `player`'s entry, signed by `cranker`; `player_token`
    /// overrides the token account (to test redirection).
    pub fn settle_for(&mut self, arena_id: u64, player: &Pubkey, cranker: &Keypair, player_token: Option<Pubkey>) -> Result<(), String> {
        let arena = arena_pda(arena_id);
        let token = self.arena_token(arena_id);
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::SettleArenaEntry {}.data(),
            acc::SettleEntryFor {
                cranker: cranker.pubkey(),
                arena,
                player: *player,
                token_mint: token.map(|t| t.mint),
                arena_vault: token.map(|t| t.ata(&arena)),
                player_token: player_token.or(token.map(|t| t.ata(player))),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        );
        self.send_as(&[instruction], cranker)
    }

    pub fn timeout(&mut self, data: Vec<u8>, arena_id: u64) -> Result<(), String> {
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::ArenaTimeout { arena: arena_pda(arena_id) }.to_account_metas(None),
        );
        let admin = self.admin.insecure_clone();
        self.send(&[instruction], &admin, &[])
    }

    pub fn entry_of(&self, arena_id: u64, player: &Pubkey) -> Entry {
        let arena = self.arena(arena_id);
        arena.entries.into_iter().find(|e| e.player == *player).expect("entry exists")
    }
}

pub fn encode(attestation: &PoolAttestation) -> Vec<u8> {
    let mut bytes = Vec::new();
    attestation.serialize(&mut bytes).unwrap();
    bytes
}

/// Builds an Ed25519 precompile instruction with all data inline.
pub fn ed25519_ix(signer: &Keypair, message: &[u8]) -> Instruction {
    let signature = signer.sign_message(message);
    let pubkey_offset: u16 = 16;
    let signature_offset: u16 = pubkey_offset + 32;
    let message_offset: u16 = signature_offset + 64;
    let mut data = vec![1u8, 0u8];
    for value in [
        signature_offset,
        u16::MAX,
        pubkey_offset,
        u16::MAX,
        message_offset,
        message.len() as u16,
        u16::MAX,
    ] {
        data.extend_from_slice(&value.to_le_bytes());
    }
    data.extend_from_slice(signer.pubkey().as_ref());
    data.extend_from_slice(signature.as_ref());
    data.extend_from_slice(message);
    Instruction { program_id: solana_sdk_ids::ed25519_program::ID, accounts: vec![], data }
}

pub fn assert_err(result: Result<(), String>, expected: &str) {
    match result {
        Ok(()) => panic!("expected error {expected}, transaction succeeded"),
        Err(e) => assert!(e.contains(expected), "expected {expected}, got:\n{e}"),
    }
}
