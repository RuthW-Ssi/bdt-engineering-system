// Client-side checks for the Change password dialog (2026-09-29). The
// backend enforces the same rules (auth/dto/change-password.dto.ts +
// AuthService.changePassword); this only gives instant feedback.
export const MIN_PASSWORD_LENGTH = 8

export interface PasswordForm { current: string; next: string; confirm: string }

// null = OK to submit; otherwise the message to show under the fields.
// Empty fields return '' — the Save button is just disabled, no nagging text.
export function passwordFormError(f: PasswordForm): string | null {
  if (!f.current || !f.next || !f.confirm) return ''
  if (f.next.length < MIN_PASSWORD_LENGTH) return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`
  if (f.next === f.current) return 'New password must be different from the current password'
  if (f.next !== f.confirm) return 'New passwords do not match'
  return null
}
