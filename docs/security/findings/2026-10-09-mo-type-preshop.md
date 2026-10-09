# Security review — MO type / Pre-shop (branch `dev-t-mo-preshop`, uncommitted)

- Date: 2026-10-09 · Reviewer: security role (review-only) · Baseline: OWASP API Top 10 2023
- Scope: `git diff origin/dev` + untracked files. Focus: `backend/src/modules/manufacturing-orders/**`
  (preshop import endpoints, `POST :id/preshop`, `PUT :id/lines/:lineId/parts`, `GET :id/bom-compare`,
  `POST :id/bom-link`, `GET :id/qc-check`, `zone-bom`, `zone-check`, print-packet logging), DTOs,
  `preshop/*`, work-orders changes, new dep `pdfjs-dist@3.11.174`, frontend rendering of uploaded strings.

## Verdict: WARN (no Critical/High introduced by this change; 3 Medium, 5 Low)

## What is fine

- Every new endpoint sits under the controller-level `@UseGuards(JwtAuthGuard, PermissionGuard)` and has
  `@RequiresPermission` (`orders:create` for import/zone-check, `orders:update` for writes, `orders:view` for reads).
- All new bodies are class-validator DTOs with nested `@ValidateNested` + `@Type`, length/range caps and
  `ArrayMaxSize`; global `ValidationPipe({ whitelist: true, transform: true })` strips unknown fields.
- IDOR: `PUT :id/lines/:lineId/parts` looks the line up with `{ id: lineId, mo_id: id }` (404 otherwise) and refuses
  non-PRE_SHOP lines. `bom-link` validates `dispatch_id` against the zone's latest BOM, `marks[].assembly_mark`
  against this MO's rows, `pair_with` against the zone's free pool, `add[].bom_assembly_id` against `bom_only`.
  `part_map` renames only parts found on the line's own assembly. Shared real-BOM rows are never edited (only
  `PRE_SHOP`-dispatch rows are written by `applyAssemblyState`).
- No raw SQL added; no `$queryRawUnsafe`.
- pdf.js CVE-2024-4367 (arbitrary JS via FontMatrix, < 4.2.67): mitigated — `preshop-pdf-parser.ts:66` passes
  `isEvalSupported: false`, runs `disableWorker`, and only calls `getTextContent()` (no glyph rendering). No
  `cMapUrl`/`standardFontDataUrl`, so no outbound fetches (API7 SSRF n/a).
- Uploads are parsed in memory and never stored. Frontend: no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in
  the new MO/WO components or `src/lib/*`; marks/names/filenames are rendered through React (escaped).
- `ChangeStatusDto.reason` now optional, but the service still requires it for every move except CONFIRMED /
  IN_PROGRESS (`manufacturing-orders.service.ts:1428-1429`) — audit trail for Cancel/Complete preserved.
- Print log stores `user.login` + MO revision + WO ids only — no secrets/PII beyond the username.
- Grep: no new `password|secret|key|credential|DATABASE_URL` literals.

## Findings

### Medium

**M1 · API6:2023 Unrestricted Sensitive Business Flow / API3 BOPLA — `POST /mo/:id/preshop` accepts `preshop_assemblies` on a Full shop MO**
- Where: `manufacturing-orders.service.ts:640-641` (guard) → `:722-733` (writes).
- What: for `shop_type = FULL_SHOP` the only check is `dto.source === 'BOM'`; `preshop_assemblies` is not rejected.
  A crafted request with `source: 'BOM'` + `preshop_assemblies` (a) creates a `PRE_SHOP` dispatch + lines in a
  Full shop MO's zone — bypassing the create-time rule "zone has a real BOM → must be Full shop", and
  (b) for marks already on the MO, `applyAssemblyState` sets `mo_assembly_line.qty` directly.
- Why: corrupts MO/BOM data integrity, inflates sets beyond BOM remaining.
- Fix (be): in `mergePreshop`, reject `preshop_assemblies?.length` when `mo.shop_type !== 'PRE_SHOP'`
  (mirror of the existing `assembly_lines` check for PRE_SHOP).

**M2 · API6:2023 — set qty on BOM-sourced lines bypasses `assertQtyWithinRemaining`**
- Where: `manufacturing-orders.service.ts:701-705, 722-726, 763-767` (`applyAssemblyState` qty update).
- What: when a `preshop_assemblies` mark matches a line whose assembly is from a `BOM_UPLOAD` dispatch (possible on
  a PRE_SHOP MO after `bom-link` "apply/link", or via M1), qty is raised with only a lower bound (WO-issued floor);
  the upper bound `assertQtyWithinRemaining` applied for create/BOM adds is skipped. Same for `bom-link`
  `final.qty` on `kind = 'bom'` rows via `switchToBomVersion` (`:1051` validation has only `> 0` and floor).
