const mockFile = jest.fn()

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn(() => ({ file: mockFile })),
  })),
}))

import { GcsFileStorageDriver } from './gcs.driver'

const ORIGINAL_ENV = { ...process.env }

function makeFileStub(overrides: Partial<Record<'getSignedUrl' | 'getMetadata' | 'delete' | 'save', jest.Mock>> = {}) {
  return {
    getSignedUrl: overrides.getSignedUrl ?? jest.fn().mockResolvedValue(['https://signed.example/url']),
    getMetadata: overrides.getMetadata ?? jest.fn().mockResolvedValue([{ size: '42', contentType: 'application/pdf' }]),
    delete: overrides.delete ?? jest.fn().mockResolvedValue(undefined),
    save: overrides.save ?? jest.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  process.env.FILE_STORAGE_GCS_BUCKET = 'test-bucket'
  delete process.env.FILE_STORAGE_GCS_CREDENTIALS_JSON
  mockFile.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('GcsFileStorageDriver', () => {
  it('throws at construction time if FILE_STORAGE_GCS_BUCKET is unset — this driver should never be instantiated without it', () => {
    delete process.env.FILE_STORAGE_GCS_BUCKET
    expect(() => new GcsFileStorageDriver()).toThrow('FILE_STORAGE_GCS_BUCKET')
  })

  it('getUploadUrl: signs a v4 write URL for the exact key, PUT method', async () => {
    const file = makeFileStub()
    mockFile.mockReturnValue(file)
    const driver = new GcsFileStorageDriver()

    const result = await driver.getUploadUrl('drawings/0X220/v1/plan.pdf', 'application/pdf')

    expect(mockFile).toHaveBeenCalledWith('drawings/0X220/v1/plan.pdf')
    expect(file.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
      version: 'v4', action: 'write', contentType: 'application/pdf',
    }))
    expect(result).toEqual({ url: 'https://signed.example/url', method: 'PUT' })
  })

  it('getDownloadUrl: signs a v4 read URL for the exact key', async () => {
    const file = makeFileStub()
    mockFile.mockReturnValue(file)
    const driver = new GcsFileStorageDriver()

    const url = await driver.getDownloadUrl('bom/0X220/Z01/assembly-list-rev1.xlsx')

    expect(mockFile).toHaveBeenCalledWith('bom/0X220/Z01/assembly-list-rev1.xlsx')
    expect(file.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ version: 'v4', action: 'read' }))
    expect(url).toBe('https://signed.example/url')
  })

  it('getMetadata: maps size/contentType, returns null on any error (e.g. object not found) instead of throwing', async () => {
    mockFile.mockReturnValueOnce(makeFileStub())
    const driver = new GcsFileStorageDriver()
    const meta = await driver.getMetadata('some/key')
    expect(meta).toEqual({ size: 42, contentType: 'application/pdf', checksumSha256: undefined })

    mockFile.mockReturnValueOnce(makeFileStub({ getMetadata: jest.fn().mockRejectedValue(new Error('404')) }))
    const missing = await driver.getMetadata('missing/key')
    expect(missing).toBeNull()
  })

  it('delete: passes ignoreNotFound so deleting an already-gone object is not an error', async () => {
    const file = makeFileStub()
    mockFile.mockReturnValue(file)
    const driver = new GcsFileStorageDriver()

    await driver.delete('drawings/0X220/v1/plan.pdf')

    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it('putObject: saves the buffer non-resumable, at the exact key, with the given content type', async () => {
    const file = makeFileStub()
    mockFile.mockReturnValue(file)
    const driver = new GcsFileStorageDriver()
    const buf = Buffer.from('hello')

    await driver.putObject('bom/0X220/Z01/assembly-list-rev1.xlsx', buf, 'application/vnd.ms-excel')

    expect(mockFile).toHaveBeenCalledWith('bom/0X220/Z01/assembly-list-rev1.xlsx')
    expect(file.save).toHaveBeenCalledWith(buf, { contentType: 'application/vnd.ms-excel', resumable: false })
  })
})
