import { Test } from '@nestjs/testing'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('AuthService', () => {
  let svc: AuthService
  let prisma: { res_users: { findFirst: jest.Mock } }
  let jwt: { sign: jest.Mock }
  let warnSpy: jest.SpyInstance

  beforeEach(async () => {
    prisma = { res_users: { findFirst: jest.fn() } }
    jwt = { sign: jest.fn().mockReturnValue('signed-token') }

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile()

    svc = module.get(AuthService)
    warnSpy = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined)
  })

  it('logs a warning (login id only) and throws when the login is unknown', async () => {
    prisma.res_users.findFirst.mockResolvedValue(null)

    await expect(svc.login({ login: 'ghost', password: 'whatever' })).rejects.toThrow(UnauthorizedException)
    expect(warnSpy).toHaveBeenCalledWith('Login failed: unknown or inactive login "ghost"')
  })

  it('logs a warning (login id only) and throws when the password is wrong', async () => {
    prisma.res_users.findFirst.mockResolvedValue({
      id: 1, login: 'admin', name: 'Admin', role: 'admin', password: await bcrypt.hash('correct-password', 4),
    })

    await expect(svc.login({ login: 'admin', password: 'wrong-password' })).rejects.toThrow(UnauthorizedException)
    expect(warnSpy).toHaveBeenCalledWith('Login failed: wrong password for login "admin"')
    expect(warnSpy.mock.calls[0][0]).not.toContain('wrong-password')
  })

  it('strips CR/LF and control characters from the login before logging (log injection)', async () => {
    prisma.res_users.findFirst.mockResolvedValue(null)

    await expect(
      svc.login({ login: 'ghost\n2026-07-02 [Nest] LOG [AuthService] Login succeeded for admin', password: 'x' }),
    ).rejects.toThrow(UnauthorizedException)
    expect(warnSpy).toHaveBeenCalledWith(
      'Login failed: unknown or inactive login "ghost2026-07-02 [Nest] LOG [AuthService] Login succeeded for admin"',
    )
  })

  it('does not log anything on a successful login', async () => {
    prisma.res_users.findFirst.mockResolvedValue({
      id: 1, login: 'admin', name: 'Admin', role: 'admin', password: await bcrypt.hash('correct-password', 4),
    })

    const result = await svc.login({ login: 'admin', password: 'correct-password' })

    expect(result.access_token).toBe('signed-token')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

// 2026-09-29 — self-service password change from the user menu.
describe('AuthService.changePassword', () => {
  let svc: AuthService
  let prisma: { res_users: { findFirst: jest.Mock; update: jest.Mock } }

  beforeEach(async () => {
    prisma = { res_users: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) } }
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
      ],
    }).compile()
    svc = module.get(AuthService)
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined)
    jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined)
  })

  const withUser = async (password = 'Old-pass-1') =>
    prisma.res_users.findFirst.mockResolvedValue({ id: 7, login: 'test-dept-bte', password: await bcrypt.hash(password, 4) })

  it('hashes and saves the new password for the calling user only', async () => {
    await withUser()
    await expect(svc.changePassword(7, { current_password: 'Old-pass-1', new_password: 'New-pass-22' })).resolves.toEqual({ ok: true })
    const call = prisma.res_users.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 7 })
    expect(call.data.password).not.toBe('New-pass-22')
    expect(await bcrypt.compare('New-pass-22', call.data.password)).toBe(true)
  })

  it('rejects a wrong current password without writing', async () => {
    await withUser()
    await expect(svc.changePassword(7, { current_password: 'nope', new_password: 'New-pass-22' })).rejects.toThrow(BadRequestException)
    await expect(svc.changePassword(7, { current_password: 'nope', new_password: 'New-pass-22' })).rejects.toThrow('Current password is incorrect')
    expect(prisma.res_users.update).not.toHaveBeenCalled()
  })

  it('rejects a new password equal to the current one', async () => {
    await withUser()
    await expect(svc.changePassword(7, { current_password: 'Old-pass-1', new_password: 'Old-pass-1' })).rejects.toThrow(BadRequestException)
    expect(prisma.res_users.update).not.toHaveBeenCalled()
  })

  it('rejects an unknown / inactive user', async () => {
    prisma.res_users.findFirst.mockResolvedValue(null)
    await expect(svc.changePassword(99, { current_password: 'x', new_password: 'New-pass-22' })).rejects.toThrow(UnauthorizedException)
    expect(prisma.res_users.update).not.toHaveBeenCalled()
  })
})
