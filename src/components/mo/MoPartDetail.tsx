import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, History } from 'lucide-react'
import { toast } from 'sonner'
import type { MoDetail, MoPartChange, MoStatus, PartSource } from '../../api/mo'
import { useChangeMoStatus, useMoPartHistory } from '../../hooks/useMo'
import { usePermission } from '../../hooks/usePermission'
import { MoStatusPill } from './MoStatusPill'
import { ui } from './PartUi'

// MO Part detail (wiki features/mo-part-import-plan). Kept apart from the
// assembly MoDetail page: header + marks + plate lines + Confirm / Cancel /
// Edit (any status except CANCELLED, round 3 R2) + change history.
// WOs for MO Part are not supported yet. Styling: tokens via PartUi.

const SOURCE_LABEL: Record<PartSource, string> = {
  MATERIAL_LIST: 'Material List',
  BOM_PART_LIST: 'Part List (BOM)',
  MANUAL: 'กรอกเอง',
  DISPATCH_NOTE: 'Dispatch Note',
  NC: 'NC (.nc1)',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const show = (v: unknown) => (v == null ? '—' : String(v))
// "mark BUH1-3 · tf_mm: — → 25", "แผ่น BUH1-3 PL25X400 … · qty: 4 → 6", "เพิ่ม/ลบ …"
function describeChange(c: MoPartChange) {
  const what = c.entity === 'header' ? 'MO' : c.entity === 'mark' ? `mark ${c.key}` : `แผ่น ${c.key.split('|').filter(x => x !== '-').join(' ')}`
  if (c.field === '*') return `${c.new === 'added' ? 'เพิ่ม' : 'ลบ'} ${what}`
  return `${what} · ${c.field}: ${show(c.old)} → ${show(c.new)}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={ui.label}>{label}</div>
      <div className="mt-0.5 text-sm text-chrome-900">{children}</div>
    </div>
  )
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
    <div className={ui.page}>
      <div className={ui.header}>
        <button className={ui.backBtn} onClick={() => navigate('/order?tab=mo')}><ArrowLeft size={18} /></button>
        <span className="font-mono text-[17px] font-bold text-chrome-900">{mo.mo_code}</span>
        <span className={ui.prefixChip}>{mo.mark_prefix?.code ?? mo.primary_mark_prefix_code}</span>
        <span className={ui.partBadge}>MO Part</span>
        <MoStatusPill status={mo.status} />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {canWrite && mo.status !== 'CANCELLED' && (
            <button className={ui.btnSecondary} onClick={() => navigate(`/mo/${mo.id}/edit-part`)}>แก้ไข</button>
          )}
          {canWrite && (mo.status === 'DRAFT' || mo.status === 'CONFIRMED') && (
            <button className={ui.btnNeutral} disabled={busy} onClick={() => void move('CANCELLED', 'เหตุผลการยกเลิก')}>ยกเลิก MO</button>
          )}
          {canWrite && mo.status === 'DRAFT' && (
            <button className={ui.btnPrimary} disabled={busy} onClick={() => void move('CONFIRMED', 'เหตุผลการยืนยัน')}>ยืนยัน</button>
          )}
        </div>
      </div>

      <div className={ui.body}>
        <section className={`${ui.panel} grid grid-cols-4 gap-4`}>
          <Field label="โปรเจกต์">{mo.project ? `${mo.project.project_code} · ${mo.project.name}` : '—'}</Field>
          <Field label="Mark prefix">{mo.mark_prefix?.code ?? mo.primary_mark_prefix_code} · {mo.mark_prefix?.label ?? ''}</Field>
          <Field label="Routing">{mo.routing_template.code} · {mo.routing_template.name}</Field>
          <Field label="แหล่งข้อมูล">
            {mo.part_sources?.length ? mo.part_sources.map(s => SOURCE_LABEL[s] ?? s).join(', ') : '—'}
            {mo.source_files?.length ? <div className="truncate text-xs text-chrome-400">{mo.source_files.map(f => f.filename).join(', ')}</div> : null}
          </Field>
        </section>

        {mo.part_marks?.length > 0 && (
          <section className={ui.panel}>
            <div className={`${ui.label} mb-2`}>Mark ({mo.part_marks.length})</div>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th className={ui.th}>Mark</th>
                  {['Set', 'L (mm)', 'W (mm)', 'H (mm)', 'น้ำหนัก (kg)', 'tw', 'tf'].map(h => <th key={h} className={ui.thRight}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {mo.part_marks.map(m => (
                  <tr key={m.id}>
                    <td className={`${ui.td} font-semibold`}>{m.mark}</td>
                    {[m.set_qty, m.length_mm, m.width_mm, m.height_mm, m.weight_kg, m.tw_mm, m.tf_mm].map((v, k) => (
                      <td key={k} className={ui.tdRight}>{v == null ? <span className="text-chrome-200">—</span> : Number(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className={ui.panel}>
          <div className={`${ui.label} mb-2`}>รายการแผ่น ({lines.length})</div>
          <div className="overflow-x-auto scroll-thin">
            <table className={ui.table}>
              <thead>
                <tr>
                  <th className={`${ui.th} w-8`}>#</th>
                  <th className={ui.th}>Mark</th>
                  <th className={ui.th}>Profile</th>
                  <th className={ui.th}>Grade</th>
                  <th className={ui.thRight}>ยาว (mm)</th>
                  <th className={ui.thRight}>จำนวน</th>
                  <th className={ui.thRight}>น้ำหนัก/ชิ้น (kg)</th>
                  <th className={ui.thRight}>น้ำหนักรวม (kg)</th>
                  <th className={ui.th}>Part mark</th>
                  <th className={ui.th}>รูเจาะ</th>
                  <th className={ui.thRight}>แนวตัด (m)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} className="hover:bg-chrome-50">
                    <td className={ui.tdMuted}>{i + 1}</td>
                    <td className={ui.td}>{l.mark?.mark ?? <span className="text-chrome-200">—</span>}</td>
                    <td className={ui.td}>{l.profile}</td>
                    <td className={ui.td}>{l.grade}</td>
                    <td className={ui.tdRight}>{l.length_mm}</td>
                    <td className={ui.tdRight}>{l.qty}</td>
                    <td className={ui.tdRight}>{l.w == null ? '—' : fmt(l.w)}</td>
                    <td className={ui.tdRight}>{l.w == null ? '—' : fmt(l.qty * l.w)}</td>
                    <td className={`${ui.tdMuted} max-w-[180px] truncate`}>{l.part_mark ?? ''}</td>
                    <td className={`${ui.td} whitespace-nowrap text-chrome-600`}>{(l.holes ?? []).map(h => `${h.count}×Ø${h.diameter_mm}`).join(', ')}</td>
                    <td className={ui.tdRight}>{l.cut_length_mm == null ? '' : (Number(l.cut_length_mm) / 1000).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-between text-xs text-chrome-600">
            <span className="text-chrome-400">การออก WO สำหรับ MO Part ยังไม่รองรับ</span>
            <span>{lines.length} แถว · รวม <strong className="text-chrome-900">{totalQty}</strong> ชิ้น · น้ำหนักรวม <strong className="text-chrome-900">{fmt(totalKg)}</strong> kg</span>
          </div>
        </section>

        <section className={ui.panel}>
          <div className={`${ui.label} mb-2 flex items-center gap-1.5`}><History size={12} /> ประวัติการแก้ไข</div>
          {!history?.length ? <div className={ui.muted}>ยังไม่มี</div> : history.map(h => (
            <div key={h.id} className="border-t border-chrome-50 py-2 text-xs first:border-t-0">
              <div className="flex items-center gap-2 text-chrome-600">
                <span>{new Date(h.changed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="font-semibold text-chrome-900">{h.changed_by}</span>
                {h.note && <span className="rounded bg-chrome-50 px-1.5 py-px text-chrome-600">{h.note === 'created' ? 'สร้าง' : h.note}</span>}
              </div>
              {h.changes.map((c, k) => <div key={k} className="ml-3 mt-0.5 text-chrome-800">{describeChange(c)}</div>)}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
