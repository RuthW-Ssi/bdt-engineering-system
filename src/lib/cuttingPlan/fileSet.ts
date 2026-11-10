// Plate uploads come as four files per plate with the same name (2026-11-06,
// Tao's Drive history of 198 uploads): .txt (nesting report, the only one the
// parser reads), .xls (same report), .pdf (printable report + nest picture),
// .dxf (CAD for the cutter). Only the .txt is required (2026-11-09: old uploads have real plates whose
// .pdf / .dxf came out empty from CutLogic); a missing .xls / .pdf / .dxf is a warning. Nothing else is allowed.
// Names are paired ignoring case and spaces — real uploads have
// "222-A4-20-1 rev1" next to "222-A4-20-1rev1", and "X190-…" next to "x190-…".
// Mirror of backend/src/modules/cutting-plan/cutting-plan-file-set.ts — keep both in step.

export const PLATE_FILE_KINDS = ['txt', 'xls', 'pdf', 'dxf'] as const
export type PlateFileKind = (typeof PLATE_FILE_KINDS)[number]

export interface PlateFileSet {
  plate: string // display name: the .txt file's base name as uploaded
  files: Partial<Record<PlateFileKind, string>> // kind → original file name
  missing: PlateFileKind[]
}

export interface PlateFileGrouping {
  plates: PlateFileSet[]
  notAllowed: string[] // wrong extension (e.g. .zip, a BOM Part List .xlsx)
  duplicates: string[] // two files of the same kind for one plate
}

const norm = (base: string) => base.toLowerCase().replace(/\s+/g, '')

function split(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.')
  return i <= 0 ? { base: name, ext: '' } : { base: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() }
}

export function groupPlateFiles(fileNames: string[]): PlateFileGrouping {
  const byKey = new Map<string, PlateFileSet>()
  const notAllowed: string[] = []
  const duplicates: string[] = []
  for (const name of fileNames) {
    const { base, ext } = split(name)
    if (!(PLATE_FILE_KINDS as readonly string[]).includes(ext)) { notAllowed.push(name); continue }
    const kind = ext as PlateFileKind
    const key = norm(base)
    const set = byKey.get(key) ?? { plate: base, files: {}, missing: [] }
    if (set.files[kind]) { duplicates.push(name); continue }
    set.files[kind] = name
    if (kind === 'txt') set.plate = base
    byKey.set(key, set)
  }
  const plates = [...byKey.values()]
    .map(s => ({ ...s, missing: PLATE_FILE_KINDS.filter(k => !s.files[k]) }))
    .sort((a, b) => a.plate.localeCompare(b.plate, undefined, { numeric: true }))
  return { plates, notAllowed, duplicates }
}

// One line per problem, in Thai for the preview; empty = the set can be saved.
export function plateFileProblems(g: PlateFileGrouping): string[] {
  const out: string[] = []
  for (const p of g.plates) if (!p.files.txt) out.push(`แผ่น ${p.plate} ไม่มีไฟล์ .txt (ทุกแผ่นต้องมี .txt)`)
  for (const n of g.notAllowed) out.push(`ไฟล์ ${n} ไม่ใช่ .txt / .xls / .pdf / .dxf`)
  for (const n of g.duplicates) out.push(`ไฟล์ ${n} ซ้ำกับไฟล์ชนิดเดียวกันของแผ่นเดียวกัน`)
  return out
}

// Plates that can be saved but miss an .xls / .pdf / .dxf (that file can't be opened later).
export function plateFileWarnings(g: PlateFileGrouping): string[] {
  return g.plates
    .filter(p => p.files.txt && p.missing.length)
    .map(p => `แผ่น ${p.plate} ไม่มี ${p.missing.map(k => '.' + k).join(', ')} (บันทึกได้ แต่เปิดไฟล์นั้นไม่ได้)`)
}
