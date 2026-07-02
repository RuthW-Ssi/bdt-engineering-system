import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'

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

  async login(dto: LoginDto): Promise<{ access_token: string; user: { id: number; login: string; name: string; role: string } }> {
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
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, login: user.login, name: user.name, role: user.role },
    }
  }

  async getProfile(userId: number) {
    const user = await this.prisma.res_users.findFirst({
      where: { id: userId, active: true },
      select: { id: true, login: true, name: true, email: true, role: true, lang: true, tz: true },
    })
    if (!user) throw new UnauthorizedException('User not found')
    return user
  }
}
