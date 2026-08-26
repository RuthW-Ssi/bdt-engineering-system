import { DrawingApsService } from './drawing-aps.service'

const ORIGINAL_FETCH = global.fetch

function makeDrawing(overrides: Partial<{ id: number; aps_urn: string | null; aps_translation_status: string | null; aps_translation_error: string | null }> = {}) {
  return {
    id: 1,
    file_key: 'drawings/0X220/Z1/v1/plan-A.dwg',
    file_name: 'plan-A.dwg',
    aps_urn: null,
    aps_translation_status: null,
    aps_translation_error: null,
    ...overrides,
  }
}

function makePrisma(drawing: ReturnType<typeof makeDrawing>) {
  return {
    drawing: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(drawing),
      update: jest.fn().mockImplementation(({ data }: any) => {
        Object.assign(drawing, data)
        return Promise.resolve(drawing)
      }),
    },
  }
}

function makeAps() {
  return {
    drawingBucketKey: 'bdt-drawing-staging',
    ensureBucket: jest.fn().mockResolvedValue(undefined),
    createSignedUpload: jest.fn().mockResolvedValue({ uploadKey: 'up-key', url: 'https://oss.example/put' }),
    completeUpload: jest.fn().mockResolvedValue({ urn: 'urn:new' }),
    translate: jest.fn().mockResolvedValue(undefined),
    getManifest: jest.fn(),
    getViewerAccessToken: jest.fn().mockResolvedValue('viewer-token'),
  }
}

function makeFileStorage(url = 'https://gcs.example/signed-download') {
  return { getDownloadUrl: jest.fn().mockResolvedValue(url) }
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
  jest.restoreAllMocks()
})

describe('DrawingApsService.pushToAps', () => {
  it('happy path: pushes the GCS object into the drawing bucket, translates with 2d views, and persists the urn', async () => {
    const drawing = makeDrawing()
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const fileStorage = makeFileStorage()
    global.fetch = jest
      .fn()
      // 1st call: fetch the file back out of GCS
      .mockResolvedValueOnce({ ok: true, status: 200, body: webStreamFromString('fake dwg bytes') })
      // 2nd call: PUT the bytes to the APS signed upload URL
      .mockResolvedValueOnce({ ok: true, status: 200 }) as unknown as typeof fetch

    const svc = new DrawingApsService(prisma as any, aps as any, fileStorage as any)
    await svc.pushToAps(drawing.id, drawing.file_key, drawing.file_name)

    expect(aps.ensureBucket).toHaveBeenCalledWith('bdt-drawing-staging')
    expect(aps.createSignedUpload).toHaveBeenCalledWith(expect.any(String), 'bdt-drawing-staging')
    expect(aps.completeUpload).toHaveBeenCalledWith(expect.any(String), 'up-key', 'bdt-drawing-staging')
    expect(aps.translate).toHaveBeenCalledWith('urn:new', ['2d'])
    expect(drawing.aps_urn).toBe('urn:new')
    expect(drawing.aps_translation_status).toBe('processing') // checkStatus flips this to complete later, not this method
  })

  it('never throws (resolves) and marks the drawing failed when the GCS fetch itself returns non-ok', async () => {
    const drawing = makeDrawing()
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const fileStorage = makeFileStorage()
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, body: null }) as unknown as typeof fetch

    const svc = new DrawingApsService(prisma as any, aps as any, fileStorage as any)
    await expect(svc.pushToAps(drawing.id, drawing.file_key, drawing.file_name)).resolves.toBeUndefined()

    expect(drawing.aps_translation_status).toBe('failed')
    expect(drawing.aps_translation_error).toContain('GCS object fetch failed')
    expect(aps.createSignedUpload).not.toHaveBeenCalled()
  })

  it('never throws (resolves) and marks the drawing failed when the APS upload PUT fails', async () => {
    const drawing = makeDrawing()
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const fileStorage = makeFileStorage()
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, body: webStreamFromString('fake dwg bytes') })
      .mockResolvedValueOnce({ ok: false, status: 500 }) as unknown as typeof fetch

    const svc = new DrawingApsService(prisma as any, aps as any, fileStorage as any)
    await expect(svc.pushToAps(drawing.id, drawing.file_key, drawing.file_name)).resolves.toBeUndefined()

    expect(drawing.aps_translation_status).toBe('failed')
    expect(drawing.aps_translation_error).toContain('APS object upload failed')
    expect(aps.completeUpload).not.toHaveBeenCalled()
  })

  it('never throws (resolves) when ensureBucket itself rejects', async () => {
    const drawing = makeDrawing()
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    aps.ensureBucket.mockRejectedValue(new Error('APS down'))
    const fileStorage = makeFileStorage()

    const svc = new DrawingApsService(prisma as any, aps as any, fileStorage as any)
    await expect(svc.pushToAps(drawing.id, drawing.file_key, drawing.file_name)).resolves.toBeUndefined()

    expect(drawing.aps_translation_status).toBe('failed')
  })
})

