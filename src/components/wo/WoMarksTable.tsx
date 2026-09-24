import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BomVersionStatus, WoMark } from '../../api/wo'
import { QcBreakdownFields, qcBreakdownValid, EMPTY_QC_BREAKDOWN, type QcBreakdown } from './QcBreakdownFields'

type QtyField = 'qty_not_started' | 'qty_in_progress' | 'qty_done' | 'qty_qc_passed' | 'qty_rework' | 'qty_renew'
export type MarkEdits = Record<number, Partial<Record<QtyField, string>>>

interface Props {
  // Full marks array (removed included) — the table itself scopes to
  // non-removed rows, same as the backend's own bom-version-status/done/
  // cancel endpoints only ever act on non-removed marks.
  marks: WoMark[]
  bomVersionStatus: BomVersionStatus[]
  // Local draft — nothing here is persisted until the caller (WoDetail's
  // Done button) submits it; Save/Cancel per row would be pointless busywork
  // since typing a value here never reaches the server on its own.
  edits: MarkEdits
  onEditChange: (bomAssemblyId: number, field: QtyField, value: string) => void
  canEditQty: boolean
  canModify: boolean
  onRemove: (bomAssemblyId: number, body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) => Promise<unknown>
  onAcceptVersion: (bomAssemblyId: number, body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) => Promise<unknown>
  removePending: boolean
  acceptPending: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#999', padding: '8px 10px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle' }
const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

function effectiveValue(mark: WoMark, field: QtyField, edits: MarkEdits): string {
  const edited = edits[mark.bom_assembly_id]?.[field]
  if (edited !== undefined) return edited
  const raw = mark[field]
  return raw != null ? String(raw) : ''
}

function num(v: string): number {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? n : 0
}

/** Clamps a qty field's value to [0, max] — shared with WoDetail's own
 *  clampQtyEdit (bulk-apply path), see that function's doc comment. */
export function clampQty(value: string, max: number): string {
  if (value === '') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  if (n < 0) return '0'
  return n > max ? String(max) : value
}

function dispatchLabel(d: WoMark['snapshot_dispatch']): string {
  if (!d) return ''
  return [d.project?.name, d.zone?.label, d.sub_zone?.name].filter(Boolean).join(' · ')
}

/**
 * Marks table for WoDetail's Overview tab (multi-mark redesign, 2026-09-17)
 * — replaces the old single bom_assembly + Qty Done/Scrapped fields. Follows
 * ProgressAssemblyTable.tsx's shape: checkbox multi-select + bulk-apply of
 * touched fields, accordion inline-edit, footer aggregate row.
 *
 * Quantity/Done/QC Passed/Rework/Renew (2026-09-23, was Planned/Done/
 * Scrapped/Reusable) — user: "เปลี่ยนจาก Planned เป็น quantity แล้วก็ Done
 * เอาไว้แบบเดิม เอา Scrapped Reusable เปลี่ยนเป็น Qc passed, Rework, Renew".
 * QC Passed/Rework/Renew are edited the SAME way Done always was (inline
 * pencil + bulk-apply, only while canEditQty) — they replace both the old
 * editable Scrapped column AND the old read-only Reusable display column,
 * since a disruption action (remove-mark/accept-version/cancel) now writes
 * into these same three fields instead of a separate qty_reusable.
 *
 * Not Started/In Progress (2026-09-23) — first shipped as a read-only Status
 * column mirroring the WO's own WoStatusPill, then rejected the same day
 * ("ไม่ใช่ status แบบนี้สิ เอามาเพิ่มให้เหมือน Done QC Passed Rework Renew"):
 * these are per-mark EDITABLE qty fields, same mechanism as Done/QC Passed/
 * Rework/Renew (inline pencil + bulk-apply, only while canEditQty), not a
 * shared read-only copy of the WO's status. Scoped to the Done payload only —
 * unlike the QC fields, NOT part of remove-mark/accept-version/cancel, since
 * those dispose of qty_done, not the not-yet-done remainder.
 *
 * Expand-row Confirm/Cancel (2026-09-23, user: "ต้องมีปุ่มกด cancel และ
 * confirm ด้วย" — there must be Cancel and Confirm buttons too). Originally
 * every keystroke in the expand-row inputs called onEditChange immediately
 * (no staging) — the collapsed row/footer totals updated live as you typed,
 * with no way to back out mid-edit. Now the expand-row inputs bind to a
 * LOCAL `draft` (seeded from the current effective values on open), clamped
 * to [0, qty_planned] as you type (same clampQty the bulk-apply path relies
 * on via WoDetail's onEditChange wrapper); nothing reaches the shared
 * `edits`/onEditChange — and so the collapsed row/footer totals — until
 * Confirm is clicked. Cancel (or the row's own top-right icon, which
 * discards-and-closes the same way while expanded) discards the draft
 * untouched. Bulk-apply is a separate, unaffected path — it still calls
 * onEditChange directly per selected mark.
 *
 * Confirm validates + toasts (2026-09-23, user: "หลัง confirm ต้องแสดง toast
 * ด้วยว่า success หรือ เกิด error" — after Confirm there must be a toast for
 * either success or error). The two checks mirror WorkOrdersService.done()'s
 * own server-side rules (not_started+in_progress+done ≤ qty_planned;
 * qc_passed+rework+renew ≤ qty_done) — moved earlier, to the moment a row is
 * confirmed, instead of only surfacing as a 400 at the final Complete
 * submission. A failing check toasts an error and leaves the row open/
 * unconfirmed (edits stay in the local draft, nothing reaches `edits`); a
 * passing one commits via onEditChange, closes the row, and toasts success.
 */
export function WoMarksTable({
  marks, bomVersionStatus, edits, onEditChange, canEditQty, canModify,
  onRemove, onAcceptVersion, removePending, acceptPending,
}: Props) {
  const activeMarks = useMemo(() => marks.filter(m => !m.removed_at), [marks])
  const removedCount = marks.length - activeMarks.length
  const bomByAssembly = useMemo(() => new Map(bomVersionStatus.map(b => [b.bom_assembly_id, b])), [bomVersionStatus])
  const canRemoveAny = canModify && activeMarks.length > 1

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<Record<QtyField, string>>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDraft, setBulkDraft] = useState<Partial<Record<QtyField, string>>>({})
  const [bulkTouched, setBulkTouched] = useState<Set<QtyField>>(new Set())
  const [removeTarget, setRemoveTarget] = useState<WoMark | null>(null)
  const [acceptTarget, setAcceptTarget] = useState<{ mark: WoMark; bom: BomVersionStatus } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Checking ANY box closes whatever per-row edit panel is open (2026-09-23,
  // user: "ไม่ว่าจะกดcheck box assembly ไหนก็ตาม ฟอร์มตรงที่กรอก progress
  // รายชิ้นที่เปิดอยู่ต้องปิดและไปกรอก ด้านบนที่เป็นการ apply all อย่างเดียว" —
  // selecting for bulk-apply and individually editing a row are mutually
  // exclusive; mixing them left a row's edit panel open showing stale values
  // while its mark was also checked for the bulk toolbar). cancelEdit() is a
  // harmless no-op when nothing is expanded.
  const toggleSelected = (id: number) => {
    cancelEdit()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allSelected = activeMarks.length > 0 && activeMarks.every(m => selected.has(m.bom_assembly_id))
  const toggleSelectAll = () => {
    cancelEdit()
    setSelected(allSelected ? new Set() : new Set(activeMarks.map(m => m.bom_assembly_id)))
  }

  const setBulkField = (field: QtyField, value: string) => {
    setBulkDraft(d => ({ ...d, [field]: value }))
    setBulkTouched(t => new Set(t).add(field))
  }
  const clearBulk = () => { setSelected(new Set()); setBulkDraft({}); setBulkTouched(new Set()) }
  const applyBulk = () => {
    if (!bulkTouched.size || !selected.size) return
    for (const id of selected) {
      for (const field of bulkTouched) onEditChange(id, field, bulkDraft[field] ?? '')
    }
    clearBulk()
  }

  function openEdit(m: WoMark) {
    setExpandedId(m.id)
    setDraft({
      qty_not_started: effectiveValue(m, 'qty_not_started', edits),
      qty_in_progress: effectiveValue(m, 'qty_in_progress', edits),
      qty_done: effectiveValue(m, 'qty_done', edits),
      qty_qc_passed: effectiveValue(m, 'qty_qc_passed', edits),
      qty_rework: effectiveValue(m, 'qty_rework', edits),
      qty_renew: effectiveValue(m, 'qty_renew', edits),
    })
  }
  const cancelEdit = () => { setExpandedId(null); setDraft({}) }
  function confirmEdit(m: WoMark) {
    const notStarted = num(draft.qty_not_started ?? '')
    const inProgress = num(draft.qty_in_progress ?? '')
    const done = num(draft.qty_done ?? '')
    const qcPassed = num(draft.qty_qc_passed ?? '')
    const rework = num(draft.qty_rework ?? '')
    const renew = num(draft.qty_renew ?? '')
    const planned = Number(m.qty_planned)

    if (notStarted + inProgress + done > planned) {
      toast.error(`Not Started + In Progress + Done exceeds Quantity (${planned}) for ${m.bom_assembly.assembly_mark}`)
      return
    }
    if (qcPassed + rework + renew > done) {
      toast.error(`QC Passed + Rework + Renew exceeds Qty Done (${done}) for ${m.bom_assembly.assembly_mark}`)
      return
    }

    for (const field of Object.keys(draft) as QtyField[]) onEditChange(m.bom_assembly_id, field, draft[field] ?? '')
    setExpandedId(null)
    setDraft({})
    toast.success(`${m.bom_assembly.assembly_mark} updated`)
  }
  const setDraftField = (m: WoMark, field: QtyField, value: string) =>
    setDraft(d => ({ ...d, [field]: clampQty(value, Number(m.qty_planned)) }))

  const totalPlanned = activeMarks.reduce((s, m) => s + Number(m.qty_planned), 0)
  const totalNotStarted = activeMarks.reduce((s, m) => s + num(effectiveValue(m, 'qty_not_started', edits)), 0)
  const totalInProgress = activeMarks.reduce((s, m) => s + num(effectiveValue(m, 'qty_in_progress', edits)), 0)
  const totalDone = activeMarks.reduce((s, m) => s + num(effectiveValue(m, 'qty_done', edits)), 0)
  const totalQcPassed = activeMarks.reduce((s, m) => s + num(effectiveValue(m, 'qty_qc_passed', edits)), 0)
  const totalRework = activeMarks.reduce((s, m) => s + num(effectiveValue(m, 'qty_rework', edits)), 0)
  const totalRenew = activeMarks.reduce((s, m) => s + num(effectiveValue(m, 'qty_renew', edits)), 0)
  const outdatedCount = activeMarks.filter(m => bomByAssembly.get(m.bom_assembly_id)?.is_outdated).length

  async function handleRemoveSubmit(body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) {
    if (!removeTarget) return
    setActionError(null)
    try {
      await onRemove(removeTarget.bom_assembly_id, body)
      setRemoveTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove mark.')
    }
  }

  async function handleAcceptSubmit(body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) {
    if (!acceptTarget) return
    setActionError(null)
    try {
      await onAcceptVersion(acceptTarget.mark.bom_assembly_id, body)
      setAcceptTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept the new version.')
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: 10, overflow: 'hidden' }}>
      {actionError && (
        <div style={{ background: '#FCEBEB', color: '#C8202A', fontSize: 12, padding: '8px 12px', borderBottom: '1px solid #F3C6C6' }}>{actionError}</div>
      )}

      {selected.size > 0 && canEditQty && (
        <div style={{ background: '#FCEBEB', borderBottom: '1px solid #F3C9CB', padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#C8202A' }}>{selected.size} selected</span>
          <label style={{ fontSize: 10.5, color: '#888' }}>
            <span style={{ display: 'block', marginBottom: 2 }}>Set Not Started</span>
            <input
              type="number" min={0} placeholder="—" value={bulkTouched.has('qty_not_started') ? bulkDraft.qty_not_started ?? '' : ''}
              onChange={e => setBulkField('qty_not_started', e.target.value)}
              style={{ display: 'block', width: 90, padding: '5px 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4 }}
            />
          </label>
          <label style={{ fontSize: 10.5, color: '#888' }}>
            <span style={{ display: 'block', marginBottom: 2 }}>Set In Progress</span>
            <input
              type="number" min={0} placeholder="—" value={bulkTouched.has('qty_in_progress') ? bulkDraft.qty_in_progress ?? '' : ''}
              onChange={e => setBulkField('qty_in_progress', e.target.value)}
              style={{ display: 'block', width: 90, padding: '5px 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4 }}
            />
          </label>
          <label style={{ fontSize: 10.5, color: '#888' }}>
            <span style={{ display: 'block', marginBottom: 2 }}>Set Qty Done</span>
            <input
              type="number" min={0} placeholder="—" value={bulkTouched.has('qty_done') ? bulkDraft.qty_done ?? '' : ''}
              onChange={e => setBulkField('qty_done', e.target.value)}
              style={{ display: 'block', width: 90, padding: '5px 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4 }}
            />
          </label>
          <label style={{ fontSize: 10.5, color: '#888' }}>
            <span style={{ display: 'block', marginBottom: 2 }}>Set QC Passed</span>
            <input
              type="number" min={0} placeholder="—" value={bulkTouched.has('qty_qc_passed') ? bulkDraft.qty_qc_passed ?? '' : ''}
              onChange={e => setBulkField('qty_qc_passed', e.target.value)}
              style={{ display: 'block', width: 90, padding: '5px 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4 }}
            />
          </label>
          <label style={{ fontSize: 10.5, color: '#888' }}>
            <span style={{ display: 'block', marginBottom: 2 }}>Set Rework</span>
            <input
              type="number" min={0} placeholder="—" value={bulkTouched.has('qty_rework') ? bulkDraft.qty_rework ?? '' : ''}
              onChange={e => setBulkField('qty_rework', e.target.value)}
              style={{ display: 'block', width: 90, padding: '5px 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4 }}
            />
          </label>
          <label style={{ fontSize: 10.5, color: '#888' }}>
            <span style={{ display: 'block', marginBottom: 2 }}>Set Renew</span>
            <input
              type="number" min={0} placeholder="—" value={bulkTouched.has('qty_renew') ? bulkDraft.qty_renew ?? '' : ''}
              onChange={e => setBulkField('qty_renew', e.target.value)}
              style={{ display: 'block', width: 90, padding: '5px 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4 }}
            />
          </label>
          <button
            onClick={applyBulk}
            disabled={!bulkTouched.size}
            style={{ height: 28, padding: '0 14px', fontSize: 12, fontWeight: 700, color: '#fff', background: bulkTouched.size ? '#C8202A' : '#E0A6AA', border: 'none', borderRadius: 6, cursor: bulkTouched.size ? 'pointer' : 'default' }}
          >
            Apply to {selected.size}
          </button>
          <button onClick={clearBulk} style={{ height: 28, padding: '0 10px', fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'center', width: 32 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" style={{ width: 14, height: 14, accentColor: '#C8202A', cursor: 'pointer' }} />
            </th>
            <th style={th}>Mark</th>
            <th style={{ ...th, textAlign: 'right' }}>Quantity</th>
            <th style={{ ...th, textAlign: 'right' }}>Not Started</th>
            <th style={{ ...th, textAlign: 'right' }}>In Progress</th>
            <th style={{ ...th, textAlign: 'right' }}>Done</th>
            <th style={{ ...th, textAlign: 'right' }}>QC Passed</th>
            <th style={{ ...th, textAlign: 'right' }}>Rework</th>
            <th style={{ ...th, textAlign: 'right' }}>Renew</th>
            <th style={{ ...th, textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {activeMarks.map(m => {
            const bom = bomByAssembly.get(m.bom_assembly_id)
            const outdated = !!bom?.is_outdated
            const removedIrreversibly = bom?.delta_types.includes('REMOVED')
            const expanded = expandedId === m.id
            const dispatchText = dispatchLabel(m.snapshot_dispatch ?? { id: 0, project: m.bom_assembly.dispatch.project, zone: m.bom_assembly.dispatch.zone, sub_zone: m.bom_assembly.dispatch.sub_zone })
            return (
              <Fragment key={m.id}>
                <tr style={{ background: expanded ? '#FAFAFA' : selected.has(m.bom_assembly_id) ? '#FFF7F7' : undefined }}>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input
                      type="checkbox" checked={selected.has(m.bom_assembly_id)}
                      onChange={() => toggleSelected(m.bom_assembly_id)}
                      style={{ width: 14, height: 14, accentColor: '#C8202A', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={td}>
                    <span style={{ ...mono, fontWeight: 700, color: '#1A1A1A' }}>{m.bom_assembly.assembly_mark}</span>
                    {m.bom_assembly.name && <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>{m.bom_assembly.name}</span>}
                    {outdated && (
                      <span title={`Newer BOM version: ${bom!.delta_types.join(' · ') || 'change'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#C62828' }}>
                        <AlertTriangle size={11} /> outdated
                      </span>
                    )}
                    {dispatchText && <div style={{ fontSize: 10.5, color: '#ABABAB', marginTop: 1 }}>{dispatchText}</div>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', ...mono }}>{Number(m.qty_planned)}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#555555' }}>{effectiveValue(m, 'qty_not_started', edits) || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#854F0B' }}>{effectiveValue(m, 'qty_in_progress', edits) || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, fontWeight: 600 }}>{effectiveValue(m, 'qty_done', edits) || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#1E6B36' }}>{effectiveValue(m, 'qty_qc_passed', edits) || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#946200' }}>{effectiveValue(m, 'qty_rework', edits) || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...mono, color: '#888' }}>{effectiveValue(m, 'qty_renew', edits) || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {canEditQty && (
                        <IconButton title={expanded ? 'Close (discards unconfirmed changes)' : 'Edit qty'} active={expanded} onClick={() => (expanded ? cancelEdit() : openEdit(m))}>
                          {expanded ? <ChevronUp size={13} /> : <Pencil size={12} />}
                        </IconButton>
                      )}
                      {outdated && canModify && !removedIrreversibly && (
                        <IconButton title="Accept new BOM version" color="#1E6B36" onClick={() => setAcceptTarget({ mark: m, bom: bom! })}>
                          <AlertTriangle size={12} />
                        </IconButton>
                      )}
                      {canModify && (
                        canRemoveAny ? (
                          <IconButton title="Remove this mark" color="#C8202A" onClick={() => setRemoveTarget(m)}>
                            <Trash2 size={12} />
                          </IconButton>
                        ) : (
                          <span title="Last mark on this WO — cancel the whole work order instead" style={{ fontSize: 10, color: '#BBB', display: 'inline-flex', alignItems: 'center' }}>only mark</span>
                        )
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={10} style={{ padding: '10px 14px 16px', background: '#FAFAFA', borderBottom: '1px solid #EEE' }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <FieldGroup label="Not Started">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_not_started ?? ''}
                            onChange={e => setDraftField(m, 'qty_not_started', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="In Progress">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_in_progress ?? ''}
                            onChange={e => setDraftField(m, 'qty_in_progress', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="Qty Done">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_done ?? ''}
                            onChange={e => setDraftField(m, 'qty_done', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="QC Passed">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_qc_passed ?? ''}
                            onChange={e => setDraftField(m, 'qty_qc_passed', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="Rework">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_rework ?? ''}
                            onChange={e => setDraftField(m, 'qty_rework', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <FieldGroup label="Renew">
                          <input
                            type="number" min={0} max={Number(m.qty_planned)}
                            value={draft.qty_renew ?? ''}
                            onChange={e => setDraftField(m, 'qty_renew', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                          />
                        </FieldGroup>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => confirmEdit(m)}
                            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer' }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      {outdated && (
                        <div style={{ marginTop: 10, fontSize: 11.5, color: '#8A2A0D' }}>
                          Dispatch #{bom!.latest_dispatch_id} changed this mark: {bom!.delta_types.join(' · ') || 'unspecified change'}.
                          {removedIrreversibly && ' The assembly was removed from the latest BOM version — remove this mark (or cancel the whole WO) instead of accepting.'}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {!activeMarks.length && (
            <tr>
              <td colSpan={10} style={{ ...td, textAlign: 'center', color: '#AAA', padding: 20 }}>No marks on this work order.</td>
            </tr>
          )}
        </tbody>
        {activeMarks.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={2} style={{ padding: '8px 10px', fontSize: 11, color: '#888', borderTop: '1px solid #E0E0E0' }}>
                {activeMarks.length} mark{activeMarks.length > 1 ? 's' : ''}
                {removedCount > 0 ? ` · ${removedCount} removed` : ''}
                {outdatedCount > 0 ? ` · ${outdatedCount} outdated` : ''}
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalPlanned}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalNotStarted}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalInProgress}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalDone}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalQcPassed}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalRework}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...mono, borderTop: '1px solid #E0E0E0' }}>{totalRenew}</td>
              <td style={{ borderTop: '1px solid #E0E0E0' }} />
            </tr>
          </tfoot>
        )}
      </table>

      {removeTarget && (
        <RemoveMarkModal
          mark={removeTarget}
          isPending={removePending}
          onClose={() => setRemoveTarget(null)}
          onSubmit={handleRemoveSubmit}
        />
      )}
      {acceptTarget && (
        <AcceptVersionModal
          mark={acceptTarget.mark}
          bom={acceptTarget.bom}
          isPending={acceptPending}
          onClose={() => setAcceptTarget(null)}
          onSubmit={handleAcceptSubmit}
        />
      )}
    </div>
  )
}

function IconButton({ title, children, onClick, active, color }: { title: string; children: React.ReactNode; onClick: () => void; active?: boolean; color?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${active ? '#C8202A' : '#E0E0E0'}`,
        background: active ? '#C8202A' : '#fff',
        color: active ? '#fff' : (color ?? '#8E8E8E'),
      }}
    >
      {children}
    </button>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10.5, color: '#888', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}

function RemoveMarkModal({
  mark, isPending, onClose, onSubmit,
}: {
  mark: WoMark
  isPending: boolean
  onClose: () => void
  onSubmit: (body: { reason: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number }) => void
}) {
  const [reason, setReason] = useState('')
  const [breakdown, setBreakdown] = useState<QcBreakdown>(EMPTY_QC_BREAKDOWN)
  const qtyDone = mark.qty_done != null ? Number(mark.qty_done) : 0
  const needsBreakdown = qtyDone > 0
  const canSubmit = reason.trim().length > 0 && (!needsBreakdown || qcBreakdownValid(breakdown, qtyDone))

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      reason: reason.trim(),
      qty_qc_passed: needsBreakdown && breakdown.qty_qc_passed !== '' ? Number(breakdown.qty_qc_passed) : undefined,
      qty_rework: needsBreakdown && breakdown.qty_rework !== '' ? Number(breakdown.qty_rework) : undefined,
      qty_renew: needsBreakdown && breakdown.qty_renew !== '' ? Number(breakdown.qty_renew) : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 460 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Remove mark · {mark.bom_assembly.assembly_mark}</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Removes this mark from the work order. A reason is required.</p>
        <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Reason *</label>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} autoFocus rows={3} placeholder="Reason…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
        />
        {needsBreakdown && <QcBreakdownFields value={breakdown} onChange={setBreakdown} max={qtyDone} />}
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Close</button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer', opacity: isPending || !canSubmit ? 0.6 : 1 }}
          >
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AcceptVersionModal({
  mark, bom, isPending, onClose, onSubmit,
}: {
  mark: WoMark
  bom: BomVersionStatus
  isPending: boolean
  onClose: () => void
  onSubmit: (body: { note?: string; qty_qc_passed?: number; qty_rework?: number; qty_renew?: number; apply_to_other_wos?: boolean }) => void
}) {
  const [note, setNote] = useState('')
  const [breakdown, setBreakdown] = useState<QcBreakdown>(EMPTY_QC_BREAKDOWN)
  const [applyToOthers, setApplyToOthers] = useState(false)

  const qtyDone = mark.qty_done != null ? Number(mark.qty_done) : 0
  const qtyDelta = bom.delta_types.includes('QTY_CHANGED')
    ? (bom.delta_details as { qty?: { from: number; to: number } } | null)?.qty
    : undefined
  const needsBreakdown = qtyDelta != null && qtyDone > qtyDelta.to
  const canSubmit = !needsBreakdown || qcBreakdownValid(breakdown, qtyDone)

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      note: note.trim() || undefined,
      qty_qc_passed: needsBreakdown && breakdown.qty_qc_passed !== '' ? Number(breakdown.qty_qc_passed) : undefined,
      qty_rework: needsBreakdown && breakdown.qty_rework !== '' ? Number(breakdown.qty_rework) : undefined,
      qty_renew: needsBreakdown && breakdown.qty_renew !== '' ? Number(breakdown.qty_renew) : undefined,
      apply_to_other_wos: applyToOthers,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 480 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Accept new BOM version · {mark.bom_assembly.assembly_mark}</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          Adopts dispatch #{bom.latest_dispatch_id} ({bom.delta_types.join(' · ') || 'change'}) for this mark only, unless applied below.
        </p>
        <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Note</label>
        <textarea
          value={note} onChange={e => setNote(e.target.value)} autoFocus rows={2} placeholder="Optional note…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, resize: 'vertical' }}
        />
        {needsBreakdown && <QcBreakdownFields value={breakdown} onChange={setBreakdown} max={qtyDone} />}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: '#444', cursor: 'pointer' }}>
          <input type="checkbox" checked={applyToOthers} onChange={e => setApplyToOthers(e.target.checked)} style={{ width: 14, height: 14 }} />
          Also apply to other work orders holding this mark
        </label>
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Close</button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#1E6B36', color: '#fff', cursor: 'pointer', opacity: isPending || !canSubmit ? 0.6 : 1 }}
          >
            {isPending ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