- Why: an MO can claim more sets of a real BOM assembly than remain → double allocation across MOs.
- Fix (be): for lines whose dispatch source is `BOM_UPLOAD`, call `assertQtyWithinRemaining([{ bom_assembly_id, qty }], id)`
  before any qty increase (mergePreshop and linkBom).

**M3 · API4:2023 Unrestricted Resource Consumption — pre-shop PDF import**
- Where: `manufacturing-orders.controller.ts:107-117` (`FilesInterceptor('files', 100, { fileSize: 10 MB })`),
  `preshop/preshop-pdf-parser.ts:60-88`.
- What: one request may buffer up to 100 × 10 MB = 1 GB in memory (Cloud Run instance OOM), then pdf.js parses
  every page of every file with no page cap and no timeout. Files are processed serially on the request thread.
  Only the extension is checked (no MIME / `%PDF-` magic), so the "3 checks" rule is 1/3.
  `doc.destroy()` is not in a `finally` — a throw in `getPage/getTextContent` leaks the document.
- Why: any `orders:create` user can exhaust instance memory/CPU (DoS for all users).
- Fix (be): cap total size (e.g. `files: 20`, `fileSize: 5 MB`, or reject when sum > 25 MB); check
  `buffer.subarray(0,5).toString() === '%PDF-'` and `mimetype === 'application/pdf'`; cap `doc.numPages` (e.g. 200)
  and total pages per request; wrap in `try/finally { await doc?.destroy() }`. Rate limit (devops) remains open (risk register API4).

### Low

**L1 · API4 / A06:2021 — `xlsx@0.18.5` reached from a new upload endpoint**
- Where: `preshop/import/dispatch-note` → `mo-part/dispatch-note-parser.ts:47` (`XLSX.read`); `backend/package.json` `"xlsx": "^0.18.5"`.
- What: 0.18.5 has CVE-2023-30533 (prototype pollution on crafted file, fixed 0.19.3) and CVE-2024-22363 (ReDoS,
  fixed 0.20.2). Pre-existing dependency (also used by `part/import/dispatch-note`, bom-upload), not introduced here;
  this adds one more authenticated entry point. Also no extension/MIME check on this endpoint (size cap 5 MB only).
- Fix (devops/be): upgrade to SheetJS ≥ 0.20.2 from `https://cdn.sheetjs.com/` (npm registry is frozen at 0.18.5);
  add `.xls/.xlsx` extension + MIME check. Track in risk register.

**L2 · A06:2021 — `pdfjs-dist` pinned to 3.11.174**
- Where: `backend/package.json:52`.
- What: CVE-2024-4367 is mitigated by `isEvalSupported: false` (see above), but the version is EOL and that mitigation
  is one flag away from regressing.
- Fix (be): upgrade to ≥ 4.2.67 when the legacy CJS build is no longer needed, or keep the pin + add a unit test
  asserting `isEvalSupported: false` is passed.

**L3 · API4 — unbounded / uncapped DTO fields**
- Where: `dto/create-mo.dto.ts` `MergePreshopDto.assembly_lines` (no `ArrayMaxSize`); `LinkBomFinalDto.length_mm /
  width_mm / height_mm / weight_kg / surface_area_m2` (`@Min(0)` only, no `@Max`).
- What: huge numbers overflow Postgres `Decimal` columns → 500 instead of 400; array is effectively capped by Express's
  100 KB JSON limit only.
- Fix (be): add `@ArrayMaxSize(2000)` and `@Max(99999999)` matching `PreshopAssemblyDto`.

**L4 · API1:2023 BOLA (known global gap) — `zone-bom` / `zone-check` take any `zone_id`**
- Where: `manufacturing-orders.controller.ts:155-167`, `service.ts:1628-1640`.
- What: no zone/project scoping; `zone-check` returns the MO code holding any zone. Low impact (same as the
  existing "any authed user reads any object" state in the risk register).
- Fix (be): none now; covered by the existing API1 risk-register entry.

**L5 · A09:2021 — client-supplied `filename` / `notes[]` written verbatim into `mo_status_history.reason`**
- Where: `manufacturing-orders.service.ts:741-745`.
- What: the audit text includes user-controlled strings (up to 200 × 500 chars of `notes`). Rendered safely by React
  today, but the audit row can be padded/forged-looking ("คำเตือนตอนอ่านไฟล์: …"). Not injection.
- Fix (be): optional — cap total notes length (e.g. 20 × 200) and strip control chars/newlines.

## Non-security note (route to be)
- Express default JSON body limit is 100 KB (`main.ts` sets none). A large Dispatch Note / PDF set saved via
  `POST /mo` or `POST /mo/:id/preshop` (2000 assemblies × parts) will hit 413. Decide a deliberate limit
  (e.g. `app.use(json({ limit: '2mb' }))`) rather than relying on the default.

## OWASP API table delta
- API4: new upload endpoints add memory/CPU exposure (M3) — rate limit + size caps still open.
- API6: MO qty/BOM integrity checks have gaps on new merge/link flows (M1, M2).
- Others unchanged.
