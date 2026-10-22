import type { DisappearedMarkDto, RenameCandidatesDto, RenameDataSetDto, RenameKind, RenameOptionDto, RenamePairInput } from '../../api/dispatches'
import { FIELD_LABEL } from '../../components/progress/ProgressDiffTable'

// The pairing dialog's choices (2026-10-21, [[bom-mark-rename-plan]]). Not
// picked = a new mark; pairs are 1 : 1; when both names already have data the
// user picks ONE whole set (b2) — never per stage, never summed.
export interface Choice { to: string | null; keep: 'old' | 'new' | null }
export type Selections = Record<string, Choice>

export const keyOf = (kind: RenameKind, mark: string) => `${kind}:${mark}`
export const optionsFor = (c: RenameCandidatesDto, kind: RenameKind) => (kind === 'ASSEMBLY' ? c.new_assemblies : c.new_parts)
export const needsKeep = (old: DisappearedMarkDto, target?: RenameOptionDto) => !!old.data && !!target?.data

export function takenBy(sel: Selections, kind: RenameKind, exceptKey: string): Set<string> {
  return new Set(Object.entries(sel).filter(([k, v]) => k !== exceptKey && k.startsWith(`${kind}:`) && v.to).map(([, v]) => v.to!))
}

export function buildRenamePayload(c: RenameCandidatesDto, sel: Selections): { renames: RenamePairInput[]; missingKeep: string[] } {
  const renames: RenamePairInput[] = []
  const missingKeep: string[] = []
  for (const [kind, rows] of [['ASSEMBLY', c.assemblies], ['PART', c.parts]] as const) {
    for (const d of rows) {
      const s = sel[keyOf(kind, d.mark)]
      if (!s?.to) continue
      const target = optionsFor(c, kind).find(o => o.mark === s.to)
      if (kind === 'ASSEMBLY' && needsKeep(d, target) && !s.keep) { missingKeep.push(d.mark); continue }
      renames.push({ kind, from_mark: d.mark, to_mark: s.to, ...(kind === 'ASSEMBLY' && s.keep ? { keep: s.keep } : {}) })
    }
  }
  return { renames, missingKeep }
}

export function dataSetChips(d: RenameDataSetDto | null): string[] {
  if (!d) return []
  return [
    ...d.progress.map(p => `${FIELD_LABEL[p.field] ?? p.field} ${p.value}`),
    ...d.paint.map(p => `สี ${p.paint_type} ${p.material ?? '—'} ×${p.layers}`),
  ]
}
