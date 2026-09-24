/**
 * Shared with `manufacturing-orders.service.ts` (getConsumeSummary, the live
 * planned-consume display) and `WorkOrderAutoCreateService.recomputeConsume`
 * (the plan-vs-actual persistence added 2026-09-17) — extracted so the same
 * formula evaluation can't drift between the two call sites.
 *
 * Safely evaluate a formula expression with known numeric variables.
 * Substitutes variable names → decimal strings, then asserts the resulting
 * string contains only digits / operators / parens before evaluating.
 */
export function evalFormulaExpr(expr: string, vars: Record<string, number>): number {
  const KNOWN = ['length', 'area', 'weight', 'thickness']
  let safe = expr
  for (const k of KNOWN) {
    safe = safe.replace(new RegExp(`\\b${k}\\b`, 'g'), String(vars[k] ?? 0))
  }
  // After substitution only numbers, operators, parentheses and whitespace are allowed
  if (!/^[\d\s+\-*/().]+$/.test(safe)) return 0
  // eslint-disable-next-line no-new-func
  return Number(new Function(`return ${safe}`)())
}
