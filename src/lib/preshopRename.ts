import type { PreshopAssembly, PreshopMergeRow } from '../api/mo'
import { finalAssembly, type MergeChoice } from './preshopMerge'

// MO Pre-shop upload — pair a renamed mark (2026-10-22): a `new` row may be
// the same piece as an absent PRE_SHOP mark in the MO, just renamed — same
// idea as the BOM-side rename. Scope cut: no % shown, no threshold — every
// absent PRE_SHOP mark is offered as `rename_candidates`, name-similar ones
// first (server order, kept as given). The user decides; default is "ไม่ใช่
// — เพิ่มเป็น mark ใหม่". 1:1 — a candidate chosen by one row is disabled in
// the others. Paired, the row is saved with `rename_from` = the old mark.

export type RenameCandidate = NonNullable<PreshopMergeRow['rename_candidates']>[number]

/** Chosen MO line per new row, keyed by the incoming (trimmed) assembly_mark;
 *  undefined = not paired ("ไม่ใช่ — เพิ่มเป็น mark ใหม่", the default). */
export type RenamePairing = Record<string, number | undefined>

/** Every MO line already claimed by some row — disabled in the others (1:1). */
export function pairedLineIds(pairing: RenamePairing): Set<number> {
  return new Set(Object.values(pairing).filter((id): id is number => id !== undefined))
}

/** The candidate a row is paired with, or undefined (not paired / not found). */
export function candidateFor(candidates: RenameCandidate[] | undefined, lineId: number | undefined): RenameCandidate | undefined {
  return lineId === undefined ? undefined : candidates?.find(c => c.line_id === lineId)
}

/** `rename_from` set/cleared on the assembly as it will be saved — the field
 *  the save DTO uses to rename that MO line in place (backend T2). */
export function withRenameFrom(a: PreshopAssembly, fromMark: string | undefined): PreshopAssembly {
  const out = { ...a }
  if (fromMark) out.rename_from = fromMark
  else delete out.rename_from
  return out
}

/** The assembly as it will be sent: the usual chosen final values (same as
 *  any mark already in the MO) plus `rename_from`, once a new row is paired. */
export function finalRenamedAssembly(incoming: PreshopAssembly, choice: MergeChoice, pairedWithMark: string | undefined): PreshopAssembly {
  return withRenameFrom(finalAssembly(incoming, choice), pairedWithMark)
}

/** A fresh dry run can drop a chosen candidate (e.g. the old mark now appears
 *  elsewhere in the batch, so it's no longer absent and the server stops
 *  offering it) — a stale pairing must never keep acting "paired": the qty
 *  cell would stay stuck on "เลือกด้านล่าง" with nothing behind it, and Save
 *  would silently drop `rename_from` and add the row as a brand-new mark
 *  instead of renaming in place. Drops any pairing whose chosen line no
 *  longer resolves against `compare`'s CURRENT `rename_candidates`, returning
 *  the cleaned pairing (same reference when nothing changed) and which marks
 *  were dropped — their `choices` should be cleared and a notice shown. */
export function reconcilePairing(pairing: RenamePairing, compare: Map<string, PreshopMergeRow>): { pairing: RenamePairing; dropped: string[] } {
  const dropped = Object.keys(pairing).filter(mark => pairing[mark] !== undefined && !candidateFor(compare.get(mark)?.rename_candidates, pairing[mark]))
  if (!dropped.length) return { pairing, dropped }
  const next = { ...pairing }
  for (const mark of dropped) delete next[mark]
  return { pairing: next, dropped }
}
