// BOM mark/part renamed between dispatch versions (2026-10-21, [[bom-mark-rename-plan]]).
// Pure name resolution over confirmed pairs (bom_mark_rename rows). Dispatch ids
// only grow, so walking forward/backward through them always ends.

export type RenameKind = 'ASSEMBLY' | 'PART'
export interface RenameRow { id: number; kind: string; from_mark: string; to_mark: string; dispatch_id: number }
export interface BomScope { project_id: number; zone_id: number; sub_zone_id: number | null }
/** One name a piece had, and which dispatches its rows under that name sit in
 *  (fromDispatchId inclusive, beforeDispatchId exclusive; null = open). */
export interface Alias { mark: string; fromDispatchId: number | null; beforeDispatchId: number | null }

export const scopeKey = (s: BomScope) => `${s.project_id}:${s.zone_id}:${s.sub_zone_id ?? ''}`

const ofKind = (renames: RenameRow[], kind: RenameKind) => renames.filter(r => r.kind === kind)

/** The piece's own name first, then every earlier name, nearest first.
 *  `atDispatchId` = the dispatch of the row asking. If the same name was
 *  renamed away before, older rows of that name belong to the other piece. */
export function aliasesOf(renames: RenameRow[], kind: RenameKind, mark: string, atDispatchId: number): Alias[] {
  const rows = ofKind(renames, kind)
  const leftAt = rows.filter(r => r.from_mark === mark && r.dispatch_id <= atDispatchId).map(r => r.dispatch_id)
  const own: Alias = { mark, fromDispatchId: leftAt.length ? Math.max(...leftAt) : null, beforeDispatchId: null }
  const out: Alias[] = [own]
  let name = mark
  let bound = atDispatchId + 1
  let floor = own.fromDispatchId ?? 0
  for (;;) {
    const into = rows.filter(r => r.to_mark === name && r.dispatch_id < bound && r.dispatch_id >= floor)
    if (!into.length) return out
    const r = into.reduce((a, b) => (b.dispatch_id > a.dispatch_id ? b : a))
    out.push({ mark: r.from_mark, fromDispatchId: null, beforeDispatchId: r.dispatch_id })
    name = r.from_mark
    bound = r.dispatch_id
    floor = 0
  }
}

/** Follows a row's name forward through later pairs: its current name and the pair ids used. */
export function followRenames(renames: RenameRow[], kind: RenameKind, mark: string, sinceDispatchId: number): { name: string; ids: number[] } {
  const rows = ofKind(renames, kind)
  let name = mark
  let since = sinceDispatchId
  const ids: number[] = []
  for (;;) {
    const next = rows.filter(r => r.from_mark === name && r.dispatch_id > since)
    if (!next.length) return { name, ids }
    const r = next.reduce((a, b) => (b.dispatch_id < a.dispatch_id ? b : a))
    ids.push(r.id)
    name = r.to_mark
    since = r.dispatch_id
  }
}

export const currentNameOf = (renames: RenameRow[], kind: RenameKind, mark: string, sinceDispatchId: number) =>
  followRenames(renames, kind, mark, sinceDispatchId).name

export const formerNames = (renames: RenameRow[], kind: RenameKind, mark: string, atDispatchId: number) =>
  aliasesOf(renames, kind, mark, atDispatchId).slice(1).map(a => a.mark)

export function aliasMatches(a: Alias, dispatchId: number): boolean {
  return (a.fromDispatchId == null || dispatchId >= a.fromDispatchId) && (a.beforeDispatchId == null || dispatchId < a.beforeDispatchId)
}

/** Prisma `where` fragment for rows (bom_assembly / bom_part) under any alias. */
export function aliasWhere(aliases: Alias[], field: 'assembly_mark' | 'part_mark'): Record<string, unknown> {
  const one = (a: Alias) => {
    const range = { ...(a.fromDispatchId != null ? { gte: a.fromDispatchId } : {}), ...(a.beforeDispatchId != null ? { lt: a.beforeDispatchId } : {}) }
    return { [field]: a.mark, ...(Object.keys(range).length ? { dispatch_id: range } : {}) }
  }
  return aliases.length === 1 ? one(aliases[0]) : { OR: aliases.map(one) }
}
