import { BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import type { PartLineInput } from './part-lines'

// Source ① (wiki features/mo-part-import-plan §4): a Tekla-style "Material
// List" — totals by profile/grade/length, no part marks. The Part List parser
// in bom-upload can't read it (it requires a part-mark column). Parsed in
// memory only; the file is never stored (D4).

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}
const findCol = (header: string[], aliases: string[]) => header.findIndex(h => aliases.includes(h))

const PROFILE = ['profile', 'section', 'size']
const GRADE = ['grade', 'material', 'mat grade']
const QTY = ['qty', 'quantity', "q'ty"]
const LENGTH = ['length(mm)', 'length (mm)', 'length', 'length_mm']
const UNIT_WEIGHT = ['net wieght(kg) for one', 'net weight(kg) for one', 'weight(kg)/1pcs.', 'unit weight']

export function parseMaterialList(buffer: Buffer): { project_number: string | null; lines: PartLineInput[]; warnings: string[] } {
  let rows: unknown[][]
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    if (!wb.SheetNames.length) throw new Error('no sheets')
    rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][]
  } catch {
    throw new BadRequestException('Material List: file is not a readable spreadsheet')
  }

  const headerIdx = rows.findIndex(r => findCol((r ?? []).map(norm), PROFILE) >= 0)
  if (headerIdx < 0) throw new BadRequestException('Material List: cannot find Profile column')
  const header = rows[headerIdx].map(norm)
  const col = { profile: findCol(header, PROFILE), grade: findCol(header, GRADE), qty: findCol(header, QTY), length: findCol(header, LENGTH), weight: findCol(header, UNIT_WEIGHT) }
  for (const [name, idx] of [['Grade', col.grade], ['Qty', col.qty], ['Length', col.length]] as const) {
    if (idx < 0) throw new BadRequestException(`Material List: cannot find ${name} column`)
  }

  let project_number: string | null = null
  for (const r of rows.slice(0, headerIdx)) {
    const i = (r ?? []).findIndex(c => norm(c).startsWith('project number'))
    if (i >= 0) {
      const v = String(r[i + 1] ?? '').trim()
      if (v) project_number = v
    }
  }

  const lines: PartLineInput[] = []
  const warnings: string[] = []
  rows.slice(headerIdx + 1).forEach((r, k) => {
    const cells = (r ?? []).map(norm)
    if (cells.every(c => c === '')) return
    if (cells.includes('total')) return
    const profile = String(r[col.profile] ?? '').trim()
    if (!profile) return
    const rowNo = headerIdx + k + 2 // 1-based sheet row
    const qty = num(r[col.qty])
    const length = num(r[col.length])
    if (!(qty > 0) || !(length > 0)) {
      warnings.push(`Row ${rowNo - headerIdx} (${profile}): missing or invalid qty/length — skipped`)
      return
    }
    const w = col.weight >= 0 ? num(r[col.weight]) : NaN
    lines.push({
      profile,
      grade: String(r[col.grade] ?? '').trim(),
      length_mm: length,
      qty,
      unit_weight_kg: Number.isFinite(w) ? w : null,
    })
  })
  return { project_number, lines, warnings }
}
