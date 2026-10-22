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
