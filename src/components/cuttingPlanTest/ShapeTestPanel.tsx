import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FlaskConical, Loader2, Pencil, Play, Plus, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { getShapeBomSources, optimizeShapeTest, readShapeBomParts, readShapePartList } from '../../api/cutting-plan-test'
import type { ShapeTestPartList, ShapeTestResult, ShapeTestStock } from '../../api/cutting-plan-test'
import { splitByMarkSet, defaultKerf, defaultStock, STOCK_PRESETS, totals, yieldLossGrade } from '../../lib/cuttingPlanTest/shapeTest'
import { useAllProjects } from '../../hooks/useProjects'
import { InfoTip } from '../bom/InfoTip'
import { LayoutList } from './LayoutList'
import type { LossGrade } from '../../lib/cuttingPlanTest/shapeTest'
import { getErrorMessage } from '../../lib/getErrorMessage'

// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md): our own 1D layouts from a Tekla part list, in place of
// CutLogic. A test bench beside Plate / Shape: nothing is saved, no table, no file kept.
const card = { background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 16px' } as const
const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const m = (v: number) => `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} m`
const GRADE: Record<LossGrade, { label: string; bg: string; fg: string }> = {
  great: { label: 'Great', bg: '#DCFCE7', fg: '#166534' },
  ok: { label: 'OK', bg: '#FEF3C7', fg: '#92400E' },
  bad: { label: 'Bad', bg: '#FEE2E2', fg: '#991B1B' },
}
const input = { height: 28, fontSize: 12, border: '1px solid #C2C2C2', borderRadius: 4, padding: '0 6px', background: 'white' } as const
const primary = { height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' } as const
const seg = (on: boolean, h = 28) => ({ height: h, padding: '0 10px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: on ? '#1F2937' : 'white', color: on ? 'white' : '#555', display: 'inline-flex', alignItems: 'center', gap: 6 }) as const

// Tao 2026-11-13 ("hard to use"): the page reads top to bottom as three numbered steps
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, background: '#1F2937', color: 'white', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{title}</span>
      {hint && <span style={{ fontSize: 12, color: '#6B7280' }}>{hint}</span>}
    </div>
  )
}

// A run's notes (saddle options): the model file is said once for the whole run, what needs a look is shown in the
// size's row, the rest sits behind the row's ⓘ
const SOURCE = 'End cuts from '
const NEEDS_A_LOOK = ['Not in the model', 'Nest saddles took more steel', 'No end-cut data']
const needsALook = (note: string) => NEEDS_A_LOOK.some(p => note.startsWith(p))

// Two saddle ends side by side: tips touching, and one tucked into the other
function SaddleIcon({ nest }: { nest: boolean }) {
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" fill="currentColor">
      <path d="M0 1H10Q6 5 10 9H0Z" />
      <path d={nest ? 'M26 1H12Q8 5 12 9H26Z' : 'M26 1H15Q19 5 15 9H26Z'} />
    </svg>
  )
}

function LossBadge({ yieldPct }: { yieldPct: number }) {
  const loss = 100 - yieldPct
  const g = GRADE[yieldLossGrade(loss)]
  return <span style={{ background: g.bg, color: g.fg, borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{loss.toFixed(2)}% · {g.label}</span>
}

// Lengths that can be bought; how many is the answer (Required stock). A limit per length is opt-in, for stock on
// hand: it caps that length, it does not make the layout use it first.
function StockEditor({ stock, onChange }: { stock: ShapeTestStock[]; onChange: (s: ShapeTestStock[]) => void }) {
  const [limits, setLimits] = useState(stock.some(s => s.qty != null))
  const [editing, setEditing] = useState(false)
  const set = (i: number, patch: Partial<ShapeTestStock>) => onChange(stock.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const unused = STOCK_PRESETS.filter(p => !stock.some(s => s.lengthMm === p))
  const link = { fontSize: 11, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 } as const
  // Tao 2026-11-13: most sizes keep their starting lengths, so the row says them in one line; Edit opens the inputs
  if (!editing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <span>{stock.map(s => `${mm(s.lengthMm)}${s.qty != null ? ` (max ${s.qty})` : ''}`).join(' · ')}</span>
      <button onClick={() => setEditing(true)} aria-label="Edit stock lengths" style={{ ...link, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Pencil size={11} />Edit</button>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stock.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" aria-label={`Stock ${i + 1} length (mm)`} value={s.lengthMm} min={100} max={15000}
            onChange={e => set(i, { lengthMm: Number(e.target.value) })} style={{ ...input, width: 76 }} />
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>mm</span>
          {limits && <>
            <span style={{ fontSize: 11, color: '#8E8E8E' }}>max</span>
            <input type="number" aria-label={`Stock ${i + 1} limit (in stock)`} value={s.qty ?? ''} min={0} placeholder="∞"
              onChange={e => set(i, { qty: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...input, width: 52 }} />
          </>}
          {stock.length > 1 && (
            <button onClick={() => onChange(stock.filter((_, k) => k !== i))} aria-label={`Remove stock ${i + 1}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E8E', display: 'inline-flex' }}><X size={12} /></button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {stock.length < 6 && (unused.length ? unused : [6013]).map(p => (
          <button key={p} onClick={() => onChange([...stock, { lengthMm: p, qty: null }])}
            style={{ fontSize: 11, color: '#0C447C', background: 'none', border: '1px dashed #C2C2C2', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <Plus size={10} />{mm(p)}
          </button>
        ))}
        {limits
          ? <button style={link} onClick={() => { setLimits(false); onChange(stock.map(s => ({ ...s, qty: null }))) }}>No limits</button>
          : <button style={link} onClick={() => setLimits(true)}>Limit in stock</button>}
        <button style={{ ...link, fontWeight: 600 }} onClick={() => setEditing(false)}>Done</button>
      </div>
    </div>
  )
}

// Parts straight from the BOM (2026-11-11): project → zones → mark groups (the mark's area code, e.g. DBN-A3, which
// is how the CutLogic runs were grouped). Pipe and rod only for now. Tao 2026-11-12: the same calculation, run over
// all picked zones together or each zone on its own (one load per zone, sizes tagged with the zone).
function BomPicker({ onLoaded }: { onLoaded: (list: ShapeTestPartList, label: string, projectId: number) => void }) {
  const projects = useAllProjects()
  const [projectId, setProjectId] = useState<number | null>(null)
  const [zones, setZones] = useState<number[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [split, setSplit] = useState<'all' | 'zone'>('all')
  const sources = useQuery({ queryKey: ['cp-shape-test', 'bom-sources', projectId], queryFn: () => getShapeBomSources(projectId!), enabled: !!projectId })
  const zoneList = (sources.data?.zones ?? []).filter(z => z.pieces > 0) // a zone with no pipe or rod has nothing to lay out
  const groupList = [...zoneList.filter(z => zones.includes(z.id)).flatMap(z => z.groups)
    .reduce((m, g) => m.set(g.group, (m.get(g.group) ?? 0) + g.pieces), new Map<string, number>())]
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, padding: '4px 8px', background: 'white' } as const

  const load = async () => {
    if (!projectId || !zones.length) return
    setLoading(true)
    try {
      const picked = groups.filter(g => groupList.some(([x]) => x === g))
      const code = projects.data?.find(p => p.id === projectId)?.project_code ?? `#${projectId}`
      const pickedZones = zoneList.filter(z => zones.includes(z.id))
      const zoneCodes = pickedZones.map(z => z.code).join(', ')
      let list: ShapeTestPartList
      if (split === 'all') list = await readShapeBomParts({ project_id: projectId, zone_ids: pickedZones.map(z => z.id), groups: picked })
      else {
        const lists = await Promise.all(pickedZones.map(z => readShapeBomParts({ project_id: projectId, zone_ids: [z.id], groups: picked })))
        list = {
          sizes: lists.flatMap((l, i) => l.sizes.map(s => ({ ...s, zone: pickedZones[i].code }))),
          pieces: lists.reduce((n, l) => n + l.pieces, 0),
          warnings: lists.flatMap((l, i) => l.warnings.map(w => `${pickedZones[i].code}: ${w}`)),
        }
      }
      onLoaded(list, `BOM ${code} · ${zoneCodes} · ${picked.length ? picked.join(', ') : 'all mark groups'} · ${split === 'all' ? 'all zones together' : 'each zone'}`, projectId)
    } catch (e) { toast.error(getErrorMessage(e, 'Could not read the BOM')) } finally { setLoading(false) }
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555' }}>
        Project
        <select aria-label="Project" value={projectId ?? ''} onChange={e => { setProjectId(e.target.value ? Number(e.target.value) : null); setZones([]); setGroups([]) }}
          style={{ ...input, minWidth: 280 }}>
          <option value="">Pick a project…</option>
          {(projects.data ?? []).map(p => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}
        </select>
        {sources.isLoading && <Loader2 size={14} className="animate-spin" />}
      </label>
      {zoneList.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Zones (pipe + rod pieces)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {zoneList.map(z => (
              <label key={z.id} style={chip}>
                <input type="checkbox" aria-label={`${z.code} ${z.label} · ${z.pieces} pcs`} checked={zones.includes(z.id)}
                  onChange={() => setZones(v => toggle(v, z.id))} />
                <b>{z.code}</b> {z.label} <span style={{ color: '#8E8E8E' }}>· {z.pieces} pcs</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {groupList.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Mark groups (none picked = all)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {groupList.map(([g, n]) => (
              <label key={g} style={chip}>
                <input type="checkbox" aria-label={`${g} · ${n} pcs`} checked={groups.includes(g)} onChange={() => setGroups(v => toggle(v, g))} />
                {g} <span style={{ color: '#8E8E8E' }}>· {n} pcs</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6B7280' }}>Layouts</span>
        <div style={{ display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
          {([['all', 'All zones together'], ['zone', 'Each zone']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setSplit(v)} aria-pressed={split === v} style={seg(split === v)}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={!zones.length || loading} className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40"
          style={primary}>
          {loading && <Loader2 size={14} className="animate-spin" />}Load parts
        </button>
      </div>
    </div>
  )
}

export function ShapeTestPanel() {
  const [list, setList] = useState<ShapeTestPartList | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [source, setSource] = useState<'file' | 'bom'>('file')
  const [projectId, setProjectId] = useState<number | null>(null) // BOM source only: for the end cuts in 3D
  // POC 2026-11-12: saddle nesting (needs the project's end cuts, so BOM source only); lengths always the BOM's
  const [saddleNest, setSaddleNest] = useState(false)
  const [kerfs, setKerfs] = useState<Record<string, number>>({})
  const [stock, setStock] = useState<Record<string, ShapeTestStock[]>>({})
  const [results, setResults] = useState<Record<string, ShapeTestResult>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [ran, setRan] = useState(0) // sizes finished in the run under way, for the button's "2 of 6"
  const [open, setOpen] = useState<string | null>(null)
  const [reqOpen, setReqOpen] = useState<string[]>([])
  const keyOf = (s: { profile: string; grade: string | null; zone?: string }) => `${s.zone ? `${s.zone}|` : ''}${s.profile}|${s.grade ?? ''}`

  // Every edit / new list bumps a version, so a run still in flight cannot write onto newer inputs
  const versions = useRef<Record<string, number>>({})
  const epoch = useRef(0)
  const tokenOf = (k: string) => `${epoch.current}:${versions.current[k] ?? 0}`
  const clear = (key?: string) => {
    if (key) versions.current[key] = (versions.current[key] ?? 0) + 1
    else epoch.current++
    const drop = <T,>(r: Record<string, T>) => (key ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)) : {})
    setResults(drop); setErrors(drop)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    try {
      applyList(await readShapePartList(file), file.name)
    } catch (e) { toast.error(getErrorMessage(e, 'Could not read the part list')) } finally { setReading(false) }
  }

  const applyList = (r: ShapeTestPartList, label: string, project: number | null = null) => {
    setList(r); setFileName(label); setOpen(null); clear(); setProjectId(project)
    setStock(Object.fromEntries(r.sizes.map(s => [keyOf(s), defaultStock(s.profile, Math.max(...s.parts.map(p => p.lengthMm)))])))
    setKerfs(Object.fromEntries(r.sizes.map(s => [keyOf(s), defaultKerf(s.profile)])))
  }

  const run = async () => {
    if (!list) return
    clear(); setRan(0)
    for (const s of list.sizes) {
      const k = keyOf(s)
      setRunning(k)
      const token = tokenOf(k)
      try {
        const r = await optimizeShapeTest({ kerfMm: kerfs[k], parts: s.parts, stock: stock[k], ...(projectId ? { project_id: projectId, saddleNest } : {}) })
        if (tokenOf(k) === token) setResults(prev => ({ ...prev, [k]: r }))
      } catch (e) { if (tokenOf(k) === token) setErrors(prev => ({ ...prev, [k]: getErrorMessage(e, 'Layout failed') })) }
      setRan(n => n + 1)
    }
    setRunning(null)
  }

  const done = list ? list.sizes.map(keyOf).filter(k => results[k]).map(k => results[k]) : []
  const t = totals(done)
  const byZone = !!list?.sizes.some(s => s.zone)
  const cols = (byZone ? 1 : 0) + 12
  const notesOf = (k: string) => (results[k]?.notes ?? []).filter(n => !n.startsWith(SOURCE))
  const modelFile = done.flatMap(r => r.notes ?? []).find(n => n.startsWith(SOURCE))?.slice(SOURCE.length)
  // what tip to tip would have taken over what the nest plans take, for the sizes that have both
  const savedMm = done.reduce((n, r) => n + (r.tipToTip ? Math.max(0, r.tipToTip.stockLengthMm - r.stockLengthMm) : 0), 0)
  const grade = GRADE[yieldLossGrade(t.lossPct)]
  const zoneCell = (s: { zone?: string }, pad: string) => byZone && <td style={{ padding: pad, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.zone}</td>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <FlaskConical size={18} style={{ color: '#7C3AED' }} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>CP-Shape-Test · our own pipe layouts</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Test bench: lays out cuts from a Tekla part list in place of CutLogic. Nothing is saved.</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Step n={1} title="Parts" hint="where the pieces come from" />
        <div style={{ display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
          {(['file', 'bom'] as const).map(v => (
            <button key={v} onClick={() => setSource(v)} aria-pressed={source === v} style={seg(source === v, 32)}>
              {v === 'file' ? 'Part list file' : 'From BOM'}
            </button>
          ))}
        </div>
        {source === 'file' && <label className="flex items-center gap-1.5 rounded-md text-white" style={primary}>
          {reading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {list ? 'Change part list' : 'Part list (.xls)'}
          <input type="file" aria-label="Part list file" accept=".xls,.xlsx" style={{ display: 'none' }}
            onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>}
      </div>

      {source === 'bom' && <BomPicker onLoaded={applyList} />}

      {list && list.warnings.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: 12, fontSize: 12, color: '#92400E' }}>
          {list.warnings.map(w => <div key={w}>{w}</div>)}
        </div>
      )}

      {list && <Step n={2} title="Stock lengths" hint="check the lengths to cut from, then run" />}
      {list && (
        <div style={{ ...card, padding: 0 }}>
          <div className="flex items-center justify-between" style={{ padding: '10px 12px', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 13, color: '#555' }}><b>{fileName}</b> · {list.sizes.length} sizes · {list.pieces.toLocaleString('en-US')} pcs</div>
              {modelFile && <div data-testid="model-file" style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{`End cuts and cut lengths from ${modelFile}`}</div>}
            </div>
            {projectId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#6B7280' }}>Saddle ends</span>
                <InfoTip label="About saddle ends" text="Tip to tip: each piece starts after the tip of the one before, a kerf apart. Nest saddles: a saddle end is turned and tucked into the next one, still a kerf apart, so the pair takes less stock. When nesting takes more stock, the tip-to-tip layouts are shown." />
                <div style={{ display: 'inline-flex', border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden' }}>
                  {([['Tip to tip', false], ['Nest saddles', true]] as const).map(([name, nest]) => (
                    <button key={name} aria-pressed={saddleNest === nest} onClick={() => { if (saddleNest !== nest) { setSaddleNest(nest); clear() } }} style={seg(saddleNest === nest)}>
                      <SaddleIcon nest={nest} />{name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={run} disabled={!!running} aria-label="Run layouts" className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40" style={primary}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{running ? `Laying out ${Math.min(ran + 1, list.sizes.length)} of ${list.sizes.length}` : 'Run layouts'}
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>
                {[...(byZone ? ['Zone'] : []), 'Size', 'Grade', 'Pieces', 'Parts length', 'Kerf (mm)', 'Lengths (mm)', 'Required stock', 'Yield', 'Yield loss', 'Cuts', 'Scrap', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontWeight: 500, borderTop: '1px solid #F3F4F6' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.sizes.flatMap(s => {
                const k = keyOf(s), r = results[k]
                const pieces = s.parts.reduce((n, p) => n + p.count, 0)
                const length = r?.partsLengthMm ?? s.parts.reduce((n, p) => n + p.count * p.lengthMm, 0) // after a run: the lengths laid out (BdtPipeCut's, from a BOM)
                const notes = notesOf(k), quiet = notes.filter(n => !needsALook(n))
                const row = (
                  <tr key={k} data-testid={`size-${s.profile}`} style={{ borderTop: '1px solid #F3F4F6', verticalAlign: 'top', background: open === k ? '#F9FAFB' : 'white' }}>
                    {zoneCell(s, '8px 12px')}
                    <td style={{ padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{s.profile}{quiet.length > 0 && <InfoTip label={`Notes for ${s.zone ? `${s.zone} ` : ''}${s.profile}`} text={quiet.join(' · ')} />}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{s.grade ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{pieces.toLocaleString('en-US')}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{m(length)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <input type="number" aria-label="Kerf (mm)" value={kerfs[k] ?? 12} min={0} max={20}
                        onChange={e => { setKerfs(p => ({ ...p, [k]: Number(e.target.value) })); clear(k) }} style={{ ...input, width: 52 }} />
                    </td>
                    <td style={{ padding: '8px 12px' }}><StockEditor stock={stock[k] ?? []} onChange={v => { setStock(p => ({ ...p, [k]: v })); clear(k) }} /></td>
                    {r ? <>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {r.stockMix.filter(x => x.pieces).map(x => <div key={x.lengthMm}>{`${mm(x.lengthMm)} × ${x.pieces}`}</div>)}
                        {r.tipToTip && r.tipToTip.stockLengthMm > r.stockLengthMm + 1e-6 && <div style={{ color: '#0F766E', fontSize: 11 }}>{`Nesting saves ${m(r.tipToTip.stockLengthMm - r.stockLengthMm)}`}</div>}
                        {r.timedOut && <div style={{ color: '#92400E', fontSize: 11, whiteSpace: 'normal' }}>Search cut short: may not be the fewest stocks</div>}
                        {notes.filter(needsALook).map(n => <div key={n} style={{ color: '#92400E', fontSize: 11, whiteSpace: 'normal', maxWidth: 260 }}>{n}</div>)}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{r.yieldPct.toFixed(2)}%</td>
                      <td style={{ padding: '8px 12px' }}><LossBadge yieldPct={r.yieldPct} /></td>
                      <td style={{ padding: '8px 12px' }}>{r.cuts.toLocaleString('en-US')}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{m(r.scrapMm)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <button onClick={() => setOpen(open === k ? null : k)} aria-label={`Layouts of ${s.zone ? `${s.zone} ` : ''}${s.profile}`}
                          style={{ fontSize: 12, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {open === k ? 'Hide' : 'Layouts'}
                        </button>
                      </td>
                    </> : (
                      <td colSpan={6} style={{ padding: '8px 12px', fontSize: 12, color: errors[k] ? '#991B1B' : '#8E8E8E' }}>
                        {errors[k] ?? (running === k ? 'Laying out…' : '—')}
                      </td>
                    )}
                  </tr>
                )
                // Tao 2026-11-13: the layouts open right under the row that was clicked, not at the foot of the page
                return open === k && r ? [row, (
                  <tr key={`${k}|layouts`}>
                    <td colSpan={cols} data-testid={`layouts-${k}`} style={{ padding: '10px 12px 16px', background: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
                      <LayoutList profile={s.profile} layouts={r.layouts} kerfMm={kerfs[k] ?? 12} projectId={projectId} bg="#F9FAFB" />
                    </td>
                  </tr>
                )] : [row]
              })}
            </tbody>
          </table>
        </div>
      )}

      {done.length > 0 && list && <Step n={3} title="Result" hint={running ? 'so far' : undefined} />}
      {done.length > 0 && (
        <div data-testid="test-totals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { v: t.stocks.toLocaleString('en-US'), l: 'Stock pieces' },
            { v: m(t.stockLengthMm), l: 'Stock length' },
            { v: `${t.lossPct.toFixed(2)}%`, l: `Yield loss · ${grade.label}`, color: grade.fg },
            { v: m(t.scrapMm), l: 'Scrap' },
            { v: t.cuts.toLocaleString('en-US'), l: 'Cuts' },
            ...(t.nestedMm > 0 ? [{ v: m(t.nestedMm), l: savedMm > 0 ? `Nested · saves ${m(savedMm)} of stock` : 'Nested', color: '#0F766E' }] : []),
          ].map(c => (
            <div key={c.l} style={card}>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color ?? '#1F1F1F' }}>{c.v}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{c.l}</div>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && list && (
        <div data-testid="required-stock" style={{ ...card, padding: 0 }}>
          <div style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600 }}>Required stock <span style={{ fontSize: 12, fontWeight: 400, color: '#6B7280' }}>· what to prepare or buy</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#6B7280', fontSize: 12 }}>
              {[...(byZone ? ['Zone'] : []), 'Size', 'Grade', 'Length', 'Pcs', 'Layouts'].map(h => <th key={h} style={{ padding: '6px 12px', fontWeight: 500, textAlign: h === 'Pcs' || h === 'Layouts' ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {list.sizes.flatMap(s => {
                const r = results[keyOf(s)]
                if (!r) return []
                return r.stockMix.filter(x => x.pieces).flatMap(x => {
                  const id = `${keyOf(s)}|${x.lengthMm}`
                  const ls = r.layouts.filter(l => l.stockLengthMm === x.lengthMm)
                  const isOpen = reqOpen.includes(id)
                  const toggle = () => setReqOpen(v => (isOpen ? v.filter(k => k !== id) : [...v, id]))
                  const row = (
                    <tr key={id} onClick={toggle} style={{ borderTop: '1px solid #F3F4F6', background: isOpen ? '#F9FAFB' : 'white', cursor: 'pointer' }}>
                      {zoneCell(s, '6px 12px')}
                      <td style={{ padding: '6px 12px', fontWeight: 600 }}>{s.profile}</td>
                      <td style={{ padding: '6px 12px' }}>{s.grade ?? '—'}</td>
                      <td style={{ padding: '6px 12px' }}>{mm(x.lengthMm)} mm</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>{x.pieces.toLocaleString('en-US')}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {splitByMarkSet(ls).length}
                        <button onClick={e => { e.stopPropagation(); toggle() }} aria-label={`Layouts of ${s.zone ? `${s.zone} ` : ''}${s.profile} on ${mm(x.lengthMm)} mm`}
                          style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', verticalAlign: 'middle', display: 'inline-flex' }}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                    </tr>
                  )
                  return isOpen ? [row, (
                    <tr key={`${id}|open`}>
                      <td colSpan={byZone ? 6 : 5} data-testid={`req-layouts-${id}`} style={{ padding: '8px 12px 14px', background: '#F9FAFB' }}>
                        <LayoutList profile={s.profile} layouts={ls} kerfMm={kerfs[keyOf(s)] ?? 12} projectId={projectId} bg="#F9FAFB" />
                      </td>
                    </tr>
                  )] : [row]
                })
              })}
              <tr style={{ borderTop: '1px solid #E5E7EB', fontWeight: 600 }}>
                <td style={{ padding: '6px 12px' }}>Total</td><td /><td />{byZone && <td />}
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{t.stocks.toLocaleString('en-US')}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{done.reduce((n, r) => n + splitByMarkSet(r.layouts).length, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
