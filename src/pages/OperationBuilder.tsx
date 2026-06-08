import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Check, Plus, Save, X } from 'lucide-react'
import { apiClient } from '../api/client'
import ActivityLibraryPanel from '../components/operations/ActivityLibraryPanel'
import StaleBadge from '../components/operations/StaleBadge'
import StaleDiffModal from '../components/operations/StaleDiffModal'
import { useOperationTemplate } from '../hooks/useOperationTemplates'

// ── Types ──────────────────────────────────────────────────────

interface WorkcenterItem { id: number; code: string; name: string }
interface OpTypeItem { id: number; key: string; label: string; color: string; default_wc_id: number | null; default_wc: { id: number; code: string; name: string } | null }

interface ConsumableFormItem { resource_id: number; qty: string; unit: string }

interface FormActivity {
  id?: number
  localId: string
  name: string; measure: string; unit: string; per_minute: string; std_measure: string
  source_activity_id: number | null
  source_activity_code: string | null
  is_stale: boolean
  machine_id: number | null
  tool_ids: number[]
  consumables: ConsumableFormItem[]
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

  const [form, setForm] = useState<FormState>({
    op_code: '', name: '', op_type_id: '', workcenter_id: '', method: '', activities: [],
  })
  const [openPicker, setOpenPicker] = useState<{ actId: string; kind: 'tool' | 'consumable' } | null>(null)
  useEffect(() => {
    if (!openPicker) return
    const close = () => setOpenPicker(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openPicker])

  const [staleModalActId, setStaleModalActId] = useState<number | null>(null)
  const staleModalAct = form.activities.find(a => a.id === staleModalActId) ?? null

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))

  // Load existing template in edit mode
  const { data: templateDetail, isLoading: loadingTpl } = useOperationTemplate(templateId, true)

  useEffect(() => {
    if (!templateDetail) return
    setForm({
      op_code:      templateDetail.op_code,
      name:         templateDetail.name,
      op_type_id:   templateDetail.op_type_id ?? '',
      workcenter_id: templateDetail.workcenter_id ?? '',
      method:       (templateDetail as any).method ?? '',
      activities:   templateDetail.activities.map((a) => ({
        id: a.id,
        localId: uid(),
        name: a.name,
        measure: a.measure,
        unit: a.unit ?? '',
        per_minute: a.per_minute ? String(a.per_minute) : '',
        std_measure: (a as any).std_measure != null ? String((a as any).std_measure) : '',
        source_activity_id: a.source_activity_id ?? null,
        source_activity_code: a.source_activity_code ?? null,
        is_stale: a.is_stale ?? false,
        machine_id: a.machine_id ?? null,
        tool_ids: a.tools?.map((t) => t.resource.id) ?? [],
        consumables: a.consumables?.map((c) => ({ resource_id: c.resource.id, qty: c.qty != null ? String(c.qty) : '', unit: c.unit ?? '' })) ?? [],
      })),
    })
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
      consumables: a.consumables.map(c => ({ resource_id: c.resource_id, qty: c.qty ? Number(c.qty) : null, unit: c.unit || null })),
      sequence: (i + 1) * 10,
    })),
    ...overrides,
  })

  const saveMut = useMutation({
    mutationFn: () => isEdit
      ? apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
      : apiClient.post('/operation-templates', buildPayload()).then(r => r.data),
    onSuccess: () => navigate('/operation-library'),
  })

  const publishMut = useMutation({
    mutationFn: async () => {
      const tpl = isEdit
        ? await apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
        : await apiClient.post('/operation-templates', buildPayload()).then(r => r.data)
      return apiClient.patch(`/operation-templates/${tpl.id}/publish`).then(r => r.data)
    },
    onSuccess: () => navigate('/operation-library'),
  })

  const opCodeOk = OP_CODE_RE.test(form.op_code.trim().toUpperCase())

  const removeActivity = (localId: string) =>
    patch({ activities: form.activities.filter(a => a.localId !== localId) })

  const patchActivity = (localId: string, p: Partial<FormActivity>) =>
    patch({ activities: form.activities.map(a => a.localId === localId ? { ...a, ...p } : a) })

  if (isEdit && loadingTpl) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#8E8E8E', fontSize: 13 }}>Loading…</div>
  }

  const isPending = saveMut.isPending || publishMut.isPending
  const error = saveMut.error || publishMut.error

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
              <span style={{ fontSize: 10, color: '#9E9E9E', marginRight: 8 }}>Σ time = sum of activities</span>
              <button
                onClick={() => patch({ activities: [...form.activities, { localId: uid(), name: '', measure: '', unit: '', per_minute: '', std_measure: '', source_activity_id: null, source_activity_code: null, is_stale: false, machine_id: null, tool_ids: [], consumables: [] }] })}
                style={{ height: 22, padding: '0 8px', borderRadius: 4, border: '1px solid #E0E0E0', background: '#fff', fontSize: 10, fontWeight: 600, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Plus size={10} />Add blank
              </button>
            </div>

            {form.activities.length === 0 ? (
              <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: '#BDBDBD', border: '1px dashed #E0E0E0', borderRadius: 6 }}>
                Add from the library → or click Add blank above
              </div>
            ) : (() => {
              let opTotal = 0; let opTotalOk = true
              for (const a of form.activities) {
                const pm = Number(a.per_minute); const sm = Number(a.std_measure)
                if (!pm || pm <= 0 || !sm) { opTotalOk = false; break }
                opTotal += sm / pm
              }
              const machines = equipmentList.filter(e => ['machine', 'handling', 'labor'].includes(e.type))
              const toolOpts = equipmentList.filter(e => e.type === 'tool')
              const consumableOpts = equipmentList.filter(e => e.type === 'consumable')
              const chipBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px 1px 7px', borderRadius: 10, border: '1px solid', cursor: 'default', whiteSpace: 'nowrap' }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 50px 50px 44px 116px 24px', gap: 6, padding: '0 8px', marginBottom: 2 }}>
                    {['Name', 'Measure', 'Unit', '/min', '≈min', 'Machine', ''].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                    ))}
                  </div>
                  {form.activities.map((act, _idx) => {
                    const pm = Number(act.per_minute); const sm = Number(act.std_measure)
                    const estMin = pm > 0 && sm > 0 ? sm / pm : null
                    const isPickerOpen = (kind: 'tool' | 'consumable') => openPicker?.actId === act.localId && openPicker.kind === kind
                    return (
                      <div key={act.localId} style={{ border: '1px solid #E8E8E8', borderRadius: 6, overflow: 'visible' }}>
                        {/* Main row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 50px 50px 44px 116px 24px', gap: 6, alignItems: 'center', background: '#F8F8F8', padding: '6px 8px' }}>
                          <div>
                            <input value={act.name} onChange={e => patchActivity(act.localId, { name: e.target.value })}
                              style={{ fontSize: 12, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 7px', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                            <StaleBadge
                              stale={act.is_stale}
                              onClick={() => setStaleModalActId(act.id ?? null)}
                            />
                            {act.source_activity_code && (
                              <div style={{ fontSize: 10, color: '#9E9E9E', fontStyle: 'italic' }}>
                                ⇩ from {act.source_activity_code} (library)
                              </div>
                            )}
                          </div>
                          <input value={act.measure} onChange={e => patchActivity(act.localId, { measure: e.target.value })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 6px', background: '#fff', outline: 'none', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} placeholder="param" />
                          <input value={act.unit} onChange={e => patchActivity(act.localId, { unit: e.target.value })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 5px', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} placeholder="mm" />
                          <input type="number" min={0} value={act.per_minute} onChange={e => patchActivity(act.localId, { per_minute: e.target.value })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 5px', background: '#fff', outline: 'none', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} placeholder="0" />
                          <div style={{ fontSize: 10, fontFamily: 'monospace', color: estMin != null ? '#185FA5' : '#C0C0C0', textAlign: 'right' }}>
                            {estMin != null ? fmtMin(+estMin.toFixed(2)) : '—'}
                          </div>
                          <select value={act.machine_id ?? ''} onChange={e => patchActivity(act.localId, { machine_id: e.target.value ? Number(e.target.value) : null })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '3px 4px', background: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                            <option value="">—</option>
                            {machines.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
                          </select>
                          <button onClick={() => removeActivity(act.localId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex', justifyContent: 'center' }}>
                            <X size={12} />
                          </button>
                        </div>
                        {/* Tools / Consumables row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid #F0F0F0', background: '#FAFAFA' }}>
                          {/* Tools */}
                          <div style={{ padding: '5px 10px 6px', borderRight: '1px solid #F0F0F0', position: 'relative' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tools</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {act.tool_ids.map(tid => {
                                const eq = equipmentList.find(e => e.id === tid)
                                return eq ? (
                                  <span key={tid} style={{ ...chipBase, background: '#F0F4FF', borderColor: '#BBDEFB', color: '#1565C0' }}>
                                    {eq.name}
                                    <button onClick={() => patchActivity(act.localId, { tool_ids: act.tool_ids.filter(id => id !== tid) })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565C0', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex' }}>×</button>
                                  </span>
                                ) : null
                              })}
                              <div style={{ position: 'relative' }}>
                                <button onClick={() => setOpenPicker(isPickerOpen('tool') ? null : { actId: act.localId, kind: 'tool' })}
                                  style={{ height: 18, padding: '0 6px', borderRadius: 9, border: '1px dashed #BDBDBD', background: 'none', fontSize: 10, color: '#9E9E9E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Plus size={8} />Add
                                </button>
                                {isPickerOpen('tool') && (
                                  <div onMouseDown={e2 => e2.stopPropagation()} style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
                                    {toolOpts.length === 0 ? (
                                      <div style={{ padding: '10px 12px', fontSize: 11, color: '#9E9E9E' }}>No tool resources seeded yet</div>
                                    ) : toolOpts.filter(e => !act.tool_ids.includes(e.id)).map(e => (
                                      <button key={e.id} onClick={() => { patchActivity(act.localId, { tool_ids: [...act.tool_ids, e.id] }); setOpenPicker(null) }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                        onMouseEnter={e2 => (e2.currentTarget.style.background = '#F5F5F5')}
                                        onMouseLeave={e2 => (e2.currentTarget.style.background = 'none')}>
                                        <span style={{ fontFamily: 'monospace', color: '#185FA5' }}>{e.code}</span> {e.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Consumables */}
                          <div style={{ padding: '5px 10px 6px', position: 'relative' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Consumables</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {act.consumables.map((c, ci) => {
                                const eq = equipmentList.find(e => e.id === c.resource_id)
                                return eq ? (
                                  <span key={c.resource_id} style={{ ...chipBase, background: '#FFF3E0', borderColor: '#FFE082', color: '#E65100', gap: 4 }}>
                                    {eq.name}
                                    <button onClick={() => patchActivity(act.localId, { consumables: act.consumables.filter((_, xi) => xi !== ci) })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E65100', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex' }}>×</button>
                                  </span>
                                ) : null
                              })}
                              <div style={{ position: 'relative' }}>
                                <button onClick={() => setOpenPicker(isPickerOpen('consumable') ? null : { actId: act.localId, kind: 'consumable' })}
                                  style={{ height: 18, padding: '0 6px', borderRadius: 9, border: '1px dashed #BDBDBD', background: 'none', fontSize: 10, color: '#9E9E9E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Plus size={8} />Add
                                </button>
                                {isPickerOpen('consumable') && (
                                  <div onMouseDown={e2 => e2.stopPropagation()} style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
                                    {consumableOpts.length === 0 ? (
                                      <div style={{ padding: '10px 12px', fontSize: 11, color: '#9E9E9E' }}>No consumable resources seeded yet</div>
                                    ) : consumableOpts.filter(e => !act.consumables.find(c => c.resource_id === e.id)).map(e => (
                                      <button key={e.id} onClick={() => { patchActivity(act.localId, { consumables: [...act.consumables, { resource_id: e.id, qty: '', unit: e.rate_unit ?? '' }] }); setOpenPicker(null) }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                        onMouseEnter={e2 => (e2.currentTarget.style.background = '#F5F5F5')}
                                        onMouseLeave={e2 => (e2.currentTarget.style.background = 'none')}>
                                        <span style={{ fontFamily: 'monospace', color: '#185FA5' }}>{e.code}</span> {e.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {opTotalOk && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0', fontSize: 11, color: '#185FA5', fontWeight: 700, borderTop: '1px solid #F0F0F0', marginTop: 2 }}>
                      Total: {fmtMin(+opTotal.toFixed(2))} (std)
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

      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#C8202A', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} />
          {error instanceof Error ? error.message : 'Save failed'}
        </div>
      )}

      {staleModalAct && templateId && (
        <StaleDiffModal
          templateId={templateId}
          opAct={staleModalAct as any}
          onClose={() => setStaleModalActId(null)}
        />
      )}
    </div>
  )
}
