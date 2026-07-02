# Security Review — F-Login Error Handling (Sprint 18)

- **Date:** 2026-07-02
- **Reviewer:** security subagent (OWASP API Top 10 2023 baseline)
- **Branch:** `dev-t-login-error-handling` (base `dev`, merge-base `8cd4226`)
- **Feature:** Login error-handling standardization (`getErrorMessage`, `AuthContext`, `LoginPage`, `auth.service` logging)
- **Verdict:** **PASS** — both mid-branch fixes independently re-derived and confirmed correct/complete; no new Critical/High findings; 2 Low observations logged

---

## Independent re-verification of the two claimed fixes

### 1. `AuthContext.tsx` — raw AxiosError logging → password leak (commit `26011d0`)

Confirmed via diff + `git show 26011d0`. Final tree (`src/context/AuthContext.tsx`):

```ts
} catch (err) {
  console.error('[auth] login failed:', err instanceof Error ? err.message : String(err))
  throw err
}
```

Verified: only `err.message` (or `String(err)` for non-`Error` throws) reaches `console.error` — never the error object itself, so `err.config.data` (the JSON request body containing the plaintext password for a failed `/auth/login` POST) cannot be printed. `AxiosError` extends `Error`, so the `err.message` branch is the one taken for real network/HTTP failures, and `.message` is a static string (e.g. "Request failed with status code 401"), not derived from `config.data`. **Fix is correct and complete.**

### 2. `auth.service.ts` — log injection via unsanitized `dto.login` (commit `35694c8`)

Confirmed via diff + `git show 35694c8`. Both `logger.warn(...)` call sites (unknown/inactive login, wrong password) route through the new `sanitizeForLog()`:

```ts
private sanitizeForLog(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, '')
}
```

Both branches call `this.sanitizeForLog(dto.login)` — no un-sanitized call site remains. Regression test in `auth.service.spec.ts` ("strips CR/LF and control characters from the login before logging") injects a literal `\n` + fake log-line payload and asserts the sanitized, concatenated (no separator re-inserted) output — matches the regex behavior exactly. A second test asserts the password never appears in the logged string. **Fix is correct and complete** for CWE-117 (CRLF/control-char log forgery).

---

## Additional checks (this diff + adjacent code)

| Check | Result |
|---|---|
| Other raw error/credential logging in diff (`AuthContext.tsx`, `LoginPage.tsx`, `auth.service.ts`, `getErrorMessage.ts`) | Clean — `getErrorMessage.ts` only surfaces `error.response.data.message` (backend-controlled string/array) back to the *same* requesting user via toast, never to a log sink; no `console.log`/`logger.*` calls elsewhere in the diff |
| Password ever logged/stored beyond memory | Clean — `AuthContext` only persists `access_token` + `user` object to `localStorage`; password never touches `localStorage`, `console`, or backend logs |
| `JwtAuthGuard` / `login.dto.ts` touched by this diff | Not touched — confirmed via `git diff dev...dev-t-login-error-handling` (no hunks for either file) and direct read of both files on the branch tip; `login.dto.ts` still `@IsString()` (login) / `@IsString() @MinLength(6)` (password), `auth.controller.ts` `/auth/login` still intentionally unguarded (dev-mode login), `/auth/me` still behind `JwtAuthGuard`. No weakening. |
| Rate limiting on `/auth/login` (OWASP API4:2023) | Pre-existing gap, **already tracked** as `R-003` in `docs/security/risk-register.md` (created 2026-05-29, Open). This feature does not touch it and wasn't asked to — not a new finding, not blocking. |

---

## Findings

### F-001 · LOW · A09:2021 Security Logging and Monitoring Failures (documentation hygiene)
**Plan/spec docs retain the pre-fix vulnerable code as the literal "reference implementation"**

