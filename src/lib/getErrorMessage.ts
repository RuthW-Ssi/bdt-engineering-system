import { isAxiosError } from 'axios'

/**
 * Turns any thrown error into a category-appropriate, English, user-facing
 * message. Shared across features — Login is the first consumer.
 *
 * @param error - whatever was caught (usually an AxiosError, but callers pass `unknown`)
 * @param fallback - shown when the error doesn't match any known category
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot connect to server. Please check your connection and try again.'
    }

    const backendMessage = error.response.data?.message

    if (typeof backendMessage === 'string') {
      return backendMessage
    }

    if (Array.isArray(backendMessage)) {
      return backendMessage.join(', ')
    }

    if (error.response.status >= 500) {
      return 'Server error. Please try again later.'
    }
  }

  return fallback
}
