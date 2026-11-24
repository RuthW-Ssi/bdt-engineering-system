import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAssignHeat, useAssignHeatBulk, useHeatLots, useSheetHistory, useVoidPlateCut } from '../../hooks/useTraceability'
import { getErrorMessage } from '../../lib/getErrorMessage'
import type { SheetTrace } from '../../api/traceability'

// "Assign heat no." for one nesting sheet. Saving writes one plate cut
// record and passes the heat number on to every part of the sheet. A plate that already has
// a heat number is replaced: the old record is voided (kept for history), so a reason is asked.
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }
const INPUT: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: 'white' }
const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// Bulk mode (nestingIds with more than one id): the same heat number goes to plate 1 of every picked sheet.
export function AssignHeatModal({ sheet, sheetLabel, onClose, nestingIds, replacing = 0 }: {
  sheet: Pick<SheetTrace, 'nesting_id' | 'plate_cuts' | 'parts' | 'plates_in_report' | 'previous_cuts' | 'parent_plate' | 'parent_cuts'>
  sheetLabel: string
  onClose: () => void
  nestingIds?: number[]
  replacing?: number // bulk mode: how many of the picked sheets already have a heat number
}) {
  const [heatNo, setHeatNo] = useState('')
  const [mill, setMill] = useState('')
  const [certNo, setCertNo] = useState('')
  const [plateNo, setPlateNo] = useState('')
  const [plateSeq, setPlateSeq] = useState(1)
  const [cutDate, setCutDate] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const assign = useAssignHeat()
  const assignBulk = useAssignHeatBulk()
  const voidCut = useVoidPlateCut()
  const { data: lots } = useHeatLots()
  const bulkIds = nestingIds && nestingIds.length > 1 ? nestingIds : null
  // Audit trail (ACTIVE + VOID records) of this sheet — loaded only when opened.
  const [showHistory, setShowHistory] = useState(false)
  const history = useSheetHistory(bulkIds ? null : sheet.nesting_id, showHistory)
  const current = bulkIds ? undefined : sheet.plate_cuts.find(c => c.plate_seq === plateSeq)
  // The same plate in an earlier upload of this cutting plan already had a heat number: offer it, never copy it silently.
  const previous = bulkIds || current ? undefined : sheet.previous_cuts?.find(c => c.plate_seq === plateSeq)
  // Else: the report's Charge names another plate — this sheet is likely cut from that plate's remnant (unverified).
  const parent = bulkIds || current || previous ? undefined : sheet.parent_cuts?.[0]
  const hint = previous ?? parent

  function applyPrevious() {
    if (!hint) return
    setHeatNo(hint.heat_lot.heat_no)
    setMill(hint.heat_lot.mill)
    setCertNo(hint.heat_lot.cert_no ?? '')
    if (hint.plate_no) setPlateNo(hint.plate_no)
  }
  const needsReason = bulkIds ? replacing > 0 : !!current
  const busy = assign.isPending || assignBulk.isPending || voidCut.isPending
  const canSave = heatNo.trim() !== '' && (!needsReason || reason.trim() !== '') && !busy

  // Picking a known heat number fills in its mill and certificate.
  function onHeatNo(value: string) {
    setHeatNo(value)
    const known = lots?.find(l => l.heat_no === value.replace(/\s+/g, '').toUpperCase())
    if (known) { setMill(known.mill); setCertNo(known.cert_no ?? '') }
  }

  // Take a wrong heat number off the plate without giving a new one (the record is kept as void).
  async function remove() {
    if (!current || !reason.trim() || busy) return
    try {
      await voidCut.mutateAsync({ id: current.id, reason: reason.trim() })
      toast.success(`Heat no. ${current.heat_lot.heat_no} removed from plate ${current.plate_seq}`)
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to remove the heat number. Please try again.'))
    }
  }

  async function save() {
    if (!canSave) return
    const payload = {
      heat_no: heatNo.trim(),
      mill: mill.trim() || undefined,
      cert_no: certNo.trim() || undefined,
      plate_no: bulkIds ? undefined : plateNo.trim() || undefined,
      plate_seq: bulkIds ? 1 : plateSeq,
      cut_date: cutDate || undefined,
      note: note.trim() || undefined,
      reason: needsReason ? reason.trim() : undefined,
    }
    try {
      if (bulkIds) {
        const all = await assignBulk.mutateAsync({ nestingIds: bulkIds, payload })
        if (all.assigned > 0) toast.success(`Heat no. ${heatNo.trim().toUpperCase()} assigned to ${all.assigned} sheet(s) — passed on to ${all.parts_traced} part(s)`)
        for (const f of all.failed.slice(0, 3)) toast.error(`Sheet ${f.nesting_id}: ${f.message}`)
        for (const w of [...new Set(all.done.flatMap(d => d.warnings))].slice(0, 3)) toast.warning(w)
        onClose()
        return
      }
      const res = await assign.mutateAsync({ nestingId: sheet.nesting_id, payload })
      toast.success(`Heat no. ${res.heat_lot.heat_no} assigned — passed on to ${res.parts_traced} part(s)`)
      for (const w of res.warnings) toast.warning(w)
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to assign the heat number. Please try again.'))
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Assign heat number"
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between" style={{ padding: '20px 24px 0' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Assign heat no. — {sheetLabel}</span>
          <button onClick={onClose} disabled={busy} aria-label="Close"
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
            style={{ width: 28, height: 28, color: '#8E8E8E' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            The heat number is passed on to all {sheet.parts.toLocaleString('en')} part(s) on {bulkIds ? `the ${bulkIds.length} picked sheets` : 'this sheet'}.
            {sheet.plate_cuts.length > 0 && <> Now: {sheet.plate_cuts.map(c => `plate ${c.plate_seq} = ${c.heat_lot.heat_no}`).join(', ')}.</>}
          </div>

          {hint && heatNo.trim() === '' && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, fontSize: 12, color: '#1E3A8A' }}>
              {previous
                ? <>An earlier upload of this plate ({hint.sheet}{hint.upload_id != null ? `, upload #${hint.upload_id}` : ''}) had heat no.{' '}</>
                : <>The report names plate <b>{sheet.parent_plate}</b> as this sheet's Charge, so it may be cut from that plate's remnant — please check. That plate has heat no.{' '}</>}
              <b style={{ fontFamily: 'monospace' }}>{hint.heat_lot.heat_no}</b>{hint.heat_lot.mill ? ` (${hint.heat_lot.mill})` : ''}.
              It is not counted for this sheet until it is assigned here.
              <button onClick={applyPrevious}
                style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#1D4ED8', background: 'none', border: '1px solid #BFDBFE', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                Use it
              </button>
            </div>
          )}

          <div>
            <label style={LABEL} htmlFor="trace-heat-no">Heat no. <span style={{ color: '#C8202A' }}>*</span></label>
            <input id="trace-heat-no" style={{ ...INPUT, fontFamily: 'monospace' }} value={heatNo} autoFocus maxLength={60} list="trace-heat-lots"
              placeholder="as on the mill test certificate" onChange={e => onHeatNo(e.target.value)} />
            <datalist id="trace-heat-lots">
              {(lots ?? []).map(l => <option key={l.id} value={l.heat_no}>{[l.mill, l.grade, l.cert_no].filter(Boolean).join(' · ')}</option>)}
            </datalist>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL} htmlFor="trace-mill">Mill</label>
              <input id="trace-mill" style={INPUT} value={mill} maxLength={120} onChange={e => setMill(e.target.value)} />
            </div>
            <div>
              <label style={LABEL} htmlFor="trace-cert">Mill certificate no.</label>
              <input id="trace-cert" style={INPUT} value={certNo} maxLength={100} onChange={e => setCertNo(e.target.value)} />
            </div>
            {!bulkIds && (
              <div>
                <label style={LABEL} htmlFor="trace-plate-no">Plate no. (stamped / label)</label>
                <input id="trace-plate-no" style={INPUT} value={plateNo} maxLength={60} onChange={e => setPlateNo(e.target.value)} />
              </div>
            )}
            <div>
              <label style={LABEL} htmlFor="trace-cut-date">Cut date</label>
              <input id="trace-cut-date" type="date" style={INPUT} value={cutDate} onChange={e => setCutDate(e.target.value)} />
            </div>
            {!bulkIds && <div>
              <label style={LABEL} htmlFor="trace-plate-seq">Plate of this sheet</label>
              <input id="trace-plate-seq" type="number" min={1} max={999} style={INPUT} value={plateSeq}
                onChange={e => setPlateSeq(Math.max(1, Math.min(999, Math.round(Number(e.target.value)) || 1)))} />
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                Use 2, 3, … when the same nest is cut on several plates{sheet.plates_in_report != null ? ` (report count: ${sheet.plates_in_report})` : ''}.
              </div>
            </div>}
            <div>
              <label style={LABEL} htmlFor="trace-note">Note</label>
              <input id="trace-note" style={INPUT} value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
            </div>
          </div>

          {needsReason && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#9A3412', marginBottom: 8 }}>
                {current
                  ? <>Plate {plateSeq} already has heat no. <b style={{ fontFamily: 'monospace' }}>{current.heat_lot.heat_no}</b>. Saving replaces it; the old record is kept as void.</>
                  : <>{replacing} of the picked sheets already have a heat number. Saving replaces them; the old records are kept as void.</>}
              </div>
              <label style={LABEL} htmlFor="trace-reason">Reason for the change <span style={{ color: '#C8202A' }}>*</span></label>
              <input id="trace-reason" style={INPUT} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} />
              {current && (
                <button onClick={remove} disabled={!reason.trim() || busy} className="disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#9A3412', background: 'none', border: '1px solid #FED7AA', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                  Remove heat no. from this plate
                </button>
              )}
            </div>
          )}

          {!bulkIds && (
            <div>
              <button onClick={() => setShowHistory(v => !v)} aria-expanded={showHistory}
                style={{ fontSize: 12, color: '#555', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                {showHistory ? 'Hide history' : 'Show history (replaced / removed heat numbers)'}
              </button>
              {showHistory && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {history.isLoading && <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading history…</span>}
                  {history.isError && <span style={{ color: '#C8202A' }}>Could not load the history.</span>}
                  {history.data && history.data.records.length === 0 && <span style={{ color: '#9CA3AF' }}>No heat number has been assigned to this sheet yet.</span>}
                  {history.data?.records.map(r => (
                    <div key={r.id} style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 8px', background: r.status === 'VOID' ? '#F9FAFB' : 'white' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, textDecoration: r.status === 'VOID' ? 'line-through' : undefined }}>{r.heat_lot.heat_no}</span>
                      {r.heat_lot.mill ? ` (${r.heat_lot.mill})` : ''} · plate {r.plate_seq}{r.plate_no ? ` / ${r.plate_no}` : ''} · {r.parts_traced} part(s)
                      <span style={{ marginLeft: 6, fontSize: 11, padding: '0 6px', borderRadius: 4, background: r.status === 'VOID' ? '#F3F4F6' : '#DCFCE7', color: r.status === 'VOID' ? '#6B7280' : '#166534' }}>
                        {r.status}
                      </span>
                      <div style={{ color: '#6B7280', marginTop: 2 }}>
                        assigned {fmtWhen(r.assigned_at)}{r.assigned_by ? ` by ${r.assigned_by}` : ''}
                        {r.status === 'VOID' && <> · voided {fmtWhen(r.voided_at)}{r.voided_by ? ` by ${r.voided_by}` : ''}{r.void_reason ? ` — ${r.void_reason}` : ''}</>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2" style={{ marginTop: 4 }}>
            <button onClick={onClose} disabled={busy}
              style={{ height: 36, padding: '0 16px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: 'white', color: '#555', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={!canSave} className="disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: '#C8202A', color: 'white', cursor: 'pointer' }}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {needsReason ? 'Replace heat no.' : 'Assign heat no.'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
