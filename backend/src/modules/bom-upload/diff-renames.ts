import type { AssemblyDiffItem, DiffRow, JunctionDiffItem, PartDiffItem } from './dto/diff.dto'

// A confirmed rename (2026-10-21) reads as ONE row "เปลี่ยนชื่อ X → Y", not
// removed X + added Y: the previous version is compared under the new names.
export interface DiffRename { id: number; kind: string; from_mark: string; to_mark: string }

export function renamePrev(prev: { assemblies: AssemblyDiffItem[]; parts: PartDiffItem[]; junctions: JunctionDiffItem[] }, renames: DiffRename[]) {
  const asm = new Map(renames.filter(r => r.kind === 'ASSEMBLY').map(r => [r.from_mark, r.to_mark]))
  const part = new Map(renames.filter(r => r.kind === 'PART').map(r => [r.from_mark, r.to_mark]))
  return {
    assemblies: prev.assemblies.map(a => (asm.has(a.assembly_mark) ? { ...a, assembly_mark: asm.get(a.assembly_mark)! } : a)),
    parts: prev.parts.map(p => (part.has(p.part_mark) ? { ...p, part_mark: part.get(p.part_mark)! } : p)),
    junctions: prev.junctions.map(j => ({ ...j, assembly_mark: asm.get(j.assembly_mark) ?? j.assembly_mark, part_mark: part.get(j.part_mark) ?? j.part_mark })),
  }
}

export function tagRenamed<T>(rows: DiffRow<T>[], keyOf: (x: T) => string, renames: DiffRename[], kind: 'ASSEMBLY' | 'PART'): DiffRow<T>[] {
  const byTo = new Map(renames.filter(r => r.kind === kind).map(r => [r.to_mark, r]))
  return rows.map(r => {
    const hit = r.prev && r.curr ? byTo.get(keyOf(r.curr)) : undefined
    return hit ? { ...r, renamed_from: hit.from_mark, rename_id: hit.id } : r
  })
}
