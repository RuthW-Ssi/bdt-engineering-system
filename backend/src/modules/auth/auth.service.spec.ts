import { Test } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
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

  it('does not log anything on a successful login', async () => {
    prisma.res_users.findFirst.mockResolvedValue({
      id: 1, login: 'admin', name: 'Admin', role: 'admin', password: await bcrypt.hash('correct-password', 4),
    })

    const result = await svc.login({ login: 'admin', password: 'correct-password' })

    expect(result.access_token).toBe('signed-token')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
