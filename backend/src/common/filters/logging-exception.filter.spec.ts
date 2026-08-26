import { InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { LoggingExceptionFilter } from './logging-exception.filter'

describe('LoggingExceptionFilter', () => {
  let filter: LoggingExceptionFilter
  let superCatchSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    filter = new LoggingExceptionFilter(undefined as any)
    superCatchSpy = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // The bug this filter exists to fix: Nest's own BaseExceptionFilter never
  // logs HttpException instances, so every `throw new
  // InternalServerErrorException(...)` in ApsClientService reached the
  // client with a real body but left zero trace in Cloud Run's logs.
  it('logs a 5xx HttpException (e.g. InternalServerErrorException) before delegating to the default filter', () => {
    const exception = new InternalServerErrorException('APS translate job failed (403): boom')
    const host = {} as any

    filter.catch(exception, host)

    expect(errorSpy).toHaveBeenCalledWith('APS translate job failed (403): boom', expect.any(String))
    expect(superCatchSpy).toHaveBeenCalledWith(exception, host)
  })

  it('does not log a non-5xx HttpException (e.g. NotFoundException)', () => {
    const exception = new NotFoundException('not found')
    const host = {} as any

    filter.catch(exception, host)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(superCatchSpy).toHaveBeenCalledWith(exception, host)
  })

  it('logs a non-HttpException error (treated as an unexpected 500)', () => {
    const exception = new Error('unexpected crash')
    const host = {} as any

    filter.catch(exception, host)

    expect(errorSpy).toHaveBeenCalledWith('unexpected crash', expect.any(String))
    expect(superCatchSpy).toHaveBeenCalledWith(exception, host)
  })
})
