import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateMo, useMo, useUpdateMo } from '../hooks/useMo'
import { changeMoStatus } from '../api/mo'
import { MarkPrefixGrid } from '../components/mo/MarkPrefixGrid'
import { AssemblyPicker } from '../components/mo/AssemblyPicker'
import { AssemblyFilterBar, DEFAULT_FILTER, type AssemblyFilter } from '../components/mo/AssemblyFilterBar'
import { RoutingSuggestion } from '../components/mo/RoutingSuggestion'
import { StickySaveBar } from '../components/mo/StickySaveBar'
import type { AssemblyPickerItem } from '../api/mo'

const PANEL: React.CSSProperties = { border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff' }
const PANEL_SCROLL: React.CSSProperties = { ...PANEL, flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }

function ColHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 8, flexShrink: 0 }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, background: '#C8202A', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{title}</span>
      {hint && <span style={{ fontSize: 11, color: '#999' }}>{hint}</span>}
    </div>
  )
}

export function MoNew() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editId = id ? Number(id) : null
  const isEdit = editId != null

  const createMut = useCreateMo()
  const updateMut = useUpdateMo(editId ?? 0)
  const { data: existing } = useMo(editId ?? 0)

  const [markPrefix, setMarkPrefix] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<number, { item: AssemblyPickerItem; qty: number }>>({})
  const [routingId, setRoutingId] = useState<number | null>(null)
  const [filter, setFilter] = useState<AssemblyFilter>(DEFAULT_FILTER)
  const patchFilter = (patch: Partial<AssemblyFilter>) => setFilter(prev => ({ ...prev, ...patch }))
  const [routingName, setRoutingName] = useState<string | null>(null)

  // prefill once when editing (only DRAFT is editable — bounce otherwise)
  const seeded = useRef(false)
  useEffect(() => {
    if (!isEdit || !existing || seeded.current) return
    if (existing.status !== 'DRAFT') {
      navigate(`/mo/${editId}`, { replace: true })
      return
    }
    seeded.current = true
    setMarkPrefix(existing.primary_mark_prefix_code)
    setRoutingId(existing.routing_template_id)
    setRoutingName(existing.routing_template?.name ?? null)
    const sel: Record<number, { item: AssemblyPickerItem; qty: number }> = {}
    for (const l of existing.assembly_lines) {
      sel[l.bom_assembly_id] = {
        qty: Number(l.qty),
        item: {
          id: l.bom_assembly_id,
          assembly_mark: l.bom_assembly.assembly_mark,
          name: l.bom_assembly.name,
          mark_prefix: null, project: null, zone: null, sub_zone: null,
          project_due_date: null, zone_end_date: null, sub_zone_due_date: null,
          bom_version: '1.0',
          total: 0, allocated: 0, remaining: Number(l.qty),
          allocation_breakdown: [],
        },
      }
    }
    setSelected(sel)
  }, [isEdit, existing, editId, navigate])

  function selectPrefix(code: string) {
    setMarkPrefix(code)
    setSelected({})
    setRoutingId(null)
    setRoutingName(null)
  }

  function setQty(item: AssemblyPickerItem, qty: number) {
    setSelected(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[item.id]
      else next[item.id] = { item, qty }
      return next
    })
  }

  const lines = Object.values(selected).filter(s => s.qty > 0)
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  const canSave = !!markPrefix && !!routingId && lines.length > 0
  const saving = createMut.isPending || updateMut.isPending

  async function save(confirm: boolean) {
    if (!canSave || !markPrefix || !routingId) return
    const payload = {
      primary_mark_prefix_code: markPrefix,
      routing_template_id: routingId,
      assembly_lines: lines.map(l => ({ bom_assembly_id: l.item.id, qty: l.qty })),
    }
    try {
      if (isEdit && editId) {
        await updateMut.mutateAsync(payload)
        if (confirm) await changeMoStatus(editId, { to_status: 'CONFIRMED', reason: 'Confirmed on edit' })
        navigate(`/mo/${editId}`)
      } else {
        const mo = await createMut.mutateAsync({ ...payload, confirm })
        navigate(`/mo/${mo.id}`)
      }
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { message?: string | string[] } } })?.response
      const msg = resp?.data?.message
      toast.error(Array.isArray(msg) ? msg.join(' · ') : msg ?? `Failed to ${isEdit ? 'update' : 'create'} MO`)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button onClick={() => navigate(isEdit ? `/mo/${editId}` : '/mo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>
          {isEdit ? `Edit ${existing?.mo_code ?? 'MO'}` : 'New Manufacturing Order'}
        </span>
        {isEdit && <span style={{ fontSize: 11, fontWeight: 700, color: '#555', background: '#F0F0F0', borderRadius: 999, padding: '2px 10px' }}>DRAFT</span>}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#F7F7F7' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '12px 20px 16px', overflow: 'hidden' }}>
          {/* Left col — Select By + Mark Prefix */}
          <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 10 }}>
            <div style={{ flexShrink: 0 }}>
              <ColHead n={1} title="Select By" />
              <AssemblyFilterBar filter={filter} onChange={patchFilter} />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ColHead n={2} title="Mark Prefix" />
              <div style={{ flex: 1, minHeight: 0 }}>
                <MarkPrefixGrid value={markPrefix} onChange={selectPrefix} />
              </div>
            </div>
          </div>

          {/* 3. Assemblies */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ColHead n={3} title="Assemblies" hint={markPrefix ? 'qty ≤ remaining' : undefined} />
            <div style={PANEL_SCROLL}>
              {markPrefix
                ? <AssemblyPicker key={markPrefix} markPrefix={markPrefix} selected={selected} onSetQty={setQty} filter={filter} />
                : <PickFirst />}
            </div>
          </div>

          {/* 4. Routing */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ColHead n={4} title="Routing" />
            <div style={PANEL_SCROLL}>
              {markPrefix
                ? <RoutingSuggestion markPrefix={markPrefix} value={routingId} onChange={(rid, name) => { setRoutingId(rid); setRoutingName(name) }} />
                : <PickFirst />}
            </div>
          </div>
        </div>
      </div>

      <StickySaveBar
        markPrefix={markPrefix}
        assemblyCount={lines.length}
        totalQty={Number(totalQty.toFixed(3))}
        routingName={routingName}
        canSave={canSave}
        saving={saving}
        onCancel={() => navigate(isEdit ? `/mo/${editId}` : '/mo')}
        onSaveDraft={() => save(false)}
        onSaveConfirm={() => save(true)}
      />
    </div>
  )
}

function PickFirst() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 160, color: '#B0B0B0', fontSize: 13, border: '1px dashed #DDD', borderRadius: 8 }}>
      Select a mark prefix first
    </div>
  )
}
