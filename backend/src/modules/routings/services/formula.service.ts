import { BadRequestException, Injectable } from '@nestjs/common'
import { Parser } from 'expr-eval'

// Whitelist of safe function names expr-eval exposes
const SAFE_FUNCTIONS = new Set([
  'abs', 'ceil', 'floor', 'round', 'sqrt', 'min', 'max',
  'log', 'log2', 'log10', 'exp',
])

// Patterns that must never appear in user-supplied expressions
const INJECTION_PATTERNS = [
  /process\s*\./,
  /require\s*\(/,
  /import\s*\(/,
  /__proto__/,
  /prototype/,
  /constructor/,
  /Function\s*\(/,
  /eval\s*\(/,
  /globalThis/,
  /\[.*\]/,       // property access via bracket notation
]

@Injectable()
export class FormulaService {
  private readonly parser: Parser

  constructor() {
    this.parser = new Parser({
      operators: {
        logical: false,
        comparison: false,
        assignment: false,
      },
    })
  }

  /**
   * Evaluate a formula expression with the given variable bindings.
   * Returns the numeric result (minutes, meters, kg, etc.).
   * Throws BadRequestException if expression is invalid or variables are missing.
   */
  evaluate(expression: string, variables: Record<string, number>): number {
    this.assertSafe(expression)

    let expr: ReturnType<Parser['parse']>
    try {
      expr = this.parser.parse(expression)
    } catch {
      throw new BadRequestException(`Invalid formula expression: "${expression}"`)
    }

    // Check all required variables are provided
    const needed = expr.variables()
    for (const v of needed) {
      if (!(v in variables)) {
        throw new BadRequestException(
          `Missing variable "${v}" required by formula "${expression}"`,
        )
      }
    }

    try {
      const result = expr.evaluate(variables)
      if (!isFinite(result) || isNaN(result)) {
        throw new BadRequestException(
          `Formula "${expression}" produced non-finite result`,
        )
      }
      return result
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      throw new BadRequestException(`Formula evaluation error: ${(err as Error).message}`)
    }
  }

  /**
   * Check which variables are required by a formula expression.
   */
  variables(expression: string): string[] {
    this.assertSafe(expression)
    try {
      return this.parser.parse(expression).variables()
    } catch {
      throw new BadRequestException(`Cannot parse formula: "${expression}"`)
    }
  }

  private assertSafe(expression: string): void {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(expression)) {
        throw new BadRequestException(
          `Formula contains forbidden pattern: "${expression}"`,
        )
      }
    }
    // Reject function calls that are not whitelisted
    const fnCalls = expression.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g) ?? []
    for (const call of fnCalls) {
      const name = call.replace(/\s*\($/, '')
      if (!SAFE_FUNCTIONS.has(name)) {
        throw new BadRequestException(
          `Forbidden function "${name}" in formula "${expression}"`,
        )
      }
    }
  }
}
