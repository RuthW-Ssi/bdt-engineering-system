# Security Review — MO Print Packet + DWG Removal

- **Branch:** `dev-t-mo-print-packet` (base `dev` @ `9eaa78f`) — changes
  UNCOMMITTED in the working tree at review time
- **Reviewer:** security subagent (review-only, OWASP API Top 10 2023
  baseline), via `/release-gate`
- **Date:** 2026-09-15
- **Verdict: WARN** — one Medium finding (F-001), a pre-existing,
  already-tracked, app-wide pattern reconfirmed on a new endpoint — not a
  new regression, not blocking per established precedent (R-011). No
  Critical/High findings.

---

## Scope reviewed

```
git diff dev -- backend/src/ src/
```

Plus 6 untracked new files not visible to `git diff` against a tracked
branch (new, never-committed): `backend/src/modules/manufacturing-orders/
mo-print/{mo-print.service.ts, mo-print-pdf-builder.ts,
mark-drawing-match.ts, mo-print.service.spec.ts,
mo-print-pdf-builder.spec.ts, mark-drawing-match.spec.ts}` — read directly.

Three logical changes:
1. New `GET /mo/:id/print-packet` — generates + streams a merged PDF
   (manifest + per-WO traveler + embedded shop-drawing pages via `pdf-lib`).
2. `DrawingApsService` (Autodesk-APS `.dwg` preview pipeline) + its 2 routes
   deleted entirely; `.dwg` upload itself removed (`CreateDrawingDto` now
   server-side-rejects any `file_name` not ending `.pdf`).
3. 46 real `.dwg` files bulk-deleted via a loop of `DELETE /drawings/:id`
   (existing single-delete endpoint, called 46 times — not new code).

## Checks performed

### 1. `GET /mo/:id/print-packet` — authz

Compared against every other `:id`-scoped route on
`manufacturing-orders.controller.ts` (`findOne`, `getAssemblies`,
`getParts`, `getHistory`, `getConsumeSummary`, `update`, `changeStatus`,
`cancel`): all resolve strictly by primary key with `@RequiresPermission`
(module/action level) and **no** project/customer-membership check. The
new `printPacket()` handler is identical in shape —
`@RequiresPermission('orders', 'view')` only, no scoping beyond that. This
is **not a new gap** — it's the existing, already-tracked pattern
(risk register **R-001**, API1:2023 BOLA) reconfirmed on a new endpoint.
`R-011`'s release note (2026-07-21, BIM Viewer review) already explicitly
lists `manufacturing-orders` among the modules carrying this exact shape
today, so this finding doesn't even widen R-001's known affected-module
list — it's a same-module instance of an already-scoped gap.

`MoPrintService.buildPlan()`/`DrawingsService.findByZone()` (the
drawing-match step) carry the same shape — no zone/project-ownership check
— consistent with `drawings` being one of R-001's already-listed affected
modules.

**Finding F-001** (below) — Medium/WARN, not blocking, per the R-011
precedent of treating a same-shape reconfirmation as WARN rather than
BLOCK for an already-accepted, already-tracked, app-wide risk.

### 2. `@Res() res: Response` (non-passthrough) — exception-filter bypass risk

Verified safe by reading the actual control flow:

```ts
async printPacket(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
  const bytes = await this.moPrint.buildPdf(id)   // <- full PDF built in memory here
  res.set({ 'Content-Type': 'application/pdf' })   // <- nothing sent before this line
  res.send(Buffer.from(bytes))
}
```

`buildMoPrintPdf()` builds the entire merged document into an in-memory
`Uint8Array` and returns it in one shot (`doc.save()`) — there is no
streaming/chunked write. Consequently `await this.moPrint.buildPdf(id)`
either resolves with the complete buffer or rejects; in both cases this
happens **before** `res.set()`/`res.send()` are ever reached, so there is
no scenario where headers have already been sent when an error occurs —
the "leaks a stack trace mid-stream" concern doesn't apply to this
handler's actual shape.

