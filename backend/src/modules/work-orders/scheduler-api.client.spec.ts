import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common'

const mockGetRequestHeaders = jest.fn()
const mockGetIdTokenClient = jest.fn()

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getIdTokenClient: mockGetIdTokenClient,
  })),
}))

import { ScheduleRunRequest, SchedulerApiClient } from './scheduler-api.client'

const URL_ = 'https://prod-scheduler.example.run.app'
const REQ: ScheduleRunRequest = {
  direction: 'backward',
  dispatch_rule: 'EDD',
  activate: false,
  persist: true,
  now: '2026-10-03T08:30:00+07:00',
  requested_by: 'admin',
}
const RESULT = {
  direction: 'backward',
  dispatch_rule: 'EDD',
  kpi: { work_orders: 125, late_vs_due: 3 },
  line_load_min: { '7': 480 },
  version_id: 2,
  version_code: 'BACKWARD-V1',
  is_active: true,
  requested_by: 'admin',
}

function respond(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError('bad json')) : Promise.resolve(body)),
  }) as unknown as typeof fetch
}

describe('SchedulerApiClient', () => {
  const ORIGINAL_ENV = process.env.SCHEDULER_API_URL
  const ORIGINAL_FETCH = global.fetch

  beforeEach(() => {
    process.env.SCHEDULER_API_URL = URL_
    mockGetRequestHeaders.mockImplementation(() => Promise.resolve(new Headers({ Authorization: 'Bearer fake-id-token' })))
    mockGetIdTokenClient.mockResolvedValue({ getRequestHeaders: mockGetRequestHeaders })
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.SCHEDULER_API_URL
    else process.env.SCHEDULER_API_URL = ORIGINAL_ENV
    global.fetch = ORIGINAL_FETCH
    jest.clearAllMocks()
  })

  // Silence the client's server-side error logs for unexpected statuses.
  const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  afterAll(() => errorSpy.mockRestore())

  it('POSTs JSON to <url>/schedule with the ID-token header and a 60s timeout signal', async () => {
    const fetchMock = respond(200, RESULT)
    global.fetch = fetchMock

    const result = await new SchedulerApiClient().run(REQ)

    expect(mockGetIdTokenClient).toHaveBeenCalledWith(URL_)
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0]
    expect(url).toBe(`${URL_}/schedule`)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Authorization')).toBe('Bearer fake-id-token')
    expect(init.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(REQ)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual(RESULT)
  })

  it('caches the ID-token client across calls', async () => {
    global.fetch = respond(200, RESULT)
    const client = new SchedulerApiClient()
    await client.run(REQ)
    await client.run(REQ)
    expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1)
    expect(mockGetRequestHeaders).toHaveBeenCalledTimes(2)
  })

  it('maps 409 run_in_progress to ConflictException with the service message', async () => {
    global.fetch = respond(409, { code: 'run_in_progress', message: 'a scheduler run is already in progress' })
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictException)
    expect(err.message).toBe('a scheduler run is already in progress')
  })

  it('maps 422 data_not_ready to UnprocessableEntityException carrying message + reasons', async () => {
    global.fetch = respond(422, {
      code: 'data_not_ready',
      message: 'scheduler input data is not ready',
      reasons: ['work center WC-PAINT has no active lines (12 work orders)'],
    })
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(UnprocessableEntityException)
    expect(err.getResponse()).toEqual({
      message: 'scheduler input data is not ready',
      reasons: ['work center WC-PAINT has no active lines (12 work orders)'],
    })
  })

  it('maps any other 422 (request validation) to BadRequestException without forwarding the body', async () => {
    global.fetch = respond(422, { detail: [{ loc: ['body', 'direction'], msg: 'secret detail' }] })
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(BadRequestException)
    expect(JSON.stringify(err.getResponse())).not.toContain('secret detail')
  })

  it.each([401, 403])('maps a Cloud Run IAM %i (our misconfiguration) to a generic 500, not 400', async (status) => {
    global.fetch = respond(status, undefined)
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(InternalServerErrorException)
    expect(err.message).toBe('Scheduler failed')
  })

  it('maps 500 to a generic InternalServerErrorException and hides the Python body', async () => {
    global.fetch = respond(500, { code: 'internal', message: 'relation "prod_schedule" does not exist' })
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(InternalServerErrorException)
    expect(err.message).toBe('Scheduler failed')
    expect(JSON.stringify(err.getResponse())).not.toContain('prod_schedule')
  })

  it('maps a 200 with an unparseable body to InternalServerErrorException', async () => {
    global.fetch = respond(200, undefined)
    await expect(new SchedulerApiClient().run(REQ)).rejects.toThrow(InternalServerErrorException)
  })

  it('maps a timeout (AbortSignal.timeout → TimeoutError) to GatewayTimeoutException', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) as unknown as typeof fetch
    await expect(new SchedulerApiClient().run(REQ)).rejects.toThrow(GatewayTimeoutException)
  })

  it('maps a network failure to a generic InternalServerErrorException', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(InternalServerErrorException)
    expect(err.message).toBe('Scheduler failed')
  })

  it('maps an ID-token failure (getRequestHeaders rejects) to a generic 500 without calling fetch', async () => {
    mockGetRequestHeaders.mockRejectedValue(new Error('Could not load the default credentials'))
    global.fetch = respond(200, RESULT)
    const err = await new SchedulerApiClient().run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(InternalServerErrorException)
    expect(err.message).toBe('Scheduler failed')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('maps a getIdTokenClient failure to a generic 500 and does not cache the rejection', async () => {
    mockGetIdTokenClient.mockRejectedValueOnce(new Error('Cannot fetch ID token in this environment'))
    global.fetch = respond(200, RESULT)
    const client = new SchedulerApiClient()

    const err = await client.run(REQ).catch((e) => e)
    expect(err).toBeInstanceOf(InternalServerErrorException)
    expect(err.message).toBe('Scheduler failed')

    await expect(client.run(REQ)).resolves.toEqual(RESULT)
    expect(mockGetIdTokenClient).toHaveBeenCalledTimes(2)
  })

  it('throws InternalServerErrorException when SCHEDULER_API_URL is not configured', async () => {
    delete process.env.SCHEDULER_API_URL
    global.fetch = respond(200, RESULT)
    await expect(new SchedulerApiClient().run(REQ)).rejects.toThrow('Scheduler service is not configured')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
