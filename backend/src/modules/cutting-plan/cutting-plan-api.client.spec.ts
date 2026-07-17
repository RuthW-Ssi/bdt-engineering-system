import { BadRequestException, InternalServerErrorException } from '@nestjs/common'

const mockGetRequestHeaders = jest.fn()
const mockGetIdTokenClient = jest.fn()

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getIdTokenClient: mockGetIdTokenClient,
  })),
}))

import { CuttingPlanApiClient } from './cutting-plan-api.client'

const FIELDS = { file_id: 'f1', project_code: 'X1', project_name: 'P', tag: 'T', description: 'd', version: '1', revision: '0' }
const FILES = [{ buffer: Buffer.from('hello'), originalname: 'a.txt' }]

describe('CuttingPlanApiClient', () => {
  const ORIGINAL_ENV = process.env.CUTTING_PLAN_API_URL
  const ORIGINAL_FETCH = global.fetch

  beforeEach(() => {
    process.env.CUTTING_PLAN_API_URL = 'https://cutting-plan.example.run.app'
    mockGetRequestHeaders.mockResolvedValue({ Authorization: 'Bearer fake-id-token' })
    mockGetIdTokenClient.mockResolvedValue({ getRequestHeaders: mockGetRequestHeaders })
  })

  afterEach(() => {
    process.env.CUTTING_PLAN_API_URL = ORIGINAL_ENV
    global.fetch = ORIGINAL_FETCH
    jest.clearAllMocks()
  })

  it('POSTs a multipart request to the configured URL with the ID-token header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        code: 200, status: 'success', file_id: 'f1', description: 'ok',
        data: { nesting: [], order_part: [], plate_usage: [] },
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const client = new CuttingPlanApiClient()
    const result = await client.submit(FILES, FIELDS)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://cutting-plan.example.run.app')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer fake-id-token' })
    expect(init.body).toBeInstanceOf(FormData)
    expect(result.status).toBe('success')
  })

  it('maps a 400 response to BadRequestException', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400,
      json: () => Promise.resolve({ code: 400, status: 'failed', description: 'missing field' }),
    }) as unknown as typeof fetch

    const client = new CuttingPlanApiClient()
    await expect(client.submit(FILES, FIELDS)).rejects.toThrow(BadRequestException)
  })

  it('maps a 500 response to InternalServerErrorException, surfacing the external description', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({ code: 500, status: 'failed', description: 'parse error' }),
    }) as unknown as typeof fetch

    const client = new CuttingPlanApiClient()
    await expect(client.submit(FILES, FIELDS)).rejects.toThrow(InternalServerErrorException)
    await expect(client.submit(FILES, FIELDS)).rejects.toThrow('parse error')
  })

  it('throws InternalServerErrorException if CUTTING_PLAN_API_URL is not configured', async () => {
    delete process.env.CUTTING_PLAN_API_URL
    const client = new CuttingPlanApiClient()
    await expect(client.submit(FILES, FIELDS)).rejects.toThrow(InternalServerErrorException)
  })
})
