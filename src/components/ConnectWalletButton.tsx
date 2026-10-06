import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { AddressAvatar } from '@/components/AddressAvatar'
import { AddressLabel } from '@/components/AddressLabel'
import { LocalnetAirdropButton } from '@/components/LocalnetAirdropButton'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { BackupModal, DepositModal, ImportModal, SetPasswordModal, WithdrawModal, usePlatformLogin } from '@/components/WalletAccountModals'
import { ProphetWalletName, prophetWalletStore } from '@/solana/prophetWallet'
import { EXTERNAL_WALLETS_ENABLED } from '@/solana/SolanaProvider'
import { formatStakeAmount, useStakeBalance } from '@/solana/stakeTokens'
import { explorerUrl } from '@/solana/config'
import { PIXEL } from '@/retro/scene'

// Lazy: the nickname modal is only needed when someone opens it.
const SetNicknameModal = lazy(() => import('@/components/SetNicknameModal').then((m) => ({ default: m.SetNicknameModal })))

type ModalKind = 'password' | 'backup' | 'deposit' | 'withdraw' | 'import' | 'nickname' | null

const itemClass = 'block w-full px-3 py-2 text-left font-bold text-[#1B1340]/80 hover:bg-[#FFD23F] hover:text-[#1B1340]'

/** The account entry point. With the platform wallet (default) it is a
 * personal account: create, top up, withdraw, back up and restore - no
 * extension, no external connect prompt. */
export function ConnectWalletButton() {
  const { publicKey, connected, disconnect, wallet } = useWallet()
  const login = usePlatformLogin()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)
  const address = publicKey?.toBase58()
  const menuRef = useRef<HTMLDivElement>(null)
  const balance = useStakeBalance()
  const platform = wallet?.adapter.name === ProphetWalletName
  const [backedUp, setBackedUp] = useState(() => prophetWalletStore.isBackedUp())
  // When the header wraps (narrow window, wallet side panel open) the button
  // sits on the left, and a right-anchored menu would open off screen.
  const [menuSide, setMenuSide] = useState<'left-0' | 'right-0'>('right-0')
  const toggleMenu = () => {
    const rect = menuRef.current?.getBoundingClientRect()
    setMenuSide(rect && rect.right < 300 ? 'left-0' : 'right-0')
    setOpen((v) => !v)
  }

  // A fresh platform account must be backed up before anything else: losing
  // the browser without the key loses the funds.
  // Accounts from before passwords get one first (their key is still in clear).
  useEffect(() => {
    if (connected && platform && prophetWalletStore.needsPassword()) setModal('password')
    else if (connected && platform && !prophetWalletStore.isBackedUp()) setModal('backup')
  }, [connected, platform])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const openModal = (kind: ModalKind) => {
    setOpen(false)
    setModal(kind)
  }

  const modals = (
    <>
      {modal === 'password' && (
        <SetPasswordModal onClose={() => setModal(prophetWalletStore.isBackedUp() ? null : 'backup')} />
      )}
      {modal === 'backup' && (
        <BackupModal
          forced={!backedUp}
          onClose={() => {
            setBackedUp(prophetWalletStore.isBackedUp())
            setModal(null)
          }}
        />
      )}
      {modal === 'deposit' && <DepositModal onClose={() => setModal(null)} />}
      {modal === 'withdraw' && <WithdrawModal onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal === 'nickname' && (
        <Suspense fallback={null}>
          <SetNicknameModal onClose={() => setModal(null)} />
        </Suspense>
      )}
    </>
  )

  if (connected && address) {
    return (
      <div ref={menuRef} className="relative">
        <button onClick={toggleMenu} className="rx-plate relative flex items-center gap-2 bg-[#FFF6DF] py-1 pl-1.5 pr-3">
          <AddressAvatar address={address} size={22} />
          <span className="flex flex-col items-start leading-tight">
            <AddressLabel address={address} link={false} className="font-mono text-xs font-bold text-[#1B1340]" />
            <span style={{ fontFamily: PIXEL, fontSize: 9 }}>{balance.data != null ? formatStakeAmount(balance.data) : '…'}</span>
          </span>
          {platform && !backedUp && <span aria-label="Back up your key" className="absolute -right-1.5 -top-1.5 h-3 w-3 bg-[#FF5C8A]" />}
        </button>
        {open && (
          <div className={`rx-plate absolute ${menuSide} top-14 z-30 w-60 bg-[#FFF6DF] py-1 text-[17px]`}>
            {platform && (
              <>
                <button onClick={() => openModal('deposit')} className={itemClass}>Top up</button>
                <button onClick={() => openModal('withdraw')} className={itemClass}>Withdraw</button>
                <button onClick={() => openModal('backup')} className={itemClass}>
                  Back up key{!backedUp && <span className="ml-2 text-[#C2245A]">!</span>}
                </button>
                <div className="my-1 border-t-2 border-[#1B1340]/15" />
              </>
            )}
            <NavLink to="/onchain/portfolio" onClick={() => setOpen(false)} className={itemClass}>Your portfolio</NavLink>
            <button onClick={() => openModal('nickname')} className={itemClass}>Set nickname</button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(address)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className={itemClass}
            >
              {copied ? 'Copied!' : 'Copy address'}
            </button>
            <a href={explorerUrl('address', address)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={itemClass}>
              View on explorer ↗
            </a>
            <LocalnetAirdropButton />
            <div className="my-1 border-t-2 border-[#1B1340]/15" />
            {platform && <button onClick={() => openModal('import')} className={itemClass}>Restore another account</button>}
            <button
              onClick={() => {
                setOpen(false)
                void disconnect()
              }}
              className="block w-full px-3 py-2 text-left font-bold text-[#C2245A] hover:bg-[#C2245A]/10"
            >
              {platform ? 'Log out (key stays on this device)' : 'Disconnect'}
            </button>
          </div>
        )}
        {modals}
      </div>
    )
  }

  const hasAccount = prophetWalletStore.hasWallet()

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => {
          // Returning players go straight in; new ones choose create/restore.
          if (!EXTERNAL_WALLETS_ENABLED && hasAccount) login.start()
          else toggleMenu()
        }}
        className="rx-btn rx-btn-pink"
        style={{ minHeight: 48, padding: '0 20px', fontFamily: "'Pixelify Sans', 'Courier New', monospace", fontSize: 18, fontWeight: 700 }}
      >
        {hasAccount ? 'Log in' : 'Start playing'}
      </button>
      {open && (
        <div className={`rx-plate absolute ${menuSide} top-16 z-30 w-72 bg-[#FFF6DF] p-3`}>
          <WalletOptionsList login={login} onConnect={() => setOpen(false)} onRestore={() => { setOpen(false); login.restore() }} />
        </div>
      )}
      {modals}
      {login.modal}
    </div>
  )
}
