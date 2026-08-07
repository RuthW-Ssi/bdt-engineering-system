import type { AuthUser } from '../context/AuthContext'

// OR semantics — a page/nav item backed by more than one module (e.g. the
// Zones page reads both `project-zones` and `sub-zones`) is viewable if
// the user has `view` on at least one of them. Note: if a page's modules
// are really just ONE permission concept (e.g. Engineer Products' Library
// tab used to be tagged `product-library` separately from `products`),
// merge them into a single module server-side rather than leaning on this
// OR here — see the `product-library` → `products` merge in api/users.ts.
//
// 2026-08-03: a module with no entry in `user.permissions` means it's not
// currently gated at all (see usePermission.ts) — treat that as viewable,
// not denied, so nav/routes match the backend's now-fully-open behavior
// during the permission-system reset.
export function canViewAny(user: AuthUser | null, modules: string[]): boolean {
  if (!user) return false
  return modules.some(m => {
    const entry = user.permissions?.[m]
    return entry === undefined || entry.view === true
  })
}
