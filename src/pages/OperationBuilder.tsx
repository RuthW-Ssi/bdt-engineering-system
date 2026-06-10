import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Check, Pencil, Save, Trash2, X } from 'lucide-react'
import { apiClient } from '../api/client'
import ActivityLibraryPanel from '../components/operations/ActivityLibraryPanel'
import { useOperationTemplate } from '../hooks/useOperationTemplates'
import { ActivityBuilderModal } from './ActivityBuilder'

// ── Types ──────────────────────────────────────────────────────

interface WorkcenterItem { id: number; code: string; name: string }
interface OpTypeItem { id: number; key: string; label: string; color: string; default_wc_id: number | null; default_wc: { id: number; code: string; name: string } | null }

interface ConsumableFormItem { resource_id: number; qty: string; unit: string }

interface FormActivityLabor { labor_resource_id: number; name: string; code: string; qty: number }
interface FormActivityMaterial { material_id: number; name: string; code: string }

interface FormActivity {
  id?: number
  localId: string
  name: string; measure: string; unit: string; per_minute: string
  source_activity_id: number | null
  source_activity_code: string | null
  snapshot_at: string | null
  machine_id: number | null
  tool_ids: number[]
  consumables: ConsumableFormItem[]
  labors: FormActivityLabor[]
  op_materials: FormActivityMaterial[]
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