describe('DrawingApsService.checkStatus', () => {
  it('returns the stored state without calling APS when already complete', async () => {
    const drawing = makeDrawing({ aps_translation_status: 'complete', aps_urn: 'urn:x' })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.checkStatus(drawing.id)

    expect(result).toEqual({ id: drawing.id, status: 'complete', error: null })
    expect(aps.getManifest).not.toHaveBeenCalled()
  })

  it('returns the stored state without calling APS when already failed', async () => {
    const drawing = makeDrawing({ aps_translation_status: 'failed', aps_translation_error: 'boom' })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.checkStatus(drawing.id)

    expect(result).toEqual({ id: drawing.id, status: 'failed', error: 'boom' })
    expect(aps.getManifest).not.toHaveBeenCalled()
  })

  it('reports the row state without calling APS when the urn is not set yet (still pushing to APS)', async () => {
    const drawing = makeDrawing({ aps_translation_status: 'processing', aps_urn: null })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.checkStatus(drawing.id)

    expect(result).toEqual({ id: drawing.id, status: 'processing', error: null })
    expect(aps.getManifest).not.toHaveBeenCalled()
  })

  it('flips to complete when the manifest derivative reports success', async () => {
    const drawing = makeDrawing({ aps_translation_status: 'processing', aps_urn: 'urn:x' })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    aps.getManifest.mockResolvedValue({ status: 'inprogress', derivatives: [{ status: 'success' }] })
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.checkStatus(drawing.id)

    expect(result).toEqual({ id: drawing.id, status: 'complete', error: null })
    expect(drawing.aps_translation_status).toBe('complete')
  })

  it('flips to failed with a joined message when the manifest derivative reports failed', async () => {
    const drawing = makeDrawing({ aps_translation_status: 'processing', aps_urn: 'urn:x' })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    aps.getManifest.mockResolvedValue({
      status: 'failed',
      derivatives: [{ status: 'failed', messages: [{ type: 'error', message: 'bad file' }] }],
    })
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.checkStatus(drawing.id)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('bad file')
  })

  it('stays processing when the manifest is still in progress with no terminal derivative status', async () => {
    const drawing = makeDrawing({ aps_translation_status: 'processing', aps_urn: 'urn:x' })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    aps.getManifest.mockResolvedValue({ status: 'inprogress', derivatives: [{ status: 'inprogress' }] })
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.checkStatus(drawing.id)

    expect(result).toEqual({ id: drawing.id, status: 'processing', error: null })
    expect(prisma.drawing.update).not.toHaveBeenCalled()
  })
})

describe('DrawingApsService.getViewerToken', () => {
  it('returns the stored urn and a fresh viewer-scoped token', async () => {
    const drawing = makeDrawing({ aps_urn: 'urn:x' })
    const prisma = makePrisma(drawing)
    const aps = makeAps()
    const svc = new DrawingApsService(prisma as any, aps as any, makeFileStorage() as any)

    const result = await svc.getViewerToken(drawing.id)

    expect(result).toEqual({ urn: 'urn:x', access_token: 'viewer-token' })
  })
})
