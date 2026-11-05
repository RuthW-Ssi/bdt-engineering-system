import { MAX_429_RETRIES, retryDelayMs } from './client'

// API rate limit (2026-11-05): a refused request (429 RATE_LIMITED) is resent after retry_after.
const err = (over: Record<string, unknown> = {}, cfg: Record<string, unknown> = {}) => ({
  config: { url: '/drawings', ...cfg },
  response: { status: 429, data: { code: 'RATE_LIMITED', retry_after: 7, ...over } },
})

describe('retryDelayMs', () => {
  it('waits retry_after seconds for a 429 RATE_LIMITED', () => {
    expect(retryDelayMs(err())).toBe(7000)
  })
  it('caps the wait at 60 s and defaults to 5 s when retry_after is missing', () => {
    expect(retryDelayMs(err({ retry_after: 600 }))).toBe(60_000)
    expect(retryDelayMs(err({ retry_after: undefined }))).toBe(5000)
  })
  it(`gives up after ${MAX_429_RETRIES} retries`, () => {
    expect(retryDelayMs(err({}, { _retry429: MAX_429_RETRIES }))).toBeNull()
  })
  it('never retries login (its 429 / ACCOUNT_LOCKED is shown to the user) or other errors', () => {
    expect(retryDelayMs(err({}, { url: '/auth/login' }))).toBeNull()
    expect(retryDelayMs(err({ code: 'ACCOUNT_LOCKED' }))).toBeNull()
    expect(retryDelayMs({ config: { url: '/mo' }, response: { status: 500, data: {} } })).toBeNull()
  })
})
