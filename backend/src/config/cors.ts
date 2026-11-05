/**
 * Browser origins allowed to call the API cross-origin (2026-11-05, was '*').
 * The app itself calls through the Vercel /api rewrite (same origin), so this
 * only stops other sites from using the API from a browser.
 */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return [env.FRONTEND_BASE_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', ...extra].filter((o): o is string => !!o)
}
