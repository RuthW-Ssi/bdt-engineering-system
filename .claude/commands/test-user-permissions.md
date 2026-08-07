---
description: E2E test — User Module Permissions (Sprint 27): admin CRUD, AdminGuard on /users. Final shipped state (2026-08-07) — 13 gated modules, 4 always-view, 3 permanently ungated. Live-verified end to end.
---

# /test-user-permissions — User Module Permissions E2E

Verifies the Sprint 27 permission system in its final shipped shape:
`res_users.role` is a free-text org-label only (never an enforcement input);
`user_module_permission` (`can_view`/`can_create`/`can_update`/`can_delete`,
unique on `user_id`+`module`) is the single storage layer for access grants;
admin bypasses every check; the 13-entry `ALL_MODULES` list
(`backend/src/common/permissions/permission-modules.ts`) is the full set of
gated modules — `customers`, `projects`, `project-zones`, `sub-zones`,
`project-tracking`, `materials`, `products`, `boms`, `bim`, `routings`,
`cutting-plan`, `orders`, `machines`; 4 of those
(`customers`/`projects`/`project-zones`/`sub-zones`) are in
`ALWAYS_VIEW_MODULES` — `view` unconditionally granted, `create`/`update`/
`delete` still per-user gated; `product-derivation`, `mark-prefix-master`,
`drawings` are **deliberately, permanently** left ungated (JwtAuthGuard only,
not in `ALL_MODULES` at all — no toggle for them exists in the Admin UI);
`/users` is gated by its own dedicated `AdminGuard`, unrelated to this system.

> Live-run 2026-08-07 against a real Docker Postgres + `start:dev` backend +
> Vite frontend, curl for API steps and Playwright for the frontend step.
> Every step below was executed and matched its expected value on that run,
> **except** the routes/payload shapes were corrected from an earlier draft
> that hadn't been run live — see inline notes marked "(corrected)".

