import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { MoDetail, MoPartChange, MoStatus, PartSource } from '../../api/mo'
import { useChangeMoStatus, useMoPartHistory } from '../../hooks/useMo'
import { usePermission } from '../../hooks/usePermission'

// MO Part detail (wiki features/mo-part-import-plan). Kept apart from the
// assembly MoDetail page: header + read-only part lines + Confirm / Cancel /
// Edit (any status except CANCELLED, round 3 R2) + change history.
// WOs for MO Part are not supported yet.

const SOURCE_LABEL: Record<PartSource, string> = {
  MATERIAL_LIST: 'Material List',
  BOM_PART_LIST: 'Part List (BOM)',
  MANUAL: 'กรอกเอง',
  DISPATCH_NOTE: 'Dispatch Note',
  NC: 'NC (.nc1)',
}
const STATUS_COLOR: Record<MoStatus, string> = {
  DRAFT: '#888', CONFIRMED: '#1F6FEB', IN_PROGRESS: '#D97706', DONE: '#15803D', CANCELLED: '#B91C1C',
}
const CELL: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #F0F0F0', fontSize: 12 }
const HEAD: React.CSSProperties = { ...CELL, fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', textAlign: 'left', background: '#FAFAFA' }
const BTN: React.CSSProperties = { padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const show = (v: unknown) => (v == null ? '—' : String(v))
// "BUH1-3 · tf: — → 25", "line BUH1-3 PL25X400 10550 · qty: 4 → 6", "เพิ่ม/ลบ …"
function describeChange(c: MoPartChange) {
  const what = c.entity === 'header' ? 'MO' : c.entity === 'mark' ? `mark ${c.key}` : `แผ่น ${c.key.split('|').filter(x => x !== '-').join(' ')}`
  if (c.field === '*') return `${c.new === 'added' ? 'เพิ่ม' : 'ลบ'} ${what}`
  return `${what} · ${c.field}: ${show(c.old)} → ${show(c.new)}`
}

export function MoPartDetail({ mo }: { mo: MoDetail }) {
  const navigate = useNavigate()
  const canWrite = usePermission('orders', 'update')
  const changeStatus = useChangeMoStatus(mo.id)
  const [busy, setBusy] = useState(false)
  const { data: history } = useMoPartHistory(mo.id)

  // Decimal columns arrive as strings.
  const lines = mo.part_lines.map(l => ({ ...l, qty: Number(l.qty), length_mm: Number(l.length_mm), w: l.unit_weight_kg == null ? null : Number(l.unit_weight_kg) }))
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  const totalKg = lines.reduce((s, l) => s + (l.w == null ? 0 : l.qty * l.w), 0)

  async function move(to: MoStatus, ask: string) {
    const reason = window.prompt(ask)
    if (!reason?.trim()) return
    setBusy(true)
    try {
      await changeStatus.mutateAsync({ to_status: to, reason: reason.trim() })
      toast.success('อัปเดตสถานะแล้ว')
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'อัปเดตสถานะไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate('/order?tab=mo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex' }}><ArrowLeft size={18} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{mo.mo_code}</h1>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FFF5F5', color: '#C8202A', border: '1px solid #F2B8B8' }}>MO Part</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: '#fff', background: STATUS_COLOR[mo.status] }}>{mo.status}</span>
        <div style={{ flex: 1 }} />
        {canWrite && mo.status !== 'CANCELLED' && (
          <button style={{ ...BTN, border: '1px solid #C8202A', background: '#fff', color: '#C8202A' }} onClick={() => navigate(`/mo/${mo.id}/edit-part`)}>แก้ไข</button>
        )}
        {canWrite && mo.status === 'DRAFT' && (
          <button disabled={busy} style={{ ...BTN, border: 'none', background: '#C8202A', color: '#fff' }} onClick={() => void move('CONFIRMED', 'เหตุผลการยืนยัน')}>ยืนยัน</button>
        )}
        {canWrite && (mo.status === 'DRAFT' || mo.status === 'CONFIRMED') && (
          <button disabled={busy} style={{ ...BTN, border: '1px solid #DDD', background: '#fff', color: '#666' }} onClick={() => void move('CANCELLED', 'เหตุผลการยกเลิก')}>ยกเลิก MO</button>
        )}
      </div>

      <div style={{ border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff', padding: 14, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 13 }}>
        <div><div style={{ fontSize: 11, color: '#999' }}>โปรเจกต์</div>{mo.project ? `${mo.project.project_code} · ${mo.project.name}` : '—'}</div>
        <div><div style={{ fontSize: 11, color: '#999' }}>Mark prefix</div>{mo.mark_prefix?.code ?? mo.primary_mark_prefix_code} · {mo.mark_prefix?.label ?? ''}</div>
        <div><div style={{ fontSize: 11, color: '#999' }}>Routing</div>{mo.routing_template.code} · {mo.routing_template.name}</div>
        <div><div style={{ fontSize: 11, color: '#999' }}>แหล่งข้อมูล</div>{mo.part_sources?.length ? mo.part_sources.map(s => SOURCE_LABEL[s] ?? s).join(', ') : '—'}{mo.source_files?.length ? <div style={{ fontSize: 11, color: '#888' }}>{mo.source_files.map(f => f.filename).join(', ')}</div> : null}</div>
      </div>

      {mo.part_marks?.length > 0 && (
        <div style={{ border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff', padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Mark ({mo.part_marks.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Mark', 'Set', 'L', 'W', 'H', 'น้ำหนัก (kg)', 'tw', 'tf'].map(h => <th key={h} style={HEAD}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {mo.part_marks.map(m => (
                <tr key={m.id}>
                  <td style={CELL}>{m.mark}</td>
                  {[m.set_qty, m.length_mm, m.width_mm, m.height_mm, m.weight_kg, m.tw_mm, m.tf_mm].map((v, k) => <td key={k} style={CELL}>{v == null ? '—' : Number(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff', padding: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...HEAD, width: 32 }}>#</th>
              <th style={HEAD}>Mark</th>
              <th style={HEAD}>Profile</th>
              <th style={HEAD}>Grade</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>ยาว (mm)</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>จำนวน</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>น้ำหนัก/ชิ้น (kg)</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>น้ำหนักรวม (kg)</th>
              <th style={HEAD}>Part mark</th>
              <th style={HEAD}>รูเจาะ</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>แนวตัด (m)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ ...CELL, color: '#999' }}>{i + 1}</td>
                <td style={CELL}>{l.mark?.mark ?? '—'}</td>
                <td style={CELL}>{l.profile}</td>
                <td style={CELL}>{l.grade}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{l.length_mm}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{l.qty}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{l.w == null ? '—' : fmt(l.w)}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{l.w == null ? '—' : fmt(l.qty * l.w)}</td>
                <td style={{ ...CELL, color: '#888' }}>{l.part_mark ?? ''}</td>
                <td style={CELL}>{(l.holes ?? []).map(h => `${h.count}×Ø${h.diameter_mm}`).join(', ')}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{l.cut_length_mm == null ? '' : (Number(l.cut_length_mm) / 1000).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#666' }}>
          <span>การออก WO สำหรับ MO Part ยังไม่รองรับ</span>
          <span>{lines.length} แถว · รวม {totalQty} ชิ้น · น้ำหนักรวม {fmt(totalKg)} kg</span>
        </div>
      </div>

      <div style={{ border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff', padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ประวัติการแก้ไข</div>
        {!history?.length ? <div style={{ fontSize: 12, color: '#999' }}>ยังไม่มี</div> : history.map(h => (
          <div key={h.id} style={{ borderTop: '1px solid #F0F0F0', padding: '6px 0', fontSize: 12 }}>
            <div style={{ color: '#666' }}>
              {new Date(h.changed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · {h.changed_by}
              {h.note && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: '#F3F4F6' }}>{h.note === 'created' ? 'สร้าง' : h.note}</span>}
            </div>
            {h.changes.map((c, k) => <div key={k} style={{ marginLeft: 10, color: '#333' }}>{describeChange(c)}</div>)}
          </div>
        ))}
      </div>
    </div>
  )
}
