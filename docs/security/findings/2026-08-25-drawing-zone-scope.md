# Security Findings — Drawing re-scope: Project-level → Zone-level

Branch: `dev-t-drawing-zone-scope` (4 commits on `origin/main`: `0911033` schema/migration, `a29f512` backend API, `088d755` frontend API/hooks, `26c24da` frontend UI) · Reviewed: 2026-08-25 · Reviewer: `security` role subagent, via `/release-gate`

## Scope reviewed

`git diff origin/main..dev-t-drawing-zone-scope -- backend/src/ src/`:
`backend/src/modules/drawings/{drawings.controller.ts,drawings.service.ts,drawings.service.spec.ts,dto/*}`,
`src/api/drawings.ts`, `src/hooks/useDrawings.ts`, `src/components/drawings/DrawingUploadModal.tsx`, `src/pages/DrawingList.tsx`
+ `backend/prisma/migrations/20260825152234_add_zone_scope_to_drawing/migration.sql`.

Also read (unchanged by this branch, but load-bearing for the traversal question below):
`backend/src/modules/file-storage/{file-storage.controller.ts,file-storage.service.ts,drivers/local.driver.ts,drivers/gcs.driver.ts}`,
`backend/src/main.ts` (global `ValidationPipe`), `backend/prisma/schema.prisma` (`drawing` model),
`.github/workflows/deploy-backend.yml`, `backend/.env.example`.

**Prior review context:** this branch already has 4 task-scoped code reviews + 1 whole-branch review (opus), all Approved/Ready-to-merge, 0 Critical/Important findings. One of those reviews triaged the `file_key` regex's `..`-as-a-segment gap as pre-existing/low-risk, citing the local-driver `download` guard. That specific claim is independently confirmed below (see "Traversal check"). I also went further and checked `LocalFileStorageDriver.delete()` directly (the actual code path `DELETE /drawings/:id` uses) — turns out this exact `POST /drawings` → `DELETE /drawings/:id` → `LocalFileStorageDriver`'s unguarded `path.join(STORAGE_ROOT, key)` scenario was **already found and fixed as Critical during the original 2026-08-21 drawing rebuild**, per `wiki/features/drawing.md`'s changelog — the fix was tightening `CreateDrawingDto.file_key`'s regex to a fixed segment-count/position structure (this predates the current branch; the branch only added 1-2 more fixed positions to that same structure for zone/sub-zone). I did not re-discover a missed vulnerability here; see F-01 for a narrower, genuinely-new nuance about *how* that mitigation holds up.

## DoD checklist

| Check | Result |
|---|---|
| `JwtAuthGuard` on all endpoints | ✅ `@UseGuards(JwtAuthGuard)` at class level on `DrawingsController` (`drawings.controller.ts:13`) — unchanged by this branch, confirmed by reading the current file, not assumed. |
| DTO validation on every new field | ✅ `CreateDrawingDto.zone_id` (`@IsInt()`), `.sub_zone_id` (`@IsOptional() @IsInt()`); `QueryDrawingDto.zone_id`/`sub_zone_id` and `QueryLatestDrawingVersionDto.zone_id`/`sub_zone_id` all use `@Transform(Number) @IsInt() @Min(1)` (optional ones add `@IsOptional()`). `NaN` from a non-numeric query string is correctly rejected by `@IsInt()` (class-validator treats `NaN` as not-an-int). Global `ValidationPipe({ whitelist: true, transform: true })` in `backend/src/main.ts:16` strips any unlisted property before it reaches Prisma. No gap found. |
| Grep clean: `password\|secret\|credential\|DATABASE_URL\|apikey\|token` | ✅ zero matches across the full diff (migration SQL + DTOs + controller/service + React Query hook + UI). |
| File upload: size + MIME + extension | ✅ N/A change — `DrawingUploadModal.tsx`'s `MAX_DRAWING_SIZE = 50_000_000` / `MAX_FILES = 1500` are unchanged context lines in the diff, not touched. API4 posture is identical to pre-branch. |
| No SQL string concat / `$queryRaw` | ✅ N/A — migration is a static, hand-written `.sql` file (`DELETE FROM "drawing"` + `ALTER TABLE` + 2 `ADD CONSTRAINT` FKs), not templated from any request input. No `$queryRaw`/`$queryRawUnsafe` anywhere in the diff. |
| Audit trail | N/A — no new state-changing business flow; scope narrowing of an existing create/read/delete flow. |

## API1:2023 BOLA — does zone-scoping change the shape of the pre-existing gap?

