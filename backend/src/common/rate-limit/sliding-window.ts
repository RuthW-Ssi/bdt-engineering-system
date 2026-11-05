import { HttpException, HttpStatus } from '@nestjs/common'
import type { Request, Response } from 'express'

/**
 * In-memory sliding-window counter shared by the rate-limit guards
 * (2026-11-05). One instance per guard; per Cloud Run instance, so with N
 * instances a limit is at most N× looser. No Redis, no cost.
 * ponytail: in-memory per instance, upgrade path = shared store (Redis) if exact limits are ever needed
 */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly windowMs: number,
    private readonly sweepAt = 10_000, // entries; past this, drop stale keys so random keys can't grow memory
  ) {}

  /**
   * Checks every [key, limit] first; if any is full returns the ms to wait and
   * records nothing (a refused request counts against none). Otherwise records
   * one hit on every key and returns 0.
   */
  take(keys: [string, number][], now: number): number {
    if (this.hits.size > this.sweepAt) this.sweep(now)
    const wait = Math.max(0, ...keys.map(([k, limit]) => this.waitFor(k, limit, now)))
    if (wait > 0) return wait
    for (const [k] of keys) this.hits.set(k, [...(this.hits.get(k) ?? []), now])
    return 0
  }

  private waitFor(key: string, limit: number, now: number): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    this.hits.set(key, recent)
    return recent.length >= limit ? this.windowMs - (now - recent[0]) : 0
  }

  private sweep(now: number) {
    for (const [k, ts] of this.hits) if (!ts.length || now - ts[ts.length - 1] >= this.windowMs) this.hits.delete(k)
  }
}

/** 429 with a Thai message, `code`, `retry_after` and the Retry-After header. */
export function tooMany(res: Response, waitMs: number, message: (sec: number) => string): HttpException {
  const sec = Math.ceil(waitMs / 1000)
  res.setHeader('Retry-After', String(sec))
  return new HttpException({ message: message(sec), code: 'RATE_LIMITED', retry_after: sec }, HttpStatus.TOO_MANY_REQUESTS)
}

function forwardedFor(req: Pick<Request, 'headers'>): string[] {
  const xff = req.headers['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff.join(',') : xff
  return raw?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
}

/**
 * Real client IP. The browser calls /api on Vercel, which rewrites to Cloud Run:
 * Vercel sets X-Forwarded-For to the client's IP, then Cloud Run appends the
 * address that connected to it (Vercel's). So the client is the SECOND-TO-LAST
 * entry (confirmed by a staging probe 2026-11-05); with one entry (no proxy in
 * front) it is that one.
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
