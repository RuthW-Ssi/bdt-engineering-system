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
import * as crypto from 'crypto'

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

// The report's NC File (e.g. 00009430.cld): the plate's identity across uploads (3,181 on Drive, 2026-11-09).
export function reportNcFile(text: string): string | null {
  const m = /NC File\s*:\s*([^\t\r\n]+?\.cld)/.exec(text)
  return m ? m[1].trim() : null
}

// Two exports of the same nest differ only in the Changer line (who exported it, when), so a report is
// compared without it — the same rule that sorted the legacy folders into copies and revisions (2026-11-09).
export function reportFingerprint(text: string): string {
  const body = text.split(/\r?\n/).filter(l => !l.includes('Changer')).map(l => l.trimEnd()).join('\n')
  return crypto.createHash('sha1').update(body).digest('hex')
}

// The plate's Charge as the report's Used Material table states it (header row "Article Number … Charge …",
// then a units row "m", then the plate row). Backend only: rows are named after the file whose report
// carries their Charge, because a Charge is not always the file name (CP_2024_09_0413325: file Z332-10-1.txt,
// Charge Z322-10-1; long ones wrap: "0X203-Z1-10-1 0" for 0X203-Z1-10-10). Null if the table is missing.
export function reportCharge(text: string): string | null {
  const lines = text.split(/\r?\n/)
  const h = lines.findIndex(l => l.startsWith('Article Number') && l.includes('Charge'))
  if (h < 0) return null
  const col = lines[h].split('\t').findIndex(c => c.trim() === 'Charge')
  for (const line of lines.slice(h + 1, h + 6)) {
    const cells = line.split('\t')
    if (cells.length > col && /^\d+$/.test(cells[0].trim())) return cells[col].trim() || null
  }
  return null
}
