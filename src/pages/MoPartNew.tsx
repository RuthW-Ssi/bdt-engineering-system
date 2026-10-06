import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { changeMoStatus, importBomParts, importMaterialList, type PartLine, type PartSource } from '../api/mo'
import { apiClient } from '../api/client'
import { dispatchesApi } from '../api/dispatches'
import { useCreateMoPart, useMo, useUpdateMoPart } from '../hooks/useMo'
import { useProjects } from '../hooks/useProjects'
import { usePermission } from '../hooks/usePermission'
import { PartLinesReviewTable } from '../components/mo/PartLinesReviewTable'
import { duplicateGroups, rowErrors } from '../lib/moPartLines'
import { toDatetimeLocal } from '../lib/datetimeLocal'

// MO Part create/edit (wiki features/mo-part-import-plan). One page, top to
// bottom: project → source (pre-fills the table) → review table → prefix,
// routing, dates → save. Edit mode (/mo/:id/edit-part) is DRAFT-only (D8).

const PANEL: React.CSSProperties = { border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff', padding: 14, marginBottom: 12 }
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }
const SELECT: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13, border: '1px solid #D4D4D4', background: '#fff' }
const WARN: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, background: '#FFF8E1', border: '1px solid #F5D77A', fontSize: 12, marginTop: 8 }
const ERR: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, background: '#FFF0F0', border: '1px solid #F2B8B8', color: '#A3161E', fontSize: 12, marginBottom: 10 }

const SOURCE_LABEL: Record<PartSource, string> = {
  MATERIAL_LIST: 'อัปโหลด Material List',
  BOM_PART_LIST: 'ดึงจาก Part List (BOM)',
  MANUAL: 'กรอกเอง',
}

function apiMessage(e: unknown, fallback: string) {
  const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(msg) ? msg.join(' · ') : msg ?? fallback
}