Any exception thrown inside `buildPdf()` — `NotFoundException` (bad MO id),
`ConflictException` (no WOs / missing drawing PDF), or a raw `Error` (e.g.
`fs.readFileSync` ENOENT from `FileStorageDriver.getObject`, or a pdf-lib
parse failure) — propagates as a normal rejected Promise out of the async
controller method. This is still routed through Nest's registered global
exception filter (`app.useGlobalFilters(new LoggingExceptionFilter(...))`
in `main.ts`) regardless of `@Res()` usage, because the filter attaches at
the framework's exception-handling layer, not the response-serialization
layer that `@Res()` opts out of. Confirmed by reading
`backend/src/common/filters/logging-exception.filter.ts`: it extends
`BaseExceptionFilter`, logs full message+stack server-side for any 5xx,
then delegates to `super.catch()` — Nest's standard sanitized-body behavior
(generic `{"statusCode":500,"message":"Internal server error"}` for
non-`HttpException` errors; the real `HttpException` message for
`NotFoundException`/`ConflictException`, which contain only WO codes/marks
the requesting user already has `orders:view` permission to see via other
endpoints). **No raw stack trace or internal detail reaches the client.
Not a finding.**

### 3. Drawing-fetch key origin — path traversal via `FileStorageService.getObject()`

Traced the `key` passed to `getObject()` end to end:

```
MoPrintService.buildPdf()
  → fileStorage.getObject(row.drawing.file_key)
row.drawing  ← findLatestPdfForMark(zoneDrawings, assembly.assembly_mark)
zoneDrawings ← this.drawings.findByZone(zone_id, sub_zone_id)   // DB read
```

`row.drawing.file_key` is always a value read back out of the `drawing`
table via `DrawingsService.findByZone()` (a plain `prisma.drawing.findMany`
— see `drawings.service.ts`) — never anything from the `print-packet`
request itself (the only input to that endpoint is the MO's numeric `:id`,
parsed by `ParseIntPipe`). The value stored in that column was validated at
write time by `CreateDrawingDto.file_key`'s existing regex
(`/^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?v\d+\/[^/\\]+$/`, unchanged by
this diff) when the row was originally created via `POST /drawings`. **No
path-traversal is reachable through the reviewed endpoint** — confirmed,
not just assumed, by reading `mo-print.service.ts` in full and tracing
every producer of `row.drawing`.

Separately, at the driver level: `LocalFileStorageDriver.getObject()` does
`fs.readFileSync(path.join(STORAGE_ROOT, key))` with no traversal check of
its own, and `GcsFileStorageDriver.getObject()` does
`this.bucket.file(key).download()`, also unguarded. This matches the
**existing** pattern of every other method on this interface
(`delete()`, `putObject()`, `getMetadata()` — none validate `key` either;
validation happens once, upstream, at the DTO layer) — `getObject()` does
not introduce a *weaker* pattern than what already exists, it's consistent
with it. It does mean the interface now has a fourth method whose safety
depends entirely on every future caller sourcing `key` from a DB row rather
than request input — worth a non-blocking follow-up (route: backend) to
eventually wrap the driver with a shared key-sanitizer, echoing the
already-documented residual gap in `wiki/features/drawing.md` re:
`file-storage`'s own `upload` endpoint accepting an unchecked raw `key`
query param. **Not a new finding** — same shape as the pre-existing,
already-known gap; noted for awareness only, no risk-register action
(the existing gap already covers this class of issue).

### 4. PDF generation — untrusted-string injection / resource exhaustion

`mo-print-pdf-builder.ts` draws `projectName`, `zoneLabel`/`subZoneName`,
`assemblyMark`, `workCenterName`, `wo.wo_code`, `wo.status` via pdf-lib's
`page.drawText()` — all ultimately sourced from BOM-upload-controlled data
(`project.name`, `project_zone.label`, `sub_zone.name`,
`bom_assembly.assembly_mark`).

