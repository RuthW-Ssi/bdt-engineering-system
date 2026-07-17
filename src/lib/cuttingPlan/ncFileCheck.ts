// Client-side copy of the Cutting Plan API's known multi-plate detection
// heuristic — an early, client-only hint before the file even reaches the
// backend. Duplicated intentionally at
// backend/src/modules/cutting-plan/cutting-plan-nc-file-check.ts — no shared
// code mechanism exists between this frontend and the NestJS backend
// (separate package.json/toolchains). Keep both copies in sync.
//
// Every normal single-plate report contains the literal string "NC File"
// TWICE (summary block + detail block) — count DISTINCT NC-file tokens, not
// raw occurrences, or every happy-path file false-positives.
const NC_FILE_PATTERN = /NC File\s*:\s*([^\t\r\n]+?\.cld)/g

export function countDistinctPlates(text: string): number {
  const tokens = new Set<string>()
  for (const match of text.matchAll(NC_FILE_PATTERN)) {
    tokens.add(match[1].trim())
  }
  return tokens.size
}

export function isLikelyMultiPlate(text: string): boolean {
  return countDistinctPlates(text) > 1
}
