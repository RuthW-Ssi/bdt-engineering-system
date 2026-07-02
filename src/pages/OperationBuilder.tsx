import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Check, Pencil, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '../api/client'
import ActivityLibraryPanel from '../components/operations/ActivityLibraryPanel'
import { useOperationTemplate, useUpdateFromLibrary } from '../hooks/useOperationTemplates'
import { ActivityBuilderModal } from './ActivityBuilder'
import { useConfirm } from '../components/ui/ConfirmDialog'

// ── Types ──────────────────────────────────────────────────────

interface WorkcenterItem { id: number; code: string; name: string; machine?: string | null }
interface OpTypeItem { id: number; key: string; label: string; color: string; default_wc_id: number | null; default_wc: { id: number; code: string; name: string } | null }

interface ConsumableFormItem { resource_id: number; qty: string; unit: string; name?: string; formula_name?: string | null }

interface FormActivityLabor { skill: string; qty: number; level?: string }
interface FormActivityMaterial { material_id: number; name: string; code: string; formula_id?: number | null; formula_name?: string | null; formula_unit?: string | null; formula_expr?: string | null }

interface FormActivityTool { id: number; qty: number }

interface FormActivity {
  id?: number
  localId: string
  name: string; measure: string; unit: string; per_minute: string
  source_activity_id: number | null
  source_activity_code: string | null
  snapshot_at: string | null
  is_stale: boolean
  tools: FormActivityTool[]
  consumables: ConsumableFormItem[]
  labors: FormActivityLabor[]
  op_materials: FormActivityMaterial[]
  ratio: number | null
  ratio_unit: string | null
  per_time: number | null
  formula_code: string | null
}

interface EquipmentResource { id: number; code: string; name: string; type: string; rate: number | null; rate_unit: string | null }

interface FormState {
  op_code: string; name: string
  op_type_id: number | ''; workcenter_id: number | ''; method: string
  activities: FormActivity[]
}

// ── Helpers ────────────────────────────────────────────────────

let _seq = 0
const uid = () => `act-${Date.now()}-${++_seq}`

const OP_CODE_RE = /^[A-Z][A-Z0-9-]{1,38}$/

function fmtMin(min: number): string {
  if (min < 60) return `${min.toFixed(1)}min`
  return `${(min / 60).toFixed(1)}h`
}

function canPublish(f: FormState): boolean {
  if (!OP_CODE_RE.test(f.op_code.trim())) return false
  if (!f.name.trim()) return false
  if (!f.workcenter_id) return false
  if (f.activities.length === 0) return false
  return true
}

// ── Styles ─────────────────────────────────────────────────────

