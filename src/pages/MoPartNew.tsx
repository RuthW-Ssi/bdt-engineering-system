import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { changeMoStatus, importBomParts, importDispatchNote, importMaterialList, importNc, type PartLine, type PartMark, type PartSource } from '../api/mo'
import { apiClient } from '../api/client'
import { dispatchesApi } from '../api/dispatches'
import { useCreateMoPart, useMo, useUpdateMoPart } from '../hooks/useMo'
import { useProjects } from '../hooks/useProjects'
import { usePermission } from '../hooks/usePermission'
import { PartLinesReviewTable } from '../components/mo/PartLinesReviewTable'
import { PartMarksTable } from '../components/mo/PartMarksTable'
import { SizeComparisonPanel } from '../components/mo/SizeComparisonPanel'
import { duplicateGroups, rowErrors } from '../lib/moPartLines'
import { rebuildLines } from '../lib/moPartMatch'
import { toDatetimeLocal } from '../lib/datetimeLocal'
import { StepHead, ui } from '../components/mo/PartUi'
import { MoStatusPill } from '../components/mo/MoStatusPill'

// MO Part create/edit (wiki features/mo-part-import-plan §10). Every source
// only pre-fills: Dispatch Note → marks, Material List → sizes (and the
// comparison), NC → one line per part mark, BOM → grouped sizes. Everything
// stays editable; edit mode works in any status except CANCELLED (R2).

export const SOURCE_LABEL: Record<PartSource, string> = {
  DISPATCH_NOTE: 'Dispatch Note',
  MATERIAL_LIST: 'Material List',
  NC: 'NC (.nc1)',
  BOM_PART_LIST: 'Part List (BOM)',
  MANUAL: 'กรอกเอง',
}

function apiMessage(e: unknown, fallback: string) {
  const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(msg) ? msg.join(' · ') : msg ?? fallback
}