export function MoPartNew() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editId = id ? Number(id) : null
  const isEdit = editId != null

  const canWrite = usePermission('orders', isEdit ? 'update' : 'create')
  const createMut = useCreateMoPart()
  const updateMut = useUpdateMoPart(editId ?? 0)
  const { data: existing, isLoading: loadingExisting } = useMo(editId ?? 0)
  const { data: projects } = useProjects({ limit: 100 })
  // Full mark_prefix_master list (GET /mark-prefixes) — includes OTH "อื่นๆ"
  // (D7). /product-library/mark-prefixes only lists prefixes used by products.
  const { data: prefixes } = useQuery({
    queryKey: ['mark-prefixes', 'master'],
    queryFn: () => apiClient.get('/mark-prefixes').then(r => r.data as { code: string; label: string; active: boolean }[]),
  })
  // GET /routing-templates is paginated ({ data: [...] }); active templates only.
  const { data: routings } = useQuery({
    queryKey: ['routing-templates', 'mo-part'],
    queryFn: () => apiClient.get('/routing-templates', { params: { state: 'active', limit: 100 } })
      .then(r => r.data.data as { id: number; code: string; name: string }[]),
  })

  const [projectId, setProjectId] = useState<number | null>(null)
  const [source, setSource] = useState<PartSource | null>(null)
  const [lines, setLines] = useState<PartLine[]>([])
  const [filename, setFilename] = useState<string | null>(null)
  const [fileProjectNumber, setFileProjectNumber] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dispatchId, setDispatchId] = useState<number | null>(null)
  const [slot, setSlot] = useState<'' | 'MAIN' | 'ACC'>('')
  const [prefix, setPrefix] = useState('')
  const [routingId, setRoutingId] = useState<number | null>(null)
  const [planStart, setPlanStart] = useState('')
  const [planFinish, setPlanFinish] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: dispatches } = useQuery({
    queryKey: ['dispatches', 'mo-part', projectId],
    queryFn: () => dispatchesApi.list({ project_id: projectId!, limit: 100 }),
    enabled: source === 'BOM_PART_LIST' && projectId != null,
  })

  // Edit mode: pre-fill once. Project and source stay as created.
  const seeded = useRef(false)
  useEffect(() => {
    if (!isEdit || !existing || seeded.current) return
    if (existing.kind !== 'PART' || existing.status !== 'DRAFT') return
    seeded.current = true
    setProjectId(existing.project?.id ?? null)
    setSource(existing.part_source)
    setLines(existing.part_lines.map(l => ({
      profile: l.profile,
      grade: l.grade,
      length_mm: Number(l.length_mm),
      qty: Number(l.qty),
      unit_weight_kg: l.unit_weight_kg == null ? null : Number(l.unit_weight_kg),
      part_mark: l.part_mark,
      bom_part_ids: l.bom_part_ids,
    })))
    setPrefix(existing.primary_mark_prefix_code)
    setRoutingId(existing.routing_template_id)
    setPlanStart(toDatetimeLocal(existing.plan_start))
    setPlanFinish(toDatetimeLocal(existing.plan_finish))
  }, [isEdit, existing])

  const project = useMemo(() => projects?.items.find(p => p.id === projectId) ?? null, [projects, projectId])
  const projectMismatch = fileProjectNumber && project && fileProjectNumber.trim() !== project.project_code.trim()

  function resetImport() {
    setLines([])
    setFilename(null)
    setFileProjectNumber(null)
    setWarnings([])
    setImportError(null)
    setDispatchId(null)
  }

  function pickSource(next: PartSource) {
    if (next === source) return
    if (lines.length && !window.confirm('เปลี่ยนแหล่งข้อมูลจะล้างรายการที่มี ต้องการต่อไหม?')) return
    resetImport()
    setSource(next)
    if (next === 'MANUAL') setLines([{ profile: '', grade: '', length_mm: 0, qty: 0, unit_weight_kg: null }])
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const r = await importMaterialList(file)
      setLines(r.lines)
      setFilename(r.filename)
      setFileProjectNumber(r.project_number)
      setWarnings(r.warnings)
    } catch (e) {
      resetImport()
      setImportError(apiMessage(e, 'อ่านไฟล์ไม่สำเร็จ'))
    } finally {
      setImporting(false)
    }
  }

  async function loadBom() {
    if (!dispatchId) return
    setImporting(true)
    setImportError(null)
    try {
      const r = await importBomParts(dispatchId, slot || undefined)
      setLines(r.lines)
      setWarnings(r.skipped.length ? [`ข้าม part ที่ข้อมูลไม่ครบ: ${r.skipped.join(', ')}`] : [])
    } catch (e) {
      setImportError(apiMessage(e, 'ดึงข้อมูลจาก BOM ไม่สำเร็จ'))
    } finally {
      setImporting(false)
    }
  }

  const invalid = rowErrors(lines).size > 0 || duplicateGroups(lines).length > 0
  const canSave = canWrite && !!projectId && !!source && !!prefix && !!routingId && lines.length > 0 && !invalid
  const saving = createMut.isPending || updateMut.isPending

  async function save(confirm: boolean) {
    if (!canSave || !projectId || !source || !routingId) return
    setSaveError(null)
    const common = {
      primary_mark_prefix_code: prefix,
      routing_template_id: routingId,
      plan_start: planStart ? new Date(planStart).toISOString() : undefined,
      plan_finish: planFinish ? new Date(planFinish).toISOString() : undefined,
      part_lines: lines,
    }
    try {
      if (isEdit && editId) {
        await updateMut.mutateAsync(common)
        if (confirm) await changeMoStatus(editId, { to_status: 'CONFIRMED', reason: 'Confirmed on edit' })
        toast.success('บันทึกแล้ว')
        navigate(`/mo/${editId}`)
      } else {
        const mo = await createMut.mutateAsync({ ...common, project_id: projectId, part_source: source, source_filename: filename, confirm })
        toast.success(`สร้าง ${mo.mo_code} แล้ว`)
        navigate(`/mo/${mo.id}`)
      }
    } catch (e) {
      setSaveError(apiMessage(e, 'บันทึกไม่สำเร็จ'))
    }
  }

  if (isEdit && !loadingExisting && existing && (existing.kind !== 'PART' || existing.status !== 'DRAFT')) {
    return (
      <div style={{ padding: 24 }}>
        <div style={ERR}>แก้ไขได้เฉพาะ MO Part ที่เป็นร่าง</div>
        <Link to={`/mo/${editId}`}>← กลับไปที่ MO</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate(isEdit ? `/mo/${editId}` : '/order?tab=mo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex' }}><ArrowLeft size={18} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{isEdit ? `แก้ไข MO Part ${existing?.mo_code ?? ''}` : 'สร้าง MO Part'}</h1>
      </div>

      <div style={PANEL}>
        <div style={LABEL}>1. โปรเจกต์</div>
        {isEdit ? (
          <div style={{ fontSize: 13 }}>{existing?.project ? `${existing.project.project_code} · ${existing.project.name}` : '—'}</div>
        ) : (
          <select style={SELECT} value={projectId ?? ''} onChange={e => { setProjectId(e.target.value ? Number(e.target.value) : null); setDispatchId(null) }}>
            <option value="">— เลือกโปรเจกต์ —</option>
            {projects?.items.map(p => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}
          </select>
        )}
      </div>

      <div style={PANEL}>
        <div style={LABEL}>2. แหล่งข้อมูล</div>
        {isEdit ? (
          <div style={{ fontSize: 13 }}>เริ่มจาก: {source ? SOURCE_LABEL[source] : '—'}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.keys(SOURCE_LABEL) as PartSource[]).map(s => (
                <button key={s} type="button" onClick={() => pickSource(s)} disabled={!projectId}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: projectId ? 'pointer' : 'not-allowed',
                    border: source === s ? '2px solid #C8202A' : '1px solid #D4D4D4', background: source === s ? '#FFF5F5' : '#fff', color: projectId ? '#1A1A1A' : '#AAA' }}>
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
            {!projectId && <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>เลือกโปรเจกต์ก่อน</div>}

            {source === 'MATERIAL_LIST' && (
              <div style={{ marginTop: 10 }}>
                <input type="file" accept=".xls,.xlsx" disabled={importing} onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
                {filename && <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>ไฟล์: {filename}</span>}
              </div>
            )}

            {source === 'BOM_PART_LIST' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <select style={{ ...SELECT, flex: 2 }} value={dispatchId ?? ''} onChange={e => setDispatchId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— เลือก BOM (zone / revision) —</option>
                  {dispatches?.items.map(d => (
                    <option key={d.id} value={d.id}>{d.zone.label}{d.sub_zone ? ` / ${d.sub_zone.name}` : ''} · rev {d.revision}</option>
                  ))}
                </select>
                <select style={{ ...SELECT, flex: 1 }} value={slot} onChange={e => setSlot(e.target.value as '' | 'MAIN' | 'ACC')}>
                  <option value="">ทุก slot</option>
                  <option value="MAIN">MAIN</option>
                  <option value="ACC">ACC</option>
                </select>
                <button type="button" onClick={() => void loadBom()} disabled={!dispatchId || importing}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: dispatchId ? '#C8202A' : '#DDD', color: '#fff', fontSize: 13, fontWeight: 600, cursor: dispatchId ? 'pointer' : 'not-allowed' }}>
                  ดึงข้อมูล
                </button>
              </div>
            )}

            {importing && <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>กำลังอ่านข้อมูล…</div>}
            {importError && <div style={{ ...ERR, marginTop: 8, marginBottom: 0 }}>{importError}</div>}
            {projectMismatch && <div style={WARN}>เลขโปรเจกต์ในไฟล์ ({fileProjectNumber}) ไม่ตรงกับโปรเจกต์ที่เลือก ({project?.project_code})</div>}
            {warnings.map(w => <div key={w} style={WARN}>{w}</div>)}
          </>
        )}
      </div>

      {source && (
        <div style={PANEL}>
          <div style={LABEL}>3. ตรวจสอบรายการ</div>
          <PartLinesReviewTable lines={lines} onChange={setLines} />
        </div>
      )}

      <div style={PANEL}>
        <div style={LABEL}>4. ข้อมูล MO</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12 }}>Mark prefix
            <select style={SELECT} value={prefix} onChange={e => setPrefix(e.target.value)}>
              <option value="">— เลือก —</option>
              {prefixes?.filter(p => p.active).map(p => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Routing
            <select style={SELECT} value={routingId ?? ''} onChange={e => setRoutingId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— เลือก —</option>
              {routings?.map(r => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>เริ่ม (แผน)
            <input type="datetime-local" style={SELECT} value={planStart} onChange={e => setPlanStart(e.target.value)} />
          </label>
          <label style={{ fontSize: 12 }}>เสร็จ (แผน)
            <input type="datetime-local" style={SELECT} value={planFinish} onChange={e => setPlanFinish(e.target.value)} />
          </label>
        </div>
      </div>

      {saveError && <div style={ERR}>{saveError}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" disabled={!canSave || saving} onClick={() => void save(false)}
          style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${canSave ? '#C8202A' : '#DDD'}`, background: '#fff', color: canSave ? '#C8202A' : '#BBB', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>
          บันทึกร่าง
        </button>
        <button type="button" disabled={!canSave || saving} onClick={() => void save(true)}
          style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: canSave ? '#C8202A' : '#DDD', color: '#fff', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>
          บันทึกและยืนยัน
        </button>
      </div>
    </div>
  )
}
