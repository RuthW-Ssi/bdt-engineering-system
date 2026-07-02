# Login Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize Login's error handling — one shared `getErrorMessage` helper, toast-only UI (no inline banner), a welcome toast on success, and backend failure logging — as the first feature of a repo-wide error-handling initiative.

**Architecture:** A single pure function (`getErrorMessage`) categorizes any thrown error into English, user-facing copy. `AuthContext.login()` gains a try/catch (logs, rethrows) and returns the resolved user so the caller can greet them. `LoginPage` replaces its inline error `<div>` with `sonner` toasts. `auth.service.ts` gains `Logger.warn(...)` calls on both failure branches, verified by a new Jest spec.

**Tech Stack:** React 19 + TS (frontend, no test runner configured) · NestJS 10 + Jest (backend) · `sonner` (toast, already a dependency) · `axios` (already a dependency).

## Global Constraints

- All user-facing copy is **English** (per explicit user instruction — this overrides any earlier Thai draft copy).
- No new dependencies — `sonner` and `axios` are already used elsewhere in the app.
- Never log the password field, anywhere.
- Backend logging follows the existing convention: `private readonly logger = new Logger(<ClassName>.name)` from `@nestjs/common` (see `xlsx-parser.service.ts`, `bom-matching.service.ts`, `product-derivation.service.ts`).
- The frontend has **no test runner configured** (no vitest/jest, no `test` script in root `package.json`). Frontend tasks are verified via `npx tsc -p tsconfig.app.json` (type-check) plus manual browser verification — this matches the project's own criteria in `CLAUDE.md` (`.claude/commands/test-<feature>.md` skills are only required for features returning computed/diffed data, which Login is not).
- The backend has Jest configured (`backend/package.json` → `"test": "jest"`, `testRegex: ".*\\.spec\\.ts$"`) — the backend task uses real TDD (failing test → implementation → passing test).
- Branch already created: `dev-t-login-error-handling` (cut from `dev`, currently identical to `main`).
- Notion tracking already created: Sprint 18 (`https://app.notion.com/p/391aa61b71f68106bc2bd1436b3de6c1`) → Feature "F-Login Error Handling" (`https://app.notion.com/p/391aa61b71f681a7a5daeae9baa4551a`) → Tasks T-S18.01–T-S18.04. Commit messages use `[S18-T-S18.0N] subject` per project convention; mark each Notion task Done (Status + Completion Notes) as its commit lands.
- Design spec: `docs/superpowers/specs/2026-07-02-login-error-handling-design.md`.

---

### Task 1: Shared `getErrorMessage` helper (T-S18.01)

**Files:**
- Create: `src/lib/getErrorMessage.ts`

**Interfaces:**
- Consumes: nothing from other tasks (standalone pure function).
- Produces: `getErrorMessage(error: unknown, fallback: string): string` — consumed by Task 3 (`LoginPage.tsx`).

**Note for whoever runs this task interactively:** the exact category boundaries and English copy below are a UX call, not a mechanical one — this is a good step for the user to type by hand rather than delegate. The code below is the reference implementation the type-check and later manual verification (Task 3, step 5) are written against.

- [ ] **Step 1: Write the helper**

```ts
// src/lib/getErrorMessage.ts
import { isAxiosError } from 'axios'

export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot connect to server. Please check your connection and try again.'
    }

    const backendMessage = error.response.data?.message

    if (typeof backendMessage === 'string') {
      return backendMessage
    }

    if (Array.isArray(backendMessage)) {
      return backendMessage.join(', ')
    }

    if (error.response.status >= 500) {
      return 'Server error. Please try again later.'
    }
  }

  return fallback
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0 (this file introduces no new type errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/getErrorMessage.ts
git commit -m "[S18-T-S18.01] add shared getErrorMessage helper"
```

---

### Task 2: `AuthContext.login()` try/catch + return type (T-S18.02)

**Files:**
- Modify: `src/context/AuthContext.tsx` (full file, shown below)

**Interfaces:**
- Consumes: nothing new (still calls existing `apiClient.post('/auth/login', ...)`).
- Produces: `useAuth().login(loginId: string, password: string): Promise<AuthUser>` (return type changed from `Promise<void>`) and exports `AuthUser` — both consumed by Task 3 (`LoginPage.tsx`).

- [ ] **Step 1: Replace the file contents**

