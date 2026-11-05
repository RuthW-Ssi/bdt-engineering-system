import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { getPermissionMap, ModulePermission } from '../../common/permissions/permission-map'
import { LoginDto } from './dto/login.dto'
import { ChangePasswordDto } from './dto/change-password.dto'

export interface JwtPayload {
  sub: number
  login: string
  role: string
}

/**
 * Login lockout (2026-11-05, Tao): every LOGIN_FAILS_PER_ROUND wrong passwords
 * is one round. Round 1 → locked 1 min, round 2 → 5 min, round 3 → blocked
 * until an admin unlocks it (POST /users/:id/unlock-login). Admin accounts are
 * never blocked — round 1 is still 1 min, every later round 5 min — so the
 * system can't end up with nobody to unlock.
 * A correct password clears everything. Locked/blocked accounts are refused
 * even with the right password.
 */
export const LOGIN_FAILS_PER_ROUND = 5
export const LOCK_MINUTES = [1, 5] // round 1, round 2 (and every admin round after)

const lockedError = (until: Date, now: number) => {
  const sec = Math.max(1, Math.ceil((until.getTime() - now) / 1000))
  const wait = sec >= 60 ? `${Math.ceil(sec / 60)} นาที` : `${sec} วินาที`
  return new HttpException(
    { message: `ใส่รหัสผ่านผิดหลายครั้ง — บัญชีถูกล็อกชั่วคราว รอ ${wait} แล้วลองใหม่`, code: 'ACCOUNT_LOCKED', retry_after: sec },
    HttpStatus.TOO_MANY_REQUESTS,
  )
}
const blockedError = () =>
  new ForbiddenException({ message: 'ใส่รหัสผ่านผิดหลายครั้ง — บัญชีถูกระงับ ติดต่อ admin เพื่อปลดล็อก', code: 'ACCOUNT_BLOCKED' })

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private sanitizeForLog(value: string): string {
    // Strip control characters (CR/LF included) so untrusted input can't forge fake log lines (CWE-117).
    return value.replace(/[\x00-\x1F\x7F]/g, '')
  }

  async login(dto: LoginDto): Promise<{
    access_token: string
    user: {
      id: number
      login: string
      name: string
      role: string
      job_title: string | null
      user_type: string
      partner_id: number | null
      permissions: Record<string, ModulePermission>
    }
  }> {
    const user = await this.prisma.res_users.findFirst({
      where: { login: dto.login, active: true },
    })
    if (!user || !user.password) {
      this.logger.warn(`Login failed: unknown or inactive login "${this.sanitizeForLog(dto.login)}"`)
      throw new UnauthorizedException('Invalid credentials')
    }

    const now = Date.now()
    if (user.login_blocked_at) throw blockedError()
    if (user.login_locked_until && user.login_locked_until.getTime() > now) throw lockedError(user.login_locked_until, now)

    const valid = await bcrypt.compare(dto.password, user.password)
    if (!valid) {
      this.logger.warn(`Login failed: wrong password for login "${this.sanitizeForLog(dto.login)}"`)
      await this.recordFailure(user.id)
      throw new UnauthorizedException('Invalid credentials')
    }
    if (user.failed_login_count || user.login_strikes || user.login_locked_until) {
      await this.prisma.res_users.update({
        where: { id: user.id },
        data: { failed_login_count: 0, login_strikes: 0, login_locked_until: null },
      })
    }

    const payload: JwtPayload = { sub: user.id, login: user.login, role: user.role }
    const permissions = await getPermissionMap(this.prisma, user.id, user.role)
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, login: user.login, name: user.name, role: user.role, job_title: user.job_title, user_type: user.user_type, partner_id: user.partner_id, permissions },
    }
  }

  /**
   * Counts one wrong password under a row lock (two wrong attempts at the same
   * moment can't both read the old count). On every LOGIN_FAILS_PER_ROUND-th it
   * starts the next round and throws the lock/block error instead of a plain 401.
   */
  private async recordFailure(userId: number): Promise<void> {
    const err = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM res_users WHERE id = ${userId} FOR UPDATE`
      const u = await tx.res_users.findUniqueOrThrow({
        where: { id: userId },
        select: { failed_login_count: true, login_strikes: true, role: true, login: true, login_locked_until: true, login_blocked_at: true },
      })
      // Re-check under the lock (QA M1): wrong passwords sent at the same moment
      // must not keep counting once one of them locked the account.
      if (u.login_blocked_at) return blockedError()
      if (u.login_locked_until && u.login_locked_until.getTime() > Date.now()) return lockedError(u.login_locked_until, Date.now())
      const fails = u.failed_login_count + 1
      if (fails < LOGIN_FAILS_PER_ROUND) {
        await tx.res_users.update({ where: { id: userId }, data: { failed_login_count: fails } })
        return null
      }
      const isAdmin = u.role === 'admin'
      const strikes = isAdmin ? Math.min(u.login_strikes + 1, LOCK_MINUTES.length) : u.login_strikes + 1
      if (strikes > LOCK_MINUTES.length) {
        await tx.res_users.update({ where: { id: userId }, data: { failed_login_count: 0, login_strikes: strikes, login_locked_until: null, login_blocked_at: new Date() } })
        this.logger.warn(`Login blocked (round ${strikes}) for login "${this.sanitizeForLog(u.login)}" — needs admin unlock`)
        return blockedError()
      }
      const until = new Date(Date.now() + LOCK_MINUTES[strikes - 1] * 60_000)
      await tx.res_users.update({ where: { id: userId }, data: { failed_login_count: 0, login_strikes: strikes, login_locked_until: until } })
      this.logger.warn(`Login locked ${LOCK_MINUTES[strikes - 1]} min (round ${strikes}) for login "${this.sanitizeForLog(u.login)}"`)
      return lockedError(until, Date.now())
    })
    if (err) throw err
  }

  // Self-service password change (2026-09-29). `userId` comes from the JWT,
  // so a user can only ever change their own password; the current one
  // must be re-entered. The existing token stays valid (stateless JWT).
  async changePassword(userId: number, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.res_users.findFirst({ where: { id: userId, active: true } })
    if (!user || !user.password) throw new UnauthorizedException('User not found')

    if (!(await bcrypt.compare(dto.current_password, user.password))) {
      this.logger.warn(`Password change failed: wrong current password for login "${this.sanitizeForLog(user.login)}"`)
      throw new BadRequestException('Current password is incorrect')
    }
    if (dto.new_password === dto.current_password) {
      throw new BadRequestException('New password must be different from the current password')
    }

    const hash = await bcrypt.hash(dto.new_password, 12)
    await this.prisma.res_users.update({ where: { id: userId }, data: { password: hash } })
    this.logger.log(`Password changed for login "${this.sanitizeForLog(user.login)}"`)
    return { ok: true }
  }

  async getProfile(userId: number) {
    const user = await this.prisma.res_users.findFirst({
      where: { id: userId, active: true },
      select: { id: true, login: true, name: true, email: true, role: true, lang: true, tz: true, user_type: true, partner_id: true },
    })
    if (!user) throw new UnauthorizedException('User not found')
    const permissions = await getPermissionMap(this.prisma, user.id, user.role)
    return { ...user, permissions }
  }
}