const sectionHead: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }
const input: React.CSSProperties = { width: '100%', border: '1px solid #E0E0E0', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const selectStyle: React.CSSProperties = { ...input, cursor: 'pointer', background: '#fff' }

// ── Main component ─────────────────────────────────────────────

export default function OperationBuilder() {
  const navigate = useNavigate()
  const { id: paramId } = useParams<{ id?: string }>()
  const isEdit = Boolean(paramId)
  const templateId = paramId ? Number(paramId) : null

  const [editingActivity, setEditingActivity] = useState<{ sourceId: number; opActId: number } | null>(null)
  const [form, setForm] = useState<FormState>({
    op_code: '', name: '', op_type_id: '', workcenter_id: '', method: '', activities: [] as FormActivity[],
  })
  const queryClient = useQueryClient()
  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))
  const initializedRef = useRef(false)
  const updateFromLibMut = useUpdateFromLibrary(templateId ?? 0)

  // Load existing template in edit mode
  const { data: templateDetail, isLoading: loadingTpl } = useOperationTemplate(templateId, true)

  const mapActivities = (acts: typeof templateDetail extends undefined ? never : NonNullable<typeof templateDetail>['activities']) =>
    acts.map((a) => {
      const src = (a as any).source_activity
      return {
        id: a.id,
        localId: uid(),
        name: a.name,
        measure: a.measure,
        unit: a.unit ?? '',
        per_minute: a.per_minute ? String(a.per_minute) : '',
        source_activity_id: a.source_activity_id ?? null,
        source_activity_code: a.source_activity_code ?? null,
        snapshot_at: a.snapshot_at ?? null,
        is_stale: (a as any).is_stale ?? false,
        tools: a.tools?.map((t) => ({ id: t.resource.id, qty: t.qty ?? 1 })) ?? [],
        consumables: a.consumables?.map((c) => ({ resource_id: c.resource.id, name: c.resource.name, qty: c.qty != null ? String(c.qty) : '', unit: c.unit ?? '', formula_name: (c as any).formula_name ?? null })) ?? [],
        labors: a.skills?.map(l => ({ skill: l.skill, qty: l.qty, level: l.level ?? undefined })) ?? [],
        op_materials: a.op_materials?.map(m => ({ material_id: m.resource.id, name: m.resource.name, code: m.resource.code, formula_id: m.formula?.id ?? null, formula_name: m.formula?.name ?? null, formula_unit: m.formula?.result_unit ?? null, formula_expr: m.formula?.expr ?? null })) ?? [],
        ratio:        src?.ratio     ? Number(src.ratio)    : null,
        ratio_unit:   src?.ratio_unit ?? null,
        per_time:     src?.per_time  ? Number(src.per_time) : null,
        formula_code: src?.formula_code ?? null,
      }
    })

  useEffect(() => {
    if (!templateDetail) return
    if (!initializedRef.current) {
      // Full form reset on initial load only
      initializedRef.current = true
      setForm({
        op_code:      templateDetail.op_code,
        name:         templateDetail.name,
        op_type_id:   templateDetail.op_type_id ?? '',
        workcenter_id: templateDetail.workcenter_id ?? '',
        method:       templateDetail.method ?? '',
        activities:   mapActivities(templateDetail.activities),
      })
    } else {
      // Subsequent refetches (e.g. after addFromLibrary) — only sync activities, preserve form edits
      setForm(prev => ({ ...prev, activities: mapActivities(templateDetail.activities) }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateDetail])

  const { data: workcenters = [] } = useQuery<WorkcenterItem[]>({
    queryKey: ['workcenters-palette'],
    queryFn: async () => { const { data } = await apiClient.get('/workcenters'); return Array.isArray(data) ? data : data.items ?? [] },
  })

  const { data: opTypes = [] } = useQuery<OpTypeItem[]>({
    queryKey: ['op-types'],
    queryFn: async () => { const { data } = await apiClient.get('/op-types'); return Array.isArray(data) ? data : [] },
    staleTime: 5 * 60 * 1000,
  })

  const { data: equipmentList = [] } = useQuery<EquipmentResource[]>({
    queryKey: ['equipment-resources'],
    queryFn: async () => { const { data } = await apiClient.get('/equipment-resources'); return Array.isArray(data) ? data : [] },
    staleTime: 10 * 60 * 1000,
  })

  const buildPayload = (overrides: Record<string, unknown> = {}) => ({
    op_code:      form.op_code.trim().toUpperCase(),
    name:         form.name.trim(),
    op_type_id:   form.op_type_id ? Number(form.op_type_id) : null,
    workcenter_id: form.workcenter_id ? Number(form.workcenter_id) : null,
    method:       form.method || null,
    time_mode:    'by_activities',
    duration_min: null,
    formula_expr: null,
    activities:   form.activities.map((a, i) => ({
      name: a.name, measure: a.measure, unit: a.unit || null,
      per_minute: a.per_minute ? Number(a.per_minute) : null,
      tool_ids: a.tools,
      consumables: [
        // Library-linked activity consumables are read-only (from source_activity.consumes) — never re-save them
        ...(a.source_activity_id ? [] : a.consumables.map(c => ({ resource_id: c.resource_id, qty: c.qty ? Number(c.qty) : null, unit: c.unit || null }))),
        ...a.op_materials.map(m => ({ resource_id: m.material_id, formula_id: m.formula_id ?? null })),
      ],
      skills: a.labors.map(l => ({ skill: l.skill, qty: l.qty, level: l.level ?? undefined })),
      sequence: (i + 1) * 10,
      source_activity_id: a.source_activity_id ?? null,
      snapshot_at: a.snapshot_at ?? null,
    })),
    ...overrides,
  })

  const confirm = useConfirm()

  const saveMut = useMutation({
    mutationFn: () => isEdit
      ? apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
      : apiClient.post('/operation-templates', buildPayload()).then(r => r.data),
    onSuccess: (data) => {
      toast.success('Operation saved')
      queryClient.invalidateQueries({ queryKey: ['op-template-detail'] })
      if (isEdit) navigate('/operation-library')
      else navigate(`/operation-library/${data.id}/edit`)
    },
    onError: (e: any) => { toast.error(e?.response?.data?.message ?? 'Failed to save operation — please try again'); console.error(e) },
  })

  const publishMut = useMutation({
    mutationFn: async () => {
      const tpl = isEdit
        ? await apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
        : await apiClient.post('/operation-templates', buildPayload()).then(r => r.data)
      return apiClient.patch(`/operation-templates/${tpl.id}/publish`).then(r => r.data)
    },
    onSuccess: () => {
      toast.success('Operation published')
      queryClient.invalidateQueries({ queryKey: ['op-template-detail'] })
      navigate('/operation-library')
    },
    onError: (e: any) => { toast.error(e?.response?.data?.message ?? 'Failed to publish operation — please try again'); console.error(e) },
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/operation-templates/${templateId}`).then(r => r.data),
    onSuccess: () => {
      toast.success('Operation deleted')
      queryClient.invalidateQueries({ queryKey: ['op-template-detail'] })
      navigate('/operation-library')
    },
    onError: (e: any) => { toast.error(e?.response?.data?.message ?? 'Failed to delete operation — please try again'); console.error(e) },
  })

  const handleDelete = async () => {
    const ok = await confirm({ title: `Delete Operation "${form.op_code}"?`, message: 'This cannot be undone', variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    deleteMut.mutate()
  }

  const opCodeOk = OP_CODE_RE.test(form.op_code.trim().toUpperCase())

  const removeActivity = (localId: string) =>
    patch({ activities: form.activities.filter(a => a.localId !== localId) })

  const patchActivity = (localId: string, p: Partial<FormActivity>) =>
    patch({ activities: form.activities.map(a => a.localId === localId ? { ...a, ...p } : a) })

  if (isEdit && loadingTpl) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#8E8E8E', fontSize: 13 }}>Loading…</div>
  }

  const isPending = saveMut.isPending || publishMut.isPending || deleteMut.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'inherit', background: '#F8F8F8' }}>

      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate('/operation-library')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 13 }}>
          <ArrowLeft size={16} />Operation Library
        </button>
        <div style={{ width: 1, height: 20, background: '#E0E0E0' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>
          {isEdit ? `Edit: ${form.op_code || '…'}` : 'New Operation'}
        </span>
        {templateDetail?.status === 'active' && (
          <span style={{ fontSize: 10, background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>ACTIVE</span>
        )}
        <div style={{ flex: 1 }} />

        {isEdit && (
          <button onClick={handleDelete} disabled={isPending || deleteMut.isPending}
            style={{ height: 34, padding: '0 14px', borderRadius: 6, border: '1px solid #FFCDD2', background: '#FFF5F5', color: '#C8202A', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={13} />Delete
          </button>
        )}

        <button onClick={() => saveMut.mutate()} disabled={!form.name.trim() || isPending}
          title={!form.name.trim() ? 'Enter name first' : undefined}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: '#fff', color: form.name.trim() ? '#555' : '#BDBDBD', fontSize: 13, fontWeight: 500, cursor: form.name.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={13} />Save Draft
        </button>

        <button onClick={() => publishMut.mutate()} disabled={!canPublish(form) || isPending}
          title={!canPublish(form) ? 'Complete all required fields before publishing' : undefined}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: canPublish(form) ? '#C8202A' : '#E0E0E0', color: canPublish(form) ? '#fff' : '#9E9E9E', fontSize: 13, fontWeight: 600, cursor: canPublish(form) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Check size={13} />{isPending ? 'Saving…' : 'Publish to Library'}
        </button>
      </div>

      {/* 2-column body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT: Form (60%) ── */}
        <div style={{ flex: '0 0 60%', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Identity */}
          <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 20 }}>
            <div style={sectionHead}>Identity</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <div style={label}>Op Code *</div>
                <input
                  value={form.op_code}
                  onChange={e => patch({ op_code: e.target.value.toUpperCase() })}
                  placeholder="OP-WELD-MAIN"
                  style={{ ...input, fontFamily: 'monospace', borderColor: form.op_code && !opCodeOk ? '#FFCDD2' : '#E0E0E0' }}
                  disabled={isEdit}
                />
                {form.op_code && !opCodeOk && (
                  <div style={{ fontSize: 10, color: '#C8202A', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={10} />Uppercase, letters/numbers/hyphens only
                  </div>
                )}
              </div>
              <div>
                <div style={label}>Operation Name *</div>
                <input value={form.name} onChange={e => patch({ name: e.target.value })} placeholder="e.g. Weld main seam" style={input} />
              </div>
            </div>
            <div>
              <div style={label}>Operation Type</div>
              <select value={form.op_type_id} onChange={e => {
                const ot = opTypes.find(t => t.id === Number(e.target.value))
                const wc = ot?.default_wc
                patch({
                  op_type_id: ot?.id ?? '',
                  ...(wc && !form.workcenter_id ? { workcenter_id: wc.id } : {}),
                })
              }} style={selectStyle}>
                <option value="">— Select type —</option>
                {opTypes.map(ot => <option key={ot.id} value={ot.id}>{ot.label}</option>)}
              </select>
            </div>
          </div>

          {/* Resource */}
          <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 20 }}>
            <div style={sectionHead}>Resource</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={label}>Work Station *</div>
                <select value={form.workcenter_id} onChange={e => patch({ workcenter_id: e.target.value ? Number(e.target.value) : '' })} style={{ ...selectStyle, color: form.workcenter_id ? '#1F1F1F' : '#9E9E9E' }}>
                  <option value="">— Select —</option>
                  {workcenters.map(wc => <option key={wc.id} value={wc.id}>{wc.code} · {wc.name}</option>)}
                </select>
                {(() => {
                  const wc = workcenters.find(w => w.id === Number(form.workcenter_id))
                  return wc?.machine ? (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Machine:</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#185FA5' }}>{wc.machine}</span>
                    </div>
                  ) : null
                })()}
              </div>
              <div>
                <div style={label}>Method</div>
                <input value={form.method} onChange={e => patch({ method: e.target.value })} placeholder="e.g. SMAW, FCAW…" style={input} />
              </div>
            </div>
          </div>

          {/* Activities */}
          <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ ...sectionHead, marginBottom: 0, flex: 1 }}>Activities</div>
              <span style={{ fontSize: 10, color: '#9E9E9E' }}>Σ time = sum of activities</span>
            </div>

            {form.activities.length === 0 ? (
              <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: '#BDBDBD', border: '1px dashed #E0E0E0', borderRadius: 6 }}>
                Add activities from the library →
              </div>
            ) : (() => {
              let opTotal = 0; let opTotalOk = true
              for (const a of form.activities) {
                const pm = Number(a.per_minute)
                if (!pm || pm <= 0) { opTotalOk = false; break }
                opTotal += pm
              }
              const chip: React.CSSProperties = { fontSize: 11, padding: '2px 9px', borderRadius: 10, border: '1px solid', whiteSpace: 'nowrap' }
              const COL = '1fr 64px 24px'
              const COL_LIB = '1fr 64px 20px 20px'
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, padding: '0 8px', marginBottom: 2 }}>
                    {['Name', 'min', ''].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                    ))}
                  </div>

                  {form.activities.map((act) => {
                    const pm = Number(act.per_minute)
                    const estMin = pm > 0 ? pm : null
                    const isLib = act.source_activity_id !== null
                    return (
                      <div key={act.localId} style={{ border: `1px solid ${isLib ? '#BBDEFB' : '#E8E8E8'}`, borderRadius: 6 }}>

                        {/* Main row */}
                        {isLib ? (
                          <div style={{ display: 'grid', gridTemplateColumns: COL_LIB, gap: 8, alignItems: 'start', background: '#fff', padding: '8px 8px', borderLeft: '3px solid #BBDEFB' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1A1A' }}>{act.name}</div>
                              {act.ratio != null && act.per_time != null && (
                                <div style={{ marginTop: 2, fontSize: 10, fontFamily: 'monospace', color: '#1565C0' }}>
                                  Every {act.ratio} {act.ratio_unit ?? ''} → {act.per_time} min
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: estMin != null ? '#185FA5' : '#C0C0C0' }}>
                              {estMin != null ? fmtMin(+estMin.toFixed(2)) : '—'}
                            </div>
                            <button type="button"
                              onClick={() => act.source_activity_id && act.id !== undefined && setEditingActivity({ sourceId: act.source_activity_id, opActId: act.id })}
                              title="Edit activity" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#1976D2' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#BDBDBD' }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => removeActivity(act.localId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex', justifyContent: 'center' }}>
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          /* Legacy manual editable row */
                          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, alignItems: 'center', background: '#F8F8F8', padding: '6px 8px' }}>
                            <input value={act.name} onChange={e => patchActivity(act.localId, { name: e.target.value })}
                              style={{ fontSize: 12, border: '1px solid #E8E8E8', borderRadius: 4, padding: '5px 8px', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                            <input type="number" min={0} value={act.per_minute} onChange={e => patchActivity(act.localId, { per_minute: e.target.value })}
                              style={{ fontSize: 12, border: '1px solid #E8E8E8', borderRadius: 4, padding: '5px 6px', background: '#fff', outline: 'none', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} placeholder="0" />
                            <button onClick={() => removeActivity(act.localId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex', justifyContent: 'center' }}>
                              <X size={13} />
                            </button>
                          </div>
                        )}

                        {/* Tools / Skill / Consumes sub-row — read-only */}
                        {(act.tools.length > 0 || act.labors.length > 0 || act.op_materials.length > 0 || act.consumables.length > 0) && (
                          <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${isLib ? '#DDEEFF' : '#F0F0F0'}`, background: '#fff' }}>
                            {act.tools.length > 0 && (
                              <div style={{ padding: '5px 10px 7px', borderRight: '1px solid #EEF3FF' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tools</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {act.tools.map(t => {
                                    const eq = equipmentList.find(e => e.id === t.id)
                                    return eq ? <span key={t.id} style={{ ...chip, background: '#EEF4FF', borderColor: '#BBDEFB', color: '#1565C0' }}>{eq.name} ×{t.qty}</span> : null
                                  })}
                                </div>
                              </div>
                            )}
                            {act.labors.length > 0 && (
                              <div style={{ padding: '5px 10px 7px', borderRight: '1px solid #EEF3FF' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Skill</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {act.labors.map(l => (
                                    <span key={l.skill} style={{ ...chip, background: '#F3E5F5', borderColor: '#CE93D8', color: '#6A1B9A' }}>
                                      {l.skill}{l.level ? ` (${l.level})` : ''} ×{l.qty}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(act.op_materials.length > 0 || act.consumables.length > 0) && (
                              <div style={{ padding: '5px 10px 7px', borderRight: isLib ? '1px solid #EEF3FF' : undefined }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Consumes</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {act.op_materials.map(m => (
                                    <span key={m.material_id} title={m.name} style={{ ...chip, whiteSpace: 'normal', background: '#FFF8E1', borderColor: '#FFE082', color: '#7B4F00', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 260, overflow: 'hidden' }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{m.name}</span>
                                      {m.formula_name && (
                                        <span style={{ flexShrink: 0, background: '#E0F2F1', border: '1px solid #80CBC4', borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#00695C', fontWeight: 600 }}>
                                          {m.formula_name}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                  {act.consumables.map(c =>
                                    c.name ? (
                                      <span key={c.resource_id} title={c.name} style={{ ...chip, whiteSpace: 'normal', background: '#FFF8E1', borderColor: '#FFE082', color: '#7B4F00', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 260, overflow: 'hidden' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.name}</span>
                                        {c.formula_name && (
                                          <span style={{ flexShrink: 0, background: '#E0F2F1', border: '1px solid #80CBC4', borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#00695C', fontWeight: 600 }}>
                                            {c.formula_name}
                                          </span>
                                        )}
                                      </span>
                                    ) : null
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {opTotalOk && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0', fontSize: 12, color: '#185FA5', fontWeight: 700, borderTop: '1px solid #F0F0F0', marginTop: 2 }}>
                      Total: {fmtMin(+opTotal.toFixed(2))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Publish gate hint */}
          {!canPublish(form) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8E8E8E', padding: '0 4px' }}>
              <AlertCircle size={12} />
              Publish requires: op code (OP-X-Y) · name · workcenter · ≥1 activity
            </div>
          )}
        </div>

        {/* ── RIGHT: Activity Library (40%) ── */}
        <div style={{ flex: '0 0 40%', borderLeft: '1px solid #E0E0E0', background: '#FAFAFA', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ActivityLibraryPanel
            templateId={templateId}
            existingSourceIds={new Set(
              (templateDetail?.activities ?? [])
                .map(a => a.source_activity_id)
                .filter((id): id is number => id !== null)
            )}
          />
        </div>
      </div>

      {editingActivity !== null && (
        <ActivityBuilderModal
          activityId={editingActivity.sourceId}
          onSaved={() => {
            updateFromLibMut.mutate(editingActivity.opActId, {
              onSettled: () => queryClient.invalidateQueries({ queryKey: ['op-template-detail', templateId] }),
            })
          }}
          onClose={() => setEditingActivity(null)}
        />
      )}



    </div>
  )
}
