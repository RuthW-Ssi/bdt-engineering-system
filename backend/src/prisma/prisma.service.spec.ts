import { withPoolParams } from './prisma.service'

const URL_ = 'postgresql://u:p%40ss@host:6543/postgres?pgbouncer=true&connection_limit=1'

describe('withPoolParams', () => {
  it('leaves the URL untouched when no pool env is set', () => {
    expect(withPoolParams(URL_, {})).toBe(URL_)
  })

  it('sets/overrides connection_limit and pool_timeout, keeping the rest', () => {
    const out = new URL(withPoolParams(URL_, { DB_CONNECTION_LIMIT: '10', DB_POOL_TIMEOUT: '20' })!)
    expect(out.searchParams.get('connection_limit')).toBe('10')
    expect(out.searchParams.get('pool_timeout')).toBe('20')
    expect(out.searchParams.get('pgbouncer')).toBe('true')
    expect(out.password).toBe('p%40ss') // encoded password survives
    expect(out.port).toBe('6543')
  })

  it('passes through an unset DATABASE_URL', () => {
    expect(withPoolParams(undefined, { DB_CONNECTION_LIMIT: '10' })).toBeUndefined()
  })
  it('returns the URL unchanged when it cannot be parsed (never breaks startup)', () => {
    expect(withPoolParams('not a url', { DB_CONNECTION_LIMIT: '5' })).toBe('not a url')
  })
})
