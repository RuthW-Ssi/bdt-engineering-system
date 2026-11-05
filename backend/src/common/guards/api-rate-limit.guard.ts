import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request, Response } from 'express'
import { SlidingWindow, clientIp, edgeIp, tooMany } from '../rate-limit/sliding-window'

/**
 * Rate limit for every API call (2026-11-05, global APP_GUARD): an unlimited
 * API lets a script or a stolen token keep Cloud Run at its instance cap.
 * Sliding 1-minute window, in memory per instance (no cost):
 * - Valid token → 600/min per user (10/s; shared POC accounts share it). Keyed
 *   on the verified token, so a whole factory behind one Wi-Fi IP isn't lumped
 *   together.
 * - No/invalid token → 120/min per client IP, and 600/min per edge IP (the
 *   address that connected to Cloud Run, which can't be forged) so forging
 *   X-Forwarded-For on the run.app URL doesn't escape the limit.
 * Normal use is far below: a page load is 1–4 calls, the BIM status poll 24/min.
 * GET /healthz and /readyz are exempt (Cloud Run / uptime checks).
 */
export const API_WINDOW_MS = 60_000
export const API_PER_USER = 600
export const API_PER_ANON_IP = 120
export const API_PER_ANON_EDGE = 600

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly window = new SlidingWindow(API_WINDOW_MS)

  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true
    const req = ctx.switchToHttp().getRequest<Request>()
    if (/\/(healthz|readyz)\/?$/.test(req.path ?? '')) return true
    const res = ctx.switchToHttp().getResponse<Response>()

    const sub = this.userOf(req)
    const keys: [string, number][] = sub != null
      ? [[`user:${sub}`, API_PER_USER]]
      : [[`anon:${clientIp(req)}`, API_PER_ANON_IP], [`anonedge:${edgeIp(req)}`, API_PER_ANON_EDGE]]
    const wait = this.window.take(keys, Date.now())
    if (wait > 0) throw tooMany(res, wait, (sec) => `เรียกใช้งานถี่เกินไป — รอ ${sec} วินาทีแล้วลองใหม่`)
    return true
  }

  /** User id from a token that verifies (signature + expiry); anything else counts as anonymous. */
  private userOf(req: Request): number | null {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return null
    try {
      return this.jwt.verify<{ sub: number }>(auth.slice(7)).sub ?? null
    } catch {
      return null
    }
  }
}
