import { useEffect, useState, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { AlertCircle, X, Search } from 'lucide-react'
import { useActivity, useCreateActivity, useUpdateActivity } from '../hooks/useActivities'
import { apiClient } from '../api/client'

interface MachineOption {
  id: number
  code: string
  name: string
  type: string
}

interface ConsumableOption {
  id: number
  code: string
  name: string
}

interface LaborOption {
  id: number
  code: string
  name: string
}

interface LaborEntry {
  option: LaborOption
  qty: number
}

interface FormValues {
  name: string
  duration_min: number
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E0E0E0',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: '#9E9E9E',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
}

// ── Machine Picker ────────────────────────────────────────────────────────────

function MachinePicker({
  value,
  onChange,
  hasError,
}: {
  value: MachineOption | null
  onChange: (m: MachineOption | null) => void
  hasError?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<MachineOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/equipment-resources').then((r) => {
      setAll(
        (r.data as any[])
          .filter((m) => m.type === 'machine')
          .map((m) => ({ id: m.id, code: m.code, name: m.name, type: m.type }))
      )
    })
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return all.slice(0, 10)
    return all.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 10)
  }, [query, all])

  if (value) {
    return (
      <div ref={wrapperRef}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#FFF3F3', border: '1px solid #FFCDD2',
          borderRadius: 4, padding: '5px 10px', fontSize: 12, color: '#C8202A',
        }}>
          <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{value.code}</span>
          <span style={{ color: '#555' }}>{value.name}</span>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#C8202A', opacity: 0.6 }}
          >
            <X size={12} />
          </button>
        </span>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingLeft: 30, borderColor: hasError ? '#FFCDD2' : '#E0E0E0' }}
          placeholder="พิมชื่อ หรือ รหัส machine…"
        />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              onMouseDown={() => { onChange(item); setOpen(false); setQuery('') }}
              style={{
                padding: '8px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid #F5F5F5',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#FFF8F8' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C8202A', flexShrink: 0 }}>{item.code}</span>
              <span style={{ fontSize: 13, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#BDBDBD', flexShrink: 0 }}>{item.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Consumable Picker ─────────────────────────────────────────────────────────

function ConsumablePicker({ value, onChange }: { value: ConsumableOption[]; onChange: (items: ConsumableOption[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<ConsumableOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/equipment-resources').then((r) => {
      setAll((r.data as any[]).filter((m) => m.type === 'consumable').map((m) => ({ id: m.id, code: m.code, name: m.name })))
    })
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? all.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : all
  }, [query, all])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.map((m) => (
            <span key={m.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#FFF8E1', border: '1px solid #FFE082',
              borderRadius: 4, padding: '3px 8px', fontSize: 12, color: '#7B4F00',
            }}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{m.code}</span>
              <span style={{ color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <button type="button" onClick={() => onChange(value.filter((v) => v.id !== m.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#7B4F00', opacity: 0.6 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', pointerEvents: 'none' }} />
        <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingLeft: 30 }} placeholder="ค้นหา consumable…" />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map((item) => {
            const already = value.some((v) => v.id === item.id)
            return (
              <div key={item.id} onMouseDown={() => { if (!already) { onChange([...value, item]); setQuery(''); setOpen(false) } }}
                style={{ padding: '8px 12px', cursor: already ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10, opacity: already ? 0.4 : 1, borderBottom: '1px solid #F5F5F5' }}
                onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '#FFFDE7' }}
                onMouseLeave={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#E65100', flexShrink: 0 }}>{item.code}</span>
                <span style={{ fontSize: 13, color: '#1F1F1F' }}>{item.name}</span>
                {already && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9E9E9E' }}>added</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tool Picker ───────────────────────────────────────────────────────────────

function ToolPicker({ value, onChange }: { value: LaborOption[]; onChange: (items: LaborOption[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<LaborOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/equipment-resources').then((r) => {
      setAll((r.data as any[]).filter((m) => m.type === 'tool').map((m) => ({ id: m.id, code: m.code, name: m.name })))
    })
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? all.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 10) : all.slice(0, 10)
  }, [query, all])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.map((tool) => (
            <span key={tool.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#F0F4FF', border: '1px solid #BBDEFB',
              borderRadius: 4, padding: '4px 8px', fontSize: 12, color: '#1565C0',
            }}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{tool.code}</span>
              <span style={{ color: '#555' }}>{tool.name}</span>
              <button type="button" onClick={() => onChange(value.filter((v) => v.id !== tool.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#1565C0', opacity: 0.6 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', pointerEvents: 'none' }} />
        <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingLeft: 30 }} placeholder="ค้นหา tool…" />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map((item) => {
            const already = value.some((v) => v.id === item.id)
            return (
              <div key={item.id} onMouseDown={() => { if (!already) { onChange([...value, item]); setQuery(''); setOpen(false) } }}
                style={{ padding: '8px 12px', cursor: already ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10, opacity: already ? 0.4 : 1, borderBottom: '1px solid #F5F5F5' }}
                onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '#F0F4FF' }}
                onMouseLeave={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1565C0', flexShrink: 0 }}>{item.code}</span>
                <span style={{ fontSize: 13, color: '#1F1F1F' }}>{item.name}</span>
                {already && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9E9E9E' }}>added</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Labor Picker ──────────────────────────────────────────────────────────────

function LaborPicker({ value, onChange }: { value: LaborEntry[]; onChange: (items: LaborEntry[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<LaborOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/equipment-resources').then((r) => {
      setAll((r.data as any[]).filter((m) => m.type === 'labor').map((m) => ({ id: m.id, code: m.code, name: m.name })))
    })
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? all.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 10) : all.slice(0, 10)
  }, [query, all])

  function setQty(id: number, qty: number) {
    onChange(value.map((v) => v.option.id === id ? { ...v, qty: Math.max(1, qty) } : v))
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {value.map(({ option, qty }) => (
            <div key={option.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#EDF7ED', border: '1px solid #B2DFDB',
              borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#1B5E20',
            }}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{option.code}</span>
              <span style={{ color: '#555' }}>{option.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, background: '#fff', borderRadius: 4, border: '1px solid #B2DFDB', padding: '0 4px' }}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setQty(option.id, qty - 1) }}
                  style={{ background: 'none', border: 'none', cursor: qty > 1 ? 'pointer' : 'default', color: qty > 1 ? '#1B5E20' : '#BDBDBD', fontSize: 14, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: 'center', color: '#1B5E20' }}>{qty}</span>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setQty(option.id, qty + 1) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1B5E20', fontSize: 14, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}>+</button>
              </div>
              <span style={{ fontSize: 10, color: '#888' }}>คน</span>
              <button type="button" onClick={() => onChange(value.filter((v) => v.option.id !== option.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#1B5E20', opacity: 0.5 }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', pointerEvents: 'none' }} />
        <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingLeft: 30 }} placeholder="ค้นหา labor…" />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map((item) => {
            const already = value.some((v) => v.option.id === item.id)
            return (
              <div key={item.id}
                onMouseDown={() => { if (!already) { onChange([...value, { option: item, qty: 1 }]); setQuery(''); setOpen(false) } }}
                style={{ padding: '8px 12px', cursor: already ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10, opacity: already ? 0.4 : 1, borderBottom: '1px solid #F5F5F5' }}
                onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '#F1F8F1' }}
                onMouseLeave={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1B5E20', flexShrink: 0 }}>{item.code}</span>
                <span style={{ fontSize: 13, color: '#1F1F1F' }}>{item.name}</span>
                {already && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9E9E9E' }}>added</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ActivityBuilderModal ──────────────────────────────────────────────────────

interface Props {
  activityId?: number
  onClose: () => void
  onSaved?: () => void
}

export function ActivityBuilderModal({ activityId, onClose, onSaved }: Props) {
  const isEdit = activityId !== undefined

  const [selectedMachine, setSelectedMachine] = useState<MachineOption | null>(null)
  const [selectedConsumables, setSelectedConsumables] = useState<ConsumableOption[]>([])
  const [selectedTools, setSelectedTools] = useState<LaborOption[]>([])
  const [selectedLabors, setSelectedLabors] = useState<LaborEntry[]>([])
  const [machineError, setMachineError] = useState(false)

  const { data: existing, isLoading: isLoadingExisting } = useActivity(activityId)
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity(activityId ?? 0)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', duration_min: 0 },
  })

  useEffect(() => {
    if (existing) {
      reset({ name: existing.name, duration_min: Number(existing.duration_min) })
      setSelectedMachine({ id: existing.machine.id, code: existing.machine.code, name: existing.machine.name, type: '' })
      setSelectedConsumables(existing.consumes.map((c) => ({ id: c.resource.id, code: c.resource.code, name: c.resource.name })))
      setSelectedTools((existing.tools ?? []).map((t) => ({ id: t.resource.id, code: t.resource.code, name: t.resource.name })))
      setSelectedLabors(existing.labors.map((l) => ({ option: { id: l.labor_resource.id, code: l.labor_resource.code, name: l.labor_resource.name }, qty: l.qty })))
    }
  }, [existing, reset])

  async function onSubmit(values: FormValues) {
    if (!selectedMachine) { setMachineError(true); return }
    setMachineError(false)
    const payload = {
      name: values.name,
      machine_id: selectedMachine.id,
      duration_min: Number(values.duration_min),
      consumes: selectedConsumables.map((c) => c.id),
      tools: selectedTools.map((t) => t.id),
      labors: selectedLabors.map((l) => ({ id: l.option.id, qty: l.qty })),
    }
    if (isEdit) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }
    onSaved?.()
    onClose()
  }

  const mutationError = createMutation.error || updateMutation.error

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, color: '#9E9E9E',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #F0F0F0',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 560, maxHeight: '90vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ height: 56, padding: '0 24px', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>
            {isEdit ? 'Edit Activity' : 'New Activity'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: '#9E9E9E' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {isEdit && isLoadingExisting ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>Loading…</div>
          ) : (
            <form id="activity-builder-form" onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Activity Details */}
              <div style={{ background: '#F8F9FA', border: '1px solid #E8E8E8', borderRadius: 10, padding: 20 }}>
                <div style={sectionLabel}>Activity Details</div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>ชื่อกิจกรรม <span style={{ color: '#C8202A' }}>*</span></label>
                  <input
                    {...register('name', { required: 'Required', maxLength: { value: 120, message: 'Max 120 chars' } })}
                    style={{ ...inputStyle, borderColor: errors.name ? '#FFCDD2' : '#E0E0E0' }}
                    placeholder="e.g. Cut H-beam web plate"
                  />
                  {errors.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                      <AlertCircle size={11} />{errors.name.message}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Duration (min) <span style={{ color: '#C8202A' }}>*</span></label>
                  <input
                    {...register('duration_min', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                    type="number" step="0.01"
                    style={{ ...inputStyle, borderColor: errors.duration_min ? '#FFCDD2' : '#E0E0E0' }}
                    placeholder="5.5"
                  />
                  {errors.duration_min && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                      <AlertCircle size={11} />{errors.duration_min.message}
                    </div>
                  )}
                </div>
              </div>

              {/* Resources */}
              <div style={{ background: '#F8F9FA', border: '1px solid #E8E8E8', borderRadius: 10, padding: 20 }}>
                <div style={sectionLabel}>Resources</div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Machine <span style={{ color: '#C8202A' }}>*</span></label>
                  <MachinePicker value={selectedMachine} onChange={(m) => { setSelectedMachine(m); setMachineError(false) }} hasError={machineError} />
                  {machineError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                      <AlertCircle size={11} />Required
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid #EEEEEE', marginBottom: 20 }} />
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Consumed Materials (optional)</label>
                  <ConsumablePicker value={selectedConsumables} onChange={setSelectedConsumables} />
                </div>
                <div style={{ borderTop: '1px solid #EEEEEE', marginBottom: 20 }} />
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Tools / เครื่องมือ (optional)</label>
                  <ToolPicker value={selectedTools} onChange={setSelectedTools} />
                </div>
                <div style={{ borderTop: '1px solid #EEEEEE', marginBottom: 20 }} />
                <div>
                  <label style={labelStyle}>Labor / คนทำงาน (optional)</label>
                  <LaborPicker value={selectedLabors} onChange={setSelectedLabors} />
                </div>
              </div>

            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ height: 60, padding: '0 24px', borderTop: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            {mutationError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#C8202A' }}>
                <AlertCircle size={13} />
                {mutationError instanceof Error ? mutationError.message : 'Save failed'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ height: 36, padding: '0 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" form="activity-builder-form" disabled={isSubmitting}
              style={{
                height: 36, padding: '0 20px', borderRadius: 6, border: 'none',
                background: isSubmitting ? '#E0E0E0' : '#C8202A',
                color: isSubmitting ? '#9E9E9E' : '#fff',
                fontSize: 13, fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Activity'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