**No new leak, gap is identical in kind, just re-keyed.** Pre-branch: `GET /drawings?project_id=` and `.../latest-version?project_id=` ran `findMany({ where: { project_id } })` with no check that the caller owns/is-assigned-to that project — any authenticated user could pass any `project_id`. Post-branch: `GET /drawings?zone_id=&sub_zone_id=` runs `findMany({ where: { zone_id, sub_zone_id } })` with no check that the caller owns/is-assigned-to that zone — any authenticated user can pass any `zone_id`. Same "any auth'd user reads any `<scope>`'s rows" shape, just the scope column changed from `project_id` to `zone_id`(+`sub_zone_id`). `zone_id` is in fact a *narrower* scope than `project_id` (a zone belongs to exactly one project via FK), so this branch does not widen exposure — if anything the addressable unit got smaller. `DELETE /drawings/:id` (`drawings.controller.ts:36-40`) was and remains scoped by bare `id` with no ownership check either — unchanged by this diff. This matches the security role card's already-tracked API1 row ("⚠️ no object-level checks") — no update needed to that row's *shape* for Drawing; it remains the same systemic, tracked gap.

## API3:2023 BOPLA — response shape

✅ No new leak. `drawings.service.ts`'s `create()`, `findByZone()`, `getLatestVersion()` all return raw Prisma results, but never `include` the `uploaded_by`/`zone`/`sub_zone`/`project` relations — only scalar columns on `drawing` (`id, project_id, zone_id, sub_zone_id, version, file_key, file_name, mime_type, uploaded_by_id, create_date`, confirmed against `backend/prisma/schema.prisma:531-551`). No password/credential-bearing relation (e.g. `res_users`) is ever pulled in. Identical shape/risk to pre-branch — the two new scalar columns (`zone_id`, `sub_zone_id`) are themselves non-sensitive.

## API4:2023 Resource Consumption

✅ Confirmed unchanged. `DrawingUploadModal.tsx`'s `MAX_DRAWING_SIZE` (50MB) / `MAX_FILES` (1500) constants are untouched context lines in the diff — this branch only renamed the `projectLabel` prop to `scopeLabel`, no logic change.

## Traversal check — `file_key` regex widening

Old: `/^drawings\/[^/\\]+\/v\d+\/[^/\\]+$/` (2 free segments: project_code, filename).
New: `/^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?v\d+\/[^/\\]+$/` (up to 4 free segments: project_code, zone_code, optional sub_zone_code, filename).

