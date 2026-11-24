import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAllProjects } from '../hooks/useProjects'
import { useBackwardTrace, useForwardTrace, useHeatLots, useProjectTrace, useUpsertHeatLot } from '../hooks/useTraceability'
import { usePermission } from '../hooks/usePermission'
import { CompletenessGauge } from '../components/traceability/CompletenessGauge'
import { AssignHeatModal } from '../components/traceability/AssignHeatModal'
import { downloadForwardTraceCsv, downloadProjectTraceCsv, type CompletenessScope, type HeatLot, type TraceRow } from '../api/traceability'
import { getErrorMessage } from '../lib/getErrorMessage'

// Traceability. Per project: how many nested (main) plate parts have a heat
// number, the list of parts with plate / heat, a filter for the ones still missing, CSV export,
// and a lookup both ways (heat no. → parts, part mark → heat no.).
// DRAFT: "main part" = BOM slot MAIN; parts the BOM does not class are counted as needing a
// heat number until QA decides otherwise.

const SCOPES: { id: CompletenessScope; label: string; hint: string }[] = [
  { id: 'main_or_unknown', label: 'Main + not classed', hint: 'Everything the BOM does not mark as accessory' },
  { id: 'main', label: 'Main parts only', hint: 'BOM slot MAIN only' },
  { id: 'all', label: 'All nested parts', hint: 'Every part on a nesting sheet' },
]

const COLS = '1.3fr 0.7fr 1.2fr 1fr 0.6fr 0.8fr 1.2fr 1.1fr 0.9fr'

function fmt(v: number | null, digits = 2): string {
  return v == null ? '—' : v.toLocaleString('en', { maximumFractionDigits: digits })
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.03em',
      borderBottom: '1px solid #F0F0F0', background: '#fff', position: 'sticky', top: 0, zIndex: 1,
    }}>{children}</div>
  )
}

function TD({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: '8px 12px', fontSize: 12, color: '#1F1F1F', borderBottom: '1px solid #F5F5F5', ...style }}>{children}</div>
}

function MainBadge({ value }: { value: boolean | null }) {
  const [text, bg, fg] = value === true ? ['Main', '#DCFCE7', '#166534'] : value === false ? ['Acc', '#F3F4F6', '#4B5563'] : ['Not classed', '#FEF3C7', '#92400E']
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: bg, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>{value}</div>
    </div>
  )
}

function PartsTable({ rows }: { rows: TraceRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 12, color: '#8E8E8E' }}>No parts match</div>
  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 420px)', minHeight: 240 }}>
      <div style={{ minWidth: 980, display: 'grid', gridTemplateColumns: COLS }}>
        <TH>Part mark</TH><TH>Class</TH><TH>Sheet</TH><TH>Grade / thk.</TH><TH>Qty</TH><TH>Weight (kg)</TH><TH>Heat no.</TH><TH>Plate no.</TH><TH>Cut date</TH>
        {rows.map(r => (
          <div key={r.order_part_id} style={{ display: 'contents' }}>
            <TD style={{ fontFamily: 'monospace' }}>{r.part_mark || '—'}</TD>
            <TD><MainBadge value={r.is_main_part} /></TD>
            <TD>
              <Link to={`/cutting-plan/${r.upload_id}`} title="Open the cutting plan to assign a heat no." style={{ color: '#C8202A', fontFamily: 'monospace' }}>{r.sheet}</Link>
            </TD>
            <TD>{r.quality ?? '—'} · {fmt(r.thick_mm)} mm</TD>
            <TD>{fmt(r.qty, 0)}</TD>
            <TD>{fmt(r.weight_kg)}</TD>
            <TD style={{ fontFamily: 'monospace' }}>
              {r.traced
                ? r.heats.map(h => <div key={h.plate_cut_id} title={[h.mill, h.cert_no].filter(Boolean).join(' · ') || undefined}>{h.heat_no}</div>)
                : <span style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B' }}>Untraced</span>}
            </TD>
            <TD>{r.heats.length ? r.heats.map(h => <div key={h.plate_cut_id}>{h.plate_no ?? '—'}</div>) : '—'}</TD>
            <TD>{r.heats.length ? r.heats.map(h => <div key={h.plate_cut_id}>{h.cut_date ?? '—'}</div>) : '—'}</TD>
          </div>
        ))}
      </div>
    </div>
  )
}

