import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { Request, Response } from 'express'

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
const SWEEP_AT = 10_000 // entries; drop stale ones past this so random names can't grow memory

function forwardedFor(req: Pick<Request, 'headers'>): string[] {
  const xff = req.headers['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff.join(',') : xff
  return raw?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
}

/**
 * Real client IP. The browser calls /api on Vercel, which rewrites to Cloud Run:
 * Vercel sets X-Forwarded-For to the client's IP, then Cloud Run appends the
 * address that connected to it (Vercel's). So the client is the SECOND-TO-LAST
 * entry; with one entry (no proxy in front) it is that one.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const ips = forwardedFor(req)
  return ips[ips.length - 2] ?? ips[ips.length - 1] ?? req.socket?.remoteAddress ?? 'unknown'
}

/** Address that connected to Cloud Run (last entry, appended by Google — can't be forged). Vercel's for normal traffic. */
export function edgeIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const ips = forwardedFor(req)
  return ips[ips.length - 1] ?? req.socket?.remoteAddress ?? 'unknown'
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>()

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>()
    const res = ctx.switchToHttp().getResponse<Response>()
    const now = Date.now()
    const ip = clientIp(req)
    const edge = edgeIp(req)
    const raw = req.body?.login
    const name = (typeof raw === 'string' ? raw : '').trim().toLowerCase().slice(0, 100)

    const keys: [string, number][] = [
      [`ip:${ip}`, LOGIN_PER_IP],
      [`name:${ip}:${name}`, LOGIN_PER_NAME],
      [`edge:${edge}`, LOGIN_PER_EDGE],
      [`edgename:${edge}:${name}`, LOGIN_PER_EDGE_NAME],
    ]
    // check all before recording, so a refused attempt counts against none
    const wait = Math.max(...keys.map(([k, limit]) => this.waitFor(k, limit, now)))
    if (wait > 0) {
      const sec = Math.ceil(wait / 1000)
      res.setHeader('Retry-After', String(sec))
      throw new HttpException(
        { message: `เข้าสู่ระบบหลายครั้งเกินไป — รอ ${sec} วินาทีแล้วลองใหม่`, code: 'RATE_LIMITED', retry_after: sec },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    for (const [k] of keys) this.hits.set(k, [...(this.hits.get(k) ?? []), now]) // a sweep may have dropped an empty entry
    return true
  }

  /** Ms until the oldest attempt leaves the window when `key` is at `limit`, else 0. Prunes old attempts. */
  private waitFor(key: string, limit: number, now: number): number {
    if (this.hits.size > SWEEP_AT) this.sweep(now)
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS)
    this.hits.set(key, recent)
    return recent.length >= limit ? LOGIN_WINDOW_MS - (now - recent[0]) : 0
  }

  private sweep(now: number) {
    for (const [k, ts] of this.hits) if (!ts.length || now - ts[ts.length - 1] >= LOGIN_WINDOW_MS) this.hits.delete(k)
  }
}
