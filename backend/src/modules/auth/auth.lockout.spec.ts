import { ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { AuthService, LOGIN_FAILS_PER_ROUND } from './auth.service'

// Login lockout (2026-11-05, Tao): 5 wrong = 1 round; round 1 → 1 min, round 2
// → 5 min, round 3 → blocked until admin unlock (admins: 5 min only). A correct
// login clears it; locked/blocked refuses even the right password.
async function setup(role = 'user') {
  const user: any = {
    id: 7, login: 'qc01', name: 'QC', role, job_title: null, user_type: 'employee', partner_id: null, active: true,
    password: await bcrypt.hash('right-pass', 4),
    failed_login_count: 0, login_strikes: 0, login_locked_until: null, login_blocked_at: null,
  }
  const prisma: any = {
    res_users: {
      findFirst: jest.fn(async () => ({ ...user })),
      findUniqueOrThrow: jest.fn(async () => ({ ...user })),
      update: jest.fn(async ({ data }: any) => Object.assign(user, data)),
    },
    user_module_permission: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn(),
  }
  prisma.$transaction = jest.fn((cb: any) => cb(prisma))
  const svc = new AuthService(prisma, { sign: () => 'token' } as any)
  jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined)
  return { svc, user }
}

const wrong = (svc: AuthService) => svc.login({ login: 'qc01', password: 'wrong-pass' }).catch((e) => e)
const right = (svc: AuthService) => svc.login({ login: 'qc01', password: 'right-pass' }).catch((e) => e)

async function failRound(svc: AuthService) {
  let last: unknown
  for (let i = 0; i < LOGIN_FAILS_PER_ROUND; i++) last = await wrong(svc)
  return last as HttpException
}

describe('AuthService — login lockout', () => {
  let now = Date.parse('2026-11-05T08:00:00Z')
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now))
  afterEach(() => jest.restoreAllMocks())

  it('4 wrong passwords are plain 401s; the 5th locks the account for 1 minute (429 ACCOUNT_LOCKED)', async () => {
    const { svc, user } = await setup()
    for (let i = 0; i < LOGIN_FAILS_PER_ROUND - 1; i++) expect(await wrong(svc)).toBeInstanceOf(UnauthorizedException)
    const e = (await wrong(svc)) as HttpException
    expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    expect(e.getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED', retry_after: 60 })
    expect(user.login_strikes).toBe(1)
    expect(user.login_locked_until.getTime()).toBe(now + 60_000)
  })

  it('refuses even the right password while locked, then lets it in after the minute and clears everything', async () => {
    const { svc, user } = await setup()
    await failRound(svc)
    expect(((await right(svc)) as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    now += 60_000
    expect((await right(svc)).access_token).toBe('token')
    expect(user).toMatchObject({ failed_login_count: 0, login_strikes: 0, login_locked_until: null })
  })

  it('round 2 locks for 5 minutes; round 3 blocks until an admin unlocks (403 ACCOUNT_BLOCKED, right password too)', async () => {
    const { svc, user } = await setup()
    await failRound(svc)
    now += 60_000
    const r2 = await failRound(svc)
    expect(r2.getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED', retry_after: 300 })
    now += 5 * 60_000
    const r3 = await failRound(svc)
    expect(r3).toBeInstanceOf(ForbiddenException)
    expect(r3.getResponse()).toMatchObject({ code: 'ACCOUNT_BLOCKED' })
    expect(user.login_blocked_at).toBeInstanceOf(Date)
    now += 24 * 3600_000 // time alone never clears a block
    expect(await right(svc)).toBeInstanceOf(ForbiddenException)
  })

  it('an admin account is never blocked — every round after the first is a 5-minute lock', async () => {
    const { svc, user } = await setup('admin')
    await failRound(svc)
    for (let round = 2; round <= 4; round++) {
      now += 5 * 60_000
      const e = await failRound(svc)
      expect(e.getResponse()).toMatchObject({ code: 'ACCOUNT_LOCKED', retry_after: 300 })
    }
    expect(user.login_blocked_at).toBeNull()
  })

  it('a correct login between rounds resets the count (round 1 again next time)', async () => {
    const { svc, user } = await setup()
    await failRound(svc)
    now += 60_000
    await right(svc)
    const e = await failRound(svc)
    expect(e.getResponse()).toMatchObject({ retry_after: 60 })
    expect(user.login_strikes).toBe(1)
  })

  // QA M1: many wrong passwords sent at once must not skip the 1/5-min waits
  it('wrong passwords that arrive after the lock is set do not count further (no jump to blocked)', async () => {
    const { svc, user } = await setup()
    const results = await Promise.all(Array.from({ length: 3 * LOGIN_FAILS_PER_ROUND }, () => wrong(svc)))
    expect(user.login_strikes).toBe(1)
    expect(user.login_blocked_at).toBeNull()
    expect(results.filter((e: any) => e.getResponse?.().code === 'ACCOUNT_LOCKED').length).toBeGreaterThan(0)
  })
})
