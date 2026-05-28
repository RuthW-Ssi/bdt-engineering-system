import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, BookOpen, Check, ChevronDown, Plus, Save, Search, X } from 'lucide-react'
import { apiClient } from '../api/client'

// ── Types ──────────────────────────────────────────────────────

interface WorkcenterItem { id: number; code: string; name: string }
interface OpTypeItem { id: number; key: string; label: string; color: string; default_wc_id: number | null; default_wc: { id: number; code: string; name: string } | null }

interface ActivityTemplateItem {
  id: number; op_code: string; description: string
  formula_param_code: string; std_measure: number | null; unit: string | null; per_minute: number | null
}

interface ConsumableFormItem { resource_id: number; qty: string; unit: string }

interface FormActivity {
  localId: string
  name: string; measure: string; unit: string; per_minute: string; std_measure: string
  source_activity_template_id: number | null
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

// ── ActivityLibrary (right panel) ─────────────────────────────

function ActivityLibraryPanel({
  activities, onAdd, workcenters, workcenter_id,
}: { activities: FormActivity[]; onAdd: (a: FormActivity) => void; workcenters: WorkcenterItem[]; workcenter_id: number | '' }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterChip, setFilterChip] = useState('All')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const { data: items = [], isLoading } = useQuery<ActivityTemplateItem[]>({
    queryKey: ['activity-templates-all'],
    queryFn: async () => {
      const { data } = await apiClient.get('/activity-templates', { params: { limit: 300 } })
      return data.items ?? data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const chips = ['All', ...Array.from(new Set(items.map(i => i.op_code))).sort()]

  const q = search.trim().toLowerCase()
  const filtered = items.filter(item => {
    const matchChip = filterChip === 'All' || item.op_code === filterChip
    const matchSearch = !q || item.description.toLowerCase().includes(q) || item.op_code.toLowerCase().includes(q)
    return matchChip && matchSearch
  })

  const groups: Record<string, ActivityTemplateItem[]> = {}
  for (const item of filtered) {
    if (!groups[item.op_code]) groups[item.op_code] = []
    groups[item.op_code].push(item)
  }

  const addedIds = new Set(activities.map(a => a.source_activity_template_id).filter(Boolean))

  // ── Inline new-activity-template form ──
  const [showNewAct, setShowNewAct] = useState(false)
  const [newAct, setNewAct] = useState({ description: '', op_code: '', formula_param_code: '', per_minute: '', std_measure: '', unit: '', workcenter_id: '' })
  const patchAct = (p: Partial<typeof newAct>) => setNewAct(a => ({ ...a, ...p }))
  const newActReady = !!(newAct.description.trim() && newAct.op_code.trim() && newAct.formula_param_code.trim() && newAct.per_minute && newAct.unit.trim() && (newAct.workcenter_id || workcenter_id))
  const newActMut = useMutation({
    mutationFn: () => apiClient.post('/activity-templates', {
      description: newAct.description.trim(),
      op_code: newAct.op_code.trim().toLowerCase(),
      formula_param_code: newAct.formula_param_code.trim(),
      per_minute: Number(newAct.per_minute),
      std_measure: newAct.std_measure ? Number(newAct.std_measure) : 0,
      unit: newAct.unit.trim(),
      workcenter_id: Number(newAct.workcenter_id || workcenter_id),
    }).then(r => r.data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates-all'] })
      onAdd({ localId: String(Date.now()), name: created.description, measure: created.formula_param_code, unit: created.unit ?? '', per_minute: created.per_minute ? String(created.per_minute) : '', std_measure: created.std_measure != null ? String(created.std_measure) : '', source_activity_template_id: created.id, machine_id: null, tool_ids: [], consumables: [] })
      setNewAct({ description: '', op_code: '', formula_param_code: '', per_minute: '', std_measure: '', unit: '', workcenter_id: '' })
      setShowNewAct(false)
    },
  })

  const sInp: React.CSSProperties = { border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 14px 10px', flexShrink: 0, borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1F1F1F', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <BookOpen size={13} style={{ color: '#9E9E9E' }} />Activity Library
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowNewAct(v => !v)}
            style={{ height: 22, padding: '0 8px', borderRadius: 4, border: '1px solid', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3,
              background: showNewAct ? '#FFF0F0' : '#fff', color: showNewAct ? '#C8202A' : '#555', borderColor: showNewAct ? '#C8202A' : '#D0D0D0' }}>
            <Plus size={10} />New Activity
          </button>
        </div>

        {showNewAct && (
          <div style={{ background: '#FFF8F8', border: '1px solid #FCCACA', borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#C8202A', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New Activity Template</div>
            <input value={newAct.description} onChange={e => patchAct({ description: e.target.value })} placeholder="Description *"
              style={{ ...sInp, marginBottom: 6, fontSize: 12 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <input value={newAct.op_code} onChange={e => patchAct({ op_code: e.target.value })} placeholder="Group (op_code) *" style={sInp} />
              <input value={newAct.formula_param_code} onChange={e => patchAct({ formula_param_code: e.target.value })} placeholder="Measure *" style={sInp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
              <input value={newAct.unit} onChange={e => patchAct({ unit: e.target.value })} placeholder="Unit *" style={sInp} />
              <input type="number" value={newAct.per_minute} onChange={e => patchAct({ per_minute: e.target.value })} placeholder="/min *" style={sInp} />
              <input type="number" value={newAct.std_measure} onChange={e => patchAct({ std_measure: e.target.value })} placeholder="Std" style={sInp} />
            </div>
            {!workcenter_id && (
              <select value={newAct.workcenter_id} onChange={e => patchAct({ workcenter_id: e.target.value })}
                style={{ ...sInp, cursor: 'pointer', background: '#fff', marginBottom: 6 }}>
                <option value="">— Workcenter * —</option>
                {workcenters.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewAct(false)} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: '1px solid #E0E0E0', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#555' }}>Cancel</button>
              <button onClick={() => newActMut.mutate()} disabled={!newActReady || newActMut.isPending}
                style={{ height: 26, padding: '0 10px', borderRadius: 4, border: 'none', background: newActReady ? '#C8202A' : '#E0E0E0', color: newActReady ? '#fff' : '#9E9E9E', fontSize: 11, fontWeight: 600, cursor: newActReady ? 'pointer' : 'not-allowed' }}>
                {newActMut.isPending ? 'Saving…' : 'Add to Library'}
              </button>
            </div>
            {newActMut.isError && <div style={{ fontSize: 10, color: '#C8202A', marginTop: 4 }}>{(newActMut.error as Error).message}</div>}
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activities…"
            style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px 5px 26px', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {chips.slice(0, 8).map(chip => (
            <button key={chip} onClick={() => setFilterChip(chip)} style={{
              height: 22, padding: '0 8px', borderRadius: 11, border: '1px solid', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              borderColor: filterChip === chip ? '#C8202A' : '#E0E0E0',
              background: filterChip === chip ? '#C8202A' : '#fff',
              color: filterChip === chip ? '#fff' : '#8E8E8E',
            }}>{chip}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9E9E9E' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9E9E9E' }}>No activities found</div>
        ) : (
          Object.entries(groups).map(([opCode, acts]) => {
            const isOpen = !collapsed[opCode]
            return (
              <div key={opCode} style={{ marginBottom: 8 }}>
                <button onClick={() => setCollapsed(c => ({ ...c, [opCode]: !c[opCode] }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '3px 2px' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1, textAlign: 'left' }}>{opCode}</span>
                  <span style={{ fontSize: 9, color: '#9E9E9E' }}>{acts.length}</span>
                  <ChevronDown size={10} style={{ color: '#BDBDBD', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                </button>
                {isOpen && acts.map(act => {
                  const added = addedIds.has(act.id)
                  return (
                    <div key={act.id}
                      style={{ background: added ? '#FAFAFA' : '#fff', border: `1px solid ${added ? '#F0F0F0' : '#E8E8E8'}`, borderRadius: 5, padding: '6px 8px', marginBottom: 3, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: added ? '#9E9E9E' : '#1F1F1F', lineHeight: 1.3 }}>{act.description}</div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#185FA5', background: '#F0F4FF', borderRadius: 3, padding: '0 4px' }}>{act.formula_param_code}</span>
                          {act.per_minute && <span style={{ fontSize: 10, color: '#8E8E8E' }}>{act.per_minute}/{act.unit ?? 'unit'}</span>}
                        </div>
                      </div>
                      {added ? (
                        <Check size={13} style={{ color: '#4CAF50', flexShrink: 0, marginTop: 2 }} />
                      ) : (
                        <button onClick={() => onAdd({
                          localId: uid(),
                          name: act.description,
                          measure: act.formula_param_code,
                          unit: act.unit ?? '',
                          per_minute: act.per_minute ? String(act.per_minute) : '',
                          std_measure: act.std_measure != null ? String(act.std_measure) : '',
                          source_activity_template_id: act.id,
                          machine_id: null, tool_ids: [], consumables: [],
                        })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#4CAF50', display: 'flex', flexShrink: 0, marginTop: 2 }}>
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

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

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))

  // Load existing template in edit mode
  const { data: existing, isLoading: loadingTpl } = useQuery({
    queryKey: ['op-template-detail', templateId],
    queryFn: async () => { const { data } = await apiClient.get(`/operation-templates/${templateId}`); return data },
    enabled: isEdit && !!templateId,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      op_code:      existing.op_code,
      name:         existing.name,
      op_type_id:   existing.op_type_id ?? '',
      workcenter_id: existing.workcenter_id ?? '',
      method:       existing.method ?? '',
      activities:   existing.activities.map((a: any) => ({
        localId: uid(),
        name: a.name, measure: a.measure, unit: a.unit ?? '',
        per_minute: a.per_minute ? String(a.per_minute) : '',
        std_measure: a.std_measure != null ? String(a.std_measure) : '',
        source_activity_template_id: a.source_activity_template_id ?? null,
        machine_id: a.machine_id ?? null,
        tool_ids: a.tools?.map((t: any) => t.resource_id) ?? [],
        consumables: a.consumables?.map((c: any) => ({ resource_id: c.resource_id, qty: c.qty != null ? String(c.qty) : '', unit: c.unit ?? '' })) ?? [],
      })),
    })
  }, [existing])

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
      source_activity_template_id: a.source_activity_template_id,
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
    onSuccess: () => navigate('/admin/operation-library'),
  })

  const publishMut = useMutation({
    mutationFn: async () => {
      const tpl = isEdit
        ? await apiClient.patch(`/operation-templates/${templateId}`, buildPayload()).then(r => r.data)
        : await apiClient.post('/operation-templates', buildPayload()).then(r => r.data)
      return apiClient.patch(`/operation-templates/${tpl.id}/publish`).then(r => r.data)
    },
    onSuccess: () => navigate('/admin/operation-library'),
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
        <button onClick={() => navigate('/admin/operation-library')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 13 }}>
          <ArrowLeft size={16} />Operation Library
        </button>
        <div style={{ width: 1, height: 20, background: '#E0E0E0' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>
          {isEdit ? `Edit: ${form.op_code || '…'}` : 'New Operation'}
        </span>
        {existing?.status === 'active' && (
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
                onClick={() => patch({ activities: [...form.activities, { localId: uid(), name: '', measure: '', unit: '', per_minute: '', std_measure: '', source_activity_template_id: null, machine_id: null, tool_ids: [], consumables: [] }] })}
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
                          <input value={act.name} onChange={e => patchActivity(act.localId, { name: e.target.value })}
                            style={{ fontSize: 12, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 7px', background: '#fff', outline: 'none', fontFamily: 'inherit' }} />
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
            activities={form.activities}
            onAdd={act => patch({ activities: [...form.activities, act] })}
            workcenters={workcenters}
            workcenter_id={form.workcenter_id}
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
    </div>
  )
}
