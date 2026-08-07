---
description: E2E test — User Module Permissions (Sprint 27): admin CRUD, AdminGuard on /users. Final shipped state (2026-08-07) — 13 gated modules, 4 always-view, 3 permanently ungated.
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

## 1. Environment verification

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep bdt-postgres
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"login":"admin","password":"BdtDev2026!"}'   # expect 200/201
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/                            # expect 200
```

## 2. Test steps

1. **Login as admin**, capture `access_token` and confirm `permissions` in
   the response is an object where every one of the 13 `ALL_MODULES` keys
   maps to `{view: true, create: true, update: true, delete: true}` (admin
   bypass, no DB rows needed).
2. **Create a `BTE`-role user** via `POST /users` (login `test-bte`,
   role `BTE`, no explicit `permissions`) — expect the response user
   record, then `GET /users/:id` to confirm `module_permissions` is an
   **empty array** (no department has a pre-assigned template — every new
   user starts blank, meaning `view` is also `false` everywhere until
   explicitly granted).
3. **Explicit mixed grant**: as admin, `PATCH /users/:id/permissions` with
   `[{module:'boms', can_view:true, can_create:true, can_update:true, can_delete:false}]`.
4. **Login as `test-bte`** — confirm `permissions.boms` is
   `{view:true, create:true, update:true, delete:false}` and
   `permissions.materials` is
   `{view:false, create:false, update:false, delete:false}`.
5. **View-allowed check**: as `test-bte`, `GET /boms/:id` (for a real BOM
   id) → not `403`.
6. **View-denied check**: as `test-bte`, `GET /materials` → expect `403
   Forbidden` (`"Insufficient permission"` — `can_view` is `false` for this
   module).
7. **Create-allowed check**: as `test-bte`, `POST /products/:code/boms`
   → not `403` (business validation errors like 400/404 are fine, just not
   a permission 403).
8. **Update-allowed check**: as `test-bte`, `PATCH /boms/:id` → not `403`.
9. **Delete-denied check**: as `test-bte`, `DELETE /boms/:id` → expect
   `403 Forbidden` (`can_delete` is `false`).
10. **Spot-check the remaining gated modules** (zero grants anywhere for
    `test-bte` unless noted): `GET /bim-models` → `403`; `GET
    /routing-templates` → `403`; `GET /activities` → `403` (folded into the
    `routings` module key, not standalone — a `routings` grant is required,
    not a separate `activities` grant); `GET /cutting-plan` → `403`; `GET
    /mo` (orders) → `403`; `GET /machines` → `403`. Then grant
    `{module:'routings', can_view:true}` and confirm both `GET
    /routing-templates` and `GET /activities` flip to `200` from the single
    grant (proof they share one permission key).
11. **Shared/infra modules — always read-all, no toggle exists**: as
    `test-bte` (zero grants anywhere), `GET /uoms`, `GET
    /product-categories` → `200` — never part of the permission system.
12. **Always-view modules**: as `test-bte` (zero grants anywhere), `GET
    /project-zones` and `GET /sub-zones` → `200` (view unconditionally
    granted), but `POST` on either → `403` (create still gated normally).
    `GET /customers` and `GET /projects` (zero grant) → `403` — same
    always-view treatment as zones, but for reference/entity data on these
    two `view` is granted and only write is gated:
    re-check — `GET /customers`/`GET /projects` with zero grant should be
    `200` (view always-granted, per `ALWAYS_VIEW_MODULES` including these
    two), `POST`/`PATCH`/`DELETE` on either → `403`.
13. **Permanently-open modules (never gated, not a toggle in the UI)**: as
    `test-bte` (no grant possible — these keys aren't in `ALL_MODULES`),
    `GET /dispatches/:id/review-queue` (product-derivation, real dispatch
    id), `GET /mark-prefixes`, `GET /drawings` → `200`, and — unlike the
    shared/infra modules in step 11 — writes on these also stay open
    (e.g. `POST /dispatches/:id/derive`, `PATCH
    /products/:id/variant-attributes` → not `403`), since there's no
    permission check on these controllers at all.
14. **Admin-only gate on `/users`**: as `test-bte`, `GET /users` → expect
    `403` with message `"Admin only"` (the dedicated `AdminGuard`, distinct
    from the generic `"Insufficient permission"` message — `/users` doesn't
    use the module-permission system at all).
15. **Unguarded-controller fix (pre-existing gap, fixed this sprint)**:
    unauthenticated (no token) `GET /file-storage/download?key=x`, `GET
    /product-categories`, `GET /uoms`, `GET /mark-prefixes` → expect `401`
    (these had zero guard at all before this sprint; they're still
    view-open to any *authenticated* user by design, just no longer open to
    anonymous requests).
16. **Frontend**: log in as `admin`, confirm the Sidebar shows an "Admin →
    Users" link; `/admin/users` → click "Edit / Permissions" on any row →
    confirm one unified modal shows Name/Department/Level/Job Title/Active
    followed by a feature-list table of exactly **13 rows** (one per
    `ALL_MODULES` entry) with real View/Create/Update/Delete checkboxes —
    the **4 always-view rows** (Customers, Projects, Project Zones,
    Sub-zones) show View checked+disabled; the other **9 rows**
    (Project Tracking, Materials, Products, BOMs, BIM, Routings,
    Cutting Plan, Orders, Machines) have all 4 checkboxes live. Uncheck
    View for a regular module (e.g. BOMs), Save, re-open to confirm it
    persisted, then confirm `GET` on that module now `403`s for that user.
    Log in as `test-bte`, confirm the Admin nav section and `/admin/users`
    route are absent/redirect to `/dashboard`, and nav items for modules
    with zero grant are hidden (sidebar gating from `dc9e7f8`) while
    always-view modules (`/zones`, `/customers`, `/projects`) and the 3
    permanently-open modules stay visible/reachable regardless of grants.
17. **Cleanup**: deactivate the `test-bte` user via `PATCH /users/:id`
    (`active: false`) so it doesn't linger in the seed data.

## 3. Expected values reference

| Check | Expected |
|---|---|
| Admin login `permissions[any of the 13 modules]` | `{view:true, create:true, update:true, delete:true}` |
| New `BTE` user `module_permissions` | `[]` (empty — no pre-assigned template) |
| `test-bte` → `boms` after explicit grant | `{view:true, create:true, update:true, delete:false}` |
| BOM view/create/update as `test-bte` | not `403` |
| BOM delete as `test-bte` | `403` |
| `GET /materials`, `/bim-models`, `/routing-templates`, `/activities`, `/cutting-plan`, `/mo`, `/machines` as `test-bte` (no grant) | `403` |
| `routings` grant → `GET /routing-templates` and `GET /activities` | both `200` (shared key) |
| `GET /uoms`, `/product-categories` as `test-bte` | `200` (never gated, no toggle) |
| `GET /project-zones`, `/sub-zones`, `/customers`, `/projects` as `test-bte` (no grant) | `200` (always-view) |
| `POST`/`PATCH`/`DELETE` on always-view modules as `test-bte` (no grant) | `403` |
| `GET /dispatches/:id/review-queue`, `/mark-prefixes`, `/drawings` as `test-bte` (no grant possible) | `200`, writes also `200`/non-403 (permanently open) |
| `GET /users` as `test-bte` | `403 "Admin only"` |
| Unauthenticated `GET /file-storage/download` etc. | `401` |

## 4. Re-run notes

Re-running step 2 with the same login will 409 (`ConflictException`) —
either deactivate/reuse the test user or pick a fresh login string.
