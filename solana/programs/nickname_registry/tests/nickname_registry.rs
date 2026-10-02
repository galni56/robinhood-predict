use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    nickname_registry::{accounts as acc, instruction as ix, Nickname, NICKNAME_SEED},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn pda(owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[NICKNAME_SEED, owner.as_ref()], &nickname_registry::ID).0
}

fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/nickname_registry.so"));
    svm.add_program(nickname_registry::ID, bytes).unwrap();
    svm
}

fn user(svm: &mut LiteSVM) -> Keypair {
    let user = Keypair::new();
    svm.airdrop(&user.pubkey(), 1_000_000_000).unwrap();
    user
}

fn send(svm: &mut LiteSVM, instruction: Instruction, signer: &Keypair) -> Result<(), String> {
    svm.expire_blockhash();
    let message = Message::new_with_blockhash(&[instruction], Some(&signer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[signer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
}

fn set_ix(owner: &Pubkey, record: Pubkey, nickname: &str) -> Instruction {
    Instruction::new_with_bytes(
        nickname_registry::ID,
        &ix::SetNickname { nickname: nickname.to_string() }.data(),
        acc::SetNickname { owner: *owner, nickname: record, system_program: system_program::ID }
            .to_account_metas(None),
    )
}

fn clear_ix(owner: &Pubkey, record: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        nickname_registry::ID,
        &ix::ClearNickname {}.data(),
        acc::ClearNickname { owner: *owner, nickname: record }.to_account_metas(None),
    )
}

fn read(svm: &LiteSVM, owner: &Pubkey) -> Option<String> {
    let account = svm.get_account(&pda(owner))?;
    if account.lamports == 0 {
        return None;
    }
    Some(Nickname::try_deserialize(&mut &account.data[..]).unwrap().nickname)
}

#[test]
fn set_overwrite_and_clear() {
    let mut svm = setup();
    let alice = user(&mut svm);
    assert_eq!(read(&svm, &alice.pubkey()), None);

    send(&mut svm, set_ix(&alice.pubkey(), pda(&alice.pubkey()), "alice.sol"), &alice).unwrap();
    assert_eq!(read(&svm, &alice.pubkey()).as_deref(), Some("alice.sol"));
    send(&mut svm, set_ix(&alice.pubkey(), pda(&alice.pubkey()), "second"), &alice).unwrap();
    assert_eq!(read(&svm, &alice.pubkey()).as_deref(), Some("second"));

    let before = svm.get_account(&alice.pubkey()).unwrap().lamports;
    send(&mut svm, clear_ix(&alice.pubkey(), pda(&alice.pubkey())), &alice).unwrap();
    assert_eq!(read(&svm, &alice.pubkey()), None);
    // Rent comes back, net of the 5000-lamport fee.
    assert!(svm.get_account(&alice.pubkey()).unwrap().lamports > before);
}

#[test]
fn length_limits() {
    let mut svm = setup();
    let alice = user(&mut svm);
    let max = "x".repeat(24);
    send(&mut svm, set_ix(&alice.pubkey(), pda(&alice.pubkey()), &max), &alice).unwrap();
    assert_eq!(read(&svm, &alice.pubkey()).as_deref(), Some(max.as_str()));
    let err = send(&mut svm, set_ix(&alice.pubkey(), pda(&alice.pubkey()), &"x".repeat(25)), &alice).unwrap_err();
    assert!(err.contains("NicknameTooLong"), "{err}");
    let err = send(&mut svm, set_ix(&alice.pubkey(), pda(&alice.pubkey()), ""), &alice).unwrap_err();
    assert!(err.contains("EmptyNickname"), "{err}");
}

#[test]
fn cannot_write_or_clear_someone_else() {
    let mut svm = setup();
    let alice = user(&mut svm);
    let mallory = user(&mut svm);
    send(&mut svm, set_ix(&alice.pubkey(), pda(&alice.pubkey()), "alice"), &alice).unwrap();

    // Mallory signs but points at Alice's record: the PDA seeds do not match.
    assert!(send(&mut svm, set_ix(&mallory.pubkey(), pda(&alice.pubkey()), "pwned"), &mallory).is_err());
    assert!(send(&mut svm, clear_ix(&mallory.pubkey(), pda(&alice.pubkey())), &mallory).is_err());
    assert_eq!(read(&svm, &alice.pubkey()).as_deref(), Some("alice"));
}