- **Structural/format-string injection:** none possible — `drawText()`
  takes a plain string argument, not a template the value is interpolated
  into; pdf-lib serializes it as a PDF text-showing operator with its own
  escaping for `(`/`)`/`\`, not string concatenation into PDF syntax.
- **Unicode/control characters:** pdf-lib's `StandardFonts` only encode
  WinAnsi (Latin-1) and throw on non-Latin input — this app's project/zone
  names are routinely Thai, which the implementation already handles by
  embedding a real Unicode font (Sarabun, via `@pdf-lib/fontkit`) rather
  than a `StandardFont`. Covered by a dedicated regression test
  (`mo-print-pdf-builder.spec.ts`: "does not throw when the project/zone/
  mark text contains Thai characters" — caught live on local dev during
  implementation, per the code comment). A glyph genuinely absent from
  Sarabun's coverage (e.g. CJK, emoji) would still throw during
  `embedFont`/`drawText` — this is a robustness/availability concern (that
  MO's print-packet request 500s), not a security one; any 500 here is
  handled per §2 above (caught by the global filter, no leak). **Low,
  availability-only, not security-relevant — no fix required for this
  review.**
- **Resource exhaustion via long strings:** no explicit length cap exists
  in `mo-print-pdf-builder.ts` on any drawn string, but every source field
  is bounded at the schema level — confirmed in
  `backend/prisma/schema.prisma`: `bom_assembly.assembly_mark VarChar(60)`,
  `project.name VarChar(200)`, `project_zone.label VarChar(80)`,
  `sub_zone.name VarChar(80)`. No unbounded string can reach `drawText()`
  through this path. **Verified non-issue, not a finding.**
- **Row-count/page-count bound:** `buildMoPrintPdf()` iterates
  `plan.rows` (one per non-cancelled WO) with no upper cap, merging each
  matched drawing's full page set. A pathologically large MO (very many
  WOs, each with a many-page drawing PDF) would build a proportionally
  large document synchronously per request, with no per-request size/time
  limit — this is the same class of gap as the app's already-tracked
  **R-003** (API4:2023, no rate limiting / unrestricted resource
  consumption on upload-like endpoints), just a read-side instance of it.
  In practice WO count per MO is bounded by routing-template operation
  count × assembly count (small, per the codebase's own manifest-page
  overflow-protection comment). **Low — covered by R-003's existing scope,
  no new risk-register entry needed.**

### 5. `FileStorageDriver.getObject()` — interface + both driver implementations

Read `file-storage.interface.ts`, `local.driver.ts`, `gcs.driver.ts`,
`file-storage.service.ts` in full (not just the diff). `getObject()` is a
straightforward buffer read (`fs.readFileSync` / GCS `.download()`), well
factored, doc-commented with the reason it exists (local driver's
`getDownloadUrl()` points back at this same JWT-guarded API, which a
server-to-server `fetch()` can't authenticate — confirmed this was caught
live, per the wiki, before shipping). See §3 above for the key-origin
analysis. Both driver implementations + the service pass-through are
covered by new/updated Jest specs (`gcs.driver.spec.ts` adds a
`getObject` test). **No finding.**

### 6. `CreateDrawingDto` `.pdf`-only enforcement

```ts
@ApiProperty({ example: 'plan-A.pdf' })
@IsString()
@Matches(/\.pdf$/i, { message: 'file_name must end in .pdf — .dwg upload was removed 2026-09-15' })
file_name: string
```

Confirmed a real `class-validator` decorator (`create-drawing.dto.ts:36`)
— server-side enforced on `POST /drawings`, not just the upload modal's
dropzone `accept` attribute. A direct API call with a `.dwg` (or extension-
less) `file_name` is rejected with a 400. Covered by new spec tests in
`drawings.service.spec.ts` (`CreateDrawingDto validation (.pdf-only)`:
accepts `.pdf`/`.PDF`, rejects `.dwg`, rejects no-extension). **Confirmed,
not a finding.**

### 7. 46-file bulk `.dwg` deletion — no code path involved, guard intact

`drawings.controller.ts` diff confirms `@UseGuards(JwtAuthGuard)` remains
at the controller level (line 8, unchanged), and the `remove()` handler
(`DELETE /:id`) is untouched by this diff apart from constructor wiring
(the deleted `DrawingApsService` dependency). Nothing about this session's
changes weakens or removes that guard. The bulk deletion itself used this
existing, still-guarded endpoint 46 times — no new code path, no new
finding.

### 8. Dependency additions — `pdf-lib`, `@pdf-lib/fontkit`

| Package | Version pinned | Last published | Weekly downloads (npm, 2026-09-05 to 09-11) |
|---|---|---|---|
| `pdf-lib` | `^1.17.1` | 2022-05-12 | 10,078,675 |
| `@pdf-lib/fontkit` | `^1.1.1` | 2022-04-06 | 1,551,748 |

Both are extremely widely used (pdf-lib is effectively the standard
JS/TS PDF-generation library), not typosquats, not low-adoption/newly
published packages — no supply-chain red flags. **Watch item (Low/INFO,
not blocking):** neither package has had a release since 2022 — this is
dependency staleness (unmaintained upstream, so a future CVE would go
unpatched by the maintainer) rather than a known active vulnerability
today. Routine `npm audit`/Dependabot coverage is sufficient; no special
action needed for this review.

### 9. Removed `DrawingApsService` + its 2 routes — no auth check lost

Read the removed routes via the diff (`drawings.controller.ts` @@ lines
472-487, now deleted): `GET /:id/aps-status` and `GET /:id/aps-viewer-token`
carried **no** route-specific guard beyond the controller-level
`@UseGuards(JwtAuthGuard)` — no `@RequiresPermission`, matching the
`drawings` module's documented "permanently ungated" convention
(`wiki/tech/backend/decisions.md#permanently-ungated-modules`). Since that
controller-level guard is unchanged and still applies to every remaining
route, nothing security-relevant was uniquely scoped to the two deleted
routes that isn't still present elsewhere on the same controller. Net
effect is a reduction in attack surface (two fewer routes, and the removed
`getViewerToken()` previously handed out a live, if narrowly
`viewables:read`-scoped, Autodesk APS access token to any authenticated
user — that specific token-issuance path is now gone entirely). **Not a
finding — confirmed clean removal.**