// Sheets that still need a heat no. — each opens its cutting plan, where "Assign heat no." is (Plates tab).
const SHEETS_SHOWN = 40
interface SheetToTrace { upload_id: number; nesting_id: number | null; sheet: string; parts: number }
function SheetsToTrace({ rows }: { rows: TraceRow[] }) {
  const canAssign = usePermission('cutting-plan', 'update')
  const [assignFor, setAssignFor] = useState<SheetToTrace | null>(null)
  const sheets = useMemo(() => {
    const by = new Map<string, SheetToTrace>()
    for (const r of rows) {
      if (r.traced) continue
      const key = `${r.upload_id}|${r.sheet}`
      const s = by.get(key) ?? { upload_id: r.upload_id, nesting_id: r.nesting_id, sheet: r.sheet, parts: 0 }
      s.parts += 1
      s.nesting_id ??= r.nesting_id
      by.set(key, s)
    }
    return [...by.values()].sort((a, b) => b.parts - a.parts || a.sheet.localeCompare(b.sheet))
  }, [rows])
  if (!sheets.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', marginBottom: 10 }}>
        Sheets without a heat no. ({sheets.length.toLocaleString('en')}) <span style={{ fontWeight: 400, color: '#8E8E8E' }}>· sheet · untraced part rows</span>
      </div>
      <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
        {sheets.slice(0, SHEETS_SHOWN).map(s => (
          <span key={`${s.upload_id}|${s.sheet}`} className="inline-flex items-center"
            style={{ fontSize: 12, fontFamily: 'monospace', borderRadius: 6, border: '1px solid #F3C5C8', background: '#FEF2F2', overflow: 'hidden' }}>
            <Link to={`/cutting-plan/${s.upload_id}`} title="Open the cutting plan (Plates tab)" style={{ color: '#C8202A', padding: '2px 8px' }}>
              {s.sheet} · {s.parts}
            </Link>
            {canAssign && s.nesting_id != null && (
              <button onClick={() => setAssignFor(s)} aria-label={`Assign heat no. to plate ${s.sheet}`} title="Assign heat no."
                style={{ fontSize: 11, fontWeight: 600, color: 'white', background: '#C8202A', border: 'none', padding: '3px 6px', cursor: 'pointer' }}>
                + heat
              </button>
            )}
          </span>
        ))}
        {sheets.length > SHEETS_SHOWN && (
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>and {(sheets.length - SHEETS_SHOWN).toLocaleString('en')} more — tick “Untraced only” below</span>
        )}
      </div>
      {assignFor && assignFor.nesting_id != null && (
        // Counts here are this project's untraced part rows; the dialog still passes the heat on to every part of the sheet.
        <AssignHeatModal sheetLabel={assignFor.sheet}
          sheet={{ nesting_id: assignFor.nesting_id, plate_cuts: [], parts: assignFor.parts, plates_in_report: null }}
          onClose={() => setAssignFor(null)} />
      )}
    </div>
  )
}

