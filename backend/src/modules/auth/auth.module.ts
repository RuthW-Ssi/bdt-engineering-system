import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { PrismaModule } from '../../prisma/prisma.module'
import { LoginRateLimitGuard } from '../../common/guards/login-rate-limit.guard'

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'bdt-dev-secret',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
    }),
  ],
  providers: [AuthService, LoginRateLimitGuard], // one instance → one shared counter
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
