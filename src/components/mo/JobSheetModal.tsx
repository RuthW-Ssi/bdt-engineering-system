import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Loader2, Printer, Eye, X } from 'lucide-react'
import { fetchJobSheetBlob, fetchZoneJobSheetBlob, getJobSheetPreview, getZoneJobSheetPreview, type JobSheetMode, type JobSheetParams, type JobSheetPreview } from '../../api/jobSheet'
import type { PrintLang } from '../../api/mo'
import { getErrorMessage } from '../../lib/getErrorMessage'

// "พิมพ์ใบงานต่อชิ้น" — preview modal for per-piece job sheets.
// Shows what the batch will print (one row per sheet + totals) before any
// PDF is built, then previews the PDF inline or opens it in a new tab for the
// browser's own print dialog (same blob: approach as the MO print packet).
//
// `woIds` scopes the batch to the assemblies on those work orders (WO detail
// page); omitted = the whole MO (MO detail page). `zoneId` instead of `moId`
// prints a zone batch — every CONFIRMED / IN_PROGRESS MO with work in that
// zone, one PDF (Zone list page); an extra MO column then tells sheets apart.

const ROWS_SHOWN = 200

const btn = (primary: boolean, disabled: boolean): CSSProperties => ({
  height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
  border: primary ? '1px solid #0C447C' : '1px solid #C2C2C2',
  background: primary ? '#0C447C' : '#fff', color: primary ? '#fff' : '#333',
  display: 'inline-flex', alignItems: 'center', gap: 6,
})

const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 11.5, fontWeight: 700, color: '#555', borderBottom: '1px solid #DDD', position: 'sticky', top: 0, background: '#F6F6F6', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '5px 8px', fontSize: 12, borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' }

// Mark lists travel through effect deps as joined strings (stable across
// renders); \u0001 cannot occur in a mark.
const SEP = '\u0001'
function scopeParams(woKey: string, asmKey: string, partKey: string, mode: JobSheetMode): JobSheetParams {
  return {
    ...(woKey ? { woIds: woKey.split(',').map(Number) } : {}),
    ...(asmKey ? { assemblyMarks: asmKey.split(SEP) } : {}),
    ...(partKey ? { partMarks: partKey.split(SEP) } : {}),
    mode,
  }
}

export function formatHoles(holes: { diameter_mm: number; count: number }[], known: boolean): string {
  if (!known) return 'ไม่มีข้อมูล'
  return holes.map(h => `${h.count}×Ø${h.diameter_mm}`).join(', ')
}

