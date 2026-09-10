// Single source of truth for the per-user/per-module permission system.
//
// `ALL_MODULES` is the closed set of module keys `@RequiresPermission(module,
// action)` may reference; `ModuleKey` is its type. `ALWAYS_VIEW_MODULES` are
// the modules every authenticated user can READ without a permission row —
// cross-feature reference data other features filter by; create/update/delete
// on them still need an explicit per-user grant.
//
// The sprint-by-sprint history of which modules were gated when, and why,
// lives in git history and in the wiki page `features/user-module-permissions`.
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

// Organizational reference data used as filter/lookup context by many
// OTHER features regardless of module ownership — `view` is
// unconditionally granted for every module listed here, even to a user
// with zero permission rows; only create/update/delete stay gated
// per-user. `customers`/`projects`/`project-zones`/`sub-zones` are here by
// explicit user request (2026-08-03) — `customers`/`projects` were
// bundled in alongside the confirmed `project-zones`/`sub-zones` case, not
// because a new cross-feature dependency was found for them specifically.
// `project-tracking` deliberately does NOT get this treatment — the user
// explicitly wants viewing progress data itself gated, unlike browsing the
// project/zone/customer records that other features filter by.
export const ALWAYS_VIEW_MODULES: readonly ModuleKey[] = ['customers', 'projects', 'project-zones', 'sub-zones']
