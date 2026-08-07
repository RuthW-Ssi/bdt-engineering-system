import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { SetPermissionsDto } from './dto/set-permissions.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { QueryUserDto } from './dto/query-user.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AdminGuard } from '../../common/guards/admin.guard'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin-only, paginated/filterable)' })
  findAll(@Query() query: QueryUserDto) {
    return this.svc.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id, including permission rows (admin-only)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create user — seeds permission rows from the role template unless overridden' })
  create(@Body() dto: CreateUserDto) {
    return this.svc.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user name/role/active (admin-only)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.svc.update(id, dto)
  }

  @Patch(':id/permissions')
  @ApiOperation({ summary: 'Replace the full permission set for a user (admin-only)' })
  setPermissions(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPermissionsDto) {
    return this.svc.setPermissions(id, dto)
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Admin sets a new password directly (admin-only)' })
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.svc.resetPassword(id, dto)
  }
}
