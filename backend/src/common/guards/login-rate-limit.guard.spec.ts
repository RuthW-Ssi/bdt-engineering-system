import { HttpException, HttpStatus } from '@nestjs/common'
import { LOGIN_PER_EDGE_NAME, LOGIN_PER_IP, LOGIN_PER_NAME, LOGIN_WINDOW_MS, LoginRateLimitGuard, clientIp, edgeIp } from './login-rate-limit.guard'

function ctx(login: unknown, xff = '1.1.1.1') {
  const res = { setHeader: jest.fn() }
  const req = { headers: { 'x-forwarded-for': xff }, socket: { remoteAddress: '10.0.0.1' }, body: { login } }
  return { res, c: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any }
}

function attempt(g: LoginRateLimitGuard, login: unknown, xff?: string) {
  const { c, res } = ctx(login, xff)
  try {
    g.canActivate(c)
    return { ok: true, res }
  } catch (e) {
    return { ok: false, res, err: e as HttpException }
  }
}

describe('LoginRateLimitGuard', () => {
  let now = 1_000_000
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now))
  afterEach(() => jest.restoreAllMocks())

  it(`allows ${LOGIN_PER_NAME} attempts per (IP, name) a minute, then 429 RATE_LIMITED with Retry-After`, () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_NAME; i++) expect(attempt(g, 'Admin').ok).toBe(true)
    const r = attempt(g, 'admin ') // same name after trim/lower-case
    expect(r.ok).toBe(false)
    expect(r.err!.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    expect(r.err!.getResponse()).toMatchObject({ code: 'RATE_LIMITED', retry_after: 60 })
    expect(r.res.setHeader).toHaveBeenCalledWith('Retry-After', '60')
  })

  it('lets the same name in again once the window has passed', () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_NAME; i++) attempt(g, 'admin')
    expect(attempt(g, 'admin').ok).toBe(false)
    now += LOGIN_WINDOW_MS
    expect(attempt(g, 'admin').ok).toBe(true)
  })

  it('does not block another name or another IP', () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_NAME; i++) attempt(g, 'admin')
    expect(attempt(g, 'admin').ok).toBe(false)
    expect(attempt(g, 'qc01').ok).toBe(true) // same factory IP, other account
    expect(attempt(g, 'admin', '2.2.2.2').ok).toBe(true) // other IP
  })

  it(`caps one IP at ${LOGIN_PER_IP} attempts a minute across names`, () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_IP; i++) expect(attempt(g, `user${i}`).ok).toBe(true)
    expect(attempt(g, 'fresh-name').ok).toBe(false)
  })

  it('a refused attempt does not extend the block', () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_NAME; i++) attempt(g, 'admin')
    now += LOGIN_WINDOW_MS - 1000
    expect(attempt(g, 'admin').err!.getResponse()).toMatchObject({ retry_after: 1 })
    now += 1000
    expect(attempt(g, 'admin').ok).toBe(true)
  })
})

// Browser → Vercel (/api rewrite) → Cloud Run: XFF = "<client>, <vercel egress>" (QA SEC-1 2026-11-05)
const VERCEL = '76.76.21.1'
describe('LoginRateLimitGuard — through the Vercel rewrite', () => {
  let now = 1_000_000
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now))
  afterEach(() => jest.restoreAllMocks())

  it('counts each real client separately even though all arrive from Vercel', () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_NAME; i++) attempt(g, 'admin', `203.0.113.9, ${VERCEL}`)
    expect(attempt(g, 'admin', `203.0.113.9, ${VERCEL}`).ok).toBe(false)
    expect(attempt(g, 'admin', `198.51.100.7, ${VERCEL}`).ok).toBe(true) // someone else, same account
  })

  it(`bounds a direct caller who forges X-Forwarded-For: ${LOGIN_PER_EDGE_NAME} per name from one edge IP`, () => {
    const g = new LoginRateLimitGuard()
    for (let i = 0; i < LOGIN_PER_EDGE_NAME; i++) expect(attempt(g, 'admin', `10.9.${i}.1, 6.6.6.6`).ok).toBe(true)
    expect(attempt(g, 'admin', '10.9.250.1, 6.6.6.6').ok).toBe(false)
  })

  it('treats a non-string login as empty instead of throwing (no 500)', () => {
    const g = new LoginRateLimitGuard()
    expect(attempt(g, { toString: 1, valueOf: 1 }).ok).toBe(true)
  })
})

describe('clientIp / edgeIp', () => {
  it('client = second-to-last X-Forwarded-For entry (set by Vercel); edge = last (appended by Cloud Run)', () => {
    const req = { headers: { 'x-forwarded-for': `6.6.6.6, 203.0.113.9, ${VERCEL}` }, socket: {} } as any
    expect(clientIp(req)).toBe('203.0.113.9')
    expect(edgeIp(req)).toBe(VERCEL)
  })
  it('one entry (no proxy in front) → that entry for both', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: {} } as any
    expect(clientIp(req)).toBe('203.0.113.9')
    expect(edgeIp(req)).toBe('203.0.113.9')
  })
  it('falls back to the socket address without the header (local dev)', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '::1' } } as any)).toBe('::1')
  })
})
