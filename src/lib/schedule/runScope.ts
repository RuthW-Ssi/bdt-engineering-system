import type { BoardMo, BoardWorkOrder } from '../../api/schedule'

// ▶ Run · เลือกเอง — which WOs a run is limited to. Only NOT_STARTED / RELEASED WOs are
// schedulable (backend-schedule loader.WO_STATUSES_SCHEDULABLE), so only those are offered.
const SCHEDULABLE = new Set(['NOT_STARTED', 'RELEASED'])
const FINISHED = new Set(['DONE', 'CANCELLED'])

export interface RunCandidate {
  mo: BoardMo
  wos: BoardWorkOrder[]
}

export function runCandidates(mos: BoardMo[], wos: BoardWorkOrder[]): RunCandidate[] {
  return [...mos]
    .sort((a, b) => a.mo_code.localeCompare(b.mo_code))
    .map((mo) => ({
      mo,
      wos: wos.filter((w) => w.mo_id === mo.id && SCHEDULABLE.has(w.status)).sort((a, b) => a.sequence - b.sequence || a.id - b.id),
    }))
    .filter((c) => c.wos.length > 0)
}

export function moPickState(sel: Set<number>, c: RunCandidate): 'all' | 'some' | 'none' {
  const n = c.wos.filter((w) => sel.has(w.id)).length
  return n === 0 ? 'none' : n === c.wos.length ? 'all' : 'some'
}

export function toggleMoPick(sel: Set<number>, c: RunCandidate): Set<number> {
  const next = new Set(sel)
  const all = moPickState(sel, c) === 'all'
  c.wos.forEach((w) => (all ? next.delete(w.id) : next.add(w.id)))
  return next
}

export function toggleWoPick(sel: Set<number>, id: number): Set<number> {
  const next = new Set(sel)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Picked WO id → wo_code of the nearest earlier operation of the same MO that is left out
 * of the run and not finished. The scheduler makes the picked WO wait for that op's
 * plan_finish (backend-schedule loader), so the form warns about it.
 */
export function waitsFor(sel: Set<number>, wos: BoardWorkOrder[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const w of wos) {
    if (!sel.has(w.id)) continue
    const held = wos
      .filter((o) => o.mo_id === w.mo_id && o.sequence < w.sequence && !sel.has(o.id) && !FINISHED.has(o.status))
      .sort((a, b) => b.sequence - a.sequence)[0]
    if (held) out.set(w.id, held.wo_code)
  }
  return out
}
