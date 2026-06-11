# Security Review — F-Machine-Tracker (T-MACH.01–10)

- **Date:** 2026-06-11
- **Reviewer:** security subagent (OWASP API Top 10 2023 baseline)
- **Branch:** dev
- **Feature:** Machine status / PM / repair tracking for SSI Steel Production Planners
- **Verdict:** **BLOCK** — 1 High finding (F-001 file extension not validated)

---

## Checklist results (automated grep)

| Check | Command | Result |
|---|---|---|
| No literal secrets | `grep -rE 'password\|secret\|key\|credential\|DATABASE_URL' machines/` | PASS — zero hits |
| No `$queryRawUnsafe` | `grep -rE '\$queryRawUnsafe' machines/` | PASS — zero hits |
| All endpoints guarded | `grep -E 'JwtAuthGuard\|@UseGuards' machines.controller.ts` | PASS — class-level `@UseGuards(JwtAuthGuard)` at line 26 covers all 11 endpoints |
| `@CurrentUser` on mutations | `grep -E '@CurrentUser' machines.controller.ts` | PASS — present on all 4 mutations (lines 66, 76, 87, 97). **See F-002 for unused identity issue** |
| `$queryRaw` safe | `repair-code.generator.ts:13,19` | PASS — tagged template literals only (no string concat); `SELECT ... FOR UPDATE` inside transaction |
| No `console.log` sensitive data | `grep -rE 'console\.log' machines/` | PASS — zero hits in runtime code (seed file only, not production path) |

---

## OWASP focus area findings

### F-001 · HIGH · API8:2023 Security Misconfiguration
**Missing file extension whitelist — upload endpoint stores arbitrary extensions**

- **File:line:** `backend/src/modules/machines/machines.controller.ts:114–115`
- **What:** The `fileFilter` callback checks `file.mimetype` against `ALLOWED_MIME = ['image/jpeg', 'image/png']` — MIME only. The `filename` callback uses `path.extname(file.originalname)` verbatim to build the stored filename (e.g., `machine-1234567890<ext>`). An attacker can send a multipart request with `Content-Type: image/jpeg` in the part header (bypassing MIME check) but `filename="shell.php"` in the `Content-Disposition` header — resulting in a file stored as `machine-{ts}.php` on disk.
- **Reference pattern deviation:** `bom-upload.service.ts:534` checks BOTH MIME (`!ALLOWED_MIMES.includes(f.mimetype)`) AND extension (`.originalname.match(/\.(xlsx|xls|csv)$/i)`). This machine upload deviates from the established reference pattern.
- **Why it matters:** OWASP API8 / the security role card lists "file upload missing any of 3 checks: size + MIME + extension" as a Top-5 anti-pattern mapped to HIGH severity. The `.php` extension in isolation won't execute on a Node.js/NestJS server, but the principle is violated and the pattern is wrong for the codebase standard. Additionally, if an external CDN or Nginx layer is ever placed in front of the storage directory, extension-based execution could become an active risk.
- **Fix (route → backend role):**
  ```typescript
  const ALLOWED_EXT = ['.jpg', '.jpeg', '.png']
  // In fileFilter:
  const ext = path.extname(file.originalname).toLowerCase()
  if (!ALLOWED_MIME.includes(file.mimetype) || !ALLOWED_EXT.includes(ext)) {
    return cb(new BadRequestException('Only jpg/png allowed'), false)
  }
  cb(null, true)
  ```
- **Severity:** High → **BLOCK**

---

### F-002 · MEDIUM · A09:2021 Security Logging and Monitoring Failures
**Audit trail identity not tied to JWT — authenticated user_id never persisted**

- **Files:lines:**
  - `machines.controller.ts:66,76,87,97` — `@CurrentUser() _user: JwtPayload` on all 4 mutations (leading `_` = unused)
  - `machines.service.ts:133–147` (`createMaintenanceLog`), `155–171` (`openRepairTicket`), `181–196` (`closeRepairTicket`), `199–216` (`changeStatus`)
  - Schema: `maintenance_log`, `repair_ticket`, `machine_status_history` — no `created_by_user_id` column