```tsx
// src/context/AuthContext.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { apiClient } from '../api/client'

export interface AuthUser {
  id: number
  login: string
  name: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (loginId: string, password: string) => Promise<AuthUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bdt_token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('bdt_user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  })

  const login = useCallback(async (loginId: string, password: string) => {
    try {
      const res = await apiClient.post<{ access_token: string; user: AuthUser }>('/auth/login', {
        login: loginId,
        password,
      })
      const { access_token, user: authUser } = res.data
      localStorage.setItem('bdt_token', access_token)
      localStorage.setItem('bdt_user', JSON.stringify(authUser))
      setToken(access_token)
      setUser(authUser)
      return authUser
    } catch (err) {
      console.error('[auth] login failed', err)
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('bdt_token')
    localStorage.removeItem('bdt_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: errors in `src/pages/LoginPage.tsx` only (it still calls `login()` as `Promise<void>` and renders the now-removed `error` state) — this is expected and resolved by Task 3. No errors should appear in `AuthContext.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/context/AuthContext.tsx
git commit -m "[S18-T-S18.02] AuthContext.login() try/catch + return AuthUser"
```

---

### Task 3: `LoginPage.tsx` toast wiring + welcome toast (T-S18.03)

**Files:**
- Modify: `src/pages/LoginPage.tsx` (full file, shown below)

**Interfaces:**
- Consumes: `getErrorMessage(error: unknown, fallback: string): string` from Task 1 (`src/lib/getErrorMessage.ts`); `useAuth().login(loginId, password): Promise<AuthUser>` from Task 2 (`src/context/AuthContext.tsx`), where `AuthUser` has a `.name` field.
- Produces: nothing consumed by later tasks (leaf of this feature).

- [ ] **Step 1: Replace the file contents**

```tsx
// src/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../lib/getErrorMessage'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const authUser = await login(loginId, password)
      toast.success(`Welcome, ${authUser.name}!`)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Login failed. Please check your username/password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F5',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #E0E0E0',
          borderRadius: 8,
          padding: '36px 40px',
          width: 360,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A' }}>BDT Engineering</div>
          <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 2 }}>Sign in to continue</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Login</label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoFocus
              style={{
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #C2C2C2',
                borderRadius: 4,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #C2C2C2',
                borderRadius: 4,
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: '9px',
              fontSize: 13,
              fontWeight: 600,
              background: loading ? '#B0B0B0' : '#1A1A1A',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json`
Expected: no output, exit code 0 (the mismatch flagged in Task 2 step 2 is now resolved).

- [ ] **Step 3: Start both dev servers**

Run (backend, `backend/`): `npm run start:dev`
Run (frontend, repo root): `npm run dev`
Expected: backend on `http://localhost:3000`, frontend on `http://localhost:5173`.

- [ ] **Step 4: Manual verification — wrong password**

In the browser, go to `/login`, submit `admin` / `wrong-password`.
Expected: a red toast reading "Invalid credentials" (top-right); no inline banner in the form. In the backend terminal, one `warn`-level log line containing `Login failed: wrong password for login "admin"` — no password value anywhere in the log line.

- [ ] **Step 5: Manual verification — backend unreachable**

Stop the backend process (Ctrl-C in its terminal), then submit any credentials on `/login`.
Expected: a red toast reading "Cannot connect to server. Please check your connection and try again." — not the generic "Login failed..." fallback. Restart the backend afterward for the next step.

- [ ] **Step 6: Manual verification — successful login**

Submit `admin` / `BdtDev2026!` (per `CLAUDE.md` dev credentials) on `/login`.
Expected: a green toast reading "Welcome, <name>!", immediate redirect to `/`, and no `warn` log line in the backend terminal for this request.

- [ ] **Step 7: Manual verification — short password (validation error)**

Submit `admin` / `abc` (5 characters, below the backend's `@MinLength(6)`).
Expected: a red toast showing the validation message (e.g. "password must be longer than or equal to 6 characters") — not a raw stack trace or the generic connection-error copy. No `warn` log line in the backend (the request never reaches `AuthService.login` — it's rejected by the `ValidationPipe` first).

- [ ] **Step 8: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "[S18-T-S18.03] LoginPage: toast-only errors + welcome toast"
```

---

### Task 4: Backend `auth.service.ts` failure logging + tests (T-S18.04)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–3 (backend-only, independent of the frontend changes).
- Produces: nothing consumed by other tasks (leaf of this feature). Behavior consumed informally by Task 3's manual verification (steps 4 and 6 check the log output this task produces).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/auth/auth.service.spec.ts
import { Test } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('AuthService', () => {
  let svc: AuthService
  let prisma: { res_users: { findFirst: jest.Mock } }
  let jwt: { sign: jest.Mock }
  let warnSpy: jest.SpyInstance

  beforeEach(async () => {
    prisma = { res_users: { findFirst: jest.fn() } }
    jwt = { sign: jest.fn().mockReturnValue('signed-token') }

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile()

    svc = module.get(AuthService)
    warnSpy = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined)
  })

  it('logs a warning (login id only) and throws when the login is unknown', async () => {
    prisma.res_users.findFirst.mockResolvedValue(null)

    await expect(svc.login({ login: 'ghost', password: 'whatever' })).rejects.toThrow(UnauthorizedException)
    expect(warnSpy).toHaveBeenCalledWith('Login failed: unknown or inactive login "ghost"')
  })

  it('logs a warning (login id only) and throws when the password is wrong', async () => {
    prisma.res_users.findFirst.mockResolvedValue({
      id: 1, login: 'admin', name: 'Admin', role: 'admin', password: await bcrypt.hash('correct-password', 4),
    })

    await expect(svc.login({ login: 'admin', password: 'wrong-password' })).rejects.toThrow(UnauthorizedException)
    expect(warnSpy).toHaveBeenCalledWith('Login failed: wrong password for login "admin"')
    expect(warnSpy.mock.calls[0][0]).not.toContain('wrong-password')
  })

  it('does not log anything on a successful login', async () => {
    prisma.res_users.findFirst.mockResolvedValue({
      id: 1, login: 'admin', name: 'Admin', role: 'admin', password: await bcrypt.hash('correct-password', 4),
    })

    const result = await svc.login({ login: 'admin', password: 'correct-password' })

    expect(result.access_token).toBe('signed-token')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest auth.service.spec.ts`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'warn')` (or similar), because `AuthService` has no `logger` field yet.

- [ ] **Step 3: Implement the logging**

```ts
// backend/src/modules/auth/auth.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'

export interface JwtPayload {
  sub: number
  login: string
  role: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string; user: { id: number; login: string; name: string; role: string } }> {
    const user = await this.prisma.res_users.findFirst({
      where: { login: dto.login, active: true },
    })
    if (!user || !user.password) {
      this.logger.warn(`Login failed: unknown or inactive login "${dto.login}"`)
      throw new UnauthorizedException('Invalid credentials')
    }

    const valid = await bcrypt.compare(dto.password, user.password)
    if (!valid) {
      this.logger.warn(`Login failed: wrong password for login "${dto.login}"`)
      throw new UnauthorizedException('Invalid credentials')
    }

    const payload: JwtPayload = { sub: user.id, login: user.login, role: user.role }
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, login: user.login, name: user.name, role: user.role },
    }
  }

  async getProfile(userId: number) {
    const user = await this.prisma.res_users.findFirst({
      where: { id: userId, active: true },
      select: { id: true, login: true, name: true, email: true, role: true, lang: true, tz: true },
    })
    if (!user) throw new UnauthorizedException('User not found')
    return user
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `npx jest auth.service.spec.ts`
Expected: PASS — 3 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.service.spec.ts
git commit -m "[S18-T-S18.04] auth.service: log failed login attempts (no password)"
```

---

## Post-implementation (not a task — do after Task 4)

- Update Notion: for each of T-S18.01–T-S18.04, set Status=Done + append Completion Notes (commit hash + what changed); flip Feature "F-Login Error Handling" to Done once all 4 are Done.
- Update wiki (per `bdt-app/CLAUDE.md` §6 and the `wiki-update` protocol) — this feature likely touches `wiki/tech/backend/decisions.md` (Logger-on-auth-failures convention) and possibly a new `wiki/features/error-handling.md` page seeding the pattern for the next feature in this initiative.
- Append `~/Documents/bdt/knowledge-base/log.md`.
- Ask the user before merging `dev-t-login-error-handling` back into `dev` — per `CLAUDE.md` §5.2, commit/push to shared branches goes through `/release-gate`, not a direct merge.
