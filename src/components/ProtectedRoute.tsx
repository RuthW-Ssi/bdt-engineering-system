import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canViewAny } from '../lib/moduleAccess'
import type { ReactNode } from 'react'

export function ProtectedRoute({
  children,
  roles,
  viewModules,
}: {
  children: ReactNode
  roles?: string[]
  viewModules?: string[]
}) {
  const { token, user } = useAuth()
  const location = useLocation()
  // Preserve where the user was headed (e.g. a /m/* mobile deep link, or a
  // session that expired mid-form) so LoginPage can send them back instead
  // of always dumping to /dashboard — matters most for the mobile flow,
  // which has no other way back into a specific project/zone/assembly.
  if (!token) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (roles && (!user || !roles.includes(user.role))) return <Navigate to="/dashboard" replace />
  if (viewModules && !canViewAny(user, viewModules)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
