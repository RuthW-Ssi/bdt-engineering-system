import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('bdt_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

let _redirecting = false

/**
 * A 429 RATE_LIMITED from the API's rate limit (2026-11-05) means the request
 * was refused before it ran, so it's safe to send again once `retry_after`
 * seconds pass — e.g. a bulk drawing upload that briefly crosses the per-user
 * limit finishes instead of failing files. Up to MAX_429_RETRIES waits of at
 * most 60 s each. Not for login: its 429 (or ACCOUNT_LOCKED) is shown to the user.
 */
export const MAX_429_RETRIES = 3
export function retryDelayMs(err: { config?: { url?: string; _retry429?: number }; response?: { status?: number; data?: { code?: string; retry_after?: number } } }): number | null {
  const { config, response } = err
  if (response?.status !== 429 || response.data?.code !== 'RATE_LIMITED' || !config) return null
  if (config.url?.includes('/auth/login')) return null
  if ((config._retry429 ?? 0) >= MAX_429_RETRIES) return null
  const sec = Number(response.data?.retry_after)
  return Math.min(Number.isFinite(sec) && sec > 0 ? sec : 5, 60) * 1000
}

apiClient.interceptors.response.use(
  res => res,
  async err => {
    const wait = retryDelayMs(err)
    if (wait != null) {
      err.config._retry429 = (err.config._retry429 ?? 0) + 1
      await new Promise(r => setTimeout(r, wait))
      return apiClient.request(err.config)
    }
    if (
      err.response?.status === 401 &&
      !_redirecting &&
      window.location.pathname !== '/login'
    ) {
      _redirecting = true
      localStorage.removeItem('bdt_token')
      localStorage.removeItem('bdt_user')
      const next = window.location.pathname + window.location.search
      window.location.replace(`/login?next=${encodeURIComponent(next)}`)
    }
    return Promise.reject(err)
  },
)
