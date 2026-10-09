import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { importPreshopDispatchNote, importPreshopPdf, type PreshopAssembly, type PreshopConflictField, type PreshopMergeRow } from '../../api/mo'
import { ASM_FIELDS } from '../../lib/asmFields'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { preshopErrors, preshopTotals } from '../../lib/preshop'
import { combine, notInDispatchNote, removeFile as removeRowsOf, resolve, CONFLICT_LABEL, type UploadedFile } from '../../lib/preshopCombine'
import { Card, Field, PartTable } from './PreshopMergeCompare'
import { PreshopPartsEditor } from './PreshopPartsEditor'

// Pre-shop MO assemblies (2026-10-07). Three sources, one at a time for the
// uploads: ONE Dispatch Note, or several pre-shop drawing PDFs (Tekla BILL OF
// MATERIAL — assemblies + parts per set), or assemblies picked from the BOM of
// the same project/zone. Uploaded rows stay editable; nothing is stored until
// the MO is saved (then they become a PRE_SHOP BOM dispatch). No H / B columns
// (user, 2026-10-07: "ไม่เอาค่า h b").

// Upload modes are locked (2026-10-08, user: each upload must say clearly how
// it came in): a mode takes only its own files, and once anything is read or
// picked the other modes are disabled until the files are removed.
// No BOM mode (2026-10-08): a pre-shop MO takes real-BOM data only through
// "เทียบกับ BOM" on the MO page.
export type UploadMode = 'DN' | 'PDF' | 'BOTH'
type Source = UploadMode
const TABS: { key: Source; label: string; hint: string }[] = [
  { key: 'DN', label: 'Dispatch Note', hint: 'Dispatch Note อย่างเดียว · 1 ไฟล์ (.xls / .xlsx)' },
  { key: 'PDF', label: 'Pre-shop drawing', hint: 'Pre-shop drawing อย่างเดียว · หลายไฟล์ได้ (.pdf จาก Tekla)' },
  { key: 'BOTH', label: 'Dispatch Note + Pre-shop', hint: 'อัปโหลดทั้ง 2 อย่าง — รวมตาม mark: ชุดจาก Dispatch Note, part จาก Pre-shop drawing' },
]

