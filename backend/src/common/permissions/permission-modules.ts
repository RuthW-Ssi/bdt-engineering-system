// 2026-08-03 — FULL RESET, then reintroducing ONE AT A TIME: the whole
// per-user/per-module permission system (view-gating, CRUD-split,
// always-view exemptions) grew in one big sweep this sprint and blocked
// more than intended in ways only discovered by accident (BOM needing
// zone/sub-zone data, Routing needing Activity Library data). Every
// `@RequiresPermission` usage was stripped, then modules are being brought
// back deliberately, one at a time, checking cross-feature dependencies
// each time — not by a blanket sweep like before.
//
// First modules back: `customers`, `projects`, `project-zones`,
// `sub-zones` — chosen as the first re-introduction because
// `project-zones`/`sub-zones` were the exact confirmed cross-feature
// dependency (BOM needs to read zone/sub-zone data to filter) that
// triggered the reset in the first place, and `customers`/`projects` were
// bundled back in with them at the user's explicit request this round —
// `view` defaults to allowed for everyone on all four (see
// `ALWAYS_VIEW_MODULES` below), `create`/`update`/`delete` require an
// explicit per-user grant via the Users admin checklist, same as any
// other gated module.
//
// `project-tracking` split out from `projects` the same day: the user
// pointed out "project" (CRUD on the project entity itself) and "project
// tracking" (the Sprint 24/26 progress-% feature — view/update progress
// data) are two genuinely different permissions — someone might update
// progress without being allowed to edit/delete the project record, or
// vice versa. All the `:project_code/progress/*` routes in
// `projects.controller.ts` moved from `@RequiresPermission('projects', ...)`
// to `@RequiresPermission('project-tracking', ...)`. Unlike `projects`,
// `project-tracking` is NOT in `ALWAYS_VIEW_MODULES` — both `view` and
// `update` need an explicit per-user grant (no `create`/`delete` concept;
// progress rows are upserted against existing assemblies, never created/
// deleted as their own entity).
//
// `materials`, `products` added next (2026-08-03) — "Engineer Products"
// nav page (Library + Standard + Custom tabs, backed by BOTH the
// `products` and `product-library` controllers) was initially split into
// two separate permission modules; the user pointed out that's wrong —
// Product Library IS Engineer Products, someone granted access to the
// feature should reach all three tabs, not have Library independently
// gate-able from Standard/Custom. `product-library.controller.ts`'s
// routes were re-tagged from `@RequiresPermission('product-library', ...)`
// to `@RequiresPermission('products', ...)` — both controllers now share
// the single `products` permission, matching the single-feature mental
// model. `product-library` is NOT a module key anymore (removed, not just
// dormant). Checked for cross-feature dependencies before adding
// `products`/`materials` in the first place: `ProductList.tsx` also reads
// `projects` (already always-view, no new risk); a `MbomConfigTable`
// component reads `products` but isn't wired into any active page
// currently (dormant, not a live risk). Both added as normal gated
// modules (view/create/update/delete all real per-user toggles, NOT in
// `ALWAYS_VIEW_MODULES`).
//
// `boms` added next (2026-08-04) — investigated as a possible 2-way split
// (`boms` = view/edit existing BOM data vs `bom-upload` = ingest new BOM
// files) before realizing the premise was wrong: `boms.controller.ts`
// (`product_bom`/`product_bom_line` — a BOM "recipe" attached to one
// Product, edited via the standalone `BomEditor.tsx` page reachable only
// from a button on Product Detail) turned out to be a DEAD FEATURE — 0
// rows in the entire database, last touched Sprint 20, completely
// superseded by the Tekla-ingestion Dispatch workflow. `BomEditor.tsx`,
// `BomDiffReview.tsx`, `useBom.ts`, `useBomDiff.ts`, `api/boms.ts`, and
// the backend `boms.controller.ts`/`boms.service.ts`/
// `bom-explosion.service.ts`/state-machine/DTOs were deleted outright
// (not just left dormant) — see git history for the removal commit.
// `product_bom`/`product_bom_line` Prisma models + DB table intentionally
// left in place (0 rows, no data-loss risk either way; dropping schema is
// a separate, deliberate decision for later if ever wanted).
//
// With the dead recipe-BOM path gone, everything left under the "BOM"
// label — BomList, BomUpload, BomDispatchDetail, BomPaintConfig,
// BomRoutingConfig, all served by `bom-upload.controller.ts` and reading/
// writing `bom_dispatch`/`bom_assembly`/`bom_part` — is genuinely ONE
// feature/entity (a Tekla-file-ingested "dispatch", viewed/edited/
// uploaded through one connected workflow, same shape as any other
// module: view/create/update). Merged into a single `boms` permission
// (kept the name since it was already used across `App.tsx`'s
// `viewModules` tags and `Sidebar.tsx` before this reintroduction) —
// `bom-upload` is NOT a separate module key.
//
// `bom-assemblies.controller.ts` (`GET /bom-assemblies`, the
// mark-prefix-grouped assembly list) is a special case: it's cross-feature
// reference data consumed by Manufacturing Orders' own form (`T-MO.04`),
// not the BOM feature's own UI — same shape as the zone/customer
// cross-dependency that started this whole reset. Left deliberately
// UNGATED (`JwtAuthGuard` only, no `@RequiresPermission`) rather than
// added to `ALWAYS_VIEW_MODULES`, since making all of `boms` always-view
// would defeat the point of gating the BOM feature itself — only this one
// MO-serving read stays open.
//
// Still-dormant candidates (reference only, NOT type-active yet):
// product-derivation, mark-prefix-master, drawings, routings, bim,
// manufacturing-orders, work-orders, cutting-plan, machines, activities —
// bring each back the same way: (1) add the key here, (2) re-tag its
// routes with `@RequiresPermission(module, action)` + `PermissionGuard`,
// (3) check what OTHER features read this module's data before calling it
// done, AND check whether the module is really one independent permission
// concept or actually part of a bigger feature that shouldn't be split
// (the `product-library` lesson, repeated by the `boms` lesson above).
// Note for when `routings` comes back: `BomRoutingConfig.tsx` (reached
// from the BOM dispatch flow) writes to `/products/:code/routing` —
// applying a routing template to the matched product — a real
// `boms`-needs-`routings` cross-dependency to check then, same shape as
// the BOM→products auto-create case already discussed. Still deliberately
// excluded even when modules get re-added: shared infra/reference data
// (`master-data`, `identity`, `file-storage`, `mail`, `_skeletons` —
// always readable, never gated) and `users` (its own separate
// `AdminGuard`, not this permission system at all).
//
// `bim` added next (2026-08-04) — the user drew a sharp distinction I'd
// initially blurred: don't gate "can I see a 3D model" as one blanket
// question. `bim.controller.ts` mixes two genuinely different things —
// (1) the BIM Viewer page's OWN management surface (list uploaded models,
// upload a new one, retry translation) — this is "the BIM feature," a
// real per-user gate; and (2) rendering data for an ALREADY-KNOWN model
// id (status/elements/element-properties/viewer-token) — this is a
// rendering aid embedded in OTHER features (confirmed: Progress Tracking's
// `useBimViewerToken` call, `GET /bim-models/:id/viewer-token`, is used to
// show the 3D panel inside a `project-tracking`-gated page). The user's
// principle: if you already have permission to view a feature that
// embeds a 3D visualization (BOM, Progress Tracking, ...), you should see
// the 3D view too — it's a rendering aid for data you're already allowed
// to see, not a separate "BIM" permission question. So only the
// management-surface routes are tagged `@RequiresPermission('bim', ...)`;
// the four `:id/...` rendering-data routes are deliberately left with NO
// decorator at all (still behind `JwtAuthGuard`, allowed through by
// `PermissionGuard`'s "no metadata → not gated" passthrough) — same shape
// as `bom-assemblies` being left ungated for MO, just applied to 4 routes
// instead of 1. `bim` is NOT in `ALWAYS_VIEW_MODULES` — the management
// surface (list/upload/retry) is a real per-user gate.
//
// `routings` added next (2026-08-04) — the biggest module so far (5
// controllers: routings, operation-templates, workcenters,
// equipment-resources, zone-summary), and it started with a THIRD dead-
// feature discovery in a row (after `product_bom`/BomEditor and the
// zone/customer default-view precedent): `BomRoutingConfig.tsx`
// (`/bom/dispatch/:id/routing`, "apply a routing template from the BOM
// dispatch flow") had zero navigation reaching it anywhere in the app —
// same shape as the dead `product_bom`/BomEditor case. Investigated with
// an Explore agent before deleting (learned that lesson from the
// BomTreeView near-miss): found it couldn't be deleted in isolation —
// its second export `RoutingConfigContent` was imported by a SECOND
// orphaned page, `RoutingApply.tsx`, which was itself unreachable too
// (an earlier, never-wired-up "Install" flow iteration). Deleted both
// together, plus `ZoneSummaryTab.tsx` (`components/bom/`), which turned
// out to be orphaned the same way — its only consumer was also
// `RoutingApply.tsx`, not `BomDispatchDetail.tsx` as originally assumed
// when scoping this module (grep confirmed `BomDispatchDetail.tsx` has
// zero references to "routing" at all) — routing genuinely moved to the
// MO/WO level (`WoDetail.tsx`'s own `RoutingSnapshotCard`, reading
// `wo.source_routing_op`, unrelated to this old per-dispatch-assembly
// flow). `POST products/:code/routing` (`createRouting`, bind a template
// to a product) is now fully dead on the frontend too — its only other
// wrapper, `useRouting().create`, is never invoked (`ProductDetail.tsx`,
// the only `useRouting()` consumer, doesn't destructure it) — left
// wired/tagged normally rather than deleted, since removing backend
// routes wasn't in scope this round and tagging a dead route is harmless.
//
// Two confirmed live cross-feature reference-data dependencies, same
// shape as `bim`'s rendering-data routes and `bom-assemblies` — routes
// deliberately left with NO `@RequiresPermission` decorator at all:
// - `GET routing-templates` (list, suggestion mode) and
//   `GET routing-templates/:id` (detail) — read by `MoNew.tsx`
//   (`manufacturing-orders`, not yet reintroduced) to suggest a routing
//   template while creating an MO. User's principle, stated generally:
//   if you can already create an MO, you should see the routing
//   suggestion that helps you pick one — same as the BIM/BOM 3D-viewer
//   argument ("3D ช่วยให้เห็นภาพ BOM ชัดขึ้น").
// - `GET /equipment-resources` (list) — read directly by
//   `ActivityBuilder.tsx` for a tool picker. Confirmed as suspected
//   during scoping. (At the time this was written, `activities` was
//   still assumed permanently ungated — see the correction right below,
//   added the next day once that assumption changed.)
//
// 2026-08-05 — `activities.controller.ts` folded INTO `routings` (not
// given its own module key): the user pointed at the Sidebar and noted
// Activity Library sits as a sibling of Routing Template/Operation
// Library under the same "Routings" group, and should be governed by the
// same permission, not left permanently open — reversing the earlier
// "activities is a shared/reference module, always readable" stance from
// the original design doc. Checked first: nothing outside the
// routings/activities family reads activity data (only `RoutingBuilder.tsx`
// besides Activity Library's own pages), so no cross-dependency risk in
// merging it. All 6 routes (`GET routing-formula-params`, `GET` list,
// `GET :id`, `POST`, `PATCH :id`, `DELETE :id`) tagged
// `@RequiresPermission('routings', ...)` — full parity with its Sidebar
// siblings, view included (previously activities had zero gating at all,
// frontend or backend).
//
// Deliberately DEFERRED, not specially handled — gated normally like any
// other `routings` route, no carve-out: `ProductDetail.tsx`'s (`products`
// module) own reads of `GET products/:code/routing` /
// `GET products/:code/std-cost`, and its "Recompute" button
// (`POST .../routing/recompute`, `POST .../std-cost/recompute`) — a real
// products↔routings cross-dependency exists here (same shape as the two
// above), but the user chose not to design around it this round; revisit
// if it turns out to matter in practice (a `products`-only user won't be
// able to recompute cycle time/cost from the Product Detail page until
// they're also granted `routings`).
//
// `routings` is NOT in `ALWAYS_VIEW_MODULES` — real per-user gate like
// `products`/`materials`/`boms`/`bim`'s management surface.
//
// `cutting-plan` added next (2026-08-06) — self-contained: checked for
// cross-feature reads first (the only other hit was a comment in
// `ProjectProgress.tsx` referencing its `StatCard` pattern by name, not an
// actual import) and found none, so no carve-out needed, unlike
// `bom-assemblies`/`bim`/`routing-templates`/`equipment-resources`.
// `POST upload/preview` (parses uploaded .txt reports via the external API,
// explicitly no DB writes) is tagged `create` anyway, not left ungated —
// same precedent as `bom-upload`'s own `POST bom/upload/preview`, gated
// identically to the real upload despite not persisting. Normal
// view/create/update/delete gate, NOT in `ALWAYS_VIEW_MODULES`.
// `orders` added next (2026-08-07) — covers BOTH Manufacturing Orders
// (`mo.controller.ts` → `ManufacturingOrderController`) and Work Orders
// (`wo.controller.ts` → `WorkOrdersController` + `schedule.controller.ts`),
// merged into ONE key rather than the two the original plan sketched
// (`manufacturing-orders`, `work-orders`). Discussed with the user first:
// I initially recommended keeping them separate — WO has a materially
// different action set (release/start/pause/resume/done/cancel — shop-
// floor execution) from MO's (create/edit-draft/change-status — planning),
// a real planner-vs-shop-floor role split, and the pre-existing route
// gating (`App.tsx`, predating this sprint) already tagged `/mo/*` and
// `/order/wo/:id` with distinct `viewModules`. The user overruled that:
// `OrderHub.tsx` is ONE sidebar entry / ONE page with MO↔WO as tabs, and if
// someone can manage "Order" they should be able to manage both — same
// "one feature, one nav entry, one permission" principle as the `boms` and
// `routings` merges, this time chosen deliberately over the split I'd
// proposed rather than because a technical cross-dependency forced it.
// Checked for cross-feature dependencies before merging (same step-3 check
// as every module): the only outside reader of MO/WO data found was
// `WoStatusPanel.tsx` (`components/progress/`, reads `useWos` for a
// Progress Tracking assembly panel) — grepped for importers and found
// none anywhere in `src/` — it's a dead/orphaned component, built but
// never wired into `ProjectProgress.tsx` or any other page. Not a live
// risk, flagged for the user to decide whether to delete later (same
// shape as `product_bom`/`BomEditor`, `BomRoutingConfig`, and the
// `product-derivation`/`drawings` dormant-but-built findings from
// 2026-08-06 — not acted on without explicit confirmation each time).
// `schedule.controller.ts` (`GET schedule/versions`, `GET
// schedule/versions/active` — WO's BOM-version-hold scheduling data,
// Sprint 20) is wrapped in the frontend's own `api/wo.ts`/`hooks/useWo.ts`,
// confirmed as part of the WO feature's own surface, not a separate page —
// tagged under `orders` too, no separate key. Normal view/create/update/
// delete gate, NOT in `ALWAYS_VIEW_MODULES`. Note: WO itself has no
// `delete` action (cancel is a `POST`, not `DELETE`) — only MO's `DELETE
// :id` (cancel) uses the `delete` action; WO's own cancel is tagged
// `update` like its other state transitions.
//
// `machines` added next (2026-08-07) — biggest single-controller module yet:
// machine/tool resources, consume-formula templates, operators, plus
// per-machine maintenance logs / repair tickets / status history. Checked
// for cross-feature reads first (same step 3 as every module): `GET
// machines/skills` and `GET machines/consume-formulas` are both read
// directly by `ActivityBuilder.tsx` (`routings` module) for its labor-skill
// autocomplete and consumable-formula pickers — confirmed via grep, no
// other page touches either. Left BOTH deliberately UNGATED (no
// `@RequiresPermission` at all, same as `equipment-resources`'s own `GET()`
// which ActivityBuilder ALSO reads for its tool picker — this makes 3
// reference-data reads off one page, all ungated the same way). Everything
// else on this controller (resource CRUD, formula CRUD beyond the read,
// operator CRUD, maintenance logs, repair tickets, status, photo upload)
// gated normally under `machines`. `DELETE resource/:id` (machine/tool
// delete) is tagged `delete` even though no frontend button calls it
// (`useMachines.ts`/`api/machines.ts` have no delete/remove export at
// all) — same "gate the route regardless of frontend reachability" call
// as MO's `DELETE :id` (`useCancelMo`, also unused). NOT in
// `ALWAYS_VIEW_MODULES` — real per-user gate like every other module this
// sprint except the original 4.
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

// Department is free text — admin can type a brand new department name in
// the create-user form. `KNOWN_DEPARTMENTS` are just the seed values shown
// in the dropdown; any other string is a perfectly valid department, it
// simply starts with an empty template (admin fills permissions in
// manually) rather than breaking validation.
export const KNOWN_DEPARTMENTS = ['BTE', 'BPD', 'BSC', 'BCD'] as const

export type OrgRole = 'admin' | (typeof KNOWN_DEPARTMENTS)[number]

// No pre-assigned module ownership yet for BTE/BPD/BSC/BCD — each starts
// with an empty permission template; admin fills them in per user until an
// ownership convention is established.
export const ROLE_TEMPLATE: Partial<Record<string, ModuleKey[]>> = {}
