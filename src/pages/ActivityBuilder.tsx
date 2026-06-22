import { useEffect, useState, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { AlertCircle, X, Search } from 'lucide-react'
import { useActivity, useCreateActivity, useUpdateActivity } from '../hooks/useActivities'
import { apiClient } from '../api/client'
import { consumeFormulasApi, type ConsumeFormula } from '../api/consumeFormulas'

interface MachineOption {
  id: number
  code: string
  name: string
  type: string
}

interface ConsumableEntry {
  id: number
  code: string
  name: string
  formula_id?: number
}

interface ToolOption {
  id: number
  code: string
  name: string
  qty: number
}

interface LaborEntry {
  skill: string
  qty: number
  level?: string
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

function ConsumablePicker({ value, onChange, formulas }: {
  value: ConsumableEntry[]
  onChange: (items: ConsumableEntry[]) => void
  formulas: ConsumeFormula[]
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<ConsumableEntry[]>([])
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

  function setFormula(id: number, formula_id: number | undefined) {
    onChange(value.map(v => v.id === id ? { ...v, formula_id } : v))
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {value.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto',
                background: '#FFF8E1', border: '1px solid #FFE082',
                borderRadius: 4, padding: '3px 8px', fontSize: 12, color: '#7B4F00',
              }}>
                <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{m.code}</span>
                <span style={{ color: '#555', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              </span>
              <select
                value={m.formula_id ?? ''}
                onChange={e => setFormula(m.id, e.target.value ? Number(e.target.value) : undefined)}
                style={{ fontSize: 11, border: '1px solid #E0E0E0', borderRadius: 4, padding: '3px 6px', color: m.formula_id ? '#1B5E20' : '#9E9E9E', background: m.formula_id ? '#F1F8E9' : '#FAFAFA', flex: 1, minWidth: 0 }}
              >
                <option value="">— formula —</option>
                {formulas.map(f => (
                  <option key={f.id} value={f.id}>{f.name} [{f.result_unit ?? '?'}]</option>
                ))}
              </select>
              <button type="button" onClick={() => onChange(value.filter((v) => v.id !== m.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#9E9E9E', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
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

function ToolPicker({ value, onChange }: { value: ToolOption[]; onChange: (items: ToolOption[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<ToolOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/equipment-resources').then((r) => {
      setAll((r.data as any[]).filter((m) => m.type === 'tool').map((m) => ({ id: m.id, code: m.code, name: m.name, qty: 1 })))
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {value.map((tool) => (
            <div key={tool.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#F0F4FF', border: '1px solid #BBDEFB',
              borderRadius: 6, padding: '6px 10px', fontSize: 12,
            }}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11, color: '#1565C0', minWidth: 60 }}>{tool.code}</span>
              <span style={{ color: '#555', flex: 1 }}>{tool.name}</span>
              <span style={{ fontSize: 11, color: '#9E9E9E', marginRight: 2 }}>จำนวน</span>
              <input
                type="number" min={1} value={tool.qty}
                onChange={e => onChange(value.map(v => v.id === tool.id ? { ...v, qty: Math.max(1, Number(e.target.value)) } : v))}
                style={{ width: 52, padding: '2px 6px', border: '1px solid #BBDEFB', borderRadius: 4, fontSize: 12, textAlign: 'center', background: '#fff' }}
              />
              <button type="button" onClick={() => onChange(value.filter((v) => v.id !== tool.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#1565C0', opacity: 0.6, marginLeft: 2 }}>
                <X size={12} />
              </button>
            </div>
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
              <div key={item.id} onMouseDown={() => { if (!already) { onChange([...value, { ...item, qty: 1 }]); setQuery(''); setOpen(false) } }}
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

// ── Skill Picker ──────────────────────────────────────────────────────────────

function SkillPicker({ value, onChange }: { value: LaborEntry[]; onChange: (items: LaborEntry[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [allSkills, setAllSkills] = useState<string[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/machines/skills').then((r) => {
      setAllSkills((r.data as { id: number; name: string }[]).map((s) => s.name))
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
    return (q ? allSkills.filter((s) => s.toLowerCase().includes(q)) : allSkills).slice(0, 10)
  }, [query, allSkills])

  function setQty(skill: string, qty: number) {
    onChange(value.map((v) => v.skill === skill ? { ...v, qty: Math.max(1, qty) } : v))
  }
  function setLevel(skill: string, level: string) {
    onChange(value.map((v) => v.skill === skill ? { ...v, level: (level && level !== '-') ? level : undefined } : v))
  }

  const LEVEL_OPTIONS = ['-', 'A', 'B+', 'B', 'C']

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {value.map(({ skill, qty, level }) => (
            <div key={skill} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#EDF7ED', border: '1px solid #B2DFDB',
              borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#1B5E20',
            }}>
              <span style={{ color: '#1B5E20', fontWeight: 600, minWidth: 80 }}>{skill}</span>
              {/* qty */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 4, border: '1px solid #B2DFDB', padding: '0 4px' }}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setQty(skill, qty - 1) }}
                  style={{ background: 'none', border: 'none', cursor: qty > 1 ? 'pointer' : 'default', color: qty > 1 ? '#1B5E20' : '#BDBDBD', fontSize: 14, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: 'center', color: '#1B5E20' }}>{qty}</span>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setQty(skill, qty + 1) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1B5E20', fontSize: 14, lineHeight: 1, padding: '0 2px', fontWeight: 700 }}>+</button>
              </div>
              <span style={{ fontSize: 10, color: '#888' }}>คน</span>
              {/* level */}
              <select
                value={level ?? ''}
                onChange={(e) => setLevel(skill, e.target.value)}
                style={{ fontSize: 11, border: '1px solid #B2DFDB', borderRadius: 4, padding: '1px 4px', background: '#fff', color: '#1B5E20', outline: 'none', cursor: 'pointer' }}
              >
                {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button type="button" onClick={() => onChange(value.filter((v) => v.skill !== skill))}
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
          style={{ ...inputStyle, paddingLeft: 30 }} placeholder="ค้นหา skill…" />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', marginTop: 2, maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map((skill) => {
            const already = value.some((v) => v.skill === skill)
            return (
              <div key={skill}
                onMouseDown={() => { if (!already) { onChange([...value, { skill, qty: 1 }]); setQuery(''); setOpen(false) } }}
                style={{ padding: '8px 12px', cursor: already ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10, opacity: already ? 0.4 : 1, borderBottom: '1px solid #F5F5F5' }}
                onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '#F1F8F1' }}
                onMouseLeave={(e) => { if (!already) (e.currentTarget as HTMLDivElement).style.background = '' }}
              >
                <span style={{ fontSize: 13, color: '#1F1F1F' }}>{skill}</span>
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
  const [selectedConsumables, setSelectedConsumables] = useState<ConsumableEntry[]>([])
  const [selectedTools, setSelectedTools] = useState<ToolOption[]>([])
  const [selectedSkills, setSelectedSkills] = useState<LaborEntry[]>([])

  const { data: formulas = [] } = useQuery({ queryKey: ['consume-formulas'], queryFn: consumeFormulasApi.list, staleTime: 10 * 60 * 1000 })

  const { data: existing, isLoading: isLoadingExisting } = useActivity(activityId)
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity(activityId ?? 0)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', duration_min: 0 },
  })

  useEffect(() => {
    if (existing) {
      reset({ name: existing.name, duration_min: Number(existing.duration_min) })
      setSelectedMachine(existing.machine ? { id: existing.machine.id, code: existing.machine.code, name: existing.machine.name, type: '' } : null)
      setSelectedConsumables(existing.consumes.map((c) => ({ id: c.resource.id, code: c.resource.code, name: c.resource.name, formula_id: c.formula?.id ?? undefined })))
      setSelectedTools((existing.tools ?? []).map((t) => ({ id: t.resource.id, code: t.resource.code, name: t.resource.name, qty: t.qty ?? 1 })))
      setSelectedSkills(existing.skills.map((l) => ({ skill: l.skill, qty: l.qty, level: l.level ?? undefined })))
    }
  }, [existing, reset])

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      machine_id: selectedMachine?.id,
      duration_min: Number(values.duration_min),
      consumes: selectedConsumables.map((c) => ({ resource_id: c.id, formula_id: c.formula_id })),
      tools: selectedTools.map((t) => ({ resource_id: t.id, qty: t.qty })),
      labors: selectedSkills.map((l) => ({ skill: l.skill, qty: l.qty, level: l.level || undefined })),
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
                  <label style={labelStyle}>Machine <span style={{ color: '#9E9E9E', fontWeight: 400 }}>(optional)</span></label>
                  <MachinePicker value={selectedMachine} onChange={setSelectedMachine} hasError={false} />
                </div>
                <div style={{ borderTop: '1px solid #EEEEEE', marginBottom: 20 }} />
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Consumed Materials (optional)</label>
                  <ConsumablePicker value={selectedConsumables} onChange={setSelectedConsumables} formulas={formulas} />
                </div>
                <div style={{ borderTop: '1px solid #EEEEEE', marginBottom: 20 }} />
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Tools / เครื่องมือ (optional)</label>
                  <ToolPicker value={selectedTools} onChange={setSelectedTools} />
                </div>
                <div style={{ borderTop: '1px solid #EEEEEE', marginBottom: 20 }} />
                <div>
                  <label style={labelStyle}>Skill / ทักษะ (optional)</label>
                  <SkillPicker value={selectedSkills} onChange={setSelectedSkills} />
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