const cell: React.CSSProperties = { padding: '6px 6px', borderBottom: '1px solid #F0F0F0', fontSize: 12.5, verticalAlign: 'middle' }
const head: React.CSSProperties = { ...cell, fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #E0E0E0', textAlign: 'left' }
const input: React.CSSProperties = { width: '100%', padding: '4px 6px', fontSize: 12.5, border: '1px solid #D4D4D4', borderRadius: 5 }
const num = (v: string) => (v === '' ? null : Number(v))
const COLS = 4 + ASM_FIELDS.length // spans mark · sets · values · part · delete (not the expand column)
const fmtKg = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PreshopPanel({
  assemblies, onChange, uploadedFrom, onUploadedFrom, compare, needsParts, renderCompare, errors: errorsProp,
  mode, onMode,
}: {
  mode?: UploadMode // controlled by the Upload modal (it sends the mode with the save)
  onMode?: (m: UploadMode) => void
  compare?: Map<string, PreshopMergeRow> // vs the MO, from a dry run (Upload on an existing MO)
  renderCompare?: (a: PreshopAssembly, row: PreshopMergeRow) => React.ReactNode // old-vs-new chooser for a mark the MO has
  errors?: string[] // replaces the panel's own row checks (the Upload modal skips marks chosen in the compare box)
  needsParts?: Set<string> // marks that must get parts before saving (2026-10-08)
  assemblies: PreshopAssembly[]
  onChange: (list: PreshopAssembly[]) => void
  uploadedFrom: UploadedFile[] // files read so far — a Dispatch Note and drawings can be combined (2026-10-08)
  onUploadedFrom: (v: UploadedFile[]) => void
}) {
  const [ownTab, setOwnTab] = useState<Source>('DN')
  const tab = mode ?? ownTab
  const setTab = onMode ?? setOwnTab
  // locked once anything is in: files read or rows typed
  const locked = uploadedFrom.length > 0 || assemblies.length > 0
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [open, setOpen] = useState<Set<number>>(new Set())

  async function upload(kind: 'DN' | 'PDF', files: File[]) {
    if (!files.length) return
    // Another file of the same kind replaces the old one(s); the other kind
    // is combined by mark (Dispatch Note + pre-shop drawing, 2026-10-08).
    const same = uploadedFrom.filter(f => f.kind === kind)
    if (same.length && !window.confirm(`แทนที่ ${kind === 'DN' ? 'Dispatch Note' : 'Pre-shop drawing'} เดิม (${same.map(f => f.name).join(', ')}) ด้วยไฟล์นี้?`)) return
    setBusy(true); setError(null); setWarnings([])
    try {
      const r = kind === 'DN' ? await importPreshopDispatchNote(files[0]) : await importPreshopPdf(files)
      let rows = assemblies
      for (const f of same) rows = removeRowsOf(rows, f.name)
      rows = combine(rows, r.assemblies, kind, a => ('files' in r ? a.source_file ?? r.files[0] : r.filename))
      onChange(rows)
      const names = 'files' in r ? r.files : [r.filename]
      onUploadedFrom([...uploadedFrom.filter(f => f.kind !== kind), ...names.map((name, k) => ({ name, kind, warnings: k === 0 ? r.warnings : [] }))])
      setWarnings(r.warnings)
      // Open marks that still need parts typed in (a Dispatch Note has none).
      setOpen(new Set(rows.flatMap((a, k) => (a.parts.length ? [] : [k]))))
    } catch (e) {
      setError(getErrorMessage(e, 'อ่านไฟล์ไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }
  // A wrong file comes out: its rows go, or go back to what the other file
  // says for that mark (rows typed in stay).
  function removeFile(file: string) {
    if (!window.confirm(`ลบไฟล์ ${file} ออก?\nข้อมูลที่มาจากไฟล์นี้จะหายไปด้วย`)) return
    onChange(removeRowsOf(assemblies, file))
    onUploadedFrom(uploadedFrom.filter(f => f.name !== file))
    setWarnings([])
    setOpen(new Set())
  }
  const patch = (i: number, p: Partial<PreshopAssembly>) => onChange(assemblies.map((a, k) => (k === i ? { ...a, ...p } : a)))
  const toggle = (i: number) => setOpen(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const errors = errorsProp ?? preshopErrors(assemblies)
  const onlyInDrawing = notInDispatchNote(assemblies)
  const t = preshopTotals(assemblies)
  const current = TABS.find(x => x.key === tab)!

  return (
    <div>
      {/* Source tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {TABS.map(x => (
          <button key={x.key} type="button" onClick={() => setTab(x.key)} disabled={locked && x.key !== tab}
            title={locked && x.key !== tab ? 'ลบไฟล์ / รายการที่มีอยู่ก่อน ถึงจะเปลี่ยนแบบการอัปโหลดได้' : undefined}
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, cursor: locked && x.key !== tab ? 'not-allowed' : 'pointer', opacity: locked && x.key !== tab ? 0.45 : 1,
              border: `1px solid ${tab === x.key ? '#C8202A' : '#D4D4D4'}`, background: tab === x.key ? '#FCEBEB' : '#fff', color: tab === x.key ? '#C8202A' : '#555' }}>
            {x.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>{current.hint}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {(tab === 'BOTH' ? (['DN', 'PDF'] as const) : [tab]).map(kind => (
            <label key={kind} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px', border: '1.5px dashed #D4D4D4', borderRadius: 8, cursor: busy ? 'default' : 'pointer', background: '#FAFAFA' }}>
              {busy ? <Loader2 size={16} className="animate-spin" style={{ color: '#999' }} /> : <Upload size={16} style={{ color: '#C8202A' }} />}
              <span style={{ fontSize: 13, color: '#333', fontWeight: 600 }}>
                {busy ? 'กำลังอ่านไฟล์…' : kind === 'DN' ? 'เลือกไฟล์ Dispatch Note' : 'เลือกไฟล์ Pre-shop drawing (เลือกได้หลายไฟล์)'}
                {tab === 'BOTH' && uploadedFrom.some(f => f.kind === kind) && <span className="text-green-800" style={{ marginLeft: 6 }}>✓</span>}
              </span>
              <input type="file" hidden disabled={busy} multiple={kind === 'PDF'} accept={kind === 'DN' ? '.xls,.xlsx' : '.pdf'}
                onChange={e => { void upload(kind, Array.from(e.target.files ?? [])); e.target.value = '' }} />
            </label>
          ))}
        </div>

      {uploadedFrom.length > 0 && (
        <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#555', marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>ไฟล์ที่นำเข้า:</span>
          {uploadedFrom.map(f => (
            <span key={f.name} className="inline-flex items-center gap-1.5" style={{ padding: '3px 4px 3px 9px', border: '1px solid #D4D4D4', borderRadius: 999, background: '#fff' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: f.kind === 'DN' ? '#E6F1FB' : '#EAF3DE', color: f.kind === 'DN' ? '#0C447C' : '#27500A' }}>{f.kind === 'DN' ? 'Dispatch Note' : 'Pre-shop'}</span>
              <FileText size={12} /> {f.name}
              <button type="button" onClick={() => removeFile(f.name)} aria-label={`ลบไฟล์ ${f.name}`} title="ลบไฟล์นี้ออก (นำเข้าผิด)"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, border: 'none', background: '#FCEBEB', color: '#C8202A', cursor: 'pointer' }}>
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div style={{ background: '#FCEBEB', color: '#C8202A', fontSize: 12, padding: '6px 10px', borderRadius: 6, marginBottom: 6 }}>{error}</div>}
      {warnings.map(w => <div key={w} style={{ background: '#FFF8E1', color: '#8A4B0D', fontSize: 12, padding: '5px 10px', borderRadius: 6, marginBottom: 4 }}>{w}</div>)}

      {/* Uploaded / typed assemblies — every field editable */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#333', margin: '6px 0' }}>Assembly จากไฟล์ ({assemblies.length})</div>
      {assemblies.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...head, width: 22 }} />
              <th style={{ ...head, minWidth: 130 }}>Assembly mark</th>
              <th style={{ ...head, width: 72 }}>ชุด</th>
              {/* every value is editable and compared (2026-10-09) */}
              {ASM_FIELDS.map(f => <th key={f.key} style={{ ...head, minWidth: f.text ? 110 : 76 }}>{f.title}</th>)}
              <th style={{ ...head, width: 56 }}>Part</th>
              <th style={{ ...head, width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {assemblies.map((a, i) => {
              const cmp = compare?.get(a.assembly_mark.trim())
              const inMo = !!cmp && cmp.status !== 'new' && !!renderCompare
              const tone = inMo ? 'bg-molten-50' : undefined
              return (
              <Fragment key={i}>
                <tr className={tone}>
                  <td style={cell}>
                    {(
                      <button type="button" onClick={() => toggle(i)} aria-label={`ดู part ของ ${a.assembly_mark}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 0, display: 'flex' }}>
                        {open.has(i) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </td>
                  <td style={cell}>
                    <input style={{ ...input, fontFamily: 'monospace', fontWeight: 700 }} value={a.assembly_mark} onChange={e => patch(i, { assembly_mark: e.target.value })} />
                    {onlyInDrawing.has(a.assembly_mark.trim()) && (
                      <div className="text-molten-600" style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>ไม่มีใน Dispatch Note — กรอกจำนวนชุดเอง หรือลบถ้าไม่ผลิต</div>
                    )}
                  </td>
                  <td style={cell}>
                    {inMo
                      ? <span className="text-molten-600" style={{ fontSize: 11.5, fontWeight: 600 }}>เลือกด้านล่าง</span>
                      : <input type="number" min={0} placeholder="กรอก" style={{ ...input, ...(a.qty > 0 ? {} : { borderColor: '#C8202A' }) }} value={a.qty || ''} onChange={e => patch(i, { qty: Number(e.target.value) || 0 })} />}
                  </td>
                  {ASM_FIELDS.map(f => (
                    <td key={f.key} style={cell}>
                      {f.text
                        ? <input style={input} value={a.name ?? ''} onChange={e => patch(i, { name: e.target.value || null })} />
                        : <input type="number" min={0} style={input} value={a[f.key] ?? ''} onChange={e => patch(i, { [f.key]: num(e.target.value) })} />}
                    </td>
                  ))}
                  <td style={{ ...cell, color: '#666' }}>
                    {needsParts?.has(a.assembly_mark.trim())
                      ? <button type="button" onClick={() => setOpen(s => new Set(s).add(i))} className="text-ssi-600" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>ใส่ part</button>
                      : a.parts.length || '—'}
                  </td>
                  <td style={cell}>
                    <button type="button" aria-label={`ลบ ${a.assembly_mark}`} onClick={() => onChange(assemblies.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
                {!!a.conflicts?.length && a.sources?.DN && a.sources?.PDF && (
                  <tr>
                    <td />
                    <td colSpan={COLS} style={{ padding: '4px 6px 10px' }}>
                      <SourceConflicts row={a} onPick={(f, v) => onChange(assemblies.map((x, k) => (k === i ? resolve(x, f, v) : x)))} />
                    </td>
                  </tr>
                )}
                {inMo && (
                  <tr>
                    <td />
                    <td colSpan={COLS} style={{ padding: '4px 6px 10px' }}>{renderCompare!(a, cmp!)}</td>
                  </tr>
                )}
                {open.has(i) && !inMo && (
                  <tr>
                    <td />
                    <td colSpan={COLS} style={{ padding: '4px 6px 10px', background: '#FAFAFA' }}>
                      <PreshopPartsEditor parts={a.parts} onChange={parts => patch(i, { parts })} />
                    </td>
                  </tr>
                )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => onChange([...assemblies, { assembly_mark: '', qty: 1, weight_kg: null, surface_area_m2: null, length_mm: null, parts: [] }])}
        className="flex items-center gap-1" style={{ marginTop: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#C8202A', background: '#fff', border: '1px dashed #E8A0A0', borderRadius: 6, cursor: 'pointer' }}>
        <Plus size={13} /> เพิ่ม assembly เอง
      </button>
      {assemblies.length > 0 && (
        <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
          รวม <strong>{t.assemblies}</strong> assembly · <strong>{t.sets}</strong> ชุด · <strong>{t.pieces}</strong> part · น้ำหนัก <strong>{fmtKg(t.weightKg)}</strong> kg
        </div>
      )}
      {errors.map(e => <div key={e} style={{ background: '#FCEBEB', color: '#C8202A', fontSize: 12, padding: '5px 10px', borderRadius: 6, marginTop: 4 }}>{e}</div>)}
    </div>
  )
}

// Dispatch Note and drawing disagree on a value (L / W / H / kg / area) or parts for one mark — the
// user picks (decision 1ก, 2026-10-08). Same card look as the MO compare box.
function SourceConflicts({ row, onPick }: {
  row: PreshopAssembly
  onPick: <F extends PreshopConflictField>(field: F, value: PreshopAssembly[F]) => void
}) {
  const dn = row.sources!.DN!
  const pdf = row.sources!.PDF!
  const big: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: '#1F1F1F' }
  const show = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }))
  return (
    <div style={{ background: '#fff', border: '1px solid #85B7EB', borderRadius: 10, padding: '10px 12px 12px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0C447C' }}>
        {row.assembly_mark} — Dispatch Note กับ Pre-shop drawing ไม่ตรงกัน กดเลือกค่าที่จะใช้
      </div>
      {row.conflicts!.map(f => f === 'parts' ? (
        <Field key={f} label={CONFLICT_LABEL[f]} pending>
          <Card kind="dn" active={false} onClick={() => onPick('parts', dn.parts)}><PartTable parts={dn.parts} /></Card>
          <Card kind="pdf" active={false} onClick={() => onPick('parts', pdf.parts)}><PartTable parts={pdf.parts} /></Card>
        </Field>
      ) : (
        <Field key={f} label={CONFLICT_LABEL[f]} pending>
          <Card kind="dn" active={false} onClick={() => onPick(f, dn[f] ?? null)}><div style={big}>{show(dn[f] ?? null)}</div></Card>
          <Card kind="pdf" active={false} onClick={() => onPick(f, pdf[f] ?? null)}><div style={big}>{show(pdf[f] ?? null)}</div></Card>
          <Card kind="own" active={false} onClick={() => undefined}>
            <input type="number" min={0} placeholder="พิมพ์ค่าแล้วกด Enter" style={{ width: '100%', padding: '4px 8px', fontSize: 14, fontWeight: 600, border: '1px solid #D4D4D4', borderRadius: 5 }}
              onKeyDown={e => { if (e.key === 'Enter' && e.currentTarget.value !== '') onPick(f, Number(e.currentTarget.value)) }}
              onBlur={e => { if (e.currentTarget.value !== '') onPick(f, Number(e.currentTarget.value)) }} />
          </Card>
        </Field>
      ))}
    </div>
  )
}
