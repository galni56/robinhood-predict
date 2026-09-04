import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { colorForSeed } from '@/lib/avatar'
import { mockAddress } from '@/lib/hash'
import { useChainStore } from '@/store/chainStore'
import type { User } from '@/types'

export const STARTING_BALANCE = 10_000

interface AuthState {
  users: User[]
  currentUserId: string | null

  register: (email: string, password: string, displayName: string) => { ok: true; user: User } | { ok: false; error: string }
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string }
  logout: () => void
  currentUser: () => User | null
  userById: (id: string) => User | null
  updateProfile: (userId: string, patch: { displayName?: string; avatarColor?: string }) => void
  changePassword: (
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) => { ok: true } | { ok: false; error: string }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUserId: null,

      register: (email, password, displayName) => {
        const normalized = email.trim().toLowerCase()
        if (!normalized || !normalized.includes('@')) {
          return { ok: false, error: 'Введите корректный e-mail' }
        }
        if (password.length < 6) {
          return { ok: false, error: 'Пароль должен быть не короче 6 символов' }
        }
        if (get().users.some((u) => u.email === normalized)) {
          return { ok: false, error: 'Аккаунт с таким e-mail уже есть (это мок — попробуйте войти)' }
        }

        const id = mockAddress(`user:${normalized}:${Date.now()}`)
        const name = displayName.trim() || normalized.split('@')[0]
        // First registered account becomes the demo curator/admin — there's no
        // real backend to gate this against, so it's a simple bootstrap rule.
        const isFirstUser = get().users.length === 0
        const user: User = {
          id,
          email: normalized,
          displayName: name,
          mockPassword: password,
          walletAddress: mockAddress(`wallet:${normalized}`),
          createdAt: Date.now(),
          role: isFirstUser ? 'admin' : 'user',
          avatarColor: colorForSeed(id),
        }

        set((s) => ({ users: [...s.users, user], currentUserId: id }))

        // Faucet: fund the new demo wallet. This goes through the same mock
        // chain as everything else, so it shows up in the explorer too.
        useChainStore.getState().faucet(user.walletAddress, STARTING_BALANCE, `Testnet faucet: welcome grant for ${user.displayName}`)

        return { ok: true, user }
      },

      login: (email, password) => {
        const normalized = email.trim().toLowerCase()
        const user = get().users.find((u) => u.email === normalized)
        if (!user || user.mockPassword !== password) {
          return { ok: false, error: 'Неверный e-mail или пароль' }
        }
        set({ currentUserId: user.id })
        return { ok: true }
      },

      logout: () => set({ currentUserId: null }),

      currentUser: () => get().users.find((u) => u.id === get().currentUserId) ?? null,

      userById: (id) => get().users.find((u) => u.id === id) ?? null,

      updateProfile: (userId, patch) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
        }))
      },

      changePassword: (userId, currentPassword, newPassword) => {
        const user = get().users.find((u) => u.id === userId)
        if (!user) return { ok: false, error: 'Пользователь не найден' }
        if (user.mockPassword !== currentPassword) return { ok: false, error: 'Текущий пароль неверный' }
        if (newPassword.length < 6) return { ok: false, error: 'Новый пароль должен быть не короче 6 символов' }

        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, mockPassword: newPassword } : u)),
        }))
        return { ok: true }
      },
    }),
    { name: 'rhchain-mock-auth' },
  ),
)