Neither regex excludes the literal string `..` as a whole path segment (only literal `/`/`\` are excluded per-segment) — this is a real, pre-existing gap, and the new regex does widen it from 2 to up to 4 independently-injectable segments. Whether that widening is exploitable depends entirely on what's on the other end consuming `file_key`. I independently verified each consumer rather than trusting the prior triage:

- **`GET /file-storage/download`** (`file-storage.controller.ts:58-71`): for the local driver, computes `absolutePath = this.svc.resolveLocalPath(key)` then requires `absolutePath.startsWith(this.svc.storageRoot())` before serving. `resolveLocalPath()` is `path.resolve(path.join(STORAGE_ROOT, key))` (`file-storage.service.ts:52-54`) — `path.resolve` collapses `..` segments *before* the `startsWith` comparison, so this guard is correct and cannot be bypassed by stacking more `..` segments. **Confirmed the prior review's claim — this path is genuinely safe**, regardless of how many free segments `file_key` now has.
- **GCS driver** (`gcs.driver.ts`): `bucket.file(key)` treats `key` as an opaque object name — GCS has no directory-traversal semantics, `..` is just a literal character sequence in the blob name. **Confirmed** — not filesystem-path-parsed, matches the prior triage's premise. Staging/prod explicitly set `FILE_STORAGE_DRIVER=gcs` (`.github/workflows/deploy-backend.yml:62`), so this is the active driver outside local dev.
- **`LocalFileStorageDriver.delete()` / `.getMetadata()`** (`local.driver.ts:19-21`, `:23-30`) — this is the exact scenario `wiki/features/drawing.md` documents as **already found and fixed as Critical during the 2026-08-21 rebuild**: "an unvalidated `file_key` reaching `LocalFileStorageDriver`'s `path.join(STORAGE_ROOT, key)` would have allowed deleting arbitrary files outside the storage root via `DELETE /drawings/:id`." The fix applied then (and still in place, unchanged by this branch) was **not** a driver-layer `startsWith(storageRoot)` boundary check the way `download()` has — it was tightening `CreateDrawingDto.file_key`'s regex to a rigid, fixed-position structure: exactly `drawings/SEG1/SEG2/[SEG3/]v<digits>/FILENAME`, where the `v<digits>` token's position is fixed and must literally start with `v` followed by digits. This constrains an attacker to at most 3 independently-controlled segments *before* a mandatory, non-`..`-able `v\d+` anchor, and 1 more (`FILENAME`) after it — an attacker cannot freely chain arbitrary `../../../../` depth or land on an arbitrary absolute path, because the final 2 path components are always forced to look like `.../v<N>/<name>`, which won't exist at most real traversal targets. So the *practical* exploit surface was already meaningfully narrowed by input-shape, not by output-path validation. See F-01 for the residual nuance.

## F-01 — `delete()`/`getMetadata()`'s traversal safety still rests on DTO regex shape, not on a driver-level boundary check (confirmed pre-existing, correctly triaged; noting one fragility, not a fresh vulnerability)

- **where:** `backend/src/modules/file-storage/drivers/local.driver.ts:8-10` (`resolvePath`), `:19-21` (`delete`), `:23-30` (`getMetadata`) — reached via `backend/src/modules/drawings/drawings.service.ts:48-53` (`remove()`, unchanged by this branch). Contrast with `FileStorageService.resolveLocalPath()` (`file-storage.service.ts:52-54`), used only by `download()`, which independently validates the final resolved path.
- **what:** I confirm this is **not** a new or missed vulnerability — it's the same one already found Critical and fixed 2026-08-21 (see above), and this branch didn't touch `local.driver.ts` or weaken that fix. The one thing worth flagging: the fix's safety is an *invariant of the DTO regex's shape* (fixed segment count/positions + a `v\d+` anchor), not a property independently re-verified at the point of filesystem access the way `download()` does it (`path.resolve(...).startsWith(storageRoot)`). This branch itself already changed that regex once — from a 2-free-segment shape to a 4-free-segment shape — to accommodate zone/sub-zone. I re-verified by hand that the **new** regex preserves the same safety property (the `v\d+` anchor position is still fixed and still can't be `..`, and there are still finitely-many, positionally-constrained free segments), so this branch does not regress the 2026-08-21 fix. But every future change to that regex (e.g. a Sprint that adds another optional path segment) has to independently re-derive that same safety argument by hand, because `delete`/`getMetadata` have no fallback check of their own if the regex shape ever gets it wrong.
- **why it's worth a line item anyway:** `download()` proves the codebase already has the correct, robust pattern (`path.resolve(...).startsWith(storageRoot)`) available — it's just not applied uniformly to every consumer of `file_key` on the local driver. A regex-shape invariant is more brittle than a resolved-path check: it has to be perfectly re-reasoned every time the format changes, whereas a boundary check at the driver is correct by construction regardless of what the DTO allows upstream.
- **severity: Low (INFO)** — confirmed correctly triaged as low-risk by the prior 2026-08-21 fix and unchanged/not regressed by this branch; GCS (the actual staging/prod driver per `.github/workflows/deploy-backend.yml:62`) isn't affected by any of this since it doesn't parse `key` as a filesystem path at all (confirmed by reading `gcs.driver.ts`). Not a blocker for this branch.
- **fix_route:** `backend` (optional hardening, not urgent) — move the boundary check into `LocalFileStorageDriver.resolvePath()` itself, matching `FileStorageService.resolveLocalPath()`'s pattern, so `delete`/`getMetadata`/`putObject` are safe by construction rather than by-regex-shape. This is a "make the invariant robust to future regex changes" cleanup, not a response to any exploitable gap in the current branch.

## Migration safety

✅ Checked and moving on quickly per task guidance — `backend/prisma/migrations/20260825152234_add_zone_scope_to_drawing/migration.sql` is a static, hand-written file: `DELETE FROM "drawing"` (justified in an in-file comment as disposable staging data, no FK pointing into `drawing`, no TRUNCATE per user instruction) → `ALTER TABLE ... ADD COLUMN "zone_id" INTEGER NOT NULL` → `ADD COLUMN "sub_zone_id" INTEGER` → 2 `ADD CONSTRAINT` FKs (`zone_id → project_zone(id) RESTRICT/CASCADE`, `sub_zone_id → sub_zone(id) SET NULL/CASCADE`). No string interpolation, no request input anywhere in this file. Zero injection risk by construction.

## Verdict: **PASS**

Zero Critical/High/Medium findings. One Low/INFO note (F-01), which is a hardening suggestion on an already-fixed, already-tracked, unregressed pre-existing item — not a new vulnerability. Does not block this branch. All role-card DoD checklist items pass. API1/API3/API4 postures for Drawing are confirmed unchanged in kind from pre-branch (API1's existing ⚠️ row in the role card's OWASP table does not need updating — still the same systemic, tracked, project/zone-agnostic gap, just re-keyed from `project_id` to `zone_id`).

## fix_route summary

| Finding | Severity | fix_route |
|---|---|---|
| F-01 `delete()`/`getMetadata()` traversal safety rests on DTO regex shape, not an independent driver-level boundary check (confirmed pre-existing, correctly fixed 2026-08-21, not regressed by this branch) | Low (INFO) | backend (optional hardening, not urgent) — mirror `download()`'s `startsWith(storageRoot)` pattern inside `LocalFileStorageDriver.resolvePath()` |

No new entry needed in `docs/security/risk-register.md` — F-01 is a variant of the already-tracked local-disk-traversal risk class (see `wiki/features/drawing.md`'s "Known residual gap" callout and `docs/security/findings/2026-08-24-drawing-gcs-dxf.md` F-02), not a new risk class, and this review did not find anything that regresses or reopens it.
