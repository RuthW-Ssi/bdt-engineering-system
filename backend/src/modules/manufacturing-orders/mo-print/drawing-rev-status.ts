// Stale-drawing status (2026-10-21, Task 3 of "MO/WO follow the drawing
// revision") — a pure, warn-only comparison between what a WO/mark's paper
// traveler was printed with and what the mark's drawing is at NOW. Never
// blocks Start/progress, never locks a rev to a WO — purely informational,
// same spirit as the removed date-based "Drawing updated after this WO was
// created" note it replaces (that one compared dates; this compares revs).

// One mo_print_log row, reduced to just the two fields this comparison
// needs. `drawing_revs` is the Prisma Json? column verbatim — `unknown`
// because a legacy row has it `null`, and nothing stops a malformed value
// from reaching here. Logs must be passed newest first (printed_at desc,
// id desc tie-break) — the caller guarantees ordering, not this helper.
export interface DrawingRevLogEntry {
  printed_at: Date | string
  drawing_revs: unknown
}

// One (WO, mark) pair that currently has a drawing — the service only
// builds this list for marks whose currentRevSheetsForMark() returned at
// least one sheet (Review Focus 5: no drawing at all → absent from this
// list entirely, never a row with some null/zero rev).
export interface CurrentDrawingRevItem {
  wo_id: number
  wo_code: string
  mark: string
  current_rev: number
  aliases?: string[] // former names (2026-10-21) — a log under an old name still counts
}

export interface StaleDrawingItem {
  wo_id: number
  wo_code: string
  mark: string
  printed_rev: number
  current_rev: number
}

function normalizeMark(mark: string): string {
  return mark.trim().toLowerCase()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The rev from the newest log that contains this (wo_id, mark) pair, or
// undefined when no log ever printed it (Review Focus 4: a later partial
// reprint that omitted this pair must not shadow an earlier log that did
// include it — logs are walked newest-first and the first match wins, so
// skipping a log that doesn't mention the pair falls through to older ones
// naturally). A log whose drawing_revs is null or not a plain object
// (legacy, or malformed) is skipped entirely — Review Focus 3.
//
// `marks` (2026-10-21) — the item's own current name first, then its former
// names: a log written under an old name still counts for the renamed mark,
// but within any ONE log the own name wins over an old name when both are
// present (own name checked first per log, not across logs).
function printedRevFor(logs: DrawingRevLogEntry[], woId: number, marks: string[]): number | undefined {
  const targets = marks.map(normalizeMark)
  for (const entry of logs) {
    const revs = entry.drawing_revs
    if (!isPlainObject(revs)) continue
    const woRevs = revs[String(woId)]
    if (!isPlainObject(woRevs)) continue
    const byMark = new Map(Object.entries(woRevs).filter(([, r]) => typeof r === 'number').map(([k, r]) => [normalizeMark(k), r as number]))
    for (const t of targets) if (byMark.has(t)) return byMark.get(t)
  }
  return undefined
}

// `current_rev > printed_rev` for the (wo_id, mark) pair's newest matching
// log entry; no matching log at all means "not stale" (unknown, not
// "infinitely stale") — same rule as a legacy-only history. The mark in
// the result is always `item.mark` (the WO's own current display), never
// the log's key, even though matching itself is case-insensitive.
export function staleDrawings(logs: DrawingRevLogEntry[], current: CurrentDrawingRevItem[]): StaleDrawingItem[] {
  const out: StaleDrawingItem[] = []
  for (const item of current) {
    const printedRev = printedRevFor(logs, item.wo_id, [item.mark, ...(item.aliases ?? [])])
    if (printedRev === undefined) continue
    if (item.current_rev > printedRev) {
      out.push({ wo_id: item.wo_id, wo_code: item.wo_code, mark: item.mark, printed_rev: printedRev, current_rev: item.current_rev })
    }
  }
  return out
}
