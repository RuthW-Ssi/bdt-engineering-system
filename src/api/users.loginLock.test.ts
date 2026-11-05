import { loginLockState } from './users'

// Login lockout (2026-11-05): what the Users page shows next to Active.
describe('loginLockState', () => {
  const now = Date.parse('2026-11-05T08:00:00Z')
  it('blocked (round 3) wins, whatever the lock time says', () => {
    expect(loginLockState({ login_blocked_at: '2026-11-05T07:00:00Z', login_locked_until: null }, now)).toBe('blocked')
  })
  it('locked while the 1/5-min lock is still running', () => {
    expect(loginLockState({ login_blocked_at: null, login_locked_until: '2026-11-05T08:04:00Z' }, now)).toBe('locked')
  })
  it('nothing once the lock has run out, or was never set', () => {
    expect(loginLockState({ login_blocked_at: null, login_locked_until: '2026-11-05T07:59:00Z' }, now)).toBeNull()
    expect(loginLockState({ login_blocked_at: null, login_locked_until: null }, now)).toBeNull()
  })
})
