import { Navigate } from 'react-router-dom'
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
  if (!token) return <Navigate to="/login" replace />
  if (roles && (!user || !roles.includes(user.role))) return <Navigate to="/dashboard" replace />
  if (viewModules && !canViewAny(user, viewModules)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
