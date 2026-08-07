import { apiClient } from './client'

// 2026-08-03 — FULL RESET, then reintroducing ONE AT A TIME. Mirrors
// backend/src/common/permissions/permission-modules.ts. First modules
// back: `customers`, `projects`, `project-zones`, `sub-zones` —
// `project-zones`/`sub-zones` were the confirmed cross-feature dependency
// that triggered the reset (BOM needs zone/sub-zone data to filter);
// `customers`/`projects` were bundled back in alongside them at the
// user's explicit request. `view` defaults to allowed for everyone on
// those four (see `ALWAYS_VIEW_MODULES`); `create`/`update`/`delete` need
// an explicit per-user grant via the Users admin checklist.
//
// `project-tracking` split out from `projects` the same day — CRUD on the
// project entity itself vs. viewing/updating Sprint 24/26 progress-%
// data are genuinely different permissions. NOT in `ALWAYS_VIEW_MODULES`:
// both `view` and `update` need an explicit grant (no create/delete —
// progress rows aren't their own creatable/deletable entity).
//
// `materials`, `products` added next (2026-08-03) — "Engineer Products"
// nav page (Library + Standard + Custom tabs, backed by BOTH the
// `products` and `product-library` backend controllers) was initially
// split into two separate permission modules; the user pointed out
// that's wrong — Product Library IS Engineer Products, someone granted
// access to the feature should reach all three tabs together, not have
// Library independently gate-able. `product-library.controller.ts` now
// shares the single `products` permission — `product-library` is NOT a
// module key anymore. Checked for cross-feature dependencies before
// adding `products`/`materials` in the first place: `ProductList.tsx`
// also reads `projects` (already always-view, no new risk); no other
// active page depends on these two. Both added as normal gated modules —
// real per-user toggles on all four actions, NOT in `ALWAYS_VIEW_MODULES`.
//
// `boms` added next (2026-08-04) — see backend permission-modules.ts for
// the full story. Short version: the app had TWO things called "BOM" —
// `product_bom` (a per-Product BOM "recipe", edited via `BomEditor.tsx`,
// reached only from a button on Product Detail) and the Tekla-ingestion
// Dispatch workflow (BomList/BomUpload/BomDispatchDetail/etc). Turned out
// `product_bom` was dead — 0 rows in the whole DB, untouched since Sprint
// 20 — so `BomEditor.tsx`/`BomDiffReview.tsx`/`useBom.ts`/`useBomDiff.ts`/
// `api/boms.ts` were deleted outright rather than gated. What's left under
// "BOM" is genuinely one feature/entity (the dispatch), so it gets ONE
// permission — `boms` — not two. `bom-upload` is NOT a separate module key;
// `App.tsx`'s `/bom/upload` route now also tags `viewModules={['boms']}`.
//
// `bim` added next (2026-08-04) — see backend permission-modules.ts for the
// full story. Short version: `bim.controller.ts` mixes the BIM Viewer
// page's own management surface (list/upload/retry — real gate, `bim`)
// with rendering data for an already-known model id (status/elements/
// element-properties/viewer-token — used as a visualization aid embedded
// in OTHER already-permitted features, e.g. Progress Tracking's 3D panel).
// Only the 5 management routes are tagged `@RequiresPermission('bim',...)`
// on the backend; the 4 rendering-data routes are deliberately left
// ungated (same shape as `bom-assemblies` being left open for MO). No
// frontend change needed for the rendering routes since nothing here
// gated them in the first place — this only affects the standalone
// `/bim-viewer` page's own list/upload/retry UI.
//
// `routings` added next (2026-08-04) — see backend permission-modules.ts
// for the full story. Short version: a third dead-feature discovery in a
// row — `BomRoutingConfig.tsx` (`/bom/dispatch/:id/routing`) had zero
// navigation reaching it, and turned out to be entangled with a SECOND
// orphaned page (`RoutingApply.tsx`, importing its `RoutingConfigContent`
// export) plus `components/bom/ZoneSummaryTab.tsx` (only consumer was
// also `RoutingApply.tsx`, not `BomDispatchDetail.tsx` as first assumed —
// routing genuinely moved to the MO/WO level, see `WoDetail.tsx`'s
// `RoutingSnapshotCard`). All three deleted together. `App.tsx`'s
// `/bom/dispatch/:id/routing` route + `BomRoutingConfig` import removed.
//
// Two live cross-feature reference-data routes deliberately left ungated
// on the backend (no frontend change needed — nothing gated them before):
// `GET routing-templates` + `GET routing-templates/:id`, read by
// `MoNew.tsx` (manufacturing-orders, not yet reintroduced) to suggest a
// routing template while creating an MO; `GET /equipment-resources`, read
// by `ActivityBuilder.tsx`.
//
// Deliberately deferred (not specially handled, gated normally): a real
// products↔routings dependency exists in `ProductDetail.tsx`'s own
// Routing tab (reads routing/std-cost, has a Recompute button) — the user
// chose not to design around this one this round.
//
// 2026-08-05 — `activities.controller.ts` folded INTO `routings`, not its
// own module key. The user pointed at the Sidebar: Activity Library sits
// as a sibling of Routing Template/Operation Library under the same
// "Routings" group, so it should be governed by the same permission —
// reversing the "activities is always open" stance above. Confirmed no
// cross-dependency risk first (nothing outside routings/activities reads
// activity data). `App.tsx`'s `/activity-library*` routes and
// `Sidebar.tsx`'s Activity Library item now tag `viewModules={['routings']}`
// — previously neither had any gate at all.
//
// Still-dormant candidates (reference only, NOT type-active yet):
// product-derivation, mark-prefix-master, drawings.
// Still deliberately excluded even when modules get re-added: master-data,
// identity, file-storage, mail, _skeletons (shared infra/reference data)
// and users (own AdminGuard).
//
// `cutting-plan` added next (2026-08-06) — self-contained, no cross-feature
// dependency found. See backend permission-modules.ts for the full story.
// NOTE: this ALL_MODULES/MODULE_LABELS pair is a hand-kept mirror of the
// backend's own copy (no shared package between the two apps) — updating
// one without the other is exactly how this module went missing from the
// Edit User permissions table the first time; always update both together.
//
// `orders` added next (2026-08-07) — ONE key covering both Manufacturing
// Orders and Work Orders (`OrderHub.tsx`'s MO↔WO tabs), not two. See
// backend permission-modules.ts for the full discussion — the user
// deliberately chose the merge over the split I'd initially recommended.
//
// `machines` added next (2026-08-07) — machine/tool/operator/consume-formula
// CRUD + per-machine maintenance/repair/status data. See backend
// permission-modules.ts for the full story (2 cross-feature reads — skills,
// consume-formulas — left ungated for ActivityBuilder.tsx).
export const ALL_MODULES = [
  'customers',
  'projects',
  'project-zones',
  'sub-zones',
  'project-tracking',
  'materials',
  'products',
  'boms',
  'bim',
  'routings',
  'cutting-plan',
  'orders',
  'machines',
] as const