- **What:** All four write mutations extract the authenticated user from the JWT via `@CurrentUser()` but never use it. The `performed_by`, `reported_by`, `repaired_by`, and `changed_by` fields are free-text strings from the DTO body. Any authenticated employee can write any name in the audit record (e.g., a planner can log a PM as "หัวหน้าช่าง"). There is no cryptographic link between an audit entry and the authenticated system account that submitted it.
- **Why it matters:** OWASP A09:2021 — the audit trail is not trustworthy for accountability or forensics. The intent of capturing `@CurrentUser` suggests the design intended to use it but did not.
- **Note — business design intent:** The `performed_by` field likely serves a legitimate dual purpose: recording the physical technician who did the work (not the IT account that submitted the form). This free-text field can remain. The fix is to ADD a `created_by_user_id` column alongside it, not replace it.
- **Fix (route → data role for schema + backend role for service):**
  1. Add `created_by_user_id Int?` FK → `identity_user.id` on `maintenance_log`, `repair_ticket` (open + close), `machine_status_history`.
  2. In service methods: `created_by_user_id: user.sub` (where `user` is the `@CurrentUser()` payload — remove the `_` prefix).
  3. Prisma migration + seed update.
- **Severity:** Medium → WARN (all authenticated users are internal SSI Steel employees; risk is audit integrity, not auth bypass)

---

### F-003 · LOW · API1:2023 Broken Object Level Authorization
**No machine ownership check — single-tenant accepted risk (explicit documentation)**

- **Files:** All read/write endpoints in `machines.controller.ts` / `machines.service.ts`
- **What:** No machine-level ownership check; any authenticated user can read or write any machine record. This mirrors the existing accepted state for products, customers, and dispatches (R-001 in the risk register).
- **Risk acceptance rationale:** BDT is a single-tenant deployment for SSI Steel internal staff only. All authenticated users are plant employees with legitimate access to all machine data. There is no multi-tenant isolation requirement for this feature.
- **Action:** No code fix needed now. Document under R-001 extension in risk register. Revisit if external access or multi-tenant use is ever introduced.
- **Severity:** Low (accepted risk — consistent with existing posture)

---

### F-004 · LOW · API3:2023 Broken Object Property Level Authorization
**photo URL arrays accept arbitrary strings — no URL pattern validation**

- **Files:lines:**
  - `create-maintenance-log.dto.ts:34–38` — `photo_urls: string[]` with `@IsString({ each: true })`
  - `open-repair-ticket.dto.ts:21–26` — `photos_before: string[]`
  - `close-repair-ticket.dto.ts:26–31` — `photos_after: string[]`
- **What:** The photo URL arrays accept any string per element. A client could pass `["javascript:alert(1)"]`, `["../../etc/passwd"]`, or any other string. SQL injection is mitigated by Prisma ORM. XSS risk exists if the frontend renders these URLs in `<img src>` without sanitization (though `javascript:` in `src` is generally safe in modern browsers). Main risk is storing junk data in the audit trail.
- **Fix (route → backend role):** Add `@IsUrl({ require_tld: false })` per element, or add `@Matches(/^\/storage\/machine-photos\/[\w\-\.]+$/)` to constrain to app-managed paths only.
- **Severity:** Low

---

### F-005 · LOW · API8:2023 Security Misconfiguration
**Upload endpoint returns unresolvable storage URL — no authenticated download route**

- **File:line:** `machines.controller.ts:128` — `return { url: '/storage/machine-photos/${file.filename}' }`
- **What:** The URL returned points to `/storage/machine-photos/...`. There is no `ServeStatic` or `app.use('/storage', express.static(...))` configured in `main.ts` or `app.module.ts`. In production (Cloud Run), the container filesystem is also ephemeral — uploaded files are lost on container restart. The returned URL is broken in practice.
- **Secondary security concern:** If static file serving is added later for this path (the obvious fix), it must go through the JWT auth guard, not be served as a bare static route — otherwise any unauthenticated party with the URL can download photos.
- **Fix (route → backend role):** Route photo downloads through an authenticated API endpoint that streams the file, analogous to `GET /file-storage/download?key=...` (file-storage module, `file-storage.controller.ts:48–60`). Return the `key` (relative path) from upload, not a raw URL.
- **Severity:** Low (functional bug + security design smell; no immediate exploitability since URLs are currently broken)

