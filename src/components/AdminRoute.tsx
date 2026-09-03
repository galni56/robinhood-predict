import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function AdminRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.currentUser())

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/markets" replace />
  return <>{children}</>
}
