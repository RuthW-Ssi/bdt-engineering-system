import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeft, AlertCircle, X, Search } from 'lucide-react'
import { useActivity, useCreateActivity, useUpdateActivity } from '../hooks/useActivities'
import { apiClient } from '../api/client'

interface MachineOption {
  id: number
  code: string
  name: string
  type: string
}

interface MaterialOption {
  id: number
  default_code: string
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

// ── Machine Picker (single-select, load-all + client filter) ─────────────────

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
        (r.data as any[]).map((m) => ({
          id: m.id, code: m.code, name: m.name, type: m.type,
        }))
      )
    })
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return all.slice(0, 10)
    return all.filter(
      (m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [query, all])

  if (value) {
    return (
      <div ref={wrapperRef}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#FFF3F3', border: '1px solid #FFCDD2',
            borderRadius: 4, padding: '5px 10px', fontSize: 12, color: '#C8202A',
          }}
        >
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
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 240, overflowY: 'auto',
          }}
        >
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
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C8202A', flexShrink: 0 }}>
                {item.code}
              </span>
              <span style={{ fontSize: 13, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#BDBDBD', flexShrink: 0 }}>
                {item.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Material Picker (multi-select, debounced search) ─────────────────────────

function MaterialPicker({
  value,
  onChange,
}: {
  value: MaterialOption[]
  onChange: (items: MaterialOption[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MaterialOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiClient.get('/materials', { params: { search: query, page: 1, limit: 8 } })
        const items: MaterialOption[] = (res.data.items ?? []).map((m: any) => ({
          id: m.id, default_code: m.default_code, name: m.name,
        }))
        setResults(items)
        setOpen(items.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
  }, [query])

  function select(item: MaterialOption) {
    if (!value.find((v) => v.id === item.id)) onChange([...value, item])
    setQuery(''); setResults([]); setOpen(false)
  }

  function remove(id: number) {
    onChange(value.filter((v) => v.id !== id))
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.map((m) => (
            <span
              key={m.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#FFF3F3', border: '1px solid #FFCDD2',
                borderRadius: 4, padding: '3px 8px', fontSize: 12, color: '#C8202A',
              }}
            >
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{m.default_code}</span>
              <span style={{ color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#C8202A', opacity: 0.6 }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          style={{ ...inputStyle, paddingLeft: 30 }}
          placeholder="พิมชื่อ หรือ รหัส material เพื่อค้นหา…"
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9E9E9E' }}>...</span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 240, overflowY: 'auto',
          }}
        >
          {results.map((item) => {
            const already = value.some((v) => v.id === item.id)
            return (
              <div
                key={item.id}
                onMouseDown={() => !already && select(item)}
                style={{
                  padding: '8px 12px', cursor: already ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: already ? 0.4 : 1,
                  borderBottom: '1px solid #F5F5F5',
                }}
                onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '#FFF8F8' }}
                onMouseLeave={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C8202A', flexShrink: 0 }}>{item.default_code}</span>
                <span style={{ fontSize: 13, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                {already && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9E9E9E' }}>added</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Labor Picker (multi-select + qty stepper) ─────────────────────────────────

function LaborPicker({
  value,
  onChange,
}: {
  value: LaborEntry[]
  onChange: (items: LaborEntry[]) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<LaborOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/equipment-resources').then((r) => {
      setAll(
        (r.data as any[])
          .filter((m) => m.type === 'labor')
          .map((m) => ({ id: m.id, code: m.code, name: m.name }))
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

  function select(opt: LaborOption) {
    if (!value.find((v) => v.option.id === opt.id)) onChange([...value, { option: opt, qty: 1 }])
    setQuery(''); setOpen(false)
  }

  function remove(id: number) {
    onChange(value.filter((v) => v.option.id !== id))
  }

  function setQty(id: number, qty: number) {
    onChange(value.map((v) => v.option.id === id ? { ...v, qty: Math.max(1, qty) } : v))
  }

  const chipBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#EDF7ED', border: '1px solid #B2DFDB',
    borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#1B5E20',
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {value.map(({ option, qty }) => (
            <div key={option.id} style={chipBase}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{option.code}</span>
              <span style={{ color: '#555' }}>{option.name}</span>
              {/* qty stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, background: '#fff', borderRadius: 4, border: '1px solid #B2DFDB', padding: '0 4px' }}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setQty(option.id, qty - 1) }}
                  style={{ background: 'none', border: 'none', cursor: qty > 1 ? 'pointer' : 'default', color: qty > 1 ? '#1B5E20' : '#BDBDBD', fontSize: 14, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}
                >−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: 'center', color: '#1B5E20' }}>{qty}</span>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setQty(option.id, qty + 1) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1B5E20', fontSize: 14, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}
                >+</button>
              </div>
              <span style={{ fontSize: 10, color: '#888' }}>คน</span>
              <button
                type="button"
                onClick={() => remove(option.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#1B5E20', opacity: 0.5 }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingLeft: 30 }}
          placeholder="พิมชื่อ หรือ รหัส labor เพื่อค้นหา…"
        />
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.map((item) => {
            const already = value.some((v) => v.option.id === item.id)
            return (
              <div
                key={item.id}
                onMouseDown={() => !already && select(item)}
                style={{
                  padding: '8px 12px', cursor: already ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: already ? 0.4 : 1, borderBottom: '1px solid #F5F5F5',
                }}
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

// ── ActivityBuilder ──────────────────────────────────────────────────────────

export function ActivityBuilder() {
  const { id } = useParams<{ id?: string }>()
  const activityId = id ? Number(id) : undefined
  const isEdit = activityId !== undefined
  const navigate = useNavigate()

  const [selectedMachine, setSelectedMachine] = useState<MachineOption | null>(null)
  const [selectedMaterials, setSelectedMaterials] = useState<MaterialOption[]>([])
  const [selectedLabors, setSelectedLabors] = useState<LaborEntry[]>([])
  const [machineError, setMachineError] = useState(false)

  const { data: existing, isLoading: isLoadingExisting } = useActivity(activityId)
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity(activityId ?? 0)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: '', duration_min: 0 },
  })

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        duration_min: Number(existing.duration_min),
      })
      setSelectedMachine({
        id: existing.machine.id,
        code: existing.machine.code,
        name: existing.machine.name,
        type: '',
      })
      setSelectedMaterials(
        existing.consumes.map((c) => ({
          id: c.material.id,
          default_code: c.material.default_code,
          name: c.material.name,
        }))
      )
      setSelectedLabors(
        existing.labors.map((l) => ({
          option: { id: l.labor_resource.id, code: l.labor_resource.code, name: l.labor_resource.name },
          qty: l.qty,
        }))
      )
    }
  }, [existing, reset])

  async function onSubmit(values: FormValues) {
    if (!selectedMachine) { setMachineError(true); return }
    setMachineError(false)
    const payload = {
      name: values.name,
      machine_id: selectedMachine.id,
      duration_min: Number(values.duration_min),
      consumes: selectedMaterials.map((m) => m.id),
      labors: selectedLabors.map((l) => ({ id: l.option.id, qty: l.qty })),
    }
    if (isEdit) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }
    navigate('/activity-library')
  }

  const error = createMutation.error || updateMutation.error

  if (isEdit && isLoadingExisting) {
    return <div className="p-8 text-center">Loading…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'inherit', background: '#F8F8F8' }}>

      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/activity-library')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 13 }}
        >
          <ArrowLeft size={16} />Activity Library
        </button>
        <div style={{ width: 1, height: 20, background: '#E0E0E0' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>
          {isEdit ? 'Edit Activity' : 'New Activity'}
        </span>
      </div>

      {/* Form body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <form onSubmit={handleSubmit(onSubmit)}>

            {/* Activity Details card — Name + Duration only */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #F0F0F0' }}>
                Activity Details
              </div>

              {/* Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>
                  ชื่อกิจกรรม <span style={{ color: '#C8202A' }}>*</span>
                </label>
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

              {/* Duration */}
              <div>
                <label style={labelStyle}>
                  Duration (min) <span style={{ color: '#C8202A' }}>*</span>
                </label>
                <input
                  {...register('duration_min', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                  type="number"
                  step="0.01"
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

            {/* Resources card — Machine + Materials + Labor */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 24, marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20, paddingBottom: 8, borderBottom: '1px solid #F0F0F0' }}>
                Resources
              </div>

              {/* Machine */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>
                  Machine <span style={{ color: '#C8202A' }}>*</span>
                </label>
                <MachinePicker
                  value={selectedMachine}
                  onChange={(m) => { setSelectedMachine(m); setMachineError(false) }}
                  hasError={machineError}
                />
                {machineError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                    <AlertCircle size={11} />Required
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid #F0F0F0', marginBottom: 20 }} />

              {/* Materials */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Consumed Materials (optional)</label>
                <MaterialPicker value={selectedMaterials} onChange={setSelectedMaterials} />
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid #F0F0F0', marginBottom: 20 }} />

              {/* Labor */}
              <div>
                <label style={labelStyle}>Labor / คนทำงาน (optional)</label>
                <LaborPicker value={selectedLabors} onChange={setSelectedLabors} />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  height: 38, padding: '0 20px', borderRadius: 6, border: 'none',
                  background: isSubmitting ? '#E0E0E0' : '#C8202A',
                  color: isSubmitting ? '#9E9E9E' : '#fff',
                  fontSize: 13, fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/activity-library')}
                style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid #E0E0E0', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
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
