import { jwtSecret } from './auth.module'

describe('jwtSecret', () => {
  it('uses JWT_SECRET when set', () => {
    expect(jwtSecret({ JWT_SECRET: 's3cret', NODE_ENV: 'production' })).toBe('s3cret')
  })
  it('refuses to start in production without JWT_SECRET (the dev fallback is public)', () => {
    expect(() => jwtSecret({ NODE_ENV: 'production' })).toThrow('JWT_SECRET is required in production')
  })
  it('falls back to the dev secret outside production', () => {
    expect(jwtSecret({ NODE_ENV: 'development' })).toBe('bdt-dev-secret')
  })
})
