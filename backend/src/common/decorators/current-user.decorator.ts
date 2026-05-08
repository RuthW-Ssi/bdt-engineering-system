import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from '../../modules/auth/auth.service'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    return ctx.switchToHttp().getRequest().user
  },
)