## 1. Environment verification

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep bdt-postgres
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"login":"admin","password":"BdtDev2026!"}'   # expect 200/201
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/                            # expect 200
```

## 2. Test steps

1. **Login as admin** (`POST /auth/login`), confirm `user.permissions` in
   the response is an object with exactly the 13 `ALL_MODULES` keys, each
   `{view: true, create: true, update: true, delete: true}` (admin bypass,
   no DB rows needed). `GET /auth/me` with the token returns the identical
   map.
2. **Create a `BTE`-role user** via `POST /users` (pick a fresh login each
   run, e.g. `test-bte-<date>` — re-running with a stale login 409s, see §4)
   — expect the response user record, then `GET /users/:id` to confirm
   `module_permissions` is an **empty array** (no department has a
   pre-assigned template — every new user starts blank, meaning `view` is
   also `false` everywhere until explicitly granted).
3. **Explicit mixed grant**: as admin, `PATCH /users/:id/permissions` with
   body **(corrected — wrapped, not a bare array)**
   `{"permissions":[{"module":"boms","can_view":true,"can_create":true,"can_update":true,"can_delete":false}]}`.
4. **Login as the test user** — confirm `permissions.boms` is
   `{view:true, create:true, update:true, delete:false}` and
   `permissions.materials` is
   `{view:false, create:false, update:false, delete:false}`.
5. **View-allowed check**: as the test user, `GET /dispatches/:id`
   **(corrected — `boms` is served by `bom-upload.controller.ts` under
   `/dispatches`, not `/boms`)** for a real dispatch id → not `403`
   (verified: `200`).
6. **View-denied check**: as the test user, `GET /materials` → expect `403
   Forbidden` (`"Insufficient permission"` — `can_view` is `false` for this
   module).
7. **Create-allowed check**: as the test user, `POST /bom/upload/preview`
   **(corrected — no `POST /products/:code/boms` route exists; this is the
   real `boms`-tagged `create` endpoint)** with an empty body → not `403`
   (verified: `400` "No BOM files uploaded" — a business-validation error,
   which is fine; only a `403` would mean the permission check failed).
8. **Update-allowed check**: as the test user, `POST /dispatches/:id/paint-config`
   **(corrected — `boms`-tagged `update` endpoint; no `PATCH /boms/:id`
   route exists)** → not `403` (verified: an empty `{}` body 500s inside
   `PaintConfigService.saveConfig` — reproduces identically for `admin`,
   confirmed pre-existing/unrelated to permissions, not something to fix
   here; the permission gate itself passed through correctly, which is
   what this step checks).
9. **Delete-denied check**: **(corrected — `boms` has no `DELETE` route at
   all; the old recipe-BOM editor that had one was deleted this sprint as
   a dead feature, see `2b169ca`)** grant the test user
   `{module:'machines', can_view:true, can_create:true, can_update:true, can_delete:false}`
   and check `DELETE /machines/resource/:id` → expect `403 Forbidden`
   (`can_delete` is `false`; the guard runs before the id is even looked
   up, so any id works for this check).
10. **Spot-check the remaining gated modules** (zero grants anywhere for
    the test user unless noted): `GET /bim-models` → `403`; `GET
    /routing-templates/operations-library` **(corrected — plain `GET
    /routing-templates` is a deliberately-ungated cross-feature read for
    `MoNew.tsx`'s suggestion picker, confirmed by inspecting
    `routings.controller.ts` — it returns `200` even with zero grant; use
    the `operations-library` sub-route instead, which IS
    `@RequiresPermission('routings','view')`-tagged)** → `403`; `GET
    /activities` → `403` (folded into the `routings` module key, not
    standalone); `GET /cutting-plan` → `403`; `GET /mo` (orders) → `403`.
    Then grant `{module:'routings', can_view:true}` and confirm both `GET
    /routing-templates/operations-library` and `GET /activities` flip to
    `200` from the single grant (proof they share one permission key).
11. **Shared/infra modules — always read-all, no toggle exists**: as the
    test user (zero grants anywhere), `GET /uoms`, `GET
    /product-categories` → `200` — never part of the permission system.
12. **Always-view modules**: as the test user (zero grants anywhere),
    `GET /projects/:id/zones` and `GET /zones/:id/sub-zones` **(corrected
    — these are nested routes, `@Controller('projects/:projectId/zones')`
    and `@Get('zones/:zoneId/sub-zones')`; there is no flat `/project-zones`
    or `/sub-zones` path)** → `200` (view unconditionally granted), but
    `POST /projects/:id/zones` → `403` (create still gated normally).
    `GET /customers` and `GET /projects` (zero grant) → `200` (same
    always-view treatment), `POST` on either → `403`.
13. **Permanently-open modules (never gated, not a toggle in the UI)**: as
    the test user (no grant possible — these keys aren't in `ALL_MODULES`),
    `GET /dispatches/:id/review-queue` (product-derivation, real dispatch
    id), `GET /mark-prefixes`, `GET /drawings` → `200`, and — unlike the
    shared/infra modules in step 11 — writes on these also stay open
    (e.g. `POST /dispatches/:id/derive`, `PATCH
    /products/:id/variant-attributes` → not `403`), since there's no
    permission check on these controllers at all.
14. **Admin-only gate on `/users`**: as the test user, `GET /users` →
    expect `403` with message `"Admin only"` (the dedicated `AdminGuard`,
    distinct from the generic `"Insufficient permission"` message —
    `/users` doesn't use the module-permission system at all).
15. **Unguarded-controller fix (pre-existing gap, fixed this sprint)**:
    unauthenticated (no token) `GET /file-storage/download?key=x`, `GET
    /product-categories`, `GET /uoms`, `GET /mark-prefixes` → expect `401`
    (these had zero guard at all before this sprint; they're still
    view-open to any *authenticated* user by design, just no longer open to
    anonymous requests).
16. **Frontend** (Playwright-verified 2026-08-07): log in as `admin`,
    confirm the Sidebar shows an "Admin" group with a "Users" link;
    `/admin/users` → click "Edit / Permissions" on a row → confirms one
    unified modal with Name/Department/Level/Job Title/Active followed by
    a **Permissions** table of exactly **13 rows**, one per `ALL_MODULES`
    entry (Customers, Projects, Zones, Sub-zones, Project Tracking,
    Materials, Engineer Products, BOM, BIM, Routings, Cutting Plan, Order,
    Machine & Resources) — the **4 always-view rows** (Customers, Projects,
    Zones, Sub-zones) show View checked+disabled with tooltip "Always
    viewable — reference data used by other features"; the other **9
    rows** have all 4 checkboxes live and reflect whatever grants were
    set via the API. Log in as the test user: confirm the entire "Admin"
    nav group is absent, `/admin/users` redirects to `/dashboard`, only
    nav groups/items for granted modules appear (verified: with grants on
    `boms`+`routings`+`machines` only, the sidebar showed exactly
    Dashboard, Project Management (Customers/Projects/Zones — always-view),
    Engineering→BOM, Engineering→Routings, Production→Machine & Resources,
    and the disabled "Unavailable" group — Materials, Engineer Products,
    BIM, Cutting Plan, and Order were all correctly hidden), and the
    "Unavailable" placeholder group (ECO/QC/Reports, disabled) still shows
    for everyone regardless of grants.
17. **Cleanup**: deactivate the test user via `PATCH /users/:id`
    (`{"active": false}`) so it doesn't linger in the seed data.

## 3. Expected values reference

| Check | Expected |
|---|---|
| Admin login `permissions[any of the 13 modules]` | `{view:true, create:true, update:true, delete:true}` |
| New `BTE` user `module_permissions` | `[]` (empty — no pre-assigned template) |
| test user → `boms` after explicit grant | `{view:true, create:true, update:true, delete:false}` |
| `GET /dispatches/:id` (view), `POST /bom/upload/preview` (create), `POST /dispatches/:id/paint-config` (update) as test user | not `403` |
| `DELETE /machines/resource/:id` as test user (no `can_delete`) | `403` |
| `GET /materials`, `/bim-models`, `/routing-templates/operations-library`, `/activities`, `/cutting-plan`, `/mo` as test user (no grant) | `403` |
| `GET /routing-templates` (plain list) as test user (no grant) | `200` — deliberately ungated cross-feature read, not a `routings` gate |
| `routings` grant → `GET /routing-templates/operations-library` and `GET /activities` | both `200` (shared key) |
| `GET /uoms`, `/product-categories` as test user | `200` (never gated, no toggle) |
| `GET /projects/:id/zones`, `/zones/:id/sub-zones`, `/customers`, `/projects` as test user (no grant) | `200` (always-view) |
| `POST` on always-view modules as test user (no grant) | `403` |
| `GET /dispatches/:id/review-queue`, `/mark-prefixes`, `/drawings` as test user (no grant possible) | `200`, writes also non-`403` (permanently open) |
| `GET /users` as test user | `403 "Admin only"` |
| Unauthenticated `GET /file-storage/download` etc. | `401` |

## 4. Re-run notes

Re-running step 2 with the same login will 409 (`ConflictException`) —
either deactivate/reuse the test user or pick a fresh login string (e.g.
suffix with the date). A stale `active:false` test user from a prior run
lingering in the DB is harmless — the 409 is the only symptom.
