import { PassThrough } from 'node:stream'
import { BimBackupService } from './bim-backup.service'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_ENV = { ...process.env }

function makeAps(downloadUrl = 'https://oss.example/signed-download') {
  return { getSignedDownloadUrl: jest.fn().mockResolvedValue(downloadUrl) }
}

function webStreamFromString(s: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(s))
      controller.close()
    },
  })
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  process.env = { ...ORIGINAL_ENV }
  jest.restoreAllMocks()
  jest.resetModules()
  jest.dontMock('@google-cloud/storage')
})

describe('BimBackupService.backup', () => {
  it('no-ops (never calls APS or fetch) when FILE_STORAGE_GCS_BUCKET is unset — the local-dev default', async () => {
    delete process.env.FILE_STORAGE_GCS_BUCKET
    const aps = makeAps()
    const svc = new BimBackupService()

    await svc.backup('0X220', 1, 0, 'obj-key', aps as any)

    expect(aps.getSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('resolves (never rejects) when the APS download URL request fails — a backup failure must never surface to the fire-and-forget caller', async () => {
    process.env.FILE_STORAGE_GCS_BUCKET = 'test-bucket'
    const aps = { getSignedDownloadUrl: jest.fn().mockRejectedValue(new Error('APS down')) }
    const svc = new BimBackupService()

    await expect(svc.backup('0X220', 1, 0, 'obj-key', aps as any)).resolves.toBeUndefined()
  })

  it('resolves (never rejects) when the APS object fetch itself returns non-ok', async () => {
    process.env.FILE_STORAGE_GCS_BUCKET = 'test-bucket'
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, body: null }) as unknown as typeof fetch
    const svc = new BimBackupService()

    await expect(svc.backup('0X220', 1, 0, 'obj-key', makeAps() as any)).resolves.toBeUndefined()
  })

  // Dynamically mocked (jest.doMock, not the hoisted jest.mock) so only this
  // test swaps out the real @google-cloud/storage — the tests above never
  // reach bucket.file(...).createWriteStream() at all (they short-circuit
  // earlier), so they're fine exercising the real, un-mocked package (no
  // network call ever happens — Storage/Bucket construction alone doesn't
  // touch the network).
  it('streams the APS object into bucket.file(<key>).createWriteStream() at the spec key shape, never buffering the whole file', async () => {
    process.env.FILE_STORAGE_GCS_BUCKET = 'test-bucket'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: webStreamFromString('fake ifc bytes'),
    }) as unknown as typeof fetch

    let capturedKey: string | undefined
    const sink = new PassThrough()
    sink.resume() // drain so pipeline() can resolve, same as a real write eventually would

    jest.doMock('@google-cloud/storage', () => ({
      Storage: jest.fn().mockImplementation(() => ({
        bucket: jest.fn(() => ({
          file: jest.fn((key: string) => {
            capturedKey = key
            return { createWriteStream: jest.fn(() => sink) }
          }),
        })),
      })),
    }))

    const { BimBackupService: MockedService } = require('./bim-backup.service')
    const svc = new MockedService()

    await svc.backup('0X220', 2, 1, 'obj-key', makeAps() as any)

    expect(capturedKey).toBe('bim/0X220/0X220-v2.1.ifc')
  })
})
