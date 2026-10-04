import { isAxiosError } from 'axios'
import { getErrorMessage } from '../getErrorMessage'

/** 409 from POST /schedule/runs or /schedule/versions/:id/activate: the scheduler's advisory lock is held. */
export const RUN_IN_PROGRESS_MESSAGE = 'มีการคำนวณค้างอยู่ ลองใหม่อีกครั้ง'

/** 504: the backend gave up waiting, but prod-scheduler may still finish and save the version. */
export const SCHEDULER_TIMEOUT_HINT = 'อาจคำนวณเสร็จภายหลัง — กด Reload เพื่อตรวจสอบ'

/**
 * User-facing error of a run / activate call: 409 → RUN_IN_PROGRESS_MESSAGE,
 * 422 data_not_ready → its message + reasons[], 504 → message + SCHEDULER_TIMEOUT_HINT,
 * anything else → getErrorMessage.
 */
export function describeScheduleError(error: unknown, fallback = 'Scheduler request failed'): { message: string; reasons: string[] } {
  if (isAxiosError(error)) {
    const status = error.response?.status
    if (status === 409) return { message: RUN_IN_PROGRESS_MESSAGE, reasons: [] }
    if (status === 504) return { message: `${getErrorMessage(error, fallback)} · ${SCHEDULER_TIMEOUT_HINT}`, reasons: [] }
    if (status === 422) {
      const data = error.response?.data as { message?: unknown; reasons?: unknown } | undefined
      const reasons = Array.isArray(data?.reasons) ? data.reasons.filter((r): r is string => typeof r === 'string') : []
      return { message: typeof data?.message === 'string' ? data.message : getErrorMessage(error, fallback), reasons }
    }
  }
  return { message: getErrorMessage(error, fallback), reasons: [] }
}