export function JobSheetModal({ moId, moCode, heading, woIds, zoneId, subZones, assemblyMarks, partMarks, scopeLabel, onClose }: {
  moId?: number
  moCode?: string
  heading?: string // shown after the title instead of moCode (e.g. the zone of a zone batch)
  zoneId?: number // set = zone batch (moId / woIds are ignored)
  // Zone batch only: the zone's sub-zones, so a zone too big for one batch
  // (409 JOB_SHEET_TOO_MANY / _MOS tells the user to go sub-zone by sub-zone)
  // can be narrowed right here. Omitted / empty = no sub-zone picker.
  subZones?: { id: number; name: string }[]
  assemblyMarks?: string[] // per-assembly print (Assemblies tab)
  partMarks?: string[] // per-part print (Parts tab)
  woIds?: number[]
  scopeLabel?: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<JobSheetMode>('piece')
  const [subZoneId, setSubZoneId] = useState<number | undefined>(undefined) // zone batch: undefined = whole zone
  // Thai by default: this sheet is for the shop floor (the MO packet defaults to English).
  const [lang, setLang] = useState<PrintLang>('th')
  const [preview, setPreview] = useState<JobSheetPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'print' | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfUrlRef = useRef<string | null>(null)

  const isZone = zoneId !== undefined
  const woKey = woIds ? woIds.join(',') : ''
  const asmKey = assemblyMarks ? assemblyMarks.join(SEP) : ''
  const partKey = partMarks ? partMarks.join(SEP) : ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const load = zoneId !== undefined
      ? getZoneJobSheetPreview(zoneId, { ...scopeParams('', asmKey, partKey, mode), ...(subZoneId !== undefined ? { subZoneId } : {}) })
      : getJobSheetPreview(moId!, scopeParams(woKey, asmKey, partKey, mode))
    load
      .then((data) => { if (!cancelled) setPreview(data) })
      .catch((err) => { if (!cancelled) { setPreview(null); setError(getErrorMessage(err, 'โหลดตัวอย่างใบงานไม่สำเร็จ')) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [moId, zoneId, subZoneId, woKey, asmKey, partKey, mode])

  // The inline PDF belongs to one (mode, lang, sub-zone) choice — drop it when any changes or on close.
  function dropPdf() {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    pdfUrlRef.current = null
    setPdfUrl(null)
  }
  useEffect(() => dropPdf, [])
  useEffect(() => { dropPdf() }, [mode, lang, subZoneId])

  async function build(action: 'preview' | 'print') {
    setBusy(action)
    setError(null)
    try {
      const blob = zoneId !== undefined
        ? await fetchZoneJobSheetBlob(zoneId, { ...scopeParams('', asmKey, partKey, mode), ...(subZoneId !== undefined ? { subZoneId } : {}) }, lang)
        : await fetchJobSheetBlob(moId!, scopeParams(woKey, asmKey, partKey, mode), lang)
      const url = URL.createObjectURL(blob)
      if (action === 'print') {
        window.open(url, '_blank')
        // Not revoked right away — the new tab still has to load it.
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        dropPdf()
        pdfUrlRef.current = url
        setPdfUrl(url)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'สร้างใบงานไม่สำเร็จ'))
    } finally {
      setBusy(null)
    }
  }

  const totals = preview?.totals
  const canBuild = !loading && !!preview && preview.sheets.length > 0 && busy === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} role="dialog" aria-modal="true" aria-label="พิมพ์ใบงานต่อชิ้น">
      <div style={{ background: '#fff', borderRadius: 8, padding: '20px 24px', width: 'min(1100px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center" style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>พิมพ์ใบงานต่อชิ้น{(heading ?? moCode) ? ` — ${heading ?? moCode}` : ''}</h2>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          {scopeLabel ?? (isZone ? (subZoneId !== undefined ? `ทุก MO ที่ยืนยันแล้ว/กำลังผลิตใน Sub-zone ${subZones?.find(sz => sz.id === subZoneId)?.name ?? subZoneId}` : 'ทุก MO ที่ยืนยันแล้ว/กำลังผลิตในโซนนี้') : woIds ? 'เฉพาะชิ้นงานของ Work Order นี้' : partMarks ? `เฉพาะ Part Mark ${partMarks.join(', ')}` : assemblyMarks ? `เฉพาะ Assembly ${assemblyMarks.join(', ')}` : 'ทุกชิ้นงานของ MO นี้')} · ใบงาน 1 หน้า A4 ต่อชิ้น: รหัสชิ้น + QR, หน้าตัด/เกรด/ขนาด/น้ำหนัก, ขั้นตอนพร้อมช่องลงชื่อ, แบบอ้างอิง, วันต้องเสร็จ, Heat No. และสรุปรูเจาะ
        </p>

        <div className="flex items-center gap-4" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            รูปแบบ
            <select value={mode} onChange={(e) => setMode(e.target.value as JobSheetMode)} style={{ height: 30, fontSize: 12.5, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 6px' }}>
              <option value="piece">1 ใบต่อ 1 ชิ้น</option>
              <option value="part">1 ใบต่อ Part Mark (ระบุจำนวน)</option>
            </select>
          </label>
          {isZone && subZones && subZones.length > 0 && (
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              Sub-zone
              <select value={subZoneId ?? ''} onChange={(e) => setSubZoneId(e.target.value === '' ? undefined : Number(e.target.value))} style={{ height: 30, fontSize: 12.5, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 6px' }}>
                <option value="">ทั้งโซน</option>
                {subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.name}</option>)}
              </select>
            </label>
          )}
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            ภาษา
            <select value={lang} onChange={(e) => setLang(e.target.value as PrintLang)} style={{ height: 30, fontSize: 12.5, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 6px' }}>
              <option value="th">ไทย</option>
              <option value="en">English</option>
            </select>
          </label>
          {totals && (
            <span style={{ fontSize: 12.5, color: '#333' }}>
              <b>{totals.sheets}</b> ใบ · {totals.partMarks} Part Mark · {totals.pieces} ชิ้น · {totals.weight_kg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg
            </span>
          )}
        </div>

        {preview?.zone && (
          <div style={{ fontSize: 12, color: '#333', marginBottom: 8 }}>
            MO ในชุดนี้ ({preview.zone.moCodes.length}): <span style={{ fontFamily: 'monospace' }}>{preview.zone.moCodes.join(', ')}</span>
            {preview.zone.skippedMoCodes.length > 0 && <span style={{ color: '#888' }}> · ไม่มีชิ้นงานตามเงื่อนไข: {preview.zone.skippedMoCodes.join(', ')}</span>}
          </div>
        )}

        {totals && (totals.withoutHoleData > 0 || totals.withoutDrawing > 0 || totals.withoutRouting > 0) && (
          <div style={{ fontSize: 12, color: '#8A5A00', background: '#FFF6E0', border: '1px solid #F0D48A', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>
            {totals.withoutHoleData > 0 && <span>ไม่มีข้อมูลรู {totals.withoutHoleData} ใบ · </span>}
            {totals.withoutDrawing > 0 && <span>ไม่มีแบบ PDF {totals.withoutDrawing} ใบ · </span>}
            {totals.withoutRouting > 0 && <span>ยังไม่มีขั้นตอน/WO {totals.withoutRouting} ใบ · </span>}
            ช่องที่ไม่มีข้อมูลจะพิมพ์เป็นช่องว่างให้กรอกด้วยมือ
          </div>
        )}

        {error && <div role="alert" style={{ fontSize: 12.5, color: '#A32D2D', background: '#FCEBEB', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 220, overflow: 'auto', border: '1px solid #E2E2E2', borderRadius: 4 }}>
          {loading ? (
            <div className="flex items-center justify-center" style={{ height: 200, color: '#888', gap: 8, fontSize: 13 }}><Loader2 size={16} className="animate-spin" /> กำลังโหลด…</div>
          ) : pdfUrl ? (
            <iframe title="ตัวอย่างใบงานต่อชิ้น" src={pdfUrl} style={{ width: '100%', height: '62vh', border: 'none' }} />
          ) : preview && preview.sheets.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[...(isZone ? ['MO'] : []), '#', 'Assembly', 'Part Mark', 'ชิ้นที่', 'หน้าตัด', 'เกรด', 'ยาว (mm)', 'น้ำหนัก/ชิ้น (kg)', 'รูเจาะ', 'ขั้นตอน', 'แบบ', 'Heat No.'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.sheets.slice(0, ROWS_SHOWN).map(s => (
                  <tr key={s.sheetNo}>
                    {isZone && <td style={{ ...td, fontFamily: 'monospace' }}>{s.moCode}</td>}
                    <td style={td}>{s.sheetNo}</td>
                    <td style={td}>{s.assemblyMark}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{s.partMark}</td>
                    <td style={td}>{s.pieceNo != null ? `${s.pieceNo}/${s.pieceTotal}` : `×${s.pieceTotal}`}</td>
                    <td style={td}>{s.profile ?? '—'}</td>
                    <td style={td}>{s.grade ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{s.length_mm ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{s.unitWeight_kg != null ? s.unitWeight_kg.toFixed(2) : '—'}</td>
                    <td style={{ ...td, color: s.holesKnown ? '#333' : '#B26A00' }}>{formatHoles(s.holes, s.holesKnown)}</td>
                    <td style={td}>{s.routing.length}</td>
                    <td style={{ ...td, color: s.drawings.length ? '#333' : '#B26A00' }}>{s.drawings.length ? s.drawings.map(d => `Rev ${d.rev}`).join(', ') : 'ไม่มี'}</td>
                    <td style={{ ...td, color: s.heatNo ? '#333' : '#999' }}>{s.heatNo ?? 'กรอกมือ'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !error ? (
            <div style={{ padding: 24, fontSize: 13, color: '#888', textAlign: 'center' }}>ไม่มีชิ้นงานให้พิมพ์</div>
          ) : null}
        </div>
        {preview && !pdfUrl && preview.sheets.length > ROWS_SHOWN && (
          <p style={{ fontSize: 11.5, color: '#888', marginTop: 6 }}>แสดง {ROWS_SHOWN} ใบแรกจาก {preview.sheets.length} ใบ — PDF มีครบทุกใบ</p>
        )}

        <div className="flex items-center gap-2" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          {pdfUrl && <button onClick={dropPdf} style={btn(false, false)}>กลับไปดูรายการ</button>}
          <button onClick={onClose} style={btn(false, false)}>ปิด</button>
          <button onClick={() => build('preview')} disabled={!canBuild} style={btn(false, !canBuild)}>
            {busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} ดูตัวอย่าง PDF
          </button>
          <button onClick={() => build('print')} disabled={!canBuild} style={btn(true, !canBuild)}>
            {busy === 'print' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} พิมพ์ใบงานต่อชิ้น
          </button>
        </div>
      </div>
    </div>
  )
}
