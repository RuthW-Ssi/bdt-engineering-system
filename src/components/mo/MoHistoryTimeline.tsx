import { useMemo, useState } from 'react'
import { AlertTriangle, GitCompare, ChevronDown, ChevronRight, FilePlus2, Flag, Hammer, Layers, Pencil, Search, Sparkles } from 'lucide-react'
import type { MoHistoryEntry } from '../../api/mo'
import { historySearchText, historyView, type HistoryKind, type HistoryView, type MarkGroup, type PartChange } from '../../lib/moHistory'

// MO History, redesigned 2026-10-08 (user: "ยิ่งข้อมูลยิ่งเยอะ … การเปลี่ยนของ part
// เริ่มดูยาก"). One card per entry: type badge, title, who / when; changes
// grouped by assembly mark — assembly values as old → new chips, parts as a
// small table with add / remove / change badges. Long entries fold after 3
// marks. Filter by type and search by mark / part on top.

const KIND: Record<HistoryKind, { label: string; bg: string; fg: string; icon: typeof Flag }> = {
  status: { label: 'สถานะ', bg: '#FCEBEB', fg: '#C8202A', icon: Flag },
  create: { label: 'สร้าง', bg: '#EAF3DE', fg: '#27500A', icon: Sparkles },
  upload: { label: 'อัปโหลดไฟล์', bg: '#E6F1FB', fg: '#0C447C', icon: FilePlus2 },
  bom: { label: 'เทียบ BOM จริง', bg: '#E6F1FB', fg: '#0C447C', icon: GitCompare },
  edit: { label: 'แก้ไข MO', bg: '#FAEEDA', fg: '#854F0B', icon: Pencil },
  parts: { label: 'แก้ part', bg: '#FAEEDA', fg: '#854F0B', icon: Layers },
  wo: { label: 'Work Order', bg: '#F0F0F0', fg: '#3A3A3A', icon: Hammer },
  other: { label: 'อื่น ๆ', bg: '#F0F0F0', fg: '#555', icon: Pencil },
}
const FILTERS: { key: 'all' | HistoryKind; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' }, { key: 'upload', label: 'อัปโหลดไฟล์' }, { key: 'bom', label: 'เทียบ BOM จริง' }, { key: 'parts', label: 'แก้ part' },
  { key: 'edit', label: 'แก้ไข MO' }, { key: 'status', label: 'สถานะ' }, { key: 'wo', label: 'Work Order' },
]

function fmtWhen(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Change({ from, to }: { from?: string; to: string }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {from !== undefined && <><span style={{ color: '#C8202A', textDecoration: 'line-through' }}>{from}</span><span style={{ color: '#999', margin: '0 4px' }}>→</span></>}
      <span style={{ color: '#27500A', fontWeight: 700 }}>{to}</span>
    </span>
  )
}

const ACTION = {
  add: { text: 'เพิ่ม', bg: '#EAF3DE', fg: '#27500A' },
  remove: { text: 'ลบ', bg: '#FCEBEB', fg: '#C8202A' },
  change: { text: 'แก้', bg: '#FAEEDA', fg: '#854F0B' },
}

function PartsTable({ parts }: { parts: PartChange[] }) {
  const td: React.CSSProperties = { padding: '5px 8px', borderTop: '1px solid #F0F0F0', fontSize: 12.5, verticalAlign: 'top' }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
      <thead>
        <tr style={{ fontSize: 10.5, color: '#999', textTransform: 'uppercase', textAlign: 'left' }}>
          <th style={{ padding: '3px 8px', width: 56 }} /><th style={{ padding: '3px 8px' }}>Part</th><th style={{ padding: '3px 8px' }}>รายละเอียด</th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p, i) => {
          const a = ACTION[p.action]
          return (
            <tr key={i}>
              <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: a.bg, color: a.fg }}>{a.text}</span></td>
              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap', textDecoration: p.action === 'remove' ? 'line-through' : undefined, color: p.action === 'remove' ? '#999' : '#1F1F1F' }}>{p.part_mark}</td>
              <td style={td}>
                {p.part && (
                  <span style={{ color: '#444' }}>
                    {p.part.profile}{p.part.grade && ` · ${p.part.grade}`} · L {p.part.length_mm} · <b>×{p.part.per_set}/ชุด</b> · {p.part.kg} kg/ชิ้น
                  </span>
                )}
                {p.changes.length > 0 && (
                  <span className="flex" style={{ gap: 12, flexWrap: 'wrap' }}>
                    {p.changes.map((c, k) => <span key={k}><span style={{ color: '#666' }}>{c.field} </span><Change from={c.from} to={c.to} /></span>)}
                  </span>
                )}
                {p.note && <div className="text-molten-600" style={{ fontSize: 11.5, marginTop: 2 }}>⚠ {p.note}</div>}
                {p.action === 'remove' && <span style={{ color: '#999' }}>เอาออกจาก assembly นี้</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MarkBox({ g }: { g: MarkGroup }) {
  return (
    <div style={{ border: '1px solid #EEE', borderRadius: 8, padding: '8px 10px', background: '#FCFCFC' }}>
      <div className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13.5, color: '#1F1F1F' }}>{g.mark}</span>
        {g.isNew && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: '#EAF3DE', color: '#27500A' }}>assembly ใหม่</span>}
        {g.values.map((v, i) => (
          <span key={i} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: '#fff', border: '1px solid #E0E0E0' }}>
            <span style={{ color: '#666' }}>{v.field} </span><Change from={v.from} to={v.to} />
          </span>
        ))}
        {g.parts.length > 0 && <span style={{ fontSize: 11.5, color: '#888' }}>· part {g.parts.length} รายการ</span>}
      </div>
      {g.parts.length > 0 && <PartsTable parts={g.parts} />}
    </div>
  )
}

