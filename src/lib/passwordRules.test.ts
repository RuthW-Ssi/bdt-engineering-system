import { describe, it, expect } from 'vitest'
import { passwordFormError } from './passwordRules'

describe('passwordFormError', () => {
  it('is empty (not an error message) while any field is blank', () => {
    expect(passwordFormError({ current: '', next: 'New-pass-22', confirm: 'New-pass-22' })).toBe('')
  })
  it('requires at least 8 characters', () => {
    expect(passwordFormError({ current: 'old', next: 'short', confirm: 'short' })).toMatch(/at least 8/)
  })
  it('rejects reusing the current password', () => {
    expect(passwordFormError({ current: 'Same-pass-1', next: 'Same-pass-1', confirm: 'Same-pass-1' })).toMatch(/different/)
  })
  it('requires the confirmation to match', () => {
    expect(passwordFormError({ current: 'old', next: 'New-pass-22', confirm: 'New-pass-23' })).toMatch(/do not match/)
  })
  it('passes a valid form', () => {
    expect(passwordFormError({ current: 'old', next: 'New-pass-22', confirm: 'New-pass-22' })).toBeNull()
  })
})