- **Where:** `docs/superpowers/plans/2026-07-02-login-error-handling.md` (Task 2 Step 1, Task 4 Step 3) and `docs/superpowers/specs/2026-07-02-login-error-handling-design.md` §3.2/§3.4
- **What:** These committed docs show `console.error('[auth] login failed', err)` (raw error object) and `logger.warn(\`...${dto.login}\`)` (unsanitized) as "the implementation" — i.e., the pre-fix code, written before the same-day security-triggered fixes landed. The docs were never updated after `26011d0`/`35694c8`.
- **Why:** These are markdown, not executable — no runtime risk today. But `docs/superpowers/plans/*` is designed to be replayed by `superpowers:executing-plans`/`subagent-driven-development`. If this plan is ever re-run verbatim (e.g., reapplied to a fresh branch, used as a template for the "next feature in this initiative" per its own §6 follow-on note), it would silently reintroduce both the password-leak and the log-injection bug.
- **Fix route:** docs owner (whoever maintains `docs/superpowers/plans`) — add a note/errata pointing at the two fix commits, or update the inline snippets to the sanitized final versions. Not a code fix; no fe/be action needed.
- **Severity:** Low — informational, not blocking.

### F-002 · LOW · A09:2021 Security Logging and Monitoring Failures (residual hardening)
**`sanitizeForLog` covers CWE-117 CRLF/control-char injection but not Unicode bidi-override spoofing**

- **Where:** `backend/src/modules/auth/auth.service.ts` — `sanitizeForLog()`, regex `/[\x00-\x1F\x7F]/g`
- **What:** Strips all C0 controls (incl. CR/LF/ESC) + DEL — fully closes the CRLF log-forgery vector this fix targeted. It does not strip C1 controls (`\x80`-`\x9F`) or Unicode bidirectional-override characters (e.g. U+202E RIGHT-TO-LEFT OVERRIDE), which some log viewers/terminals render in a way that can visually reorder or obscure a log line's text (a cosmetic spoofing trick, not a structural line-forgery one).
- **Why:** Low impact — internal-log-only visibility, not a display surface shown to other users. Purely a defense-in-depth polish over an already-fixed vector.
- **Fix route:** backend (optional) — extend regex to also strip `‪-‮` / `⁦-⁩` if this is judged worth hardening; not required to ship this feature.
- **Severity:** Low — optional hardening, not blocking.

### F-003 · Informational — new risk-register watch item (not from this diff, surfaced by this review)
**Same interpolate-into-logger shape exists elsewhere in the backend, unauthenticated-adjacent risk lower but present**

- **Where:** `backend/src/modules/bom-upload/bom-upload.service.ts:208,219`, `bom-matching.service.ts:186,190`, `product-derivation/product-derivation.service.ts:92` — all interpolate file-derived strings (`assembly_mark`, `part_mark`, `product_code`) directly into `logger.log/warn` template strings, same shape as the pre-fix `auth.service.ts` bug.
- **Why it's lower priority than the auth case:** these endpoints sit behind `JwtAuthGuard` (authenticated only), and the values originate from an uploaded `.xlsx` (not a raw HTTP body field), so the attack surface is narrower — but xlsx cell content is still attacker-influenceable text, so the same CWE-117 class applies in principle.
- **Action:** logged as a new watch-item in the risk register (`R-009` below) rather than a blocking finding — out of scope for this feature, not touched by this diff. Recommend a future security pass sweep all `logger.*` interpolations codebase-wide.
- **Severity:** Low (watch item, not a finding against this diff).

---

## Checklist results (role card DoD)

| Check | Result |
|---|---|
| `POST/PATCH/DELETE` endpoints reviewed for `JwtAuthGuard` | `/auth/login` intentionally public (dev-mode login, unchanged); `/auth/logout` unguarded (no-op, unchanged); `/auth/me` guarded — all unchanged by this diff |
| DTO validation present | `login.dto.ts` unchanged, `@IsString()` / `@IsString()+@MinLength(6)` intact |
| Grep clean: `password\|secret\|key\|credential\|DATABASE_URL` in diff | Clean — only `password` as a field/parameter name and doc references to "the password field", no literal secret values |
| File upload checks | N/A — no file upload code in this diff |
| Findings written with OWASP category + severity + fix route | Done — this file |
| Risk register updated if new risk class emerged | Yes — `R-009` appended (log-injection pattern watch item) |
| Wiki update under Wiki Write Gate | Proposed only (see report) — not written without gate approval |