const n = (v: unknown) => (v == null ? null : Number(v))

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
  // Full mark_prefix_master list (GET /mark-prefixes) — includes OTH "อื่นๆ" (D7).
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
  const [marks, setMarks] = useState<PartMark[]>([])
  const [lines, setLines] = useState<PartLine[]>([])
  const [materialList, setMaterialList] = useState<PartLine[] | null>(null)
  const [sources, setSources] = useState<PartSource[]>([])
  const [files, setFiles] = useState<{ kind: PartSource; filename: string }[]>([])
  const [warnings, setWarnings] = useState<Partial<Record<PartSource, string[]>>>({})
  const [fileProjectNumber, setFileProjectNumber] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dispatchId, setDispatchId] = useState<number | null>(null)
  const [slot, setSlot] = useState<'' | 'MAIN' | 'ACC'>('')
  const [buildWarnings, setBuildWarnings] = useState<string[]>([])
  const [prefix, setPrefix] = useState('')
  const [routingId, setRoutingId] = useState<number | null>(null)
  const [planStart, setPlanStart] = useState('')
  const [planFinish, setPlanFinish] = useState('')
  const [note, setNote] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: dispatches } = useQuery({
    queryKey: ['dispatches', 'mo-part', projectId],
    queryFn: () => dispatchesApi.list({ project_id: projectId!, limit: 100 }),
    enabled: projectId != null,
  })

  const editable = !isEdit || (existing?.kind === 'PART' && existing.status !== 'CANCELLED')

  // Edit mode: pre-fill once. Project stays as created (P1).
  const seeded = useRef(false)
  useEffect(() => {
    if (!isEdit || !existing || seeded.current || !editable) return
    seeded.current = true
    setProjectId(existing.project?.id ?? null)
    setMarks((existing.part_marks ?? []).map(m => ({
      mark: m.mark, set_qty: Number(m.set_qty), length_mm: n(m.length_mm), width_mm: n(m.width_mm), height_mm: n(m.height_mm),
      weight_kg: n(m.weight_kg), tw_mm: n(m.tw_mm), tf_mm: n(m.tf_mm),
    })))
    setLines(existing.part_lines.map(l => ({
      mark: l.mark?.mark ?? null,
      profile: l.profile, grade: l.grade, length_mm: Number(l.length_mm), qty: Number(l.qty),
      unit_weight_kg: n(l.unit_weight_kg), part_mark: l.part_mark, bom_part_ids: l.bom_part_ids,
      holes: l.holes ?? [], cut_length_mm: n(l.cut_length_mm),
    })))
    setPrefix(existing.primary_mark_prefix_code)
    setRoutingId(existing.routing_template_id)
    setPlanStart(toDatetimeLocal(existing.plan_start))
    setPlanFinish(toDatetimeLocal(existing.plan_finish))
  }, [isEdit, existing, editable])

  const project = useMemo(() => projects?.items.find(p => p.id === projectId) ?? null, [projects, projectId])
  const projectMismatch = fileProjectNumber && project && fileProjectNumber.trim() !== project.project_code.trim()
  const markNames = marks.map(m => m.mark.trim()).filter(Boolean)

  function addSource(kind: PartSource, filename?: string, w: string[] = []) {
    setSources(s => (s.includes(kind) ? s : [...s, kind]))
    if (filename) setFiles(f => [...f.filter(x => x.kind !== kind || kind === 'NC'), { kind, filename }])
    setWarnings(prev => ({ ...prev, [kind]: w }))
  }

  // Lines (and BOM part ids) belong to the project they were loaded for.
  function pickProject(next: number | null) {
    if (next === projectId) return
    if ((lines.length || marks.length) && !window.confirm('เปลี่ยนโปรเจกต์จะล้างข้อมูลที่มี ต้องการต่อไหม?')) return
    setLines([]); setMarks([]); setMaterialList(null); setSources([]); setFiles([]); setWarnings({}); setFileProjectNumber(null); setDispatchId(null); setBuildWarnings([])
    setProjectId(next)
  }

  async function run<T>(fn: () => Promise<T>, fallback: string): Promise<T | null> {
    setImporting(true)
    setImportError(null)
    try { return await fn() } catch (e) { setImportError(apiMessage(e, fallback)); return null } finally { setImporting(false) }
  }

  async function onDispatchNote(file?: File) {
    if (!file) return
    const r = await run(() => importDispatchNote(file), 'อ่าน Dispatch Note ไม่สำเร็จ')
    if (!r) return
    if (marks.length && !window.confirm('แทนที่ mark ที่มีด้วย mark จากไฟล์นี้?')) return
    setMarks(r.marks)
    addSource('DISPATCH_NOTE', r.filename, r.warnings)
  }

  async function onMaterialList(file?: File) {
    if (!file) return
    const r = await run(() => importMaterialList(file), 'อ่าน Material List ไม่สำเร็จ')
    if (!r) return
    setMaterialList(r.lines)
    setFileProjectNumber(r.project_number)
    // No marks yet → the sizes become (unassigned) lines straight away.
    if (!marks.length && !lines.length) setLines(r.lines.map(l => ({ ...l, mark: null })))
    addSource('MATERIAL_LIST', r.filename, r.warnings)
  }

  async function onNc(list: FileList | null) {
    if (!list?.length) return
    const picked = Array.from(list)
    const r = await run(() => importNc(picked), 'อ่านไฟล์ NC ไม่สำเร็จ')
    if (!r) return
    setLines(prev => [...prev, ...r.lines])
    addSource('NC', `${r.files_count} ไฟล์ NC`, r.warnings)
  }

  async function onBom() {
    if (!dispatchId) return
    const r = await run(() => importBomParts(dispatchId, slot || undefined), 'ดึงข้อมูลจาก BOM ไม่สำเร็จ')
    if (!r) return
    setLines(prev => [...prev, ...r.lines])
    addSource('BOM_PART_LIST', undefined, r.skipped.length ? [`ข้าม part ที่ข้อมูลไม่ครบ: ${r.skipped.join(', ')}`] : [])
  }

  // Rebuild plate lines from the marks (+ Material List when loaded). Marks
  // that can't be derived keep their lines; NC/BOM lines are kept; derived
  // tw/tf are written back to the marks (see rebuildLines).
  function buildPlates() {
    const msg = materialList
      ? 'จะสร้างรายการแผ่นของ mark ใหม่จาก mark + Material List (รายการจาก NC และ BOM คงไว้) ต้องการต่อไหม?'
      : 'ยังไม่ได้อัปโหลด Material List ในหน้านี้ — mark ที่ไม่มี tw/tf จะคงรายการเดิมไว้ ต้องการต่อไหม?'
    if (lines.length && !window.confirm(msg)) return
    const r = rebuildLines(lines, marks, materialList)
    setLines(r.lines)
    setMarks(r.marks)
    setBuildWarnings(r.warnings)
  }

  const invalid = rowErrors(lines, markNames).size > 0 || duplicateGroups(lines).length > 0 || marks.some(m => !m.mark.trim() || !(m.set_qty > 0))
  const hasContent = lines.length > 0 || marks.length > 0
  const canSave = canWrite && editable && !!projectId && !!prefix && !!routingId && hasContent && !invalid
  const saving = createMut.isPending || updateMut.isPending

  async function save(confirm: boolean) {
    if (!canSave || !projectId || !routingId) return
    setSaveError(null)
    const common = {
      primary_mark_prefix_code: prefix,
      routing_template_id: routingId,
      plan_start: planStart ? new Date(planStart).toISOString() : undefined,
      plan_finish: planFinish ? new Date(planFinish).toISOString() : undefined,
      part_marks: marks.map(m => ({ ...m, mark: m.mark.trim() })),
      part_lines: lines,
      source_files: files,
    }
    try {
      if (isEdit && editId) {
        await updateMut.mutateAsync({ ...common, part_sources: sources, note: note.trim() || undefined })
        if (confirm && existing?.status === 'DRAFT') await changeMoStatus(editId, { to_status: 'CONFIRMED', reason: 'Confirmed on edit' })
        toast.success('บันทึกแล้ว')
        navigate(`/mo/${editId}`)
      } else {
        const mo = await createMut.mutateAsync({ ...common, project_id: projectId, part_sources: sources.length ? sources : ['MANUAL'], confirm })
        toast.success(`สร้าง ${mo.mo_code} แล้ว`)
        navigate(`/mo/${mo.id}`)
      }
    } catch (e) {
      setSaveError(apiMessage(e, 'บันทึกไม่สำเร็จ'))
    }
  }

  if (isEdit && !loadingExisting && existing && !editable) {
    return (
      <div className="p-6">
        <div className={`${ui.error} mb-3`}>{existing.kind !== 'PART' ? 'หน้านี้ใช้แก้ไขเฉพาะ MO Part' : 'MO Part ที่ยกเลิกแล้วแก้ไขไม่ได้'}</div>
        <Link to={`/mo/${editId}`} className="text-sm text-steel-600 hover:underline">← กลับไปที่ MO</Link>
      </div>
    )
  }

  const warnList = (kind: PartSource) => (warnings[kind] ?? []).map(w => <div key={w} className={`${ui.warn} mt-1.5`}>{w}</div>)
  const fileOf = (kind: PartSource) => files.filter(f => f.kind === kind).map(f => f.filename).join(', ')
  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const routingName = routings?.find(r => r.id === routingId)?.name

  return (
    <div className={ui.page}>
      <div className={ui.header}>
        <button className={ui.backBtn} onClick={() => navigate(isEdit ? `/mo/${editId}` : '/order?tab=mo')}><ArrowLeft size={18} /></button>
        <span className={ui.title}>{isEdit ? `แก้ไข MO Part ${existing?.mo_code ?? ''}` : 'สร้าง MO Part'}</span>
        <span className={ui.partBadge}>MO Part</span>
        {isEdit && existing && <MoStatusPill status={existing.status} />}
      </div>

      <div className={ui.body}>
        <section className={ui.panel}>
          <StepHead n={1} title="โปรเจกต์" />
          {isEdit ? (
            <div className="text-sm text-chrome-900">{existing?.project ? `${existing.project.project_code} · ${existing.project.name}` : '—'}</div>
          ) : (
            <select className={ui.select} value={projectId ?? ''} onChange={e => pickProject(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— เลือกโปรเจกต์ —</option>
              {projects?.items.map(p => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}
            </select>
          )}
        </section>

        <section className={ui.panel}>
          <StepHead n={2} title="นำข้อมูลเข้า" hint="ไม่บังคับ · เลือกได้หลายอย่าง · แก้ทุกอย่างได้ภายหลัง" />
          {!projectId ? <div className={ui.muted}>เลือกโปรเจกต์ก่อน</div> : (
            <div className="grid grid-cols-4 gap-2">
              <div className={ui.card}>
                <div className="mb-1.5 font-semibold text-chrome-900">Dispatch Note → mark</div>
                <input type="file" accept=".xls,.xlsx" className={ui.file} disabled={importing} onChange={e => { void onDispatchNote(e.target.files?.[0]); e.target.value = '' }} />
                {fileOf('DISPATCH_NOTE') && <div className="mt-1 text-chrome-400">ไฟล์: {fileOf('DISPATCH_NOTE')}</div>}
                {warnList('DISPATCH_NOTE')}
              </div>
              <div className={ui.card}>
                <div className="mb-1.5 font-semibold text-chrome-900">Material List → ขนาดแผ่น</div>
                <input type="file" accept=".xls,.xlsx" className={ui.file} disabled={importing} onChange={e => { void onMaterialList(e.target.files?.[0]); e.target.value = '' }} />
                {fileOf('MATERIAL_LIST') && <div className="mt-1 text-chrome-400">ไฟล์: {fileOf('MATERIAL_LIST')}</div>}
                {projectMismatch && <div className={`${ui.warn} mt-1.5`}>เลขโปรเจกต์ในไฟล์ ({fileProjectNumber}) ไม่ตรงกับโปรเจกต์ที่เลือก ({project?.project_code})</div>}
                {warnList('MATERIAL_LIST')}
              </div>
              <div className={ui.card}>
                <div className="mb-1.5 font-semibold text-chrome-900">NC (.nc1) → รายชิ้น + รูเจาะ</div>
                <input type="file" accept=".nc1,.nc" multiple className={ui.file} disabled={importing} onChange={e => { void onNc(e.target.files); e.target.value = '' }} />
                {fileOf('NC') && <div className="mt-1 text-chrome-400">{fileOf('NC')}</div>}
                {warnList('NC')}
              </div>
              <div className={ui.card}>
                <div className="mb-1.5 font-semibold text-chrome-900">Part List (BOM) ในระบบ</div>
                <select className={`${ui.select} mb-1 text-xs`} value={dispatchId ?? ''} onChange={e => setDispatchId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— เลือก BOM —</option>
                  {dispatches?.items.map(d => <option key={d.id} value={d.id}>{d.zone.label}{d.sub_zone ? ` / ${d.sub_zone.name}` : ''} · rev {d.revision}</option>)}
                </select>
                <div className="flex gap-1">
                  <select className={`${ui.select} text-xs`} value={slot} onChange={e => setSlot(e.target.value as '' | 'MAIN' | 'ACC')}>
                    <option value="">ทุก slot</option><option value="MAIN">MAIN</option><option value="ACC">ACC</option>
                  </select>
                  <button type="button" className={ui.btnPrimarySm} disabled={!dispatchId || importing} onClick={() => void onBom()}>ดึง</button>
                </div>
                {warnList('BOM_PART_LIST')}
              </div>
            </div>
          )}
          {importing && <div className="mt-2 flex items-center gap-1.5 text-xs text-chrome-600"><Loader2 size={13} className="animate-spin" /> กำลังอ่านข้อมูล…</div>}
          {importError && <div className={`${ui.error} mt-2`}>{importError}</div>}
          {isEdit && existing?.source_files?.length ? <div className={`${ui.muted} mt-2`}>ไฟล์ที่ใช้ก่อนหน้า: {existing.source_files.map(f => f.filename).join(', ')}</div> : null}
        </section>

        {projectId && (
          <section className={ui.panel}>
            <StepHead n={3} title={`Mark (${marks.length})`} hint="จาก Dispatch Note หรือเพิ่มเอง · tw/tf ว่างได้"
              right={marks.length > 0 && <button type="button" className={ui.btnPrimarySm} onClick={buildPlates}>สร้างรายการแผ่นจาก mark</button>} />
            <PartMarksTable marks={marks} onChange={setMarks} />
            {buildWarnings.map(w => <div key={w} className={`${ui.warn} mt-1.5`}>{w}</div>)}
          </section>
        )}

        {materialList && marks.length > 0 && lines.some(l => l.mark) && (
          <section className={ui.panel}>
            <StepHead n={4} title="เทียบกับ Material List" hint="แค่เตือน ไม่บล็อกการบันทึก" />
            <SizeComparisonPanel lines={lines} materialList={materialList} />
          </section>
        )}

        {projectId && (
          <section className={ui.panel}>
            <StepHead n={materialList && marks.length > 0 && lines.some(l => l.mark) ? 5 : 4} title={`รายการแผ่น (${lines.length})`} />
            <PartLinesReviewTable lines={lines} onChange={setLines} marks={markNames} />
          </section>
        )}

        <section className={ui.panel}>
          <StepHead n={projectId ? (materialList && marks.length > 0 && lines.some(l => l.mark) ? 6 : 5) : 3} title="ข้อมูล MO" />
          <div className="grid grid-cols-4 gap-3">
            <label className="flex flex-col gap-1"><span className={ui.label}>Mark prefix</span>
              <select className={ui.select} value={prefix} onChange={e => setPrefix(e.target.value)}>
                <option value="">— เลือก —</option>
                {prefixes?.filter(p => p.active).map(p => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className={ui.label}>Routing</span>
              <select className={ui.select} value={routingId ?? ''} onChange={e => setRoutingId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— เลือก —</option>
                {routings?.map(r => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className={ui.label}>เริ่ม (แผน)</span>
              <input type="datetime-local" className={ui.select} value={planStart} onChange={e => setPlanStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1"><span className={ui.label}>เสร็จ (แผน)</span>
              <input type="datetime-local" className={ui.select} value={planFinish} onChange={e => setPlanFinish(e.target.value)} />
            </label>
          </div>
          {isEdit && (
            <label className="mt-3 flex flex-col gap-1"><span className={ui.label}>หมายเหตุการแก้ไข (ไม่บังคับ)</span>
              <input className={ui.select} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="เช่น ลูกค้าแก้แบบ flange เพิ่ม 2 แผ่น" />
            </label>
          )}
        </section>
        {saveError && <div className={ui.error}>{saveError}</div>}
      </div>

      <div className={ui.saveBar}>
        <div className="flex gap-5 text-xs text-chrome-600">
          <span>Prefix: <strong className="text-chrome-900">{prefix || '—'}</strong></span>
          <span>Mark: <strong className="text-chrome-900">{marks.length}</strong></span>
          <span>แผ่น: <strong className="text-chrome-900">{lines.length}</strong> แถว · <strong className="text-chrome-900">{totalQty}</strong> ชิ้น</span>
          <span>Routing: <strong className="text-chrome-900">{routingName ?? '—'}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={ui.btnNeutral} onClick={() => navigate(isEdit ? `/mo/${editId}` : '/order?tab=mo')}>ยกเลิก</button>
          <button type="button" className={ui.btnSecondary} disabled={!canSave || saving} onClick={() => void save(false)}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : isEdit ? 'บันทึก' : 'บันทึกร่าง'}
          </button>
          {(!isEdit || existing?.status === 'DRAFT') && (
            <button type="button" className={ui.btnPrimary} disabled={!canSave || saving} onClick={() => void save(true)}>บันทึกและยืนยัน</button>
          )}
        </div>
      </div>
    </div>
  )
}