---

### F-006 · LOW · A03:2021 Injection (input validation gap)
**`@IsNotEmpty()` absent on required string fields — empty strings pass validation**

- **Files:** All 4 mutating DTOs
  - `CreateMaintenanceLogDto` — `performed_by`, `description`
  - `OpenRepairTicketDto` — `reported_by`, `problem_description`
  - `CloseRepairTicketDto` — `repaired_by`, `repair_description`
  - `ChangeStatusDto` — `reason`, `changed_by`
- **What:** Required string fields are decorated with `@IsString()` only. An empty string `""` passes `@IsString()` validation. Audit records could be created with empty identity fields, undermining the audit trail.
- **Fix (route → backend role):** Add `@IsNotEmpty()` decorator to each required string field in these DTOs.
- **Severity:** Low

---

## Repair code generator — race condition review (A04:2021)

`repair-code.generator.ts` uses `SELECT next_val FROM repair_ticket_seq WHERE id = 1 FOR UPDATE` inside a Prisma `$transaction`. This is the correct pattern for preventing sequence duplication:
- `FOR UPDATE` acquires a row-level lock on the sequence row
- The lock is held until the transaction commits (after `UPDATE ... SET next_val = next_val + 1`)
- Concurrent requests will serialize on the lock

**Result: PASS** — no race condition vulnerability. The SELECT-FOR-UPDATE pattern inside a transaction is correct.

---

## Findings table

| ID | Severity | OWASP cat | File:line | What | Fix route |
|---|---|---|---|---|---|
| F-001 | **HIGH** | API8:2023 Security Misconfiguration | `machines.controller.ts:114–115` | Extension from `file.originalname` used verbatim; only MIME checked. Reference pattern (`bom-upload.service.ts:534`) checks extension too. | backend role: add `ALLOWED_EXT` check in `fileFilter` |
| F-002 | **MEDIUM** | A09:2021 Logging Failures | `machines.service.ts:133–216` + schema | `@CurrentUser() _user` unused on all 4 mutations; `performed_by`/`changed_by` are free-text from DTO — no JWT user_id in DB | data (add FK column) + backend (use `user.sub`) |
| F-003 | Low | API1:2023 BOLA | All endpoints | No machine ownership check — single-tenant accepted risk (consistent with R-001) | Document only; no code fix |
| F-004 | Low | API3:2023 BOPLA | DTOs photo array fields | `photo_urls`/`photos_before`/`photos_after` accept arbitrary strings; no `@IsUrl()` | backend role: add `@IsUrl()` or `@Matches()` per element |
| F-005 | Low | API8:2023 Security Misconfiguration | `machines.controller.ts:128` | Returns `/storage/machine-photos/...` URL that is not served by NestJS; ephemeral on Cloud Run; no auth on a future static route | backend role: route downloads via authenticated endpoint |
| F-006 | Low | A03:2021 Injection | 4 mutating DTOs | `@IsNotEmpty()` missing on required string fields; empty strings pass validation | backend role: add `@IsNotEmpty()` to required string fields |

---

## Definition-of-Done checklist

- [x] All `POST` / `PATCH` / `DELETE` endpoints reviewed for `JwtAuthGuard` — PASS (class-level guard)
- [x] DTO validation present on every input — PASS (class-validator decorators on all DTOs; low-severity gap at F-006)
- [x] Grep clean: `password|secret|key|credential|DATABASE_URL` — PASS
- [ ] File upload endpoints have all 3 checks (size + MIME + extension) — **FAIL** (F-001: extension missing)
- [x] Each finding mapped to OWASP category with severity and fix route — PASS
- [x] Risk register updated — see appended entries R-007, R-008
- [ ] Wiki update — deferred pending Wiki Write Gate approval (not in scope for this review pass)

---

## Verdict: BLOCK

Block reason: **F-001 High** — file upload endpoint missing extension validation.
Unblock condition: backend role adds `ALLOWED_EXT` check matching the reference pattern at `bom-upload.service.ts:534`.

_Review by: security subagent · 2026-06-11_
