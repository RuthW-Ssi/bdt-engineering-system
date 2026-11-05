import { HttpException, HttpStatus } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { API_PER_ANON_EDGE, API_PER_ANON_IP, API_PER_USER, API_WINDOW_MS, ApiRateLimitGuard } from './api-rate-limit.guard'

const jwt = new JwtService({ secret: 'test-secret' })
const tokenFor = (sub: number) => jwt.sign({ sub, login: 'x', role: 'user' })

function call(g: ApiRateLimitGuard, opts: { token?: string; xff?: string; path?: string } = {}) {
  const res = { setHeader: jest.fn() }
  const req = {
    path: opts.path ?? '/api/v1/mo',
    headers: { 'x-forwarded-for': opts.xff ?? '203.0.113.9, 76.76.21.1', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    socket: {},
  }
  const ctx = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any
  try {
    return { ok: g.canActivate(ctx), res }
  } catch (e) {
    return { ok: false, res, err: e as HttpException }
  }
}

describe('ApiRateLimitGuard', () => {
  let now = 1_000_000
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now))
  afterEach(() => jest.restoreAllMocks())

  it(`signed-in: ${API_PER_USER}/min per user, then 429 RATE_LIMITED with Retry-After; frees up after the window`, () => {
    const g = new ApiRateLimitGuard(jwt)
    const t = tokenFor(7)
    for (let i = 0; i < API_PER_USER; i++) expect(call(g, { token: t }).ok).toBe(true)
    const r = call(g, { token: t })
    expect(r.err!.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    expect(r.err!.getResponse()).toMatchObject({ code: 'RATE_LIMITED', retry_after: 60 })
    expect(r.res.setHeader).toHaveBeenCalledWith('Retry-After', '60')
    now += API_WINDOW_MS
    expect(call(g, { token: t }).ok).toBe(true)
  })

  it('users behind the same factory IP each get their own allowance', () => {
    const g = new ApiRateLimitGuard(jwt)
    for (let i = 0; i < API_PER_USER; i++) call(g, { token: tokenFor(7) })
    expect(call(g, { token: tokenFor(7) }).ok).toBe(false)
    expect(call(g, { token: tokenFor(8) }).ok).toBe(true)
  })

  it(`no token: ${API_PER_ANON_IP}/min per client IP; a forged/expired token counts as no token`, () => {
    const g = new ApiRateLimitGuard(jwt)
    for (let i = 0; i < API_PER_ANON_IP; i++) expect(call(g, { token: i % 2 ? 'garbage' : undefined }).ok).toBe(true)
    expect(call(g).ok).toBe(false)
    expect(call(g, { xff: '198.51.100.7, 76.76.21.1' }).ok).toBe(true) // another client
  })

  it(`no token + forged X-Forwarded-For on run.app: bounded at ${API_PER_ANON_EDGE}/min by the edge IP`, () => {
    const g = new ApiRateLimitGuard(jwt)
    for (let i = 0; i < API_PER_ANON_EDGE; i++) call(g, { xff: `10.${i >> 8}.${i & 255}.1, 6.6.6.6` })
    expect(call(g, { xff: '10.99.99.99, 6.6.6.6' }).ok).toBe(false)
  })

  it('never limits the health checks (/healthz, /readyz)', () => {
    const g = new ApiRateLimitGuard(jwt)
    for (let i = 0; i < API_PER_ANON_IP + 10; i++) expect(call(g, { path: i % 2 ? '/api/v1/healthz' : '/api/v1/readyz' }).ok).toBe(true)
  })
})
