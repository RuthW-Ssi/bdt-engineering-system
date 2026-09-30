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
export function isCustomer(user: AuthUser | null): boolean {
  return user?.user_type === 'customer'
}

// Customer accounts (see wiki features/customer-user-scope) only get these pages;
// the backend enforces the same allowlist, this keeps nav/routes in step with it.
const CUSTOMER_MODULES = ['projects', 'project-zones', 'sub-zones', 'project-tracking', 'bim']
// Drawings/BIM are reached only inside Progress (quick-look + 3D panel), not as standalone pages
const CUSTOMER_PATHS = [
  /^\/projects$/, /^\/projects\/[^/]+\/progress$/, /^\/zones$/,
  // Mobile: read-only project → zone → assembly list (no progress form, no history)
  /^\/m\/projects$/, /^\/m\/projects\/[^/]+\/zones$/, /^\/m\/projects\/[^/]+\/zones\/\d+$/,
]
export const CUSTOMER_HOME = '/projects'
export const CUSTOMER_MOBILE_HOME = '/m/projects'

export function customerCanOpen(pathname: string): boolean {
  return CUSTOMER_PATHS.some(re => re.test(pathname))
}

export function canViewAny(user: AuthUser | null, modules: string[]): boolean {
  if (!user) return false
  if (isCustomer(user)) return modules.some(m => CUSTOMER_MODULES.includes(m))
  return modules.some(m => {
    const entry = user.permissions?.[m]
    return entry === undefined || entry.view === true
  })
}
