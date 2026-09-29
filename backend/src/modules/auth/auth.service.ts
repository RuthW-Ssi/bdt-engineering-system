import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
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

    const valid = await bcrypt.compare(dto.password, user.password)
    if (!valid) {
      this.logger.warn(`Login failed: wrong password for login "${this.sanitizeForLog(dto.login)}"`)
      throw new UnauthorizedException('Invalid credentials')
    }

    const payload: JwtPayload = { sub: user.id, login: user.login, role: user.role }
    const permissions = await getPermissionMap(this.prisma, user.id, user.role)
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, login: user.login, name: user.name, role: user.role, job_title: user.job_title, permissions },
    }
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
      select: { id: true, login: true, name: true, email: true, role: true, lang: true, tz: true },
    })
    if (!user) throw new UnauthorizedException('User not found')
    const permissions = await getPermissionMap(this.prisma, user.id, user.role)
    return { ...user, permissions }
  }
}
