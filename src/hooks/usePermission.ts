import { useAuth } from '../context/AuthContext'

// 2026-08-03: `ALL_MODULES` was reset to empty (full permission-system
// revert — see api/users.ts) so `user.permissions` no longer has an entry
// for any module. A missing entry means "not currently gated" — default
// to allowed, not denied, so the UI matches the backend's now-fully-open
// behavior. Once a module is reintroduced to ALL_MODULES + re-tagged with
// @RequiresPermission, its entry reappears here and real per-user grants
// apply again.
export function usePermission(module: string, action: 'view' | 'create' | 'update' | 'delete'): boolean {
  const { user } = useAuth()
  const entry = user?.permissions?.[module]
  if (entry === undefined) return true
  return entry[action] === true
}
