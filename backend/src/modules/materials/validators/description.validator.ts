// BDT Custom: UPPERCASE English only, 2 parts separated by space
// Part 1 = main name, Part 2 = spec/dimensions
// Validates: no Thai chars, all caps, contains at least 2 tokens

export function validateDescription(value: string): { ok: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { ok: false, error: 'description_sale is required' }
  }

  // No Thai characters
  if (/[ก-๙]/.test(value)) {
    return { ok: false, error: 'INVALID_DESCRIPTION_FORMAT: Thai characters are not allowed' }
  }

  // Must be uppercase (allow digits, spaces, =, /, -, +, ., #)
  const allowedLower = value.replace(/[^A-Za-z]/g, '')
  if (allowedLower !== allowedLower.toUpperCase()) {
    return { ok: false, error: 'INVALID_DESCRIPTION_FORMAT: Must be UPPERCASE English' }
  }

  // Must have at least 2 space-separated tokens
  const tokens = value.trim().split(/\s+/)
  if (tokens.length < 2) {
    return {
      ok: false,
      error: 'INVALID_DESCRIPTION_FORMAT: Must have 2 parts — <Main Name> <Spec/Dimensions>',
    }
  }

  return { ok: true }
}
