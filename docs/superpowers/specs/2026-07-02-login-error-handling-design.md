# Design — Login error handling, toast standardization & welcome greeting

**Date:** 2026-07-02
**Author:** bdtapp@ssi-steel.com + Claude
**Status:** Approved design, pending implementation plan
**Repo:** `bdt-app` · branch `dev-t-login-error-handling`

---

## 1. Context & Problem

This is the first pass of a repo-wide initiative: standardize error handling
(try/catch, toast, alerts) feature-by-feature so failures are easier to debug
and easier to support. **Login is the first feature.**

Current state:
- `src/pages/LoginPage.tsx` has a try/catch, but it collapses every failure
  (bad password, network down, server 500, validation error) into one generic
  message shown in a plain inline red `<div>`.
- `src/context/AuthContext.tsx`'s `login()` has **no** try/catch — errors just
  bubble up silently (no debug trail).
- The rest of the app already uses `sonner` for toasts with the pattern
  `toast.error(e?.response?.data?.message ?? 'fallback')` (e.g.
  `src/pages/ProductList.tsx`) — Login is the odd one out with its own inline
  banner.
- Backend `backend/src/modules/auth/auth.service.ts` already throws proper
  `UnauthorizedException('Invalid credentials')` for bad creds, and DTO
  validation (`class-validator`) handles empty/short fields as 400s — this
  side is functionally fine, it just has no logging for failed attempts.
- There is no persistent "who's logged in" indicator missing from the app —
  `src/components/layout/Topbar.tsx` already shows the user's initials/name in
  every authenticated page's header. What's missing is a one-time acknowledgment
  at the moment of a successful login.

**Goal:** make Login's failure modes legible (distinct message per cause,
consistent with the app's toast pattern, with a backend debug trail), and add a
transient welcome greeting on success — establishing the shared error-message
pattern that later features will reuse.

---

## 2. Goals / Non-goals

**Goals**
- One shared helper (`src/lib/getErrorMessage.ts`) that turns any thrown error
  into a category-appropriate, English, user-facing message. Reused by every
  future feature in this initiative.
- Login UI uses toast exclusively for feedback (no inline banner), matching
  the rest of the app.
- Backend logs failed login attempts (login id only, never the password) for
  debugging — using the same `Logger` pattern already used in
  `bom-upload`/`product-derivation` services.
- A one-time `toast.success('Welcome, {name}!')` on successful login.

**Non-goals**
- Not touching any feature other than Login in this pass (next features get
  their own spec, reusing `getErrorMessage`).
- Not adding rate-limiting / brute-force protection — that's a security
  hardening concern, tracked separately if raised.
- Not adding a persistent "Welcome" banner or Dashboard heading — the
  persistent user identity display already exists in `Topbar.tsx`.
- Not adding a global exception filter on the backend — Nest's default filter
  already serializes exceptions into `{ statusCode, message, error }`, which
  `getErrorMessage` consumes as-is.

---

## 3. Design

### 3.1 `src/lib/getErrorMessage.ts` (new, shared)

```ts
function getErrorMessage(error: unknown, fallback: string): string
```

Categorizes any thrown error into an English message, in this priority order:
1. Axios error with **no `response`** → connection/timeout failure (server
   unreachable) — distinct copy, e.g. *"Cannot connect to server. Please check
   your connection and try again."*
2. Axios error **with `response.data.message`** as a string → use it as-is
   (this is what the rest of the app already does ad hoc).
3. `response.data.message` as an **array** (class-validator sometimes returns
   an array of validation strings) → join it into one string.
4. 5xx status with no usable message → generic *"Server error. Please try
   again later."*
5. Anything else (non-Axios error, or none of the above matched) → the
   caller-supplied `fallback`.

This function is intentionally left for hand-implementation (see plan) — the
exact category boundaries and copy are a UX call.

### 3.2 `src/context/AuthContext.tsx`

- `login()` return type changes from `Promise<void>` → `Promise<AuthUser>`
  (returns the resolved `authUser`), so `LoginPage` can read the user's name
  right after awaiting login without relying on a stale render closure.
- Wrap the existing body in try/catch:
  - `catch (err) { console.error('[auth] login failed', err); throw err }`
    — logs for local debugging, then rethrows so the caller (LoginPage)
    decides the UI response.

### 3.3 `src/pages/LoginPage.tsx`

- Remove the `error` state and inline red `<div>` entirely.
- On failure: `toast.error(getErrorMessage(err, 'Login failed. Please check
  your username/password.'))`.
- On success: `const authUser = await login(loginId, password)` →
  `toast.success(`Welcome, ${authUser.name}!`)` → `navigate('/', { replace:
  true })`.

### 3.4 Backend `backend/src/modules/auth/auth.service.ts`

- Add `private readonly logger = new Logger(AuthService.name)` (from
  `@nestjs/common`), matching the existing convention in
  `xlsx-parser.service.ts` / `bom-matching.service.ts` / etc.
- `logger.warn(...)` on both failure branches, **failure only** (no
  success-path logging, to avoid audit-log noise from routine successful
  logins):
  - unknown/inactive login: `Login failed: unknown or inactive login
    "${dto.login}"`
  - wrong password: `Login failed: wrong password for login "${dto.login}"`
  - Never log `dto.password`.

---

## 4. Error case matrix

| Case | Backend response | Frontend message | Backend log |
|---|---|---|---|
| Wrong password / unknown login | 401 `Invalid credentials` | toast.error: "Invalid credentials" | `warn` (login id only) |
| Empty/short password (validation) | 400 (class-validator array) | toast.error: joined validation message(s) | none (not a login attempt) |
| Backend unreachable / network down | no response | toast.error: "Cannot connect to server..." | n/a (never reached backend) |
| Unexpected 5xx | 5xx, no usable message | toast.error: "Server error. Please try again later." | Nest default error log (unchanged) |
| Success | 200 + token + user | toast.success: "Welcome, {name}!" | none |

---

## 5. Verification (manual)

1. Wrong password → error toast shown, backend log shows one `warn` line with
   the login id, no password in the log.
2. Stop the backend, attempt login → toast shows the connection-error
   message (not the generic fallback).
3. Correct login → welcome toast with the user's name, redirect to `/`,
   backend log stays silent (no `warn`/`log` line for the success path).
4. Empty/too-short password → existing HTML5 `required` + backend
   `MinLength(6)` validation message surfaces via toast, not a raw stack
   trace.

This is a UI/behavior fix, not computed/diffed data, so it doesn't need a
formal `.claude/commands/test-*.md` per the project's test-skill criteria.

---

## 6. Follow-on (not in this pass)

- Repeat this pattern (reusing `getErrorMessage`) for the next feature in the
  error-handling initiative — candidate order TBD with the user.
- Rate-limiting / brute-force protection on `/auth/login`, if raised later as
  a security concern (out of scope here — flagged for a future `security`
  subagent pass, not decided in this spec).
