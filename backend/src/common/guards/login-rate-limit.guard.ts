import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request, Response } from 'express'
import { SlidingWindow, clientIp, edgeIp, tooMany } from '../rate-limit/sliding-window'

/**
 * Login rate limit (2026-11-05): POST /auth/login had no limit, so a script
 * could guess passwords or keep the instance busy. Sliding 1-minute window,
 * every attempt counts (success or not), a refused attempt counts against none:
 * - 5 per (client IP, login name) — stops guessing one account's password.
 * - 30 per client IP — stops spraying many names; high enough for a factory
 *   where everyone shares one Wi-Fi IP (POC: 2-3 people share an account).
 * - 20 per (edge IP, login name) and 300 per edge IP — bound a caller who hits
 *   the run.app URL directly with a forged X-Forwarded-For (see clientIp()).
 * In memory per instance (max 3 on Cloud Run → at most 3× looser), no cost.
 * ponytail: in-memory per instance, upgrade path = shared store (Redis) if exact limits are ever needed
 */
export const LOGIN_WINDOW_MS = 60_000
export const LOGIN_PER_NAME = 5
export const LOGIN_PER_IP = 30
export const LOGIN_PER_EDGE_NAME = 20
export const LOGIN_PER_EDGE = 300
export { clientIp, edgeIp } // re-exported for existing imports

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly window = new SlidingWindow(LOGIN_WINDOW_MS)

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>()
    const res = ctx.switchToHttp().getResponse<Response>()
    const ip = clientIp(req)
    const edge = edgeIp(req)
    const raw = req.body?.login
    const name = (typeof raw === 'string' ? raw : '').trim().toLowerCase().slice(0, 100)

    const wait = this.window.take([
      [`ip:${ip}`, LOGIN_PER_IP],
      [`name:${ip}:${name}`, LOGIN_PER_NAME],
      [`edge:${edge}`, LOGIN_PER_EDGE],
      [`edgename:${edge}:${name}`, LOGIN_PER_EDGE_NAME],
    ], Date.now())
    if (wait > 0) throw tooMany(res, wait, (sec) => `เข้าสู่ระบบหลายครั้งเกินไป — รอ ${sec} วินาทีแล้วลองใหม่`)
    return true
  }
}