## Finding

### F-001 · API1:2023 BOLA — `GET /mo/:id/print-packet` has no object-level authorization

- **Where:** `backend/src/modules/manufacturing-orders/manufacturing-orders.controller.ts:137-144` (`printPacket()`); same gap already present on every other `:id` route in this controller and in `DrawingsService.findByZone()`.
- **What:** the endpoint resolves solely by MO primary key + the coarse `orders:view` permission — no check that the requesting user has any project/customer relationship to the MO being printed.
- **Why:** any authenticated user holding the (app-wide, not per-project) `orders:view` permission can generate a print packet — including embedded shop-drawing PDF content — for any MO in the system, not just ones relevant to them.
- **Fix:** route to **backend**, as part of the app-wide `R-001` fix (owner/project-scope check on read endpoints) — not a standalone fix scoped to this endpoint. No new risk-register entry: this is the same risk as `R-001`/`R-011`, and `R-011`'s 2026-07-21 release note already names `manufacturing-orders` among the modules carrying this exact shape today.
- **Severity:** Medium → **WARN** (not Critical/High-BLOCK), per the `R-011` precedent of treating a same-shape reconfirmation of an already-accepted, already-tracked, single-tenant-internal-app risk as non-blocking for the feature that happens to surface it again, rather than re-litigating the underlying architectural gap on every PR that touches an affected module.

## OWASP checklist (per role card Definition-of-Done)

- [x] All routes in scope reviewed for `JwtAuthGuard` (+ `PermissionGuard`/`@RequiresPermission` where the module uses it) — present, unchanged
- [x] DTO validation present on all new/changed input (`CreateDrawingDto`'s new `@Matches` on `file_name`; `print-packet` takes only a `ParseIntPipe`-validated numeric `:id`, no body/query)
- [x] Grep clean: `password|secret|key|credential|DATABASE_URL` — no matches introduced by this diff (the only "key" hits are the pre-existing `file_key`/storage-key naming, not credentials)
- [x] File upload — N/A this review (no upload endpoint changed; `CreateDrawingDto` change is a *tighter* restriction, not a new upload path)
- [x] No `$queryRaw`/`$queryRawUnsafe` usage anywhere in this diff
- [x] Risk register cross-checked (R-001, R-003, R-011) — F-001 maps to existing R-001/R-011, no new entry required; R-003 covers the unbounded-row-count observation in §4
- [x] Findings file written (this file)

## Verdict

**WARN.** One Medium finding (F-001), which is a reconfirmation of an
already-open, already-accepted, app-wide risk-register item (`R-001`/
`R-011`) on a new endpoint in a module (`manufacturing-orders`) that
`R-011` already named as carrying this shape — not a new regression, not
widening the known gap. No Critical/High findings. Everything else
reviewed (key-origin/path-traversal, `@Res()` exception-handling,
`.pdf`-only server-side enforcement, the 46-file bulk deletion's guard,
new dependencies, and the removed APS routes) checked out clean.
Recommend: proceed: ship as-is, per the same precedent used for
BIM Viewer (2026-07-21) and Drawing APS Preview (2026-08-26) — route F-001
to backend for the eventual app-wide `R-001` fix rather than blocking this
feature on it.
