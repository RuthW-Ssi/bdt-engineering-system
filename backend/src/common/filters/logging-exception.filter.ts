import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { Logger } from '@nestjs/common'

// Nest's own BaseExceptionFilter only calls its internal logger for
// exceptions that are NOT an HttpException instance — anything thrown as
// `new SomeHttpException(...)` (BadRequestException, NotFoundException,
// InternalServerErrorException, ...) replies to the client with a correct
// status/body but is silently skipped from stdout/stderr, even at 500.
// Confirmed 2026-08-26 via a live incident: every APS/Autodesk failure in
// ApsClientService throws `new InternalServerErrorException(...)`, so a
// real 500 reached the browser with a full diagnostic message while Cloud
// Run's logs stayed completely empty — cost hours of blind debugging
// across several deploys before this was traced to Nest core's own
// catch() branching (node_modules/@nestjs/core/exceptions/base-exception-
// filter.js), not anything in this app's code. This filter logs every 5xx
// exception unconditionally (HttpException or not) before delegating back
// to Nest's normal handling, so this class of bug can't go dark again.
@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  private readonly filterLogger = new Logger('ExceptionsHandler')

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (status >= 500) {
      const message = exception instanceof Error ? exception.message : String(exception)
      const stack = exception instanceof Error ? exception.stack : undefined
      this.filterLogger.error(message, stack)
    }
    super.catch(exception, host)
  }
}
