// MO History rows → a structure the History tab can lay out (2026-10-08,
// user: History must stay readable as part changes pile up). Edits are stored
// as from = to status with "<title>: item · item · …" in the formats the
// backend writes (manufacturing-orders.service.ts: newMarkLog, partText,
// applyAssemblyState, applyParts); anything unrecognised stays a plain line.

export type HistoryKind = 'status' | 'create' | 'upload' | 'bom' | 'edit' | 'parts' | 'wo' | 'other'

export interface PartRow { part_mark: string; profile: string; grade: string; length_mm: string; per_set: string; kg: string }
export interface PartChange { action: 'add' | 'remove' | 'change'; part_mark: string; part?: PartRow; changes: { field: string; from: string; to: string }[]; note?: string }
export interface MarkGroup {
  mark: string
  isNew: boolean
  values: { field: string; from?: string; to: string }[] // new mark: to only · edit: from → to
  parts: PartChange[]
}
export interface HistoryView {
  kind: HistoryKind
  title: string
  groups: MarkGroup[]
  lines: string[] // anything not tied to a mark (MO fields, warnings, reasons)
  warnings: string[]
}

const PART = /^(\S+) (\S+)(?: (\S+))? L([\d.]+) ×([\d.]+)\/ชุด ([\d.]+) kg\/ชิ้น$/
const ARROW = /^(.+?) (\S+|—) → (\S+|—)(?: \((มีผลกับ .+)\))?$/
// "เพิ่ม BUH9 (ชุด 4, Name BUILT-UP H, L 10550, W 400, …)" — sets, then each value it brings
const NEW_MARK = /^เพิ่ม (\S+) \((ชุด [^)]*)\)$/
const OLD_NEW_MARK = /^เพิ่ม (\S+) \((\d+(?:\.\d+)?)\)$/ // before 2026-10-08 detail
const BOM_NEW_MARK = /^เพิ่ม (\S+) \(ชุด ([^)]+)\) จาก BOM$/
const PART_FIELD: Record<string, string> = { profile: 'Profile', grade: 'Grade', L: 'L', kg: 'kg/ชิ้น', 'ต่อชุด': 'ต่อชุด' }
const ASM_FIELD = new Set(['ชุด', 'Name', 'L', 'W', 'H', 'kg/ชุด', 'area/ชุด', 'จำนวน', 'ชื่อ mark'])
// "<field> <old> → <new>" where a value may hold spaces (a name: "BUILT-UP H")
const ASM_ARROW = /^(ชื่อ mark|Name|ชุด|จำนวน|L|W|H|kg\/ชุด|area\/ชุด) (.+?) → (.+)$/

function parsePart(text: string): PartRow | null {
  const m = PART.exec(text)
  return m ? { part_mark: m[1], profile: m[2], grade: m[3] ?? '', length_mm: m[4], per_set: m[5], kg: m[6] } : null
}

function kindOf(from: string, to: string, title: string): HistoryKind {
  if (from !== to) return 'status'
  if (title.startsWith('สร้าง MO')) return 'create'
  if (title.startsWith('เพิ่มข้อมูลจาก')) return 'upload'
  if (title.startsWith('เทียบกับ BOM จริง')) return 'bom'
  if (title.startsWith('แก้ part')) return 'parts'
  if (title.startsWith('แก้ไข MO') || title.startsWith('แก้วันที่จริง')) return 'edit'
  return 'other'
}