// Heat lot register: every heat number entered so far, with its certificate details and how much was cut from it.
// Editing fills in certificate data later (the dialog on the sheet asks only for the heat no.); the key (heat no. + mill) stays.
function HeatLotRow({ lot, canEdit }: { lot: HeatLot; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [certNo, setCertNo] = useState(lot.cert_no ?? '')
  const [supplier, setSupplier] = useState(lot.supplier ?? '')
  const [received, setReceived] = useState(lot.received_date?.slice(0, 10) ?? '')
  const upsert = useUpsertHeatLot()
  async function save() {
    try {
      await upsert.mutateAsync({
        heat_no: lot.heat_no, mill: lot.mill,
        cert_no: certNo.trim() || undefined, supplier: supplier.trim() || undefined, received_date: received || undefined,
      })
      toast.success(`Heat lot ${lot.heat_no} saved`)
      setEditing(false)
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to save the heat lot. Please try again.'))
    }
  }
  const input = { height: 28, padding: '0 6px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, width: '100%' } as const
  return (
    <div style={{ display: 'contents' }}>
      <TD style={{ fontFamily: 'monospace' }}>{lot.heat_no}</TD>
      <TD>{lot.mill || '—'}</TD>
      <TD>{[lot.grade, lot.thick_mm != null ? `${fmt(Number(lot.thick_mm), 0)} mm` : null].filter(Boolean).join(' · ') || '—'}</TD>
      <TD>{editing ? <input aria-label="Certificate no." style={input} value={certNo} maxLength={100} onChange={e => setCertNo(e.target.value)} /> : (lot.cert_no || '—')}</TD>
      <TD>{editing ? <input aria-label="Supplier" style={input} value={supplier} maxLength={200} onChange={e => setSupplier(e.target.value)} /> : (lot.supplier || '—')}</TD>
      <TD>{editing ? <input aria-label="Received date" type="date" style={input} value={received} onChange={e => setReceived(e.target.value)} /> : (lot.received_date?.slice(0, 10) || '—')}</TD>
      <TD>{lot._count ? `${lot._count.plate_cuts} / ${lot._count.part_traces}` : '—'}</TD>
      <TD>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 12, color: '#C8202A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
        )}
        {editing && (
          <span className="inline-flex items-center gap-2">
            <button onClick={save} disabled={upsert.isPending} style={{ fontSize: 12, color: 'white', background: '#C8202A', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
              {upsert.isPending ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 12, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </span>
        )}
      </TD>
    </div>
  )
}

function HeatLots() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const canEdit = usePermission('cutting-plan', 'update')
  const { data: lots, isFetching } = useHeatLots(search || undefined, open)
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
      <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {open ? '▾' : '▸'} Heat lots
        </button>
        {open && (
          <form onSubmit={e => { e.preventDefault(); setSearch(text.trim()) }} className="inline-flex items-center gap-2">
            <input aria-label="Search heat lots" value={text} onChange={e => setText(e.target.value)} placeholder="Heat no. / mill / certificate no."
              style={{ height: 30, padding: '0 8px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, width: 240 }} />
            <button type="submit" style={{ height: 30, padding: '0 10px', fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Search</button>
            {isFetching && <Loader2 size={14} className="animate-spin" style={{ color: '#C2C2C2' }} />}
          </form>
        )}
        {open && <span style={{ fontSize: 11, color: '#8E8E8E' }}>newest 200 · plates / parts cut from each</span>}
      </div>
      {open && lots && (lots.length === 0
        ? <div style={{ marginTop: 12, fontSize: 12, color: '#8E8E8E' }}>No heat lot found.</div>
        : (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1.2fr 0.9fr 0.8fr 0.8fr', minWidth: 900 }}>
              <TH>Heat no.</TH><TH>Mill</TH><TH>Grade / thickness</TH><TH>Certificate no.</TH><TH>Supplier</TH><TH>Received</TH><TH>Plates / parts</TH><TH>{' '}</TH>
              {lots.map(l => <HeatLotRow key={l.id} lot={l} canEdit={canEdit} />)}
            </div>
          </div>
        ))}
    </div>
  )
}

// Lookup both ways: a heat number lists the parts cut from it, a part mark lists its heat numbers.
function Lookup({ projectCode }: { projectCode?: string }) {
  const [mode, setMode] = useState<'forward' | 'backward'>('forward')
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<{ mode: 'forward' | 'backward'; text: string } | null>(null)
  const forward = useForwardTrace(asked?.mode === 'forward' ? asked.text : null)
  const backward = useBackwardTrace(asked?.mode === 'backward' ? asked.text : null, projectCode)
  const loading = forward.isFetching || backward.isFetching
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', marginBottom: 10 }}>Trace lookup</div>
      <form className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}
        onSubmit={e => { e.preventDefault(); if (text.trim()) setAsked({ mode, text: text.trim() }) }}>
        <select aria-label="Lookup direction" value={mode} onChange={e => { setMode(e.target.value as 'forward' | 'backward'); setAsked(null) }}
          style={{ height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff' }}>
          <option value="forward">Heat no. → parts</option>
          <option value="backward">Part mark → heat no.</option>
        </select>
        <input aria-label={mode === 'forward' ? 'Heat number' : 'Part mark'} value={text} onChange={e => setText(e.target.value)}
          placeholder={mode === 'forward' ? 'Heat no.' : 'Part mark'}
          style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 220, fontFamily: 'monospace' }} />
        <button type="submit" disabled={!text.trim()} className="disabled:opacity-40"
          style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 4, background: '#C8202A', color: 'white', cursor: 'pointer' }}>
          Trace
        </button>
        {loading && <Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} />}
      </form>

      {asked?.mode === 'forward' && forward.data && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#1F1F1F' }}>
          {forward.data.lots.length === 0 && <div style={{ color: '#8E8E8E' }}>No heat lot {forward.data.heat_no}</div>}
          {forward.data.lots.some(l => l.parts_total > 0) && (
            <button onClick={() => { downloadForwardTraceCsv(forward.data!.heat_no).catch(e => toast.error(getErrorMessage(e, 'Export failed. Please try again.'))) }}
              className="inline-flex items-center gap-1"
              style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#C8202A', background: 'none', border: '1px solid #F3C5C8', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
              <Download size={12} /> Export all parts of this heat (CSV)
            </button>
          )}
          {forward.data.lots.map(l => (
            <div key={l.id} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>
                <span style={{ fontFamily: 'monospace' }}>{l.heat_no}</span>
                {[l.mill, l.grade, l.cert_no && `cert ${l.cert_no}`].filter(Boolean).map(t => ` · ${t}`).join('')} — {l.plates.length} plate(s), {l.parts_total} part(s)
              </div>
              {l.plates.map(p => (
                <div key={p.plate_cut_id} style={{ marginTop: 4, paddingLeft: 12, borderLeft: '2px solid #F0F0F0' }}>
                  <span style={{ fontFamily: 'monospace' }}>{p.sheet}</span>{p.plate_no ? ` · plate ${p.plate_no}` : ''}{p.cut_date ? ` · cut ${p.cut_date}` : ''}
                  <div style={{ color: '#555', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                    {p.parts.map(t => `${t.part_mark}${t.qty != null ? ` ×${t.qty}` : ''}`).join(', ') || '—'}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {asked?.mode === 'backward' && backward.data && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#1F1F1F' }}>
          {backward.data.traces.length === 0 && <div style={{ color: '#8E8E8E' }}>No heat number recorded for {backward.data.part_mark}</div>}
          {backward.data.traces.map((t, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.heat_lot.heat_no}</span>
              {[t.heat_lot.mill, t.heat_lot.cert_no && `cert ${t.heat_lot.cert_no}`].filter(Boolean).map(x => ` · ${x}`).join('')}
              {' '}← sheet <span style={{ fontFamily: 'monospace' }}>{t.plate.sheet}</span>
              {t.plate.plate_no ? ` · plate ${t.plate.plate_no}` : ''}{t.plate.cut_date ? ` · cut ${t.plate.cut_date}` : ''}
              {t.project_code ? ` · ${t.project_code}` : ''}{t.qty != null ? ` · ×${t.qty}` : ''}
            </div>
          ))}
        </div>
      )}
      {(forward.isError || backward.isError) && <div style={{ marginTop: 12, fontSize: 12, color: '#C8202A' }}>Lookup failed. Please try again.</div>}
    </div>
  )
}

export function Traceability() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: projects, isLoading: loadingProjects } = useAllProjects()
  const projectId = Number(searchParams.get('project')) || null
  const [scope, setScope] = useState<CompletenessScope>('main_or_unknown')
  const [untracedOnly, setUntracedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  // The whole list of the scope is loaded once; "untraced" and the search box filter it here.
  const { data, isLoading, isError } = useProjectTrace(projectId, { scope })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.rows ?? []).filter(r =>
      (!untracedOnly || !r.traced)
      && (!q || r.part_mark.toLowerCase().includes(q) || r.sheet.toLowerCase().includes(q) || r.heats.some(h => h.heat_no.toLowerCase().includes(q))))
  }, [data, untracedOnly, search])

  async function exportCsv() {
    if (!data) return
    setExporting(true)
    try {
      await downloadProjectTraceCsv(data.project.id, data.project.project_code, { scope, untraced: untracedOnly ? 'true' : undefined, search: search.trim() || undefined })
    } catch (e) {
      toast.error(getErrorMessage(e, 'Export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  const c = data?.completeness
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white border-b border-chrome-100 px-6 flex items-center gap-3" style={{ minHeight: 56, flexShrink: 0, flexWrap: 'wrap', paddingTop: 8, paddingBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Traceability</span>
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>Heat no. ↔ plate ↔ nesting sheet ↔ part</span>
        <div style={{ flex: 1 }} />
        <select aria-label="Project" value={projectId ?? ''} disabled={loadingProjects}
          onChange={e => setSearchParams(e.target.value ? { project: e.target.value } : {})}
          style={{ height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', minWidth: 280 }}>
          <option value="">{loadingProjects ? 'Loading projects…' : 'Select a project'}</option>
          {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, background: '#FAFAFA' }}>
        {!projectId && <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#8E8E8E' }}>Select a project to see its traceability.</div>}
        {projectId && isLoading && (
          <div className="flex items-center justify-center" style={{ height: 200 }}><Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
        )}
        {projectId && isError && <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#C8202A' }}>Failed to load traceability. Please try again.</div>}

        {data && c && (<>
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <CompletenessGauge pct={c.pct_parts} label="parts with a heat no."
              sub={`${c.parts_traced.toLocaleString('en')} of ${c.parts_total.toLocaleString('en')} part rows`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, auto))', gap: '14px 28px' }}>
              <Stat label="Untraced parts" value={c.parts_untraced.toLocaleString('en')} />
              <Stat label="By pieces" value={c.pct_qty == null ? '—' : `${c.pct_qty}%`} />
              <Stat label="By weight" value={c.pct_weight == null ? '—' : `${c.pct_weight}%`} />
              <Stat label="Sheets fully traced" value={`${c.sheets_traced.toLocaleString('en')} / ${c.sheets_total.toLocaleString('en')}`} />
              <Stat label="Weight traced (kg)" value={`${fmt(c.weight_traced_kg, 0)} / ${fmt(c.weight_total_kg, 0)}`} />
              <Stat label="Not classed in BOM" value={c.main_unknown.toLocaleString('en')} />
            </div>
            <div style={{ flex: 1, minWidth: 220, fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>
              Counted: plate parts on the newest version of each nesting sheet whose project code is {data.project.project_code}.
              A part is traced when its sheet has a heat number. Main / accessory comes from the BOM slot; parts the BOM does not class
              are counted as needing a heat number. Draft rule — to be confirmed by QA.
            </div>
          </div>

          <SheetsToTrace rows={data.rows} />

          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
            <div className="flex items-center gap-3" style={{ padding: '10px 12px', borderBottom: '1px solid #E8E8E8', flexWrap: 'wrap' }}>
              <select aria-label="Parts counted" value={scope} onChange={e => setScope(e.target.value as CompletenessScope)}
                title={SCOPES.find(s => s.id === scope)?.hint}
                style={{ height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff' }}>
                {SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <label className="inline-flex items-center gap-2" style={{ fontSize: 13, color: '#1F1F1F', cursor: 'pointer' }}>
                <input type="checkbox" checked={untracedOnly} onChange={e => setUntracedOnly(e.target.checked)} />
                Untraced only
              </label>
              <div className="relative">
                <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input aria-label="Search parts" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search part mark / sheet / heat no."
                  style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 260 }} />
              </div>
              <span style={{ fontSize: 12, color: '#8E8E8E' }}>{rows.length.toLocaleString('en')} row(s)</span>
              <div style={{ flex: 1 }} />
              <button onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-2 disabled:opacity-40"
                style={{ height: 32, padding: '0 12px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', color: '#1F1F1F', cursor: 'pointer' }}>
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
              </button>
            </div>
            <PartsTable rows={rows} />
          </div>
        </>)}

        <Lookup projectCode={data?.project.project_code} />
        <HeatLots />
      </div>
    </div>
  )
}