export type ModuleKey = (typeof ALL_MODULES)[number]

// Organizational reference data used as filter/lookup context by many other
// features — view is unconditionally granted for every module listed here,
// even to a user with zero permission rows; only create/update/delete stay
// gated. `project-tracking`/`materials`/`products` are deliberately NOT
// here — no request to make them always-viewable, so they're fully gated
// like any normal module.
export const ALWAYS_VIEW_MODULES: readonly ModuleKey[] = ['customers', 'projects', 'project-zones', 'sub-zones']

export const MODULE_LABELS: Record<ModuleKey, string> = {
  customers: 'Customers',
  projects: 'Projects',
  'project-tracking': 'Project Tracking',
  'project-zones': 'Zones',
  'sub-zones': 'Sub-zones',
  materials: 'Materials',
  products: 'Engineer Products',
  boms: 'BOM',
  bim: 'BIM',
  routings: 'Routings',
  'cutting-plan': 'Cutting Plan',
  orders: 'Order',
  machines: 'Machine & Resources',
}

// Department is free text (admin can type a brand new one in the create-user
// form). `KNOWN_DEPARTMENTS` are just the seed values shown in the dropdown
// — any other string is a valid department, it just starts with an empty
// template (admin fills permissions in manually).
export const KNOWN_DEPARTMENTS = ['BTE', 'BPD', 'BSC', 'BCD'] as const

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
}

// No pre-assigned module ownership yet for BTE/BPD/BSC/BCD — each starts
// with an empty permission template; admin fills them in per user until an
// ownership convention is established.
export const ROLE_TEMPLATE: Partial<Record<string, ModuleKey[]>> = {}

export interface PermissionEntry {
  module: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

export interface AppUser {
  id: number
  login: string
  name: string
  email: string | null
  role: string
  level: string | null
  job_title: string | null
  active: boolean
  create_date: string
}

export interface AppUserWithPermissions extends AppUser {
  module_permissions: PermissionEntry[]
}

export interface UserListResult {
  total: number
  page: number
  limit: number
  items: AppUser[]
}

export interface CreateUserPayload {
  login: string
  name: string
  password: string
  role: string
  level?: string
  job_title?: string
  permissions?: PermissionEntry[]
}

export interface UpdateUserPayload {
  name?: string
  role?: string
  level?: string
  job_title?: string
  active?: boolean
}

export async function getUsers(params?: { search?: string; active?: string; page?: number; limit?: number }): Promise<UserListResult> {
  const res = await apiClient.get('/users', { params })
  return res.data
}

export async function getUser(id: number): Promise<AppUserWithPermissions> {
  const res = await apiClient.get(`/users/${id}`)
  return res.data
}

export async function createUser(payload: CreateUserPayload): Promise<AppUser> {
  const res = await apiClient.post('/users', payload)
  return res.data
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<AppUser> {
  const res = await apiClient.patch(`/users/${id}`, payload)
  return res.data
}

export async function setUserPermissions(id: number, permissions: PermissionEntry[]): Promise<PermissionEntry[]> {
  const res = await apiClient.patch(`/users/${id}/permissions`, { permissions })
  return res.data
}

export async function resetUserPassword(id: number, password: string): Promise<{ ok: boolean }> {
  const res = await apiClient.post(`/users/${id}/reset-password`, { password })
  return res.data
}
