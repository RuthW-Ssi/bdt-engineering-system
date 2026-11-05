import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { PrismaModule } from '../../prisma/prisma.module'
import { LoginRateLimitGuard } from '../../common/guards/login-rate-limit.guard'

/**
 * The JWT signing secret (2026-11-05): in production a missing JWT_SECRET must
 * stop the app from starting — the dev fallback is public, so anyone could
 * sign an admin token with it.
 */
export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.JWT_SECRET) return env.JWT_SECRET
  if (env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production')
  return 'bdt-dev-secret'
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      // 12 h (2026-11-05, Tao option ก): a leaked token or a closed account stops working by the next day; users sign in once a day
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as any },
    }),
  ],
  providers: [AuthService, LoginRateLimitGuard], // one instance → one shared counter
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
