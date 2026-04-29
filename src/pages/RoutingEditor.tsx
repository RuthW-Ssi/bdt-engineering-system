import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, Play, ArchiveX, RefreshCw, Clock, Layers,
  ChevronDown, ChevronRight, AlertCircle, Loader2, Info,
  Trash2, Edit2, Check, X, RotateCcw, GripVertical, Pencil,
} from 'lucide-react'
import { useRouting, useStdCost } from '../hooks/useRoutings'
import { updateActivityOverride, deleteStepActivity } from '../api/routings'
import type { RoutingOpDTO, StepActivityDTO } from '../api/routings'

// ── Helpers ────────────────────────────────────────────────────

const STATE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: '#F5F5F5', text: '#555', label: 'Draft' },
  active:   { bg: '#EAF5E9', text: '#2E7D32', label: 'Active' },
  obsolete: { bg: '#FFF3E0', text: '#E65100', label: 'Obsolete' },
}

function StatePill({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.draft
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

function fmtTime(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const WC_COLOR: Record<string, string> = {
  'WC-BU': '#1565C0',
  'WC-AS': '#2E7D32',
  'WC-PT': '#7B1FA2',
  'WC-PR': '#E65100',
}

// ── Formula Trace Tooltip ──────────────────────────────────────

function TraceTooltip({ act, onClose }: { act: StepActivityDTO; onClose: () => void }) {
  const tpl = act.activity_template
  const perMin   = Number(act.per_minute_override   ?? tpl.per_minute)
  const stdM     = Number(act.std_measure_override  ?? tpl.std_measure)
  const manpower = Number(act.manpower_override     ?? tpl.manpower)
  const ct       = act.last_cycle_time_min ? Number(act.last_cycle_time_min) : null
  const snap     = act.last_input_snapshot

  return (
    <div className="absolute z-50 shadow-lg"
      style={{ right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: 12, width: 280, fontSize: 11 }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontWeight: 700, color: '#185FA5', fontSize: 12 }}>{tpl.formula_param_code}</span>
        <button onClick={onClose}><X size={12} style={{ color: '#8E8E8E' }} /></button>
      </div>
      {snap && (
        <div className="font-mono mb-2" style={{ background: '#F0F4FF', borderRadius: 4, padding: '4px 8px', color: '#3A3A3A' }}>
          {snap.formulaExpr} = {snap.inputValue.toFixed(2)}
        </div>
      )}
      <div style={{ color: '#555', lineHeight: 1.9 }}>
        <div>Rate: <span className="font-mono">{perMin} min/{tpl.unit}</span></div>
        <div>Std measure: <span className="font-mono">{stdM} {tpl.unit}</span></div>
        <div>Manpower: <span className="font-mono">{manpower} คน</span></div>
      </div>
      {snap && ct != null && (
        <div className="font-mono mt-2" style={{ background: '#F5F5F5', borderRadius: 4, padding: '4px 8px', color: '#1F1F1F' }}>
          ceil({snap.inputValue.toFixed(1)}/{stdM}) × {perMin} × {manpower} = <strong>{Math.round(ct)} min</strong>
        </div>
      )}
      {!snap && ct == null && <div style={{ color: '#8E8E8E', marginTop: 4 }}>ยังไม่ได้ Recompute</div>}
    </div>
  )
}

// ── Activity Row ───────────────────────────────────────────────

function ActivityRow({
  act, editMode, opId, productCode, routingKey,
}: {
  act: StepActivityDTO
  editMode: boolean
  opId: number
  productCode: string
  routingKey: unknown[]
}) {
  const qc = useQueryClient()
  const tpl      = act.activity_template
  const perMin   = Number(act.per_minute_override   ?? tpl.per_minute)
  const stdM     = Number(act.std_measure_override  ?? tpl.std_measure)
  const manpower = Number(act.manpower_override     ?? tpl.manpower)
  const ct       = act.last_cycle_time_min ? Number(act.last_cycle_time_min) : null
  const hasOverride = act.per_minute_override != null || act.std_measure_override != null || act.manpower_override != null

  const [editing, setEditing]     = useState(false)
  const [showTrace, setShowTrace] = useState(false)
  const [vals, setVals]           = useState({ per_minute: '', std_measure: '', manpower: '' })

  const saveMut = useMutation({
    mutationFn: () => updateActivityOverride(productCode, opId, act.id, {
      per_minute_override:  parseFloat(vals.per_minute)  || null,
      std_measure_override: parseFloat(vals.std_measure) || null,
      manpower_override:    parseFloat(vals.manpower)    || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: routingKey }); setEditing(false) },
  })

  const resetMut = useMutation({
    mutationFn: () => updateActivityOverride(productCode, opId, act.id, {
      per_minute_override: null, std_measure_override: null, manpower_override: null,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: routingKey }),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteStepActivity(productCode, opId, act.id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: routingKey }),
  })

  const startEdit = () => {
    setVals({ per_minute: String(perMin), std_measure: String(stdM), manpower: String(manpower) })
    setEditing(true)
    setShowTrace(false)
  }

  // ── Inline edit form ─────────────────────
  if (editing) {
    return (
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #F0F0F0', background: '#FFFBF0' }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1F1F1F' }}>{tpl.description}</span>
          <span style={{ background: '#FFF8E1', color: '#F57F17', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>override</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: `Rate (min/${tpl.unit})`, key: 'per_minute' },
            { label: `Std measure (${tpl.unit})`, key: 'std_measure' },
            { label: 'Manpower (คน)', key: 'manpower' },
          ].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>{f.label}</div>
              <input
                type="number"
                value={vals[f.key as keyof typeof vals]}
                onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                className="border border-chrome-200 rounded font-mono focus:outline-none focus:border-steel-600"
                style={{ width: f.key === 'manpower' ? 60 : 90, height: 28, padding: '0 6px', fontSize: 12 }}
              />
            </div>
          ))}
          <div className="flex items-center gap-1" style={{ marginTop: 16 }}>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="flex items-center gap-1 rounded text-white"
              style={{ height: 28, padding: '0 10px', fontSize: 11, fontWeight: 600, background: '#185FA5' }}
            >
              {saveMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              บันทึก
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 rounded border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 28, padding: '0 8px', fontSize: 11, color: '#555' }}
            >
              <X size={11} /> ยกเลิก
            </button>
          </div>
        </div>
        {saveMut.isError && (
          <div style={{ fontSize: 11, color: '#C8202A', marginTop: 4 }}>
            {(saveMut.error as any)?.response?.data?.message ?? 'บันทึกไม่สำเร็จ'}
          </div>
        )}
      </div>
    )
  }

  // ── Normal row ───────────────────────────
  return (
    <div className="group" style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 60px 120px', alignItems: 'center', padding: '6px 16px', borderBottom: '1px solid #F0F0F0', fontSize: 12, color: '#555' }}>
      {/* Name */}
      <div className="flex items-center gap-1 min-w-0">
        <span style={{ color: '#1F1F1F' }} className="truncate">{tpl.description}</span>
        <span style={{ background: '#F0F4FF', color: '#185FA5', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
          {tpl.formula_param_code}
        </span>
        {hasOverride && (
          <span style={{ background: '#FFF8E1', color: '#F57F17', borderRadius: 4, padding: '1px 5px', fontSize: 10, flexShrink: 0 }}>override</span>
        )}
      </div>

      <div className="font-mono" style={{ color: '#3A3A3A' }}>{perMin} min/{tpl.unit}</div>
      <div className="font-mono">{stdM} {tpl.unit}</div>
      <div>{manpower} คน</div>

      {/* Cycle time + actions */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono" style={{ fontWeight: 600, color: ct ? '#185FA5' : '#8E8E8E' }}>
          {ct != null ? `${Math.round(ct)} min` : '—'}
        </span>

        <div className="flex items-center gap-0.5">
          {/* Trace ⓘ */}
          <div className="relative">
            <button
              onClick={() => setShowTrace(s => !s)}
              className="flex items-center justify-center rounded hover:bg-chrome-100"
              style={{ width: 20, height: 20 }}
              title="Formula trace"
            >
              <Info size={11} style={{ color: showTrace ? '#185FA5' : '#C2C2C2' }} />
            </button>
            {showTrace && <TraceTooltip act={act} onClose={() => setShowTrace(false)} />}
          </div>

          {/* Override edit — only in edit mode */}
          {editMode && (
            <button
              onClick={startEdit}
              className="flex items-center justify-center rounded hover:bg-chrome-100"
              style={{ width: 20, height: 20 }}
              title="Override values"
            >
              <Edit2 size={11} style={{ color: '#8E8E8E' }} />
            </button>
          )}

          {/* Reset override — edit mode + has override */}
          {editMode && hasOverride && (
            <button
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending}
              className="flex items-center justify-center rounded hover:bg-chrome-100"
              style={{ width: 20, height: 20 }}
              title="Reset to template defaults"
            >
              {resetMut.isPending
                ? <Loader2 size={11} className="animate-spin" style={{ color: '#8E8E8E' }} />
                : <RotateCcw size={11} style={{ color: '#F57F17' }} />}
            </button>
          )}

          {/* Delete activity — edit mode */}
          {editMode && (
            <button
              onClick={() => { if (confirm(`ลบ "${tpl.description}"?`)) deleteMut.mutate() }}
              disabled={deleteMut.isPending}
              className="flex items-center justify-center rounded hover:bg-red-50"
              style={{ width: 20, height: 20 }}
              title="Remove activity"
            >
              {deleteMut.isPending
                ? <Loader2 size={11} className="animate-spin" style={{ color: '#C8202A' }} />
                : <Trash2 size={11} style={{ color: '#C8202A' }} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sortable Op Card ───────────────────────────────────────────

function SortableOpCard({
  op, expanded, onToggle, editMode, onDelete, productCode, routingKey,
}: {
  op: RoutingOpDTO
  expanded: boolean
  onToggle: () => void
  editMode: boolean
  onDelete: () => void
  productCode: string
  routingKey: unknown[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: op.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const wcColor = WC_COLOR[op.workcenter.code] ?? '#555'
  const timeMin = Number(op.time_cycle)

  return (
    <div ref={setNodeRef} style={{ ...style, border: '1px solid #E0E0E0', borderRadius: 8, marginBottom: 8, overflow: 'hidden', background: 'white' }}>
      {/* Op header */}
      <div className="flex items-center" style={{ padding: '8px 12px 8px 8px' }}>
        {/* Drag handle — only in edit mode */}
        {editMode ? (
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center cursor-grab active:cursor-grabbing mr-2"
            style={{ width: 24, height: 32, flexShrink: 0, color: '#C2C2C2' }}
          >
            <GripVertical size={16} />
          </div>
        ) : (
          <div style={{ width: 8 }} />
        )}

        {/* Expand toggle */}
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
          onClick={onToggle}
        >
          {expanded
            ? <ChevronDown size={16} style={{ color: '#8E8E8E', flexShrink: 0 }} />
            : <ChevronRight size={16} style={{ color: '#8E8E8E', flexShrink: 0 }} />}

          <span style={{ background: wcColor, color: 'white', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {op.workcenter.code}
          </span>

          <div className="flex-1 min-w-0">
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{op.name}</span>
            <span className="ml-2" style={{ fontSize: 11, color: '#8E8E8E' }}>seq {op.sequence}</span>
          </div>

          <div className="flex items-center gap-4 mr-2" style={{ flexShrink: 0 }}>
            <div className="text-right">
              <div style={{ fontSize: 11, color: '#8E8E8E' }}>Activities</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3A' }}>{op.activities.length}</div>
            </div>
            <div className="text-right">
              <div style={{ fontSize: 11, color: '#8E8E8E' }}>Cycle Time</div>
              <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: timeMin > 0 ? '#185FA5' : '#8E8E8E' }}>
                {timeMin > 0 ? fmtTime(timeMin) : '—'}
              </div>
            </div>
          </div>
        </button>

        {/* Delete op — edit mode only */}
        {editMode && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center rounded hover:bg-red-50"
            style={{ width: 28, height: 28, flexShrink: 0 }}
            title="ลบ operation นี้"
          >
            <Trash2 size={14} style={{ color: '#C8202A' }} />
          </button>
        )}
      </div>

      {/* Activity list */}
      {expanded && (
        <div style={{ borderTop: '1px solid #E0E0E0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 60px 120px', padding: '4px 16px', background: '#F8F8F8', borderBottom: '1px solid #F0F0F0' }}>
            {['กิจกรรม', 'Rate', 'Std Measure', 'Manpower', 'Cycle Time'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {op.activities.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 12, color: '#8E8E8E' }}>ไม่มี activities</div>
          ) : (
            op.activities.map(a => (
              <ActivityRow
                key={a.id}
                act={a}
                editMode={editMode}
                opId={op.id}
                productCode={productCode}
                routingKey={routingKey}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function RoutingEditor() {
  const { code } = useParams<{ code: string }>()
  const navigate  = useNavigate()

  const [expandedOps, setExpandedOps]   = useState<Set<number>>(new Set())
  const [editMode, setEditMode]         = useState(false)
  const [localOps, setLocalOps]         = useState<RoutingOpDTO[]>([])
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)

  const routingKey = ['routing', code]
  const { routing, state, totalTimeMin, loading, error, activate, obsolete, recompute, deleteOp, reorderOps } = useRouting(code)
  const { stdCost, recompute: recomputeCost } = useStdCost(code)

  const isDraft = state === 'draft'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const toggleOp = (id: number) =>
    setExpandedOps(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Enter edit mode — snapshot current op order
  const handleEnterEdit = () => {
    setLocalOps([...routing])
    setEditMode(true)
  }

  // Cancel edit — discard local reorder
  const handleCancelEdit = () => {
    setEditMode(false)
    setLocalOps([])
  }

  // Save reorder to backend
  const handleSaveEdit = async () => {
    setSaving(true)
    try {
      const items = localOps.map((op, idx) => ({ id: op.id, sequence: (idx + 1) * 10 }))
      await reorderOps.mutateAsync(items)
      setEditMode(false)
      setLocalOps([])
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLocalOps(prev => {
      const oldIdx = prev.findIndex(o => o.id === active.id)
      const newIdx = prev.findIndex(o => o.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  const handleDeleteOp = async (opId: number, opName: string) => {
    if (!confirm(`ลบ operation "${opName}" ออกจาก routing นี้?`)) return
    try {
      await deleteOp.mutateAsync(opId)
      setLocalOps(prev => prev.filter(o => o.id !== opId))
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'ลบไม่สำเร็จ')
    }
  }

  const handleActivate = async () => {
    try { await activate.mutateAsync() }
    catch (e: any) { alert(e.response?.data?.message ?? 'เกิดข้อผิดพลาด') }
  }

  const handleObsolete = async () => {
    if (!confirm('ต้องการยกเลิก routing นี้ใช่ไหม?')) return
    try { await obsolete.mutateAsync() }
    catch (e: any) { alert(e.response?.data?.message ?? 'เกิดข้อผิดพลาด') }
  }

  const handleRecompute = async () => {
    try {
      const result = await recompute.mutateAsync()
      await recomputeCost.mutateAsync()
      setRecomputeResult(`คำนวณเสร็จ: ${Math.round(result.total_cycle_time_min)} นาที รวม`)
      setTimeout(() => setRecomputeResult(null), 4000)
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'คำนวณไม่สำเร็จ')
    }
  }

  // ops to render — use local order while editing, server order otherwise
  const displayOps = editMode ? localOps : routing

  if (loading) return (
    <div className="flex items-center justify-center" style={{ height: '60vh' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: '#8E8E8E' }} />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ height: '60vh', color: '#C8202A' }}>
      <AlertCircle size={32} />
      <div style={{ fontSize: 14 }}>โหลด routing ไม่สำเร็จ</div>
      <button onClick={() => navigate('/routings')} className="text-steel-600 hover:underline" style={{ fontSize: 13 }}>
        ← กลับหน้ารายการ
      </button>
    </div>
  )

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">

      {/* ── Header ── */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/routings')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32 }}>
            <ArrowLeft size={18} style={{ color: '#555' }} />
          </button>
          <div>
            <span className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: '#1F1F1F' }}>{code}</span>
            {routing[0] && <span style={{ fontSize: 13, color: '#555', marginLeft: 8 }}>{routing[0].workcenter?.name ?? ''}</span>}
          </div>
          {state && <StatePill state={state} />}
          {editMode && (
            <span style={{ background: '#FFF8E1', color: '#854F0B', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
              โหมดแก้ไข
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Recompute */}
          {!editMode && (
            <button
              onClick={handleRecompute}
              disabled={recompute.isPending || recomputeCost.isPending}
              className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500, color: '#555' }}
            >
              {(recompute.isPending || recomputeCost.isPending)
                ? <Loader2 size={13} className="animate-spin" />
                : <RefreshCw size={13} />}
              Recompute
            </button>
          )}

          {/* Edit / Save / Cancel */}
          {isDraft && !editMode && (
            <button
              onClick={handleEnterEdit}
              className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500, color: '#555' }}
            >
              <Pencil size={13} /> แก้ไข
            </button>
          )}

          {editMode && (
            <>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
                style={{ height: 32, padding: '0 12px', fontSize: 12, color: '#555' }}
              >
                <X size={13} /> ยกเลิก
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#185FA5' }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                บันทึกลำดับ
              </button>
            </>
          )}

          {/* Activate / Obsolete — only when not editing */}
          {!editMode && state === 'draft' && (
            <button
              onClick={handleActivate}
              disabled={activate.isPending}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#2E7D32' }}
            >
              {activate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Activate
            </button>
          )}
          {!editMode && (state === 'draft' || state === 'active') && (
            <button
              onClick={handleObsolete}
              disabled={obsolete.isPending}
              className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500, color: '#E65100' }}
            >
              {obsolete.isPending ? <Loader2 size={13} className="animate-spin" /> : <ArchiveX size={13} />}
              Obsolete
            </button>
          )}
        </div>
      </div>

      {/* Edit mode hint banner */}
      {editMode && (
        <div className="flex items-center gap-2" style={{ background: '#FFF8E1', borderBottom: '1px solid #FFE082', padding: '8px 24px', fontSize: 12, color: '#854F0B' }}>
          <GripVertical size={14} />
          ลาก operation เพื่อเรียงลำดับใหม่ • แก้ไข / ลบ activity ได้จากแต่ละแถว • กด "บันทึกลำดับ" เมื่อเสร็จ
        </div>
      )}

      {/* Recompute success banner */}
      {recomputeResult && (
        <div className="flex items-center gap-2" style={{ background: '#EAF5E9', borderBottom: '1px solid #C8E6C9', padding: '8px 24px', fontSize: 13, color: '#2E7D32' }}>
          <Info size={14} />{recomputeResult}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left — Operations list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 20 }}>
          {displayOps.length === 0 ? (
            <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
              ยังไม่มี routing operations สำหรับ {code}
            </div>
          ) : editMode ? (
            /* Drag-and-drop context — active in edit mode */
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayOps.map(o => o.id)} strategy={verticalListSortingStrategy}>
                {displayOps.map(op => (
                  <SortableOpCard
                    key={op.id}
                    op={op}
                    expanded={expandedOps.has(op.id)}
                    onToggle={() => toggleOp(op.id)}
                    editMode={editMode}
                    onDelete={() => handleDeleteOp(op.id, op.name)}
                    productCode={code!}
                    routingKey={routingKey}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            /* View mode — plain list */
            displayOps.map(op => (
              <SortableOpCard
                key={op.id}
                op={op}
                expanded={expandedOps.has(op.id)}
                onToggle={() => toggleOp(op.id)}
                editMode={false}
                onDelete={() => {}}
                productCode={code!}
                routingKey={routingKey}
              />
            ))
          )}
        </div>

        {/* Right — Summary panel */}
        <div style={{ width: 260, borderLeft: '1px solid #E0E0E0', padding: 20, background: '#FAFAFA', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E8E', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>สรุป</div>

          <div className="flex flex-col gap-4">
            <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: 14 }}>
              <div className="flex items-center gap-2" style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 4 }}>
                <Clock size={12} /> เวลารวม
              </div>
              <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: totalTimeMin > 0 ? '#185FA5' : '#8E8E8E' }}>
                {totalTimeMin > 0 ? fmtTime(totalTimeMin) : '—'}
              </div>
              {totalTimeMin > 0 && <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>{Math.round(totalTimeMin)} นาที</div>}
            </div>

            <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: 14 }}>
              <div className="flex items-center gap-2" style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 10 }}>
                <Layers size={12} /> การดำเนินการ
              </div>
              {routing.map(op => (
                <div key={op.id} className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: '#555' }}>{op.name}</div>
                  <div className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3A' }}>
                    {Number(op.time_cycle) > 0 ? `${Math.round(Number(op.time_cycle))} m` : '—'}
                  </div>
                </div>
              ))}
            </div>

            {stdCost && (
              <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 8 }}>ต้นทุนการผลิต</div>
                <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: '#1F1F1F' }}>
                  ฿{stdCost.total_production_cost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 10, color: '#8E8E8E', marginTop: 4 }}>
                  คำนวณเมื่อ {new Date(stdCost.computed_at).toLocaleDateString('th-TH')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
