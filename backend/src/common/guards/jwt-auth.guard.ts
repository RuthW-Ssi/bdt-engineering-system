import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { JwtPayload } from '../../modules/auth/auth.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()
    const authHeader: string | undefined = req.headers['authorization']
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!token) throw new UnauthorizedException('Missing authorization token')
    try {
      req.user = this.jwtService.verify<JwtPayload>(token)
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
    return true
  }
}