export interface HistoryBadge { label: string; bg: string; fg: string; icon: typeof Flag }
type CardBody = Pick<HistoryView, 'lines' | 'groups' | 'warnings'>

/** One History card — shared by MO and WO History (2026-10-09). */
export function HistoryCard({ badge, title, who, when, v }: { badge: HistoryBadge; title: string; who: string; when: string; v: CardBody }) {
  const [all, setAll] = useState(false)
  const Icon = badge.icon
  const shown = all ? v.groups : v.groups.slice(0, 3)
  return (
    <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: '10px 14px 12px' }}>
      <div className="flex items-start" style={{ gap: 10 }}>
        <span className="flex items-center" style={{ gap: 5, flexShrink: 0, fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.fg }}>
          <Icon size={12} /> {badge.label}
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#1F1F1F', lineHeight: 1.4 }}>{title}</div>
        <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 11.5, color: '#888', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, color: '#555' }}>{who}</div>
          <div>{fmtWhen(when)}</div>
        </div>
      </div>
      {(v.lines.length > 0 || v.groups.length > 0 || v.warnings.length > 0) && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {v.lines.map((l, i) => {
            const m = /^(.+?) (\S+|—) → (\S+|—)$/.exec(l)
            return <div key={i} style={{ fontSize: 12.5, color: '#444' }}>{m ? <><span style={{ color: '#666' }}>{m[1]} </span><Change from={m[2]} to={m[3]} /></> : l}</div>
          })}
          {shown.map(g => <MarkBox key={g.mark} g={g} />)}
          {v.groups.length > 3 && (
            <button type="button" onClick={() => setAll(x => !x)} className="flex items-center"
              style={{ alignSelf: 'flex-start', gap: 4, fontSize: 12, fontWeight: 600, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {all ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {all ? 'ย่อ' : `ดูเพิ่มอีก ${v.groups.length - 3} mark`}
            </button>
          )}
          {v.warnings.map((w, i) => (
            <div key={i} className="flex items-start bg-molten-50 text-molten-600" style={{ gap: 6, fontSize: 12, padding: '5px 8px', borderRadius: 6 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} /> คำเตือนตอนอ่านไฟล์: {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface HistoryItem<K extends string> { key: number | string; kind: K; title: string; who: string; when: string; v: CardBody }

/** Filter chips by type + search by mark / part, then the cards newest first — shared by MO and WO History. */
export function HistoryList<K extends string>({ items, kinds, filters }: {
  items: HistoryItem<K>[] // newest first
  kinds: Record<K, HistoryBadge>
  filters: { key: 'all' | K; label: string }[]
}) {
  const [filter, setFilter] = useState<'all' | K>('all')
  const [q, setQ] = useState('')
  const counts = useMemo(() => items.reduce<Record<string, number>>((c, x) => ({ ...c, [x.kind]: (c[x.kind] ?? 0) + 1 }), {}), [items])
  const needle = q.trim().toLowerCase()
  const shown = items.filter(x => (filter === 'all' || x.kind === filter)
    && (!needle || historySearchText({ kind: 'other', title: x.title, ...x.v }).includes(needle)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
        {filters.filter(f => f.key === 'all' || counts[f.key]).map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{ padding: '5px 11px', fontSize: 12.5, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${filter === f.key ? '#C8202A' : '#D4D4D4'}`, background: filter === f.key ? '#FCEBEB' : '#fff', color: filter === f.key ? '#C8202A' : '#555' }}>
            {f.label} <span style={{ opacity: 0.7 }}>{f.key === 'all' ? items.length : counts[f.key]}</span>
          </button>
        ))}
        <div className="flex items-center" style={{ marginLeft: 'auto', gap: 6, border: '1px solid #D4D4D4', borderRadius: 8, padding: '4px 10px', background: '#fff' }}>
          <Search size={14} style={{ color: '#999' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา mark / part" style={{ border: 'none', outline: 'none', fontSize: 13, width: 170 }} />
        </div>
      </div>
      {shown.length === 0 && <div style={{ color: '#8E8E8E', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>ไม่พบรายการ</div>}
      {shown.map(x => <HistoryCard key={x.key} badge={kinds[x.kind]} title={x.title} who={x.who} when={x.when} v={x.v} />)}
    </div>
  )
}

export function MoHistoryTimeline({ rows }: { rows: MoHistoryEntry[] }) {
  const items = useMemo(() => rows.map(h => {
    const v = historyView(h)
    return { key: h.id, kind: v.kind, title: v.title, who: h.changed_by, when: h.changed_at, v }
  }).reverse(), [rows]) // newest first
  return <HistoryList items={items} kinds={KIND} filters={FILTERS} />
}