  const [editingActivityId, setEditingActivityId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>({
    op_code: '', name: '', op_type_id: '', workcenter_id: '', method: '', activities: [],
  })
  const queryClient = useQueryClient()
  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))
  const initializedRef = useRef(false)

  // Load existing template in edit mode
  const { data: templateDetail, isLoading: loadingTpl } = useOperationTemplate(templateId, true)

  const mapActivities = (acts: typeof templateDetail extends undefined ? never : NonNullable<typeof templateDetail>['activities']) =>
    acts.map((a) => ({
      id: a.id,
      localId: uid(),
      name: a.name,
      measure: a.measure,
      unit: a.unit ?? '',
      per_minute: a.per_minute ? String(a.per_minute) : '',
      source_activity_id: a.source_activity_id ?? null,
      source_activity_code: a.source_activity_code ?? null,
      snapshot_at: a.snapshot_at ?? null,
      machine_id: a.machine_id ?? null,
      tool_ids: a.tools?.map((t) => t.resource.id) ?? [],
      consumables: a.consumables?.map((c) => ({ resource_id: c.resource.id, qty: c.qty != null ? String(c.qty) : '', unit: c.unit ?? '' })) ?? [],
      labors: a.labors?.map(l => ({ labor_resource_id: l.labor_resource.id, name: l.labor_resource.name, code: l.labor_resource.code, qty: l.qty })) ?? [],
      op_materials: a.op_materials?.map(m => ({ material_id: m.resource.id, name: m.resource.name, code: m.resource.code })) ?? [],
    }))

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
      machine_id: a.machine_id ?? null,
      tool_ids: a.tool_ids,
      consumables: [
        ...a.consumables.map(c => ({ resource_id: c.resource_id, qty: c.qty ? Number(c.qty) : null, unit: c.unit || null })),
        ...a.op_materials.map(m => ({ resource_id: m.material_id })),
      ],
      labors: a.labors.map(l => ({ labor_resource_id: l.labor_resource_id, qty: l.qty })),
      sequence: (i + 1) * 10,
      source_activity_id: a.source_activity_id ?? null,
      snapshot_at: a.snapshot_at ?? null,
    })),
    ...overrides,
  })

  const saveMut = useMutation({
    mutationFn: () => isEdit
      ? apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
      : apiClient.post('/operation-templates', buildPayload()).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['op-template-detail'] })
      if (isEdit) navigate('/operation-library')
      else navigate(`/operation-library/${data.id}/edit`)
    },
  })

  const publishMut = useMutation({
    mutationFn: async () => {
      const tpl = isEdit
        ? await apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
        : await apiClient.post('/operation-templates', buildPayload()).then(r => r.data)
      return apiClient.patch(`/operation-templates/${tpl.id}/publish`).then(r => r.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['op-template-detail'] })
      navigate('/operation-library')
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/operation-templates/${templateId}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['op-template-detail'] })
      navigate('/operation-library')
    },
  })

  const handleDelete = () => {
    if (!window.confirm(`Delete operation "${form.op_code}"? This cannot be undone.`)) return
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
  const error = saveMut.error || publishMut.error || deleteMut.error

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
          title={!form.name.trim() ? 'กรอก name ก่อน' : undefined}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: '#fff', color: form.name.trim() ? '#555' : '#BDBDBD', fontSize: 13, fontWeight: 500, cursor: form.name.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={13} />Save Draft
        </button>

        <button onClick={() => publishMut.mutate()} disabled={!canPublish(form) || isPending}
          title={!canPublish(form) ? 'กรอกข้อมูลให้ครบก่อน publish' : undefined}
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
              const machines = equipmentList.filter(e => ['machine', 'handling', 'labor'].includes(e.type))
              const chip: React.CSSProperties = { fontSize: 11, padding: '2px 9px', borderRadius: 10, border: '1px solid', whiteSpace: 'nowrap' }
              const COL = '1fr 64px 1fr 24px'
              const COL_LIB = '1fr 64px 1fr 20px 20px'
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, padding: '0 8px', marginBottom: 2 }}>
                    {['Name', 'min', 'Machine', ''].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                    ))}
                  </div>

                  {form.activities.map((act) => {
                    const pm = Number(act.per_minute)
                    const estMin = pm > 0 ? pm : null
                    const isLib = act.source_activity_id !== null
                    const machineName = machines.find(m => m.id === act.machine_id)?.name ?? '—'
                    return (
                      <div key={act.localId} style={{ border: `1px solid ${isLib ? '#BBDEFB' : '#E8E8E8'}`, borderRadius: 6 }}>

                        {/* Main row */}
                        {isLib ? (
                          <div style={{ display: 'grid', gridTemplateColumns: COL_LIB, gap: 8, alignItems: 'center', background: '#fff', padding: '8px 8px', borderLeft: '3px solid #BBDEFB' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1A1A' }}>{act.name}</div>
                            <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: estMin != null ? '#185FA5' : '#C0C0C0' }}>
                              {estMin != null ? fmtMin(+estMin.toFixed(2)) : '—'}
                            </div>
                            <div style={{ fontSize: 12, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{machineName}</div>
                            <button type="button" onClick={() => setEditingActivityId(act.source_activity_id)}
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
                            <select value={act.machine_id ?? ''} onChange={e => patchActivity(act.localId, { machine_id: e.target.value ? Number(e.target.value) : null })}
                              style={{ fontSize: 12, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 6px', background: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                              <option value="">— Select machine —</option>
                              {machines.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <button onClick={() => removeActivity(act.localId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex', justifyContent: 'center' }}>
                              <X size={13} />
                            </button>
                          </div>
                        )}

                        {/* Tools / Labour / Consumes sub-row — read-only */}
                        {(act.tool_ids.length > 0 || act.labors.length > 0 || act.op_materials.length > 0 || act.consumables.length > 0) && (
                          <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${isLib ? '#DDEEFF' : '#F0F0F0'}`, background: '#fff' }}>
                            {act.tool_ids.length > 0 && (
                              <div style={{ padding: '5px 10px 7px', borderRight: '1px solid #EEF3FF' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tools</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {act.tool_ids.map(tid => {
                                    const eq = equipmentList.find(e => e.id === tid)
                                    return eq ? <span key={tid} style={{ ...chip, background: '#EEF4FF', borderColor: '#BBDEFB', color: '#1565C0' }}>{eq.name}</span> : null
                                  })}
                                </div>
                              </div>
                            )}
                            {act.labors.length > 0 && (
                              <div style={{ padding: '5px 10px 7px', borderRight: '1px solid #EEF3FF' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Labour</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {act.labors.map(l => (
                                    <span key={l.labor_resource_id} style={{ ...chip, background: '#F3E5F5', borderColor: '#CE93D8', color: '#6A1B9A' }}>
                                      {l.name}{l.qty > 1 ? ` ×${l.qty}` : ''}
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
                                    <span key={m.material_id} style={{ ...chip, background: '#FFF8E1', borderColor: '#FFE082', color: '#7B4F00' }}>{m.name}</span>
                                  ))}
                                  {act.consumables.map(c => {
                                    const eq = equipmentList.find(e => e.id === c.resource_id)
                                    return eq ? <span key={c.resource_id} style={{ ...chip, background: '#FFF8E1', borderColor: '#FFE082', color: '#7B4F00' }}>{eq.name}</span> : null
                                  })}
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
              form.activities
                .map(a => a.source_activity_id)
                .filter((id): id is number => id !== null)
            )}
          />
        </div>
      </div>

      {editingActivityId !== null && (
        <ActivityBuilderModal
          activityId={editingActivityId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['op-template-detail', templateId] })}
          onClose={() => setEditingActivityId(null)}
        />
      )}

      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#C8202A', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} />
          {error instanceof Error ? error.message : 'Save failed'}
        </div>
      )}

    </div>
  )
}
