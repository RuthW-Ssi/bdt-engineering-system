import { corsOrigins } from './cors'

describe('corsOrigins', () => {
  it('allows the frontend URL and local dev only (no more *)', () => {
    expect(corsOrigins({ FRONTEND_BASE_URL: 'https://bdt-engineering-system.vercel.app' })).toEqual([
      'https://bdt-engineering-system.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173',
    ])
  })
  it('adds CORS_ORIGINS (comma-separated) and skips an unset frontend URL', () => {
    expect(corsOrigins({ CORS_ORIGINS: 'https://a.example, https://b.example' })).toEqual([
      'http://localhost:5173', 'http://127.0.0.1:5173', 'https://a.example', 'https://b.example',
    ])
  })
})
