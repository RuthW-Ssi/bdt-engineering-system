// Detects the Cutting Plan API's known silent-data-loss bug: if one uploaded
// .txt bundles multiple plate/nest blocks (the nesting tool can export a
// batch of several plates — e.g. "1/6"..."6/6" pages — into one physical
// file), the API returns only ONE plate's data with no error/warning.
//
// Every normal single-plate report already contains the literal string
// "NC File" TWICE (once in the summary block, once in the detail block) —
// counting raw occurrences would false-positive on every happy-path file.
// Count DISTINCT NC-file tokens instead.
//
// Duplicated intentionally in the frontend at
// src/lib/cuttingPlan/ncFileCheck.ts — no shared code mechanism exists
// between this backend and the frontend (separate package.json/toolchains).
// Keep both copies in sync if this format ever changes.
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
