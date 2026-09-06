import { type FormEvent, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { AVATAR_COLORS } from '@/lib/avatar'
import { useAuthStore } from '@/store/authStore'

export function SettingsPage() {
  const user = useAuthStore((s) => s.currentUser())
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const changePassword = useAuthStore((s) => s.changePassword)

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? AVATAR_COLORS[0])
  const [profileSaved, setProfileSaved] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!user) return null

  function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    updateProfile(user.id, { displayName: displayName.trim() || user.displayName, avatarColor })
    setProfileSaved(true)
    window.setTimeout(() => setProfileSaved(false), 2000)
  }

  function onChangePassword(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: 'Новые пароли не совпадают' })
      return
    }
    const result = changePassword(user.id, currentPassword, newPassword)
    if (result.ok) {
      setPasswordMsg({ ok: true, text: 'Пароль изменён' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setPasswordMsg({ ok: false, text: result.error })
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <form onSubmit={onSaveProfile} className="bg-[#12121c]/95 border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="font-medium">Профиль</h2>

        <div className="flex items-center gap-4">
          <Avatar name={displayName || user.displayName} color={avatarColor} size={56} />
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setAvatarColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${avatarColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0b0c10] scale-110' : ''}`}
                style={{ background: c }}
                aria-label={`Выбрать цвет аватара ${c}`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">Имя</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">E-mail</label>
          <input
            value={user.email}
            disabled
            className="w-full rounded-lg bg-black/10 border border-white/5 px-3 py-2 text-sm text-white/40 cursor-not-allowed"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 px-4 text-sm transition-colors"
        >
          Сохранить
        </button>
        {profileSaved && <span className="ml-3 text-xs text-emerald-400">Сохранено ✓</span>}
      </form>

      <form onSubmit={onChangePassword} className="bg-[#12121c]/95 border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="font-medium">Смена пароля</h2>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">Текущий пароль</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Новый пароль</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Повторите новый пароль</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
        </div>

        {passwordMsg && (
          <p className={`text-sm ${passwordMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{passwordMsg.text}</p>
        )}

        <button
          type="submit"
          className="rounded-lg border border-white/15 hover:border-white/30 text-white/80 font-medium py-2 px-4 text-sm transition-colors"
        >
          Сменить пароль
        </button>
      </form>

      <p className="text-center text-xs text-white/25">
        Всё это мок — данные хранятся только в localStorage вашего браузера.
      </p>
    </div>
  )
}