export function historyView(h: { from_status: string; to_status: string; reason: string | null }): HistoryView {
  const reason = h.reason ?? ''
  if (h.from_status !== h.to_status) {
    return { kind: 'status', title: `${h.from_status} → ${h.to_status}`, groups: [], lines: reason ? [reason] : [], warnings: [] }
  }
  // "สร้าง WO-IN-26000009 (Operation 000 · 1 mark: BUH1-3 ×2)" — one line, its ':' is inside
  if (/^สร้าง WO-/.test(reason)) return { kind: 'wo', title: reason, groups: [], lines: [], warnings: [] }
  const i = reason.indexOf(': ')
  const title = i < 0 ? reason || 'แก้ไข' : reason.slice(0, i)
  const items = i < 0 ? [] : reason.slice(i + 2).split(' · ').filter(Boolean)
  const kind = kindOf(h.from_status, h.to_status, title)
  // "แก้ part BUH1-3: …" — items carry no mark, the title does
  const titleMark = kind === 'parts' ? title.slice('แก้ part '.length).trim() : null

  const groups = new Map<string, MarkGroup>()
  const group = (mark: string, isNew = false) => {
    let g = groups.get(mark)
    if (!g) groups.set(mark, (g = { mark, isNew, values: [], parts: [] }))
    if (isNew) g.isNew = true
    return g
  }
  const lines: string[] = []
  const warnings: string[] = []

  for (const raw of items) {
    if (raw.startsWith('คำเตือนตอนอ่านไฟล์: ')) { warnings.push(raw.slice('คำเตือนตอนอ่านไฟล์: '.length)); continue }
    let m = NEW_MARK.exec(raw)
    if (m) {
      const g = group(m[1], true)
      for (const kv of m[2].split(', ')) { const sp = kv.indexOf(' '); g.values.push({ field: kv.slice(0, sp), to: kv.slice(sp + 1) }) }
      continue
    }
    m = BOM_NEW_MARK.exec(raw)
    if (m) { group(m[1], true).values.push({ field: 'ชุด', to: m[2] }); continue }
    m = OLD_NEW_MARK.exec(raw)
    if (m) { group(m[1], true).values.push({ field: 'ชุด', to: m[2] }); continue }

    // "<mark> <rest>" for upload / create items, "<rest>" for a parts edit
    let mark = titleMark
    let rest = raw
    if (!mark) {
      const sp = raw.indexOf(' ')
      const head = sp < 0 ? '' : raw.slice(0, sp)
      if (head && (groups.has(head) || /^(part|เพิ่ม|ลบ|ชุด|L|kg\/ชุด|ซ้ำ)(?=\s)/.test(raw.slice(sp + 1)) || raw.slice(sp + 1).includes(' → '))) {
        mark = head; rest = raw.slice(sp + 1)
      }
    }
    if (!mark || kind === 'edit' || kind === 'wo') { lines.push(raw); continue }
    const g = group(mark)

    if (rest.startsWith('part ')) { const p = parsePart(rest.slice(5)); if (p) { g.parts.push({ action: 'add', part_mark: p.part_mark, part: p, changes: [] }); continue } }
    if (rest.startsWith('เพิ่ม ')) {
      const p = parsePart(rest.slice(6))
      g.parts.push(p ? { action: 'add', part_mark: p.part_mark, part: p, changes: [] } : { action: 'add', part_mark: rest.slice(6).split(' ')[0], changes: [] })
      continue
    }
    if (rest.startsWith('ลบ ')) { g.parts.push({ action: 'remove', part_mark: rest.slice(3).trim(), changes: [] }); continue }
    const av = ASM_ARROW.exec(rest)
    if (av) { g.values.push({ field: av[1] === 'จำนวน' ? 'ชุด' : av[1], from: av[2], to: av[3] }); continue }
    const a = ARROW.exec(rest)
    if (a) {
      const [, left, from, to, note] = a
      if (ASM_FIELD.has(left) || left === 'ซ้ำ จำนวน') { g.values.push({ field: left === 'ซ้ำ จำนวน' || left === 'จำนวน' ? 'ชุด' : left, from, to }); continue }
      const sp = left.indexOf(' ')
      if (sp > 0) {
        const pm = left.slice(0, sp)
        const field = PART_FIELD[left.slice(sp + 1)] ?? left.slice(sp + 1)
        let pc = g.parts.find(x => x.part_mark === pm && x.action === 'change')
        if (!pc) g.parts.push((pc = { action: 'change', part_mark: pm, changes: [] }))
        pc.changes.push({ field, from, to })
        if (note) pc.note = note
        continue
      }
    }
    lines.push(raw)
  }
  return { kind, title, groups: [...groups.values()], lines, warnings }
}

/** Text a search box matches against: title, marks, parts, lines. */
export function historySearchText(v: HistoryView): string {
  return [v.title, ...v.lines, ...v.warnings, ...v.groups.flatMap(g => [g.mark, ...g.parts.map(p => p.part_mark)])].join(' ').toLowerCase()
}
