import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DocumentsService, visibleAudiences } from './documents.service'

const pdf = (name = 'manual.pdf') => ({ originalname: name, size: 9, buffer: Buffer.from('%PDF-1.7\n') })

function setup(userType: 'employee' | 'customer' = 'employee', role = 'user') {
  const prisma = {
    res_users: { findUnique: jest.fn().mockResolvedValue({ user_type: userType, role }) },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({}),
    },
  }
  const storage = {
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
    delete: jest.fn().mockResolvedValue(undefined),
  }
  const svc = new DocumentsService(prisma as never, storage as never)
  return { svc, prisma, storage }
}

describe('visibleAudiences', () => {
  it('customers see customer + all, employees see employee + all, admin sees everything', () => {
    expect(visibleAudiences({ user_type: 'customer', role: 'user' })).toEqual(['customer', 'all'])
    expect(visibleAudiences({ user_type: 'employee', role: 'production' })).toEqual(['employee', 'all'])
    expect(visibleAudiences({ user_type: 'employee', role: 'admin' })).toEqual(['employee', 'customer', 'all'])
    expect(visibleAudiences(null)).toEqual(['employee', 'all'])
  })
})

describe('DocumentsService', () => {
  it('list filters by the caller audience', async () => {
    const { svc, prisma } = setup('customer')
    await svc.list(5)
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({ audience: { in: ['customer', 'all'] } })
  })

  it('getFile hides an employee-only document from a customer (404)', async () => {
    const { svc, prisma, storage } = setup('customer')
    prisma.document.findUnique.mockResolvedValue({ id: 1, audience: 'employee', file_key: 'documents/a.pdf' })
    await expect(svc.getFile(1, 5)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.getObject).not.toHaveBeenCalled()
  })

  it('create rejects a non-PDF even if named .pdf', async () => {
    const { svc, storage } = setup()
    const fake = { originalname: 'x.pdf', size: 4, buffer: Buffer.from('<htm') }
    await expect(svc.create({ title: 'T', version: 'v1' }, fake, 1)).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('create decodes the multipart (latin1) filename back to Thai', async () => {
    const { svc } = setup()
    const latin1 = Buffer.from('คู่มือ.pdf', 'utf8').toString('latin1')
    const row = await svc.create({ title: 'T', version: 'v1' }, pdf(latin1), 1)
    expect(row).toMatchObject({ file_name: 'คู่มือ.pdf' })
  })

  it('create stores the PDF under documents/ with defaults', async () => {
    const { svc, storage } = setup()
    const row = await svc.create({ title: ' Manual ', version: 'v1' }, pdf(), 1)
    expect(storage.putObject).toHaveBeenCalledWith(expect.stringMatching(/^documents\/.+\.pdf$/), expect.any(Buffer), 'application/pdf')
    expect(row).toMatchObject({ title: 'Manual', category: 'user-manual', audience: 'employee', file_name: 'manual.pdf' })
  })

  it('update with a new file replaces it and deletes the old object', async () => {
    const { svc, prisma, storage } = setup()
    prisma.document.findUnique.mockResolvedValue({ id: 1, file_key: 'documents/old.pdf' })
    await svc.update(1, { version: 'v2' }, pdf('v2.pdf'), 1)
    expect(prisma.document.update.mock.calls[0][0].data).toMatchObject({ version: 'v2', file_name: 'v2.pdf' })
    expect(storage.delete).toHaveBeenCalledWith('documents/old.pdf')
  })

  it('update without a file keeps the stored file', async () => {
    const { svc, prisma, storage } = setup()
    prisma.document.findUnique.mockResolvedValue({ id: 1, file_key: 'documents/old.pdf' })
    await svc.update(1, { title: 'New' }, undefined, 1)
    expect(prisma.document.update.mock.calls[0][0].data.file_key).toBeUndefined()
    expect(storage.delete).not.toHaveBeenCalled()
  })
})
