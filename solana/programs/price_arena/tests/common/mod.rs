#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{bpf_loader_upgradeable, instruction::Instruction, system_program},
        AccountDeserialize, AnchorSerialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    price_arena::{
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

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &price_arena::ID).0
}

pub fn treasury_pda() -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_SEED, NATIVE_SOL.as_ref()], &price_arena::ID).0
}

pub fn asset_pda(asset_id: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[ASSET_SEED, asset_id.as_ref()], &price_arena::ID).0
}

pub fn arena_pda(arena_id: u64) -> Pubkey {
    Pubkey::find_program_address(&[ARENA_SEED, arena_id.to_le_bytes().as_ref()], &price_arena::ID).0
}

pub fn creator_pda(creator: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[CREATOR_SEED, NATIVE_SOL.as_ref(), creator.as_ref()], &price_arena::ID).0
}

pub fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[price_arena::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

pub struct Harness {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub oracle: Keypair,
    pub asset_id: [u8; 32],
    pub source: Pubkey,
    pub last_compute_units: u64,
}

impl Harness {
    /// Deploys the program with `admin` as upgrade authority. Does not initialize.
    pub fn deploy() -> Self {
        let mut svm = LiteSVM::new().with_precompiles();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/price_arena.so"));
        svm.add_program(price_arena::ID, bytes).unwrap();
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
            last_compute_units: 0,
        };
        harness.set_time(START_TIME);
        harness
    }

    /// Deploys, initializes and approves one Stock asset.
    pub fn new() -> Self {
        let mut h = Self::deploy();
        let admin = h.admin.insecure_clone();
        h.send(&[h.initialize_ix(&admin.pubkey())], &admin, &[]).unwrap();
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

    pub fn initialize_ix(&self, admin: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            price_arena::ID,
            &ix::Initialize { oracle_signer: self.oracle.pubkey(), min_stake: MIN_STAKE, max_stake: MAX_STAKE }.data(),
            acc::Initialize {
                admin: *admin,
                config: config_pda(),
                treasury: treasury_pda(),
                program: price_arena::ID,
                program_data: program_data_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn admin_config_ix(&self, data: Vec<u8>) -> Instruction {
        Instruction::new_with_bytes(
            price_arena::ID,
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
            price_arena::ID,
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

    pub fn create_arena_as(&mut self, creator: &Keypair, asset_id: [u8; 32], duration: i64) -> Result<u64, String> {
        let arena_id = self.config().arena_count;
        let instruction = Instruction::new_with_bytes(
            price_arena::ID,
            &ix::CreateArena { title: "Where will it close?".into(), duration }.data(),
            acc::CreateArena {
                creator: creator.pubkey(),
                config: config_pda(),
                approved_asset: asset_pda(&asset_id),
                arena: arena_pda(arena_id),
                creator_earnings: creator_pda(&creator.pubkey()),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send_as(&[instruction], creator)?;
        Ok(arena_id)
    }

    pub fn create_arena(&mut self, duration: i64) -> Result<u64, String> {
        let admin = self.admin.insecure_clone();
        let asset_id = self.asset_id;
        self.create_arena_as(&admin, asset_id, duration)
    }

    fn entry_ix(&self, data: Vec<u8>, arena_id: u64, player: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            price_arena::ID,
            &data,
            acc::PlayerEntry {
                player: *player,
                config: config_pda(),
                arena: arena_pda(arena_id),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn enter(&mut self, arena_id: u64, player: &Keypair, prediction: u64, amount: u64) -> Result<(), String> {
        let instruction = self.entry_ix(ix::Enter { prediction, amount }.data(), arena_id, &player.pubkey());
        self.send(&[instruction], player, &[])
    }

    pub fn update(&mut self, arena_id: u64, player: &Keypair, new_prediction: u64, additional_amount: u64) -> Result<(), String> {
        let instruction = self.entry_ix(
            ix::UpdateEntry { new_prediction, additional_amount }.data(),
            arena_id,
            &player.pubkey(),
        );
        self.send(&[instruction], player, &[])
    }

    pub fn attestation(&self, target: i64, price: u64) -> PoolAttestation {
        PoolAttestation {
            domain: ATTESTATION_DOMAIN,
            version: ATTESTATION_VERSION,
            program_id: price_arena::ID,
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

    pub fn resolve_ix(&self, arena_id: u64) -> Instruction {
        let arena = self.arena(arena_id);
        Instruction::new_with_bytes(
            price_arena::ID,
            &ix::Resolve {}.data(),
            acc::ResolveArena {
                arena: arena_pda(arena_id),
                treasury: treasury_pda(),
                creator_earnings: creator_pda(&arena.creator),
                instructions: solana_sdk_ids::sysvar::instructions::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn resolve_with(&mut self, arena_id: u64, attestation: &PoolAttestation, signer: &Keypair) -> Result<(), String> {
        let ixs = [ed25519_ix(signer, &encode(attestation)), self.resolve_ix(arena_id)];
        let admin = self.admin.insecure_clone();
        self.send(&ixs, &admin, &[])
    }

    pub fn settle(&mut self, data: Vec<u8>, arena_id: u64, player: &Keypair) -> Result<(), String> {
        let instruction = Instruction::new_with_bytes(
            price_arena::ID,
            &data,
            acc::SettleEntry { player: player.pubkey(), arena: arena_pda(arena_id) }.to_account_metas(None),
        );
        self.send_as(&[instruction], player)
    }

    pub fn timeout(&mut self, data: Vec<u8>, arena_id: u64) -> Result<(), String> {
        let instruction = Instruction::new_with_bytes(
            price_arena::ID,
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
