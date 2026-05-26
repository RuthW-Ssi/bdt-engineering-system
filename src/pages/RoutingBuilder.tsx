import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
import { useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, ControlButton, MiniMap,
  addEdge, useNodesState, useEdgesState, useReactFlow,
  Handle, Position, ReactFlowProvider, BackgroundVariant, NodeResizer,
  getBezierPath, BaseEdge, EdgeLabelRenderer, MarkerType,
  type NodeProps, type EdgeProps, type Connection, type Edge, type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, ChevronsDown, ChevronsUp, Clock, Eye, EyeOff, GitMerge, GripVertical, ImageIcon, Map as MapIcon, Pause, Play, Plus, RotateCcw, RotateCw, Save, Search, Target, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import { apiClient } from '../api/client'

// ── Safe arithmetic evaluator — no eval / no new Function ──────

function safeArith(s: string): number {
  const toks: string[] = []
  let i = 0
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue }
    if ('()+-*/'.includes(s[i])) { toks.push(s[i++]); continue }
    if (/[\d.]/.test(s[i])) {
      let n = ''
      while (i < s.length && /[\d.]/.test(s[i])) n += s[i++]
      toks.push(n); continue
    }
    throw new Error(`bad char: ${s[i]}`)
  }
  let p = 0
  function atom(): number {
    if (toks[p] === '-') { p++; return -atom() }
    if (toks[p] === '+') { p++; return atom() }
    if (toks[p] === '(') { p++; const v = addSub(); if (toks[p++] !== ')') throw new Error(')'); return v }
    const n = parseFloat(toks[p++])
    if (isNaN(n)) throw new Error('NaN')
    return n
  }
  function mulDiv(): number {
    let v = atom()
    while (toks[p] === '*' || toks[p] === '/') {
      const op = toks[p++]; const r = atom()
      v = op === '*' ? v * r : r === 0 ? NaN : v / r
    }
    return v
  }
  function addSub(): number {
    let v = mulDiv()
    while (toks[p] === '+' || toks[p] === '-') { const op = toks[p++]; v = op === '+' ? v + mulDiv() : v - mulDiv() }
    return v
  }
  const result = addSub()
  if (p !== toks.length) throw new Error('trailing')
  return isFinite(result) ? result : NaN
}

function evalFormula(expr: string, vars: Record<string, number>): number | null {
  if (!expr.trim()) return null
  try {
    const sub = expr.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, m => {
      if (m in vars) return String(vars[m])
      throw new Error(`unknown: ${m}`)
    })
    const r = safeArith(sub)
    return isNaN(r) ? null : +r.toFixed(2)
  } catch { return null }
}

// ── Types ──────────────────────────────────────────────────────

type TimeMode = 'formula' | 'manual' | 'activities'

interface WorkcenterItem { id: number; code: string; name: string }

interface ActivityRef {
  localId: string
  templateId?: number
  name: string
  measure: string
  perMinute?: number
  unit?: string
  stdMeasure?: number
  machineId?: number | null
  toolIds?: number[]
  consumables?: { resource_id: number; qty: string; unit: string }[]
}

interface OperationData extends Record<string, unknown> {
  existing_op_id?: number
  name: string
  op_code: string
  operation_type: string
  op_type_id?: number
  workcenter_id: number | null
  workcenter_name: string
  method?: string
  time_mode: TimeMode
  duration_min?: number
  formula?: string
  activities: ActivityRef[]
}

interface ZoneData extends Record<string, unknown> {
  label: string
  color: string
}


interface LibraryOpItem {
  id: number; op_code: string; name: string
  time_mode: string; formula_expr: string | null; duration_min: string | null; method: string | null
  workcenter: { id: number; code: string; name: string } | null
  op_type: { id: number; key: string; label: string; color: string } | null
  status: string
  activities: Array<{ id: number; name: string; measure: string; unit: string | null; per_minute: string | null; source_activity_template_id: number | null }>
}

interface ActivityTemplateItem {
  id: number
  op_code: string
  description: string
  formula_param_code: string | null
  per_minute: number | null
  std_measure: string | null
  unit: string | null
}

interface ExistingTemplate {
  id: number; code: string; name: string; state: string
  applies_to_product_type: string | null
  bg_image_url?: string | null
  bg_rotation?: number | null
  bg_scale?: number | null
  canvas_edges?: Array<{
    source: string; target: string; label?: string
    sourceHandle?: string; targetHandle?: string
    midOffsetX?: number; midOffsetY?: number
  }> | null
  operations: Array<{
    id: number; sequence: number; op_code: string; name: string
    canvas_x: number | null; canvas_y: number | null
    method: string | null; time_mode: string
    time_cycle_manual: string | null; formula_expr: string | null
    workcenter: { id: number; code: string; name: string }
    op_type: { id: number; key: string; label: string; color: string; method_options: { value: string; label: string }[] | null } | null
    op_activities: Array<{
      id: number; sequence: number
      machine_id: number | null
      tools: Array<{ resource_id: number }>
      consumables: Array<{ resource_id: number; qty: number | null; unit: string | null }>
      activity_template: ActivityTemplateItem
    }>
  }>
}

// ── Helpers ────────────────────────────────────────────────────

let _seq = 0
const newLocalId = () => `act-${Date.now()}-${++_seq}`
const OP_CODE_RE = /^[A-Z][A-Z0-9-]{1,38}$/

function isOpReady(d: OperationData): boolean {
  if (!d.name?.trim() || !d.op_code?.trim() || !d.workcenter_id) return false
  if (d.time_mode === 'manual') return (d.duration_min ?? 0) > 0
  if (d.time_mode === 'formula') return !!d.formula?.trim()
  return true
}

function estimateOpMin(d: OperationData, inputs: Record<string, number>): number | null {
  if (d.time_mode === 'manual') return d.duration_min ?? null
  if (d.time_mode === 'formula') {
    if (!d.formula?.trim()) return null
    return evalFormula(d.formula, inputs)
  }
  if (!d.activities.length) return null
  let total = 0
  for (const a of d.activities) {
    if (!a.perMinute || a.perMinute <= 0) return null
    total += (inputs[a.measure] ?? 0) / a.perMinute
  }
  return +total.toFixed(2)
}

function fmtMin(min: number | null): string {
  if (min === null || min < 0) return '—'
  if (min < 60) return `${min.toFixed(1)}min`
  return `${(min / 60).toFixed(1)}h`
}

function extractVars(formula: string): string[] {
  return [...new Set((formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []))]
}

function makeDragPayload(op: LibraryOpItem): Omit<OperationData, 'existing_op_id'> {
  const rawMode = op.time_mode === 'by_activities' ? 'activities' : op.time_mode
  return {
    name: op.name,
    op_code: op.op_code,
    operation_type: op.op_type?.key ?? '',
    op_type_id: op.op_type?.id,
    workcenter_id: op.workcenter?.id ?? null,
    workcenter_name: op.workcenter?.name ?? '',
    method: op.method ?? undefined,
    time_mode: (['formula', 'manual', 'activities'].includes(rawMode) ? rawMode : 'formula') as TimeMode,
    formula: op.formula_expr ?? undefined,
    duration_min: op.duration_min ? Number(op.duration_min) : undefined,
    activities: op.activities.map(a => ({
      localId: newLocalId(),
      templateId: a.source_activity_template_id ?? undefined,
      name: a.name,
      measure: a.measure,
      perMinute: a.per_minute ? Number(a.per_minute) : undefined,
      unit: a.unit ?? undefined,
    })),
  }
}

// ── Contexts ───────────────────────────────────────────────────

interface EquipmentResource { id: number; code: string; name: string; type: string; rate: number | null; rate_unit: string | null }

const WorkcenterCtx = createContext<WorkcenterItem[]>([])
const EquipmentCtx = createContext<EquipmentResource[]>([])
const SequenceCtx = createContext<Map<string, number>>(new Map())
const ParallelCtx = createContext<Set<string>>(new Set())
interface PreviewCtxType { previewMode: boolean; inputs: Record<string, number>; setInputs: React.Dispatch<React.SetStateAction<Record<string, number>>> }
const PreviewCtx = createContext<PreviewCtxType>({ previewMode: false, inputs: {}, setInputs: () => {} })

type SimPhase = 'idle' | 'playing' | 'paused'
interface SimCtxType { simPhase: SimPhase; activeOpId: string | null; simPastIds: Set<string> }
const SimCtx = createContext<SimCtxType>({ simPhase: 'idle', activeOpId: null, simPastIds: new Set() })

interface ExpandCtxType {
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  expandAll: (ids: string[]) => void
  collapseAll: () => void
  leftPanelOpen: boolean
  toggleLeftPanel: () => void
  showMiniMap: boolean
  toggleMiniMap: () => void
}
const ExpandCtx = createContext<ExpandCtxType>({ expandedIds: new Set(), toggleExpand: () => {}, expandAll: () => {}, collapseAll: () => {}, leftPanelOpen: true, toggleLeftPanel: () => {}, showMiniMap: true, toggleMiniMap: () => {} })

interface OpTypeItem {
  id: number; key: string; label: string; color: string
  default_op_code: string | null
  method_options: { value: string; label: string }[] | null
  default_wc: { id: number; code: string; name: string } | null
}
const OpTypeCtx = createContext<OpTypeItem[]>([])

// ── Styles ─────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 9, color: '#9E9E9E', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }
const inspSectionHead: React.CSSProperties = { fontSize: 9, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }

// ── OperationNode — compact summary card ──────────────────────

function OperationNode({ id, selected }: NodeProps) {
  const { getNode } = useReactFlow()
  const { previewMode, inputs } = useContext(PreviewCtx)
  const { simPhase, activeOpId, simPastIds } = useContext(SimCtx)
  const opTypes = useContext(OpTypeCtx)
  const { expandedIds, toggleExpand } = useContext(ExpandCtx)
  const node = getNode(id)
  if (!node) return null
  const d = node.data as OperationData
  const opDef = opTypes.find(t => t.id === d.op_type_id) ?? opTypes.find(t => t.key === d.operation_type)
  const ready = isOpReady(d)
  const estimate = previewMode ? estimateOpMin(d, inputs) : null
  const headerColor = opDef?.color ?? '#555'

  const isSimActive = simPhase !== 'idle' && id === activeOpId
  const isSimPast  = simPhase !== 'idle' && simPastIds.has(id)
  const isSimFuture = simPhase !== 'idle' && !isSimActive && !isSimPast
  const expanded = expandedIds.has(id)

  return (
    <div
      className={isSimActive ? 'sim-blink-border' : undefined}
      style={{
        background: isSimPast ? '#F1FBF2' : '#fff',
        border: isSimActive
          ? '1.5px solid #E57373'
          : `1.5px solid ${selected ? headerColor : ready ? '#E0E0E0' : '#FFCDD2'}`,
        borderRadius: 8, width: 190, cursor: 'default',
        boxShadow: isSimActive
          ? '0 4px 20px rgba(0,0,0,0.18)'
          : selected ? `0 0 0 2px ${headerColor}33, 0 4px 16px rgba(0,0,0,0.10)` : '0 2px 8px rgba(0,0,0,0.07)',
        overflow: 'hidden', fontFamily: 'inherit',
        opacity: isSimFuture ? 0.4 : 1,
        transition: 'opacity 0.25s',
      }}>
      <Handle id="left-t"  type="target" position={Position.Left}   style={{ width: 10, height: 10, background: '#9E9E9E', border: '2px solid #fff' }} />
      <Handle id="left-s"  type="source" position={Position.Left}   style={{ width: 10, height: 10, background: '#9E9E9E', border: '2px solid #fff' }} />
      <Handle id="top-t"   type="target" position={Position.Top}    style={{ width: 8, height: 8, background: '#9E9E9E', border: '2px solid #fff' }} />
      <Handle id="top-s"   type="source" position={Position.Top}    style={{ width: 8, height: 8, background: '#9E9E9E', border: '2px solid #fff' }} />
      <Handle id="bot-t"   type="target" position={Position.Bottom} style={{ width: 8, height: 8, background: '#9E9E9E', border: '2px solid #fff' }} />
      <Handle id="bot-s"   type="source" position={Position.Bottom} style={{ width: 8, height: 8, background: '#9E9E9E', border: '2px solid #fff' }} />
      <div style={{ background: isSimFuture ? '#BDBDBD' : headerColor, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.25s' }}>
        <span style={{ flex: 1, color: '#fff', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.name || opDef?.label || 'Operation'}
        </span>
        {isSimPast  && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', flexShrink: 0 }}>✓</span>}
      </div>
      <div style={{ padding: '5px 8px 6px', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#555', fontWeight: 500 }}>{d.workcenter_name || '—'}</span>
        {d.method && <span style={{ fontSize: 9, background: '#F0F0F0', color: '#777', borderRadius: 3, padding: '1px 4px' }}>{d.method}</span>}
        <span style={{ flex: 1 }} />
        {previewMode && estimate !== null && (
          <span style={{ fontSize: 9, background: isSimActive ? `${headerColor}22` : '#E8F5E9', color: isSimActive ? headerColor : '#2E7D32', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>
            <Clock size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />{fmtMin(estimate)}
          </span>
        )}
        {d.activities.length > 0 && (
          <button
            className="nodrag"
            onClick={e => { e.stopPropagation(); toggleExpand(id) }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 600,
              color: expanded ? headerColor : '#9E9E9E',
              background: expanded ? `${headerColor}18` : 'none',
              border: `1px solid ${expanded ? `${headerColor}44` : 'transparent'}`,
              borderRadius: 3, padding: '1px 4px', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}>
            {d.activities.length} act
            {expanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
          </button>
        )}
      </div>

      {/* Collapsible activity list */}
      {expanded && d.activities.length > 0 && (
        <div style={{ borderTop: '1px solid #F0F0F0', maxHeight: 140, overflowY: 'auto' }}>
          {d.activities.map((act, i) => (
            <div key={act.localId} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              borderBottom: i < d.activities.length - 1 ? '1px solid #F5F5F5' : 'none',
              background: i % 2 === 0 ? '#FAFAFA' : '#fff',
            }}>
              <span style={{ fontSize: 9, color: '#D0D0D0', flexShrink: 0, width: 12, textAlign: 'right', fontFamily: 'monospace' }}>{i + 1}</span>
              <span style={{ fontSize: 10, color: '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.name}</span>
              {act.unit && <span style={{ fontSize: 9, color: '#BDBDBD', flexShrink: 0 }}>{act.unit}</span>}
            </div>
          ))}
        </div>
      )}

      {isSimPast && <div style={{ height: 3, background: '#4CAF50' }} />}
      {!ready && !isSimPast && <div style={{ height: 2, background: '#FFCDD2' }} />}
      <Handle id="right-t" type="target" position={Position.Right} style={{ width: 10, height: 10, background: '#9E9E9E', border: '2px solid #fff' }} />
      <Handle id="right-s" type="source" position={Position.Right} style={{ width: 10, height: 10, background: '#C8202A', border: '2px solid #fff' }} />
    </div>
  )
}

// ── EditableLabelEdge ──────────────────────────────────────────

function EditableLabelEdge({
  id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  label, markerEnd, style, data,
}: EdgeProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const { setEdges, screenToFlowPosition } = useReactFlow()
  const parallelLabels = useContext(ParallelCtx)
  const isParallel = label != null && String(label).trim() !== '' && parallelLabels.has(String(label))
  const edgeColor = isParallel ? '#F57C00' : '#C8202A'
  const edgeStyle = isParallel
    ? { ...(style ?? {}), stroke: edgeColor, strokeWidth: 2, strokeDasharray: '8 4' }
    : (style ?? {})

  // Natural bezier path (direction-aware, no offset)
  const [naturalPath, naturalLabelX, naturalLabelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    curvature: 0.35,
  })

  const midOffX = (data?.midOffsetX as number) ?? 0
  const midOffY = (data?.midOffsetY as number) ?? 0
  const hasOffset = midOffX !== 0 || midOffY !== 0

  // When dragged: quadratic bezier that passes through the dragged midpoint
  const naturalMidX = (sourceX + targetX) / 2
  const naturalMidY = (sourceY + targetY) / 2
  const mx = naturalMidX + midOffX
  const my = naturalMidY + midOffY
  const cpX = 2 * mx - 0.5 * (sourceX + targetX)
  const cpY = 2 * my - 0.5 * (sourceY + targetY)
  const draggedPath = `M ${sourceX} ${sourceY} Q ${cpX} ${cpY} ${targetX} ${targetY}`

  const edgePath = hasOffset ? draggedPath : naturalPath
  const labelX = hasOffset ? mx : naturalLabelX
  const labelY = hasOffset ? my : naturalLabelY

  const naturalMidRef = useRef({ x: naturalMidX, y: naturalMidY })
  naturalMidRef.current = { x: naturalMidX, y: naturalMidY }

  // Drag the label badge to reshape the curve; threshold prevents accidental drags
  const onBadgeMouseDown = useCallback((e: React.MouseEvent) => {
    if (editing) return
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const nat = { ...naturalMidRef.current }
    let started = false
    const onMove = (me: MouseEvent) => {
      if (!started) {
        const dx = me.clientX - startX
        const dy = me.clientY - startY
        if (dx * dx + dy * dy < 16) return // 4 px threshold
        started = true
      }
      const fp = screenToFlowPosition({ x: me.clientX, y: me.clientY })
      setEdges(eds => eds.map(ed => ed.id === id
        ? { ...ed, data: { ...ed.data, midOffsetX: fp.x - nat.x, midOffsetY: fp.y - nat.y } }
        : ed
      ))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [editing, id, screenToFlowPosition, setEdges])

  const resetMid = useCallback(() => {
    setEdges(eds => eds.map(ed => ed.id === id
      ? { ...ed, data: { ...ed.data, midOffsetX: 0, midOffsetY: 0 } }
      : ed
    ))
  }, [id, setEdges])

  const commit = useCallback(() => {
    setEditing(false)
    const n = val.trim()
    setEdges(eds => eds.map(e => e.id === id ? { ...e, label: n || undefined } : e))
  }, [id, val, setEdges])

  const deleteEdge = useCallback((ev: React.MouseEvent) => {
    ev.stopPropagation()
    setEdges(eds => eds.filter(e => e.id !== id))
  }, [id, setEdges])

  const hasLabel = label != null && String(label).trim() !== ''

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={(typeof markerEnd === 'object' && markerEnd != null ? { ...(markerEnd as object), color: edgeColor } as typeof markerEnd : markerEnd)} style={edgeStyle} />
      <EdgeLabelRenderer>
        {hasLabel && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              cursor: editing ? 'text' : 'grab',
            }}
            className="nodrag nopan"
            onMouseDown={onBadgeMouseDown}
            onDoubleClick={() => { resetMid(); setEditing(true); setVal(String(label)) }}
          >
            {editing ? (
              <input
                autoFocus value={val}
                onChange={e => setVal(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
                style={{ width: 36, textAlign: 'center', fontSize: 11, fontWeight: 700, border: `1px solid ${edgeColor}`, borderRadius: 3, padding: '1px 4px', outline: 'none', color: edgeColor, background: '#fff' }}
              />
            ) : (
              <div style={{ background: isParallel ? '#FFF3E0' : '#fff', border: `1px solid ${edgeColor}`, borderRadius: 3, padding: '1px 6px', fontSize: 11, fontWeight: 700, color: edgeColor, display: 'flex', alignItems: 'center', gap: 3 }}>
                {isParallel && <span style={{ fontSize: 9, letterSpacing: '-1px' }}>∥</span>}
                {String(label)}
                <button onClick={deleteEdge} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#BDBDBD', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center' }} title="ลบเส้นเชื่อม">×</button>
              </div>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

const edgeTypes = { labeled: EditableLabelEdge }

// ── ZoneNode ───────────────────────────────────────────────────

function ZoneNode({ data }: NodeProps) {
  const d = data as ZoneData
  return (
    <div style={{ width: '100%', height: '100%', background: `${d.color}14`, border: `2px dashed ${d.color}`, borderRadius: 10 }}>
      <NodeResizer
        minWidth={180} minHeight={120}
        lineStyle={{ borderColor: `${d.color}60` }}
        handleStyle={{ borderColor: d.color, background: '#fff', width: 8, height: 8 }}
      />
      <div style={{
        position: 'absolute', top: 8, left: 12,
        fontSize: 11, fontWeight: 800, color: d.color,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        {d.label}
      </div>
    </div>
  )
}

// ── StartNode ──────────────────────────────────────────────────

function StartNode() {
  return (
    <div style={{ background: '#1F1F1F', color: '#fff', borderRadius: 999, padding: '10px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>
      START
      <Handle type="source" position={Position.Right}  style={{ width: 10, height: 10, background: '#C8202A', border: '2px solid #1F1F1F' }} />
      <Handle id="top-s" type="source" position={Position.Top}    style={{ width: 8, height: 8, background: '#C8202A', border: '2px solid #1F1F1F' }} />
      <Handle id="bot-s" type="source" position={Position.Bottom} style={{ width: 8, height: 8, background: '#C8202A', border: '2px solid #1F1F1F' }} />
    </div>
  )
}

function EndNode() {
  return (
    <div style={{ background: '#1F1F1F', color: '#fff', borderRadius: 999, padding: '10px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 7 }}>
      <Handle type="target" position={Position.Left}   style={{ width: 10, height: 10, background: '#4CAF50', border: '2px solid #1F1F1F' }} />
      <Handle id="right-t" type="target" position={Position.Right} style={{ width: 10, height: 10, background: '#4CAF50', border: '2px solid #1F1F1F' }} />
      <Handle id="top-t" type="target" position={Position.Top}    style={{ width: 8, height: 8, background: '#4CAF50', border: '2px solid #1F1F1F' }} />
      <Handle id="bot-t" type="target" position={Position.Bottom} style={{ width: 8, height: 8, background: '#4CAF50', border: '2px solid #1F1F1F' }} />
      END
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', display: 'inline-block', flexShrink: 0 }} />
    </div>
  )
}

const nodeTypes = { operation: OperationNode, start: StartNode, end: EndNode, zone: ZoneNode }
const INITIAL_NODES: Node[] = [
  { id: 'start', type: 'start', position: { x: 60, y: 180 }, data: {}, deletable: false, selectable: false },
  { id: 'end',   type: 'end',   position: { x: 560, y: 180 }, data: {}, deletable: false },
]

// ── ModalActivityLib ────────────────────────────────────────────

interface ModalActLibItem {
  id: number; op_code: string; description: string
  formula_param_code: string; per_minute: number | null; unit: string | null
  std_measure: number | null
}

function ModalActivityLib({ addedIds, workcenter_id, onAdd }: {
  addedIds: Set<number>
  workcenter_id: number | ''
  onAdd: (a: { localId: string; name: string; measure: string; unit: string; per_minute: string; std_measure: string; source_activity_template_id: number; machine_id: null; tool_ids: number[]; consumables: { resource_id: number; qty: string; unit: string }[] }) => void
}) {
  const workcenters = useContext(WorkcenterCtx)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [chip, setChip] = useState('All')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showNewAct, setShowNewAct] = useState(false)
  const [newAct, setNewAct] = useState({ description: '', op_code: '', formula_param_code: '', per_minute: '', std_measure: '', unit: '', workcenter_id: '' })
  const patchNewAct = (p: Partial<typeof newAct>) => setNewAct(a => ({ ...a, ...p }))
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
      onAdd({ localId: newLocalId(), name: created.description, measure: created.formula_param_code, unit: created.unit ?? '', per_minute: created.per_minute ? String(created.per_minute) : '', std_measure: created.std_measure != null ? String(created.std_measure) : '', source_activity_template_id: created.id, machine_id: null, tool_ids: [], consumables: [] })
      setNewAct({ description: '', op_code: '', formula_param_code: '', per_minute: '', std_measure: '', unit: '', workcenter_id: '' })
      setShowNewAct(false)
    },
  })

  const { data: items = [], isLoading } = useQuery<ModalActLibItem[]>({
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
    if (chip !== 'All' && item.op_code !== chip) return false
    return !q || item.description.toLowerCase().includes(q) || item.op_code.toLowerCase().includes(q)
  })
  const groups: Record<string, ModalActLibItem[]> = {}
  for (const item of filtered) {
    if (!groups[item.op_code]) groups[item.op_code] = []
    groups[item.op_code].push(item)
  }

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
          <div style={{ background: '#FFF8F8', border: '1px solid #FCCACA', borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#C8202A', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New Activity Template</div>
            <input value={newAct.description} onChange={e => patchNewAct({ description: e.target.value })} placeholder="Description *"
              style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 5 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 5 }}>
              <input value={newAct.op_code} onChange={e => patchNewAct({ op_code: e.target.value })} placeholder="Group (op_code) *"
                style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
              <input value={newAct.formula_param_code} onChange={e => patchNewAct({ formula_param_code: e.target.value })} placeholder="Measure *"
                style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 5 }}>
              <input value={newAct.unit} onChange={e => patchNewAct({ unit: e.target.value })} placeholder="Unit *"
                style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
              <input type="number" value={newAct.per_minute} onChange={e => patchNewAct({ per_minute: e.target.value })} placeholder="/min *"
                style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
              <input type="number" value={newAct.std_measure} onChange={e => patchNewAct({ std_measure: e.target.value })} placeholder="Std meas"
                style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
            </div>
            {!workcenter_id && (
              <select value={newAct.workcenter_id} onChange={e => patchNewAct({ workcenter_id: e.target.value })}
                style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', background: '#fff', marginBottom: 5 }}>
                <option value="">— Workcenter * —</option>
                {workcenters.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
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
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {chips.slice(0, 8).map(c => (
            <button key={c} onClick={() => setChip(c)} style={{
              height: 22, padding: '0 8px', borderRadius: 11, border: '1px solid', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              borderColor: chip === c ? '#C8202A' : '#E0E0E0',
              background: chip === c ? '#C8202A' : '#fff',
              color: chip === c ? '#fff' : '#8E8E8E',
            }}>{c}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9E9E9E' }}>Loading…</div>
        ) : Object.entries(groups).length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9E9E9E' }}>No activities found</div>
        ) : Object.entries(groups).map(([opCode, acts]) => {
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
                  <div key={act.id} style={{ background: added ? '#FAFAFA' : '#fff', border: `1px solid ${added ? '#F0F0F0' : '#E8E8E8'}`, borderRadius: 5, padding: '6px 8px', marginBottom: 3, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: added ? '#9E9E9E' : '#1F1F1F', lineHeight: 1.3 }}>{act.description}</div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#185FA5', background: '#F0F4FF', borderRadius: 3, padding: '0 4px' }}>{act.formula_param_code}</span>
                        {act.per_minute != null && <span style={{ fontSize: 10, color: '#8E8E8E' }}>{act.per_minute}/{act.unit ?? 'unit'}</span>}
                      </div>
                    </div>
                    {added ? (
                      <Check size={13} style={{ color: '#4CAF50', flexShrink: 0, marginTop: 2 }} />
                    ) : (
                      <button onClick={() => onAdd({ localId: newLocalId(), name: act.description, measure: act.formula_param_code, unit: act.unit ?? '', per_minute: act.per_minute ? String(act.per_minute) : '', std_measure: act.std_measure != null ? String(act.std_measure) : '', source_activity_template_id: act.id, machine_id: null, tool_ids: [], consumables: [] })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#4CAF50', display: 'flex', flexShrink: 0, marginTop: 2 }}>
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── InspectorModal ───────────────────────────────────────────────

interface InspModalForm {
  op_code: string; name: string
  op_type_id: number | ''; workcenter_id: number | ''; method: string
  activities: Array<{ localId: string; name: string; measure: string; unit: string; per_minute: string; std_measure: string; source_activity_template_id: number | null; machine_id: number | null; tool_ids: number[]; consumables: { resource_id: number; qty: string; unit: string }[] }>
}

interface InspectorDrawerProps { nodeId: string; initialData?: OperationData; onClose: () => void; onDelete: () => void }

const InspectorDrawer = memo(function InspectorDrawer({ nodeId, initialData, onClose, onDelete }: InspectorDrawerProps) {
  const { getNode, setNodes } = useReactFlow()
  const workcenters = useContext(WorkcenterCtx)
  const opTypes = useContext(OpTypeCtx)
  const equipmentList = useContext(EquipmentCtx)
  const { previewMode, inputs } = useContext(PreviewCtx)

  const { data: libActs = [] } = useQuery<ModalActLibItem[]>({
    queryKey: ['activity-templates-all'],
    queryFn: async () => {
      const { data } = await apiClient.get('/activity-templates', { params: { limit: 300 } })
      return data.items ?? data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const [prefillDismissedFor, setPrefillDismissedFor] = useState<number | ''>('')

  const [form, setForm] = useState<InspModalForm>(() => {
    const nd = initialData ?? (getNode(nodeId)?.data as OperationData | undefined)
    return {
      op_code:      nd?.op_code ?? '',
      name:         nd?.name ?? '',
      op_type_id:   nd?.op_type_id ?? '',
      workcenter_id: nd?.workcenter_id ?? '',
      method:       nd?.method ?? '',
      activities:   nd?.activities.map(a => ({
        localId: a.localId,
        name: a.name,
        measure: a.measure,
        unit: a.unit ?? '',
        per_minute: a.perMinute != null ? String(a.perMinute) : '',
        std_measure: a.stdMeasure != null ? String(a.stdMeasure) : '',
        source_activity_template_id: a.templateId ?? null,
        machine_id: a.machineId ?? null,
        tool_ids: a.toolIds ?? [],
        consumables: a.consumables ?? [],
      })) ?? [],
    }
  })

  const formRef = useRef(form)
  const ndRef = useRef(initialData ?? (getNode(nodeId)?.data as OperationData | undefined))

  const syncToNode = useCallback((f: InspModalForm) => {
    const ot = opTypes.find(t => t.id === Number(f.op_type_id))
    const wc = workcenters.find(w => w.id === Number(f.workcenter_id))
    const opData: OperationData = {
      existing_op_id: ndRef.current?.existing_op_id,
      op_code:        f.op_code,
      name:           f.name,
      operation_type: ot?.key ?? ndRef.current?.operation_type ?? '',
      op_type_id:     f.op_type_id ? Number(f.op_type_id) : undefined,
      workcenter_id:  wc?.id ?? null,
      workcenter_name: wc?.name ?? '',
      method:         f.method || undefined,
      time_mode:      'activities' as TimeMode,
      formula:        undefined,
      duration_min:   undefined,
      activities:     f.activities.map(a => ({
        localId:    a.localId,
        templateId: a.source_activity_template_id ?? undefined,
        name:       a.name,
        measure:    a.measure,
        unit:       a.unit || undefined,
        perMinute:  a.per_minute ? Number(a.per_minute) : undefined,
        stdMeasure: a.std_measure ? Number(a.std_measure) : undefined,
        machineId: a.machine_id ?? undefined,
        toolIds: a.tool_ids,
        consumables: a.consumables,
      })),
    }
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: opData } : n))
  }, [nodeId, setNodes, opTypes, workcenters])

  const patch = useCallback((p: Partial<InspModalForm>) => {
    const next = { ...formRef.current, ...p }
    formRef.current = next
    setForm(next)
    syncToNode(next)
  }, [syncToNode])

  const patchAct = (localId: string, p: Partial<InspModalForm['activities'][0]>) =>
    patch({ activities: form.activities.map(a => a.localId === localId ? { ...a, ...p } : a) })

  const removeAct = (localId: string) =>
    patch({ activities: form.activities.filter(a => a.localId !== localId) })

  const [openInspPicker, setOpenInspPicker] = useState<{ actId: string; kind: 'tool' | 'consumable' } | null>(null)
  useEffect(() => {
    if (!openInspPicker) return
    const close = () => setOpenInspPicker(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openInspPicker])

  const selectedOt = opTypes.find(t => t.id === Number(form.op_type_id))
  const headerColor = selectedOt?.color ?? '#555'
  const addedIds = new Set(form.activities.map(a => a.source_activity_template_id).filter((id): id is number => id !== null))
  const canDone = !!(form.name.trim() && form.op_code.trim())

  const prefillSuggestions = useMemo(() => {
    if (!form.op_type_id || form.activities.length > 0 || prefillDismissedFor === form.op_type_id) return []
    const ot = opTypes.find(t => t.id === Number(form.op_type_id))
    if (!ot) return []
    return libActs.filter(a => a.op_code === ot.key)
  }, [form.op_type_id, form.activities.length, prefillDismissedFor, libActs, opTypes])

  const opTotalMin = useMemo(() => {
    if (form.activities.length === 0) return null
    let total = 0
    for (const act of form.activities) {
      const pm = Number(act.per_minute)
      if (!pm || pm <= 0) return null
      const val = previewMode ? (inputs[act.measure] ?? 0) : Number(act.std_measure || 0)
      if (!previewMode && !Number(act.std_measure)) return null
      total += val / pm
    }
    return +total.toFixed(2)
  }, [form.activities, previewMode, inputs])

  const sInp: React.CSSProperties = { border: '1px solid #E0E0E0', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 980, background: '#fff', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 32px rgba(0,0,0,0.18)', fontFamily: 'inherit' }}>

        {/* Header — matches NewOpModal */}
        <div style={{ height: 52, borderBottom: '1px solid #E0E0E0', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#757575', padding: 4, display: 'flex' }}><X size={18} /></button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1F1F1F' }}>{selectedOt?.label ?? 'Operation'}</span>
          {form.op_code && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', background: `${headerColor}18`, color: headerColor, border: `1px solid ${headerColor}35`, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
              {form.op_code}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#BDBDBD' }}>→ Inspector</span>
          <div style={{ flex: 1 }} />
          <button onClick={onDelete} title="Remove from canvas"
            style={{ height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #E0E0E0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#E53935', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Trash2 size={12} />Remove
          </button>
          <button onClick={onClose} disabled={!canDone}
            style={{ height: 32, padding: '0 14px', borderRadius: 6, border: 'none', background: canDone ? headerColor : '#E0E0E0', color: canDone ? '#fff' : '#9E9E9E', fontSize: 12, fontWeight: 600, cursor: canDone ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={12} />{canDone ? 'Done' : 'Close'}
          </button>
        </div>

        {/* Body: 2-column */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT: Form 60% */}
          <div style={{ flex: '0 0 60%', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: '#F8F8F8' }}>

            {/* IDENTITY */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 18 }}>
              <div style={inspSectionHead}>Identity</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={labelStyle}>Op Code *</div>
                  <input value={form.op_code} onChange={e => patch({ op_code: e.target.value.toUpperCase() })}
                    placeholder="OP-WELD-01" style={{ ...sInp, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <div style={labelStyle}>Operation Name *</div>
                  <input value={form.name} onChange={e => patch({ name: e.target.value })} placeholder="e.g. Weld main seam" style={sInp} />
                </div>
              </div>
              <div>
                <div style={labelStyle}>Operation Type</div>
                <select value={form.op_type_id} onChange={e => {
                  const ot = opTypes.find(t => t.id === Number(e.target.value))
                  patch({ op_type_id: ot?.id ?? '', ...(ot?.default_wc && !form.workcenter_id ? { workcenter_id: ot.default_wc.id } : {}) })
                }} style={{ ...sInp, cursor: 'pointer' }}>
                  <option value="">— Select type —</option>
                  {opTypes.map(ot => <option key={ot.id} value={ot.id}>{ot.label}</option>)}
                </select>
              </div>
            </div>

            {/* RESOURCE */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 18 }}>
              <div style={inspSectionHead}>Resource</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={labelStyle}>Work Station *</div>
                  <select value={form.workcenter_id} onChange={e => patch({ workcenter_id: e.target.value ? Number(e.target.value) : '' })}
                    style={{ ...sInp, cursor: 'pointer', color: form.workcenter_id ? '#1F1F1F' : '#9E9E9E' }}>
                    <option value="">— Select —</option>
                    {workcenters.map(wc => <option key={wc.id} value={wc.id}>{wc.code} · {wc.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Method</div>
                  {selectedOt?.method_options?.length ? (
                    <select value={form.method} onChange={e => patch({ method: e.target.value })} style={{ ...sInp, cursor: 'pointer' }}>
                      <option value="">— Select —</option>
                      {selectedOt.method_options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input value={form.method} onChange={e => patch({ method: e.target.value })} placeholder="e.g. SMAW, FCAW…" style={sInp} />
                  )}
                </div>
              </div>
            </div>

            {/* ACTIVITIES */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ ...inspSectionHead, marginBottom: 0, flex: 1 }}>Activities</div>
                <span style={{ fontSize: 10, color: '#9E9E9E', marginRight: 8 }}>Σ time = sum of activities</span>
                <button onClick={() => patch({ activities: [...form.activities, { localId: newLocalId(), name: '', measure: '', unit: '', per_minute: '', std_measure: '', source_activity_template_id: null, machine_id: null, tool_ids: [], consumables: [] }] })}
                  style={{ height: 22, padding: '0 8px', borderRadius: 4, border: '1px solid #E0E0E0', background: '#fff', fontSize: 10, fontWeight: 600, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Plus size={10} />Add blank
                </button>
              </div>

              {prefillSuggestions.length > 0 && (
                <div style={{ background: '#F0F4FF', border: '1px solid #BBDEFB', borderRadius: 6, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 11, color: '#1565C0' }}>
                    เพิ่ม {prefillSuggestions.length} default activities สำหรับ {selectedOt?.label}?
                  </div>
                  <button onClick={() => {
                    patch({ activities: prefillSuggestions.map(a => ({ localId: newLocalId(), name: a.description, measure: a.formula_param_code, unit: a.unit ?? '', per_minute: a.per_minute ? String(a.per_minute) : '', std_measure: a.std_measure != null ? String(a.std_measure) : '', source_activity_template_id: a.id, machine_id: null, tool_ids: [], consumables: [] })) })
                    setPrefillDismissedFor(form.op_type_id)
                  }} style={{ height: 24, padding: '0 10px', borderRadius: 4, border: 'none', background: '#1565C0', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                    Add {prefillSuggestions.length}
                  </button>
                  <button onClick={() => setPrefillDismissedFor(form.op_type_id)}
                    style={{ height: 24, padding: '0 8px', borderRadius: 4, border: '1px solid #BBDEFB', background: '#fff', color: '#1565C0', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                    Skip
                  </button>
                </div>
              )}

              {form.activities.length === 0 ? (
                <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: '#BDBDBD', border: '1px dashed #E0E0E0', borderRadius: 6 }}>
                  Add from the library → or click Add blank above
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 50px 50px 44px 116px 24px', gap: 6, padding: '0 8px', marginBottom: 2 }}>
                    {['Name', 'Measure', 'Unit', '/min', '≈min', 'Machine', ''].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                    ))}
                  </div>
                  {form.activities.map((act) => {
                    const pm = Number(act.per_minute)
                    const estMin = pm > 0
                      ? (previewMode ? (inputs[act.measure] ?? 0) / pm : (Number(act.std_measure) > 0 ? Number(act.std_measure) / pm : null))
                      : null
                    const machines = equipmentList.filter(e => ['machine', 'handling', 'labor'].includes(e.type))
                    const toolOpts = equipmentList.filter(e => e.type === 'tool')
                    const consumableOpts = equipmentList.filter(e => e.type === 'consumable')
                    const chipBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px 1px 7px', borderRadius: 10, border: '1px solid', cursor: 'default', whiteSpace: 'nowrap' }
                    const isPickerOpen = (kind: 'tool' | 'consumable') => openInspPicker?.actId === act.localId && openInspPicker.kind === kind
                    return (
                      <div key={act.localId} style={{ border: '1px solid #E8E8E8', borderRadius: 6, overflow: 'visible' }}>
                        {/* Main row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 50px 50px 44px 116px 24px', gap: 6, alignItems: 'center', background: '#F8F8F8', padding: '6px 8px' }}>
                          <input value={act.name} onChange={e => patchAct(act.localId, { name: e.target.value })}
                            style={{ fontSize: 12, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 7px', background: '#fff', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                          <input value={act.measure} onChange={e => patchAct(act.localId, { measure: e.target.value })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 6px', background: '#fff', outline: 'none', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} placeholder="param" />
                          <input value={act.unit} onChange={e => patchAct(act.localId, { unit: e.target.value })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 5px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }} placeholder="mm" />
                          <input type="number" min={0} value={act.per_minute} onChange={e => patchAct(act.localId, { per_minute: e.target.value })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '4px 5px', background: '#fff', outline: 'none', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} placeholder="0" />
                          <div style={{ fontSize: 10, fontFamily: 'monospace', color: estMin != null ? '#185FA5' : '#C0C0C0', textAlign: 'right' }}>
                            {estMin != null ? fmtMin(+estMin.toFixed(2)) : '—'}
                          </div>
                          <select value={act.machine_id ?? ''} onChange={e => patchAct(act.localId, { machine_id: e.target.value ? Number(e.target.value) : null })}
                            style={{ fontSize: 11, border: '1px solid #E8E8E8', borderRadius: 4, padding: '3px 4px', background: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                            <option value="">—</option>
                            {machines.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
                          </select>
                          <button onClick={() => removeAct(act.localId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex', justifyContent: 'center' }}>
                            <X size={12} />
                          </button>
                        </div>
                        {/* Tools / Consumables row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid #F0F0F0', background: '#FAFAFA' }}>
                          <div style={{ padding: '5px 10px 6px', borderRight: '1px solid #F0F0F0', position: 'relative' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tools</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {act.tool_ids.map(tid => {
                                const eq = equipmentList.find(e => e.id === tid)
                                return eq ? (
                                  <span key={tid} style={{ ...chipBase, background: '#F0F4FF', borderColor: '#BBDEFB', color: '#1565C0' }}>
                                    {eq.code}
                                    <button onClick={() => patchAct(act.localId, { tool_ids: act.tool_ids.filter(id => id !== tid) })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565C0', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex' }}>×</button>
                                  </span>
                                ) : null
                              })}
                              <div style={{ position: 'relative' }}>
                                <button onClick={() => setOpenInspPicker(isPickerOpen('tool') ? null : { actId: act.localId, kind: 'tool' })}
                                  style={{ height: 18, padding: '0 6px', borderRadius: 9, border: '1px dashed #BDBDBD', background: 'none', fontSize: 10, color: '#9E9E9E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Plus size={8} />Add
                                </button>
                                {isPickerOpen('tool') && (
                                  <div onMouseDown={e2 => e2.stopPropagation()} style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
                                    {toolOpts.length === 0 ? (
                                      <div style={{ padding: '10px 12px', fontSize: 11, color: '#9E9E9E' }}>No tool resources seeded yet</div>
                                    ) : toolOpts.filter(e => !act.tool_ids.includes(e.id)).map(e => (
                                      <button key={e.id} onClick={() => { patchAct(act.localId, { tool_ids: [...act.tool_ids, e.id] }); setOpenInspPicker(null) }}
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
                          <div style={{ padding: '5px 10px 6px', position: 'relative' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Consumables</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {act.consumables.map((c, ci) => {
                                const eq = equipmentList.find(e => e.id === c.resource_id)
                                return eq ? (
                                  <span key={c.resource_id} style={{ ...chipBase, background: '#FFF3E0', borderColor: '#FFE082', color: '#E65100', gap: 4 }}>
                                    {eq.code}
                                    <input value={c.qty} onChange={e2 => {
                                      const updated = act.consumables.map((x, xi) => xi === ci ? { ...x, qty: e2.target.value } : x)
                                      patchAct(act.localId, { consumables: updated })
                                    }} placeholder="qty" style={{ width: 36, fontSize: 10, border: '1px solid #FFE082', borderRadius: 3, padding: '0 3px', outline: 'none', fontFamily: 'monospace', background: '#fff', color: '#E65100' }} />
                                    <button onClick={() => patchAct(act.localId, { consumables: act.consumables.filter((_, xi) => xi !== ci) })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E65100', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex' }}>×</button>
                                  </span>
                                ) : null
                              })}
                              <div style={{ position: 'relative' }}>
                                <button onClick={() => setOpenInspPicker(isPickerOpen('consumable') ? null : { actId: act.localId, kind: 'consumable' })}
                                  style={{ height: 18, padding: '0 6px', borderRadius: 9, border: '1px dashed #BDBDBD', background: 'none', fontSize: 10, color: '#9E9E9E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Plus size={8} />Add
                                </button>
                                {isPickerOpen('consumable') && (
                                  <div onMouseDown={e2 => e2.stopPropagation()} style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
                                    {consumableOpts.length === 0 ? (
                                      <div style={{ padding: '10px 12px', fontSize: 11, color: '#9E9E9E' }}>No consumable resources seeded yet</div>
                                    ) : consumableOpts.filter(e => !act.consumables.find(c => c.resource_id === e.id)).map(e => (
                                      <button key={e.id} onClick={() => { patchAct(act.localId, { consumables: [...act.consumables, { resource_id: e.id, qty: '', unit: e.rate_unit ?? '' }] }); setOpenInspPicker(null) }}
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
                  {opTotalMin !== null && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0', fontSize: 11, color: '#185FA5', fontWeight: 700, borderTop: '1px solid #F0F0F0', marginTop: 2 }}>
                      Total: {fmtMin(opTotalMin)}{previewMode ? '' : ' (std)'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!canDone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8E8E8E', padding: '0 4px' }}>
                <AlertCircle size={12} />Op code and name are required
              </div>
            )}
          </div>

          {/* RIGHT: Activity Library 40% */}
          <div style={{ flex: '0 0 40%', borderLeft: '1px solid #E0E0E0', background: '#FAFAFA', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ModalActivityLib addedIds={addedIds} workcenter_id={form.workcenter_id} onAdd={act => patch({ activities: [...form.activities, act] })} />
          </div>
        </div>

      </div>
    </>
  )
})

// ── NewOpModal — create-operation drawer ──────────────────────

interface NewOpFormState {
  op_code: string; name: string
  op_type_id: number | ''; workcenter_id: number | ''; method: string
  activities: Array<{ localId: string; name: string; measure: string; unit: string; per_minute: string; std_measure: string; source_activity_template_id: number | null; machine_id: number | null; tool_ids: number[]; consumables: { resource_id: number; qty: string; unit: string }[] }>
}

function NewOpModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const workcenters = useContext(WorkcenterCtx)
  const opTypes = useContext(OpTypeCtx)
  const equipmentList = useContext(EquipmentCtx)
  const queryClient = useQueryClient()

  const [form, setForm] = useState<NewOpFormState>({
    op_code: '', name: '', op_type_id: '', workcenter_id: '', method: '', activities: [],
  })
  const patch = (p: Partial<NewOpFormState>) => setForm(f => ({ ...f, ...p }))

  const opCodeOk = OP_CODE_RE.test(form.op_code.trim().toUpperCase())
  const publishOk =
    opCodeOk && !!form.name.trim() && !!form.workcenter_id && form.activities.length > 0

  const buildPayload = () => ({
    op_code: form.op_code.trim().toUpperCase(),
    name: form.name.trim(),
    op_type_id: form.op_type_id ? Number(form.op_type_id) : null,
    workcenter_id: form.workcenter_id ? Number(form.workcenter_id) : null,
    method: form.method || null,
    time_mode: 'by_activities',
    duration_min: null,
    formula_expr: null,
    activities: form.activities.map((a, i) => ({
      name: a.name, measure: a.measure, unit: a.unit || null,
      per_minute: a.per_minute ? Number(a.per_minute) : null,
      source_activity_template_id: a.source_activity_template_id,
      machine_id: a.machine_id ?? null,
      tool_ids: a.tool_ids,
      consumables: a.consumables.map(c => ({ resource_id: c.resource_id, qty: c.qty ? Number(c.qty) : null, unit: c.unit || null })),
      sequence: (i + 1) * 10,
    })),
  })

  const done = () => { queryClient.invalidateQueries({ queryKey: ['op-library'] }); onCreated() }

  const saveMut = useMutation({
    mutationFn: () => apiClient.post('/operation-templates', buildPayload()).then(r => r.data),
    onSuccess: done,
  })
  const publishMut = useMutation({
    mutationFn: async () => {
      const tpl = await apiClient.post('/operation-templates', buildPayload()).then(r => r.data)
      return apiClient.patch(`/operation-templates/${tpl.id}/publish`).then(r => r.data)
    },
    onSuccess: done,
  })

  const busy = saveMut.isPending || publishMut.isPending

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #E0E0E0', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }
  const sec: React.CSSProperties = { background: '#FAFAFA', borderRadius: 8, border: '1px solid #E8E8E8', padding: 16, marginBottom: 14 }
  const secHd: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #F0F0F0' }

  const [openModalPicker, setOpenModalPicker] = useState<{ actId: string; kind: 'tool' | 'consumable' } | null>(null)
  useEffect(() => {
    if (!openModalPicker) return
    const close = () => setOpenModalPicker(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openModalPicker])

  // ── Activity library for the right panel ──
  const { data: actItems = [] } = useQuery<ActivityTemplateItem[]>({
    queryKey: ['activity-templates-all'],
    queryFn: async () => { const { data } = await apiClient.get('/activity-templates', { params: { limit: 300 } }); return data.items ?? data ?? [] },
    staleTime: 5 * 60 * 1000,
  })
  const [actSearch, setActSearch] = useState('')
  const [actChip, setActChip] = useState('All')
  const actChips = ['All', ...Array.from(new Set(actItems.map(i => i.op_code))).sort()]
  const actFiltered = actItems.filter(item => {
    const q = actSearch.trim().toLowerCase()
    return (actChip === 'All' || item.op_code === actChip) &&
      (!q || item.description.toLowerCase().includes(q) || item.op_code.toLowerCase().includes(q))
  })
  const actGroups: Record<string, ActivityTemplateItem[]> = {}
  for (const a of actFiltered) { (actGroups[a.op_code] = actGroups[a.op_code] ?? []).push(a) }

  const addedIds = new Set(form.activities.map(a => a.source_activity_template_id).filter(Boolean))
  const addFromLib = (tpl: ActivityTemplateItem) =>
    patch({ activities: [...form.activities, {
      localId: newLocalId(), name: tpl.description, measure: tpl.formula_param_code ?? '',
      unit: tpl.unit ?? '', per_minute: tpl.per_minute ? String(tpl.per_minute) : '',
      std_measure: tpl.std_measure != null ? String(tpl.std_measure) : '',
      source_activity_template_id: tpl.id,
      machine_id: null, tool_ids: [], consumables: [],
    }]})

  // ── Inline new-activity-template form ──
  const [showNewAct, setShowNewAct] = useState(false)
  const [newAct, setNewAct] = useState({ description: '', op_code: '', formula_param_code: '', per_minute: '', std_measure: '', unit: '', workcenter_id: '' })
  const patchAct = (p: Partial<typeof newAct>) => setNewAct(a => ({ ...a, ...p }))
  const newActReady = !!(newAct.description.trim() && newAct.op_code.trim() && newAct.formula_param_code.trim() && newAct.per_minute && newAct.unit.trim() && (newAct.workcenter_id || form.workcenter_id))
  const newActMut = useMutation({
    mutationFn: () => apiClient.post('/activity-templates', {
      description: newAct.description.trim(),
      op_code: newAct.op_code.trim().toLowerCase(),
      formula_param_code: newAct.formula_param_code.trim(),
      per_minute: Number(newAct.per_minute),
      std_measure: newAct.std_measure ? Number(newAct.std_measure) : 0,
      unit: newAct.unit.trim(),
      workcenter_id: Number(newAct.workcenter_id || form.workcenter_id),
    }).then(r => r.data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['activity-templates-all'] })
      addFromLib({ id: created.id, op_code: created.op_code, description: created.description, formula_param_code: created.formula_param_code, std_measure: created.std_measure, per_minute: created.per_minute, unit: created.unit })
      setNewAct({ description: '', op_code: '', formula_param_code: '', per_minute: '', std_measure: '', unit: '', workcenter_id: '' })
      setShowNewAct(false)
    },
  })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 980, background: '#fff', zIndex: 201, display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 32px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ height: 52, borderBottom: '1px solid #E0E0E0', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#757575', padding: 4, display: 'flex' }}><X size={18} /></button>
          <BookOpen size={15} style={{ color: '#C8202A' }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1F1F1F' }}>New Operation</span>
          <span style={{ fontSize: 12, color: '#BDBDBD' }}>→ Operation Library</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => saveMut.mutate()} disabled={busy}
            style={{ height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid #D0D0D0', background: '#fff', fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Save size={12} />Save Draft
          </button>
          <button onClick={() => publishMut.mutate()} disabled={!publishOk || busy}
            title={!publishOk ? 'Fill op code · name · workcenter first' : undefined}
            style={{ height: 32, padding: '0 14px', borderRadius: 6, border: 'none', background: publishOk ? '#C8202A' : '#E0E0E0', color: publishOk ? '#fff' : '#9E9E9E', fontSize: 12, fontWeight: 600, cursor: publishOk && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={12} />Publish to Library
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left: form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

            <div style={sec}>
              <div style={secHd}>Identity</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>OP CODE *</label>
                  <input value={form.op_code} onChange={e => patch({ op_code: e.target.value.toUpperCase() })}
                    placeholder="OP-WELD-MAIN"
                    style={{ ...inp, fontFamily: 'monospace', borderColor: form.op_code && !opCodeOk ? '#C8202A' : '#E0E0E0' }} />
                  {form.op_code && !opCodeOk && <div style={{ fontSize: 10, color: '#C8202A', marginTop: 3 }}>Format: OP-XXX-YYY</div>}
                </div>
                <div>
                  <label style={lbl}>OPERATION NAME *</label>
                  <input value={form.name} onChange={e => patch({ name: e.target.value })} placeholder="e.g. Main Welding Seam" style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>OPERATION TYPE</label>
                <select value={form.op_type_id}
                  onChange={e => {
                    const ot = opTypes.find(t => t.id === Number(e.target.value))
                    patch({ op_type_id: e.target.value ? Number(e.target.value) : '', workcenter_id: ot?.default_wc?.id ?? form.workcenter_id })
                  }}
                  style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Select type —</option>
                  {opTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={sec}>
              <div style={secHd}>Resource</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>WORK STATION *</label>
                  <select value={form.workcenter_id} onChange={e => patch({ workcenter_id: e.target.value ? Number(e.target.value) : '' })} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">— Select —</option>
                    {workcenters.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>METHOD</label>
                  <input value={form.method} onChange={e => patch({ method: e.target.value })} placeholder="e.g. SMAW, FCAW…" style={inp} />
                </div>
              </div>
            </div>

            <div style={sec}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ ...secHd, marginBottom: 0, flex: 1 }}>Activities</span>
                <span style={{ fontSize: 10, color: '#9E9E9E', marginRight: 8 }}>Σ time = sum of activities</span>
                <button
                  onClick={() => patch({ activities: [...form.activities, { localId: newLocalId(), name: '', measure: '', unit: '', per_minute: '', std_measure: '', source_activity_template_id: null, machine_id: null, tool_ids: [], consumables: [] }] })}
                  style={{ height: 22, padding: '0 8px', borderRadius: 4, border: '1px solid #E0E0E0', background: '#fff', fontSize: 10, fontWeight: 600, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Plus size={10} />Add blank
                </button>
              </div>
              {form.activities.length === 0 ? (
                <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: '#BDBDBD', border: '1px dashed #E0E0E0', borderRadius: 6 }}>
                  Add from the library → or click Add blank above
                </div>
              ) : (() => {
                const modalMachines = equipmentList.filter(e => ['machine', 'handling', 'labor'].includes(e.type))
                const modalToolOpts = equipmentList.filter(e => e.type === 'tool')
                const modalConsumableOpts = equipmentList.filter(e => e.type === 'consumable')
                const chipBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px 1px 7px', borderRadius: 10, border: '1px solid', cursor: 'default', whiteSpace: 'nowrap' }
                const patchActivity = (localId: string, p: Partial<NewOpFormState['activities'][0]>) =>
                  patch({ activities: form.activities.map(x => x.localId === localId ? { ...x, ...p } : x) })
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 50px 50px 116px 24px', gap: 5, padding: '0 4px', marginBottom: 2 }}>
                      {['Name', 'Measure', 'Unit', '/min', 'Machine', ''].map(h => (
                        <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                      ))}
                    </div>
                    {form.activities.map(a => {
                      const isPickerOpen = (kind: 'tool' | 'consumable') => openModalPicker?.actId === a.localId && openModalPicker.kind === kind
                      return (
                        <div key={a.localId} style={{ border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'visible' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 50px 50px 116px 24px', gap: 5, alignItems: 'center', background: '#F8F8F8', padding: '5px 6px' }}>
                            <input value={a.name} onChange={e => patchActivity(a.localId, { name: e.target.value })} placeholder="Activity name" style={{ ...inp, fontSize: 12 }} />
                            <input value={a.measure} onChange={e => patchActivity(a.localId, { measure: e.target.value })} placeholder="measure" style={{ ...inp, fontSize: 11, fontFamily: 'monospace' }} />
                            <input value={a.unit} onChange={e => patchActivity(a.localId, { unit: e.target.value })} placeholder="unit" style={{ ...inp, fontSize: 11 }} />
                            <input value={a.per_minute} onChange={e => patchActivity(a.localId, { per_minute: e.target.value })} placeholder="/min" style={{ ...inp, fontSize: 11, fontFamily: 'monospace' }} />
                            <select value={a.machine_id ?? ''} onChange={e => patchActivity(a.localId, { machine_id: e.target.value ? Number(e.target.value) : null })}
                              style={{ ...inp, fontSize: 11, cursor: 'pointer', padding: '3px 4px' }}>
                              <option value="">—</option>
                              {modalMachines.map(e => <option key={e.id} value={e.id}>{e.code}</option>)}
                            </select>
                            <button onClick={() => patch({ activities: form.activities.filter(x => x.localId !== a.localId) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 0, display: 'flex' }}><X size={13} /></button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #F0F0F0', background: '#FAFAFA' }}>
                            <div style={{ padding: '4px 8px 5px', borderRight: '1px solid #F0F0F0', position: 'relative' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Tools</div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                {a.tool_ids.map(tid => {
                                  const eq = equipmentList.find(e => e.id === tid)
                                  return eq ? (
                                    <span key={tid} style={{ ...chipBase, background: '#F0F4FF', borderColor: '#BBDEFB', color: '#1565C0' }}>
                                      {eq.code}
                                      <button onClick={() => patchActivity(a.localId, { tool_ids: a.tool_ids.filter(id => id !== tid) })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565C0', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex' }}>×</button>
                                    </span>
                                  ) : null
                                })}
                                <div style={{ position: 'relative' }}>
                                  <button onClick={() => setOpenModalPicker(isPickerOpen('tool') ? null : { actId: a.localId, kind: 'tool' })}
                                    style={{ height: 18, padding: '0 6px', borderRadius: 9, border: '1px dashed #BDBDBD', background: 'none', fontSize: 10, color: '#9E9E9E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Plus size={8} />Add
                                  </button>
                                  {isPickerOpen('tool') && (
                                    <div onMouseDown={e2 => e2.stopPropagation()} style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
                                      {modalToolOpts.length === 0 ? (
                                        <div style={{ padding: '10px 12px', fontSize: 11, color: '#9E9E9E' }}>No tool resources seeded yet</div>
                                      ) : modalToolOpts.filter(e => !a.tool_ids.includes(e.id)).map(e => (
                                        <button key={e.id} onClick={() => { patchActivity(a.localId, { tool_ids: [...a.tool_ids, e.id] }); setOpenModalPicker(null) }}
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
                            <div style={{ padding: '4px 8px 5px', position: 'relative' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#BDBDBD', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Consumables</div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                {a.consumables.map((c, ci) => {
                                  const eq = equipmentList.find(e => e.id === c.resource_id)
                                  return eq ? (
                                    <span key={c.resource_id} style={{ ...chipBase, background: '#FFF3E0', borderColor: '#FFE082', color: '#E65100', gap: 4 }}>
                                      {eq.code}
                                      <input value={c.qty} onChange={e2 => {
                                        const updated = a.consumables.map((x, xi) => xi === ci ? { ...x, qty: e2.target.value } : x)
                                        patchActivity(a.localId, { consumables: updated })
                                      }} placeholder="qty" style={{ width: 36, fontSize: 10, border: '1px solid #FFE082', borderRadius: 3, padding: '0 3px', outline: 'none', fontFamily: 'monospace', background: '#fff', color: '#E65100' }} />
                                      <button onClick={() => patchActivity(a.localId, { consumables: a.consumables.filter((_, xi) => xi !== ci) })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E65100', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex' }}>×</button>
                                    </span>
                                  ) : null
                                })}
                                <div style={{ position: 'relative' }}>
                                  <button onClick={() => setOpenModalPicker(isPickerOpen('consumable') ? null : { actId: a.localId, kind: 'consumable' })}
                                    style={{ height: 18, padding: '0 6px', borderRadius: 9, border: '1px dashed #BDBDBD', background: 'none', fontSize: 10, color: '#9E9E9E', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Plus size={8} />Add
                                  </button>
                                  {isPickerOpen('consumable') && (
                                    <div onMouseDown={e2 => e2.stopPropagation()} style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#fff', border: '1px solid #E0E0E0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
                                      {modalConsumableOpts.length === 0 ? (
                                        <div style={{ padding: '10px 12px', fontSize: 11, color: '#9E9E9E' }}>No consumable resources seeded yet</div>
                                      ) : modalConsumableOpts.filter(e => !a.consumables.find(c => c.resource_id === e.id)).map(e => (
                                        <button key={e.id} onClick={() => { patchActivity(a.localId, { consumables: [...a.consumables, { resource_id: e.id, qty: '', unit: e.rate_unit ?? '' }] }); setOpenModalPicker(null) }}
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
                  </div>
                )
              })()}
            </div>

            {!publishOk && (
              <div style={{ fontSize: 11, color: '#9E9E9E', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={11} />
                Publish requires: op code · name · workcenter · ≥1 activity
              </div>
            )}
          </div>

          {/* Right: Activity Library */}
          <div style={{ width: 280, borderLeft: '1px solid #E0E0E0', display: 'flex', flexDirection: 'column', background: '#FAFAFA', flexShrink: 0 }}>
            <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid #E8E8E8', flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <BookOpen size={12} />Activity Library
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowNewAct(v => !v)}
                  style={{ height: 22, padding: '0 8px', borderRadius: 4, border: '1px solid', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3,
                    background: showNewAct ? '#FFF0F0' : '#fff', color: showNewAct ? '#C8202A' : '#555', borderColor: showNewAct ? '#C8202A' : '#D0D0D0' }}>
                  <Plus size={10} />New Activity
                </button>
              </div>

              {showNewAct && (
                <div style={{ background: '#FFF8F8', border: '1px solid #FCCACA', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#C8202A', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New Activity Template</div>
                  <input value={newAct.description} onChange={e => patchAct({ description: e.target.value })} placeholder="Description *"
                    style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 5 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 5 }}>
                    <input value={newAct.op_code} onChange={e => patchAct({ op_code: e.target.value })} placeholder="Group (op_code) *"
                      style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                    <input value={newAct.formula_param_code} onChange={e => patchAct({ formula_param_code: e.target.value })} placeholder="Measure *"
                      style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 5 }}>
                    <input value={newAct.unit} onChange={e => patchAct({ unit: e.target.value })} placeholder="Unit *"
                      style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                    <input type="number" value={newAct.per_minute} onChange={e => patchAct({ per_minute: e.target.value })} placeholder="/min *"
                      style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                    <input type="number" value={newAct.std_measure} onChange={e => patchAct({ std_measure: e.target.value })} placeholder="Std meas"
                      style={{ border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  {!form.workcenter_id && (
                    <select value={newAct.workcenter_id} onChange={e => patchAct({ workcenter_id: e.target.value })}
                      style={{ width: '100%', border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', background: '#fff', marginBottom: 5 }}>
                      <option value="">— Workcenter * —</option>
                      {workcenters.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowNewAct(false)} style={{ height: 26, padding: '0 10px', borderRadius: 4, border: '1px solid #E0E0E0', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#555' }}>Cancel</button>
                    <button onClick={() => newActMut.mutate()} disabled={!newActReady || newActMut.isPending}
                      style={{ height: 26, padding: '0 10px', borderRadius: 4, border: 'none', background: newActReady ? '#C8202A' : '#E0E0E0', color: newActReady ? '#fff' : '#9E9E9E', fontSize: 11, fontWeight: 600, cursor: newActReady ? 'pointer' : 'not-allowed' }}>
                      {newActMut.isPending ? 'Saving…' : 'Add to Library'}
                    </button>
                  </div>
                  {newActMut.isError && <div style={{ fontSize: 10, color: '#C8202A', marginTop: 4 }}>{(newActMut.error as Error).message}</div>}
                </div>
              )}

              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search size={11} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
                <input value={actSearch} onChange={e => setActSearch(e.target.value)} placeholder="Search activities…"
                  style={{ width: '100%', border: '1px solid #E8E8E8', borderRadius: 5, padding: '5px 8px 5px 24px', fontSize: 11, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {actChips.map(c => (
                  <button key={c} onClick={() => setActChip(c)}
                    style={{ padding: '2px 7px', borderRadius: 999, border: '1px solid', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      background: actChip === c ? '#C8202A' : '#fff', color: actChip === c ? '#fff' : '#555',
                      borderColor: actChip === c ? '#C8202A' : '#D0D0D0' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {Object.entries(actGroups).map(([grp, items]) => (
                <div key={grp} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{grp}</div>
                  {items.map(item => {
                    const added = addedIds.has(item.id)
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 5, marginBottom: 3, background: added ? '#F1F8F1' : '#fff', border: `1px solid ${added ? '#A5D6A7' : '#E8E8E8'}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: '#1F1F1F', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                          <div style={{ fontSize: 9, color: '#9E9E9E', marginTop: 1 }}>{item.formula_param_code} · {item.per_minute ? `${item.per_minute}/min` : '—'}</div>
                        </div>
                        <button onClick={() => !added && addFromLib(item)}
                          style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${added ? '#A5D6A7' : '#E0E0E0'}`, background: added ? '#E8F5E9' : '#fff', cursor: added ? 'default' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: added ? '#2E7D32' : '#555' }}>
                          {added ? <Check size={11} /> : <Plus size={11} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── LeftPanel — tab wrapper for Ops + Activities ──────────────

function LeftPanel({ onAddBlank, onNewOp }: { onAddBlank: () => void; onNewOp: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <OpLibraryPanel onAddBlank={onAddBlank} onNewOp={onNewOp} />
    </div>
  )
}

// ── OpLibraryPanel ────────────────────────────────────────────

function OpLibraryPanel({ onAddBlank, onNewOp }: { onAddBlank: () => void; onNewOp: () => void }) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const { data = [], isLoading } = useQuery<LibraryOpItem[]>({
    queryKey: ['op-library'],
    queryFn: async () => {
      const { data: list } = await apiClient.get('/operation-templates')
      const visible = (Array.isArray(list) ? list : []).filter((op: LibraryOpItem) => op.status !== 'draft')
      const details = await Promise.all(
        visible.map((op: LibraryOpItem) => apiClient.get(`/operation-templates/${op.id}`).then(r => r.data))
      )
      return details as LibraryOpItem[]
    },
    staleTime: 2 * 60 * 1000,
  })

  const q = search.trim().toLowerCase()
  const filtered = q
    ? data.filter(op =>
        op.name.toLowerCase().includes(q) ||
        op.op_code.toLowerCase().includes(q)
      )
    : data

  const groups: Record<string, { label: string; color: string; ops: LibraryOpItem[] }> = {}
  for (const op of filtered) {
    const key = op.op_type?.key ?? '__other__'
    if (!groups[key]) groups[key] = { label: op.op_type?.label ?? 'Other', color: op.op_type?.color ?? '#757575', ops: [] }
    groups[key].ops.push(op)
  }

  const toggleGroup = (key: string) => setCollapsed(c => ({ ...c, [key]: !c[key] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <GripVertical size={11} />Operation List
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search operations…"
            style={{ width: '100%', border: '1px solid #E8E8E8', borderRadius: 5, padding: '5px 8px 5px 26px', fontSize: 11, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        {!isLoading && (
          <div style={{ marginTop: 4, fontSize: 9, color: '#BDBDBD' }}>
            {filtered.length} op{filtered.length !== 1 ? 's' : ''} · drag onto canvas
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {isLoading ? (
          <div style={{ padding: 20, fontSize: 11, color: '#9E9E9E', textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, fontSize: 11, color: '#9E9E9E', textAlign: 'center' }}>No operations found</div>
        ) : (
          Object.entries(groups).map(([key, { label, color, ops }]) => {
            const isOpen = !collapsed[key]
            return (
              <div key={key} style={{ marginBottom: 6 }}>
                <button onClick={() => toggleGroup(key)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '4px 2px', marginBottom: isOpen ? 3 : 0,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.09em', flex: 1, textAlign: 'left' }}>{label}</span>
                  <span style={{ fontSize: 9, background: `${color}18`, color, borderRadius: 999, padding: '0 5px', fontWeight: 700 }}>{ops.length}</span>
                  <ChevronDown size={10} style={{ color: '#BDBDBD', flexShrink: 0, transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                </button>

                {isOpen && ops.map(op => (
                  <div key={op.id} draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('application/bdt-op-library', JSON.stringify(makeDragPayload(op)))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    style={{
                      background: '#fff', border: '1px solid #E8E8E8', borderLeft: `3px solid ${color}`,
                      borderRadius: '0 5px 5px 0', padding: '5px 7px', marginBottom: 3,
                      cursor: 'grab', userSelect: 'none',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 6px rgba(0,0,0,0.10)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <span style={{ fontSize: 9, background: `${color}18`, color, borderRadius: 3, padding: '1px 4px', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>{op.op_code}</span>
                      <span style={{ fontSize: 9, color: '#9E9E9E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.workcenter?.code ?? '—'}</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1F1F1F', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</div>
                    <div style={{ fontSize: 9, color: '#BDBDBD', marginTop: 2 }}>{op.activities.length} activities · {op.status}</div>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>

      <div style={{ padding: '6px 8px 8px', borderTop: '1px solid #E0E0E0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button onClick={onNewOp}
          style={{ width: '100%', height: 30, borderRadius: 6, border: 'none', background: '#C8202A', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <BookOpen size={12} />New to Library
        </button>
        <button onClick={onAddBlank} style={{ width: '100%', height: 28, borderRadius: 6, border: '1.5px dashed #D0D0D0', background: 'none', cursor: 'pointer', fontSize: 11, color: '#8E8E8E', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Plus size={12} />Add blank operation
        </button>
      </div>
    </div>
  )
}

// ── ExpandAllControl — custom Controls button ─────────────────

function ExpandAllControl() {
  const { expandedIds, expandAll, collapseAll } = useContext(ExpandCtx)
  const { getNodes } = useReactFlow()

  const activityNodeIds = getNodes()
    .filter(n => n.type === 'operation' && ((n.data as OperationData).activities?.length ?? 0) > 0)
    .map(n => n.id)

  const hasAny = activityNodeIds.length > 0
  const allExpanded = hasAny && activityNodeIds.every(id => expandedIds.has(id))

  if (!hasAny) return null

  return (
    <ControlButton
      onClick={() => allExpanded ? collapseAll() : expandAll(activityNodeIds)}
      title={allExpanded ? 'ย่อ activities ทั้งหมด' : 'ขยาย activities ทั้งหมด'}
      style={{ color: allExpanded ? '#C8202A' : '#555' }}
    >
      {allExpanded ? <ChevronsUp size={12} /> : <ChevronsDown size={12} />}
    </ControlButton>
  )
}

// ── MiniMapControl — custom Controls button ────────────────────

function MiniMapControl() {
  const { showMiniMap, toggleMiniMap } = useContext(ExpandCtx)
  return (
    <ControlButton
      onClick={toggleMiniMap}
      title={showMiniMap ? 'ซ่อน Mini Map' : 'แสดง Mini Map'}
      style={{ color: showMiniMap ? '#555' : '#C8202A' }}
    >
      <MapIcon size={12} />
    </ControlButton>
  )
}

// ── GatherControl — compact scattered nodes into a tidy row ────

function GatherControl() {
  const { getNodes, setNodes, fitView } = useReactFlow()
  const handleGather = useCallback(() => {
    const ops = getNodes()
      .filter(n => n.type === 'operation')
      .sort((a, b) => a.position.x - b.position.x)
    if (ops.length === 0) return
    const GAP = 260
    setNodes(prev =>
      prev.map(n => {
        const idx = ops.findIndex(o => o.id === n.id)
        if (idx === -1) return n
        return { ...n, position: { x: idx * GAP, y: 120 } }
      })
    )
    setTimeout(() => fitView({ padding: 0.3, duration: 400 }), 50)
  }, [getNodes, setNodes, fitView])

  return (
    <ControlButton onClick={handleGather} title="รวม nodes ทั้งหมด">
      <Target size={12} />
    </ControlButton>
  )
}

// ── AutoEdgeControl — connect all op nodes by x-sequence ───────

function AutoEdgeControl() {
  const { getNodes, getEdges, setEdges } = useReactFlow()
  const handleToggle = useCallback(() => {
    if (getEdges().length > 0) {
      setEdges([])
      return
    }

    const ops = getNodes()
      .filter(n => n.type === 'operation')
      .map(n => {
        const parent = n.parentId ? getNodes().find(p => p.id === n.parentId) : undefined
        return { ...n, absX: n.position.x + (parent?.position.x ?? 0) }
      })
      .sort((a, b) => a.absX - b.absX)

    if (ops.length === 0) return

    const mkEdge = (id: string, source: string, target: string, num: number): Edge => ({
      id, source, target, type: 'labeled', label: String(num),
      animated: true, style: { stroke: '#C8202A', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#C8202A' },
    })
    setEdges([
      mkEdge(`ae-start-${ops[0].id}`, 'start', ops[0].id, 1),
      ...ops.slice(0, -1).map((op, i) => mkEdge(`ae-${op.id}-${ops[i + 1].id}`, op.id, ops[i + 1].id, i + 2)),
      mkEdge(`ae-${ops[ops.length - 1].id}-end`, ops[ops.length - 1].id, 'end', ops.length + 1),
    ])
  }, [getNodes, getEdges, setEdges])

  const hasEdges = useReactFlow().getEdges().length > 0

  return (
    <ControlButton
      onClick={handleToggle}
      title={hasEdges ? 'ลบเส้นเชื่อมทั้งหมด' : 'ต่อเส้น Auto (ตามลำดับ)'}
      style={{ color: hasEdges ? '#C8202A' : '#555' }}
    >
      <GitMerge size={12} />
    </ControlButton>
  )
}

// ── RoutingBuilderInner ────────────────────────────────────────

function RoutingBuilderInner() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id: paramId } = useParams<{ id?: string }>()
  const isEdit = Boolean(paramId)
  const templateId = paramId ? Number(paramId) : null
  const { screenToFlowPosition, setNodes, getNodes } = useReactFlow()

  const [code, setCode] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [productType, setProductType] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const dropDataRef = useRef<Record<string, OperationData>>({})
  const [previewMode, setPreviewMode] = useState(false)
  const [previewInputs, setPreviewInputs] = useState<Record<string, number>>({})
  const [showNewOpModal, setShowNewOpModal] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [bgImageUrl, setBgImageUrl] = useState('')
  const [bgOpacity, setBgOpacity] = useState(0.15)
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [bgRotation, setBgRotation] = useState(0)
  const [bgScale, setBgScale] = useState(1)
  const [bgIsFile, setBgIsFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgLocalKey = isEdit && templateId ? `bdt_template_bg_${templateId}` : null
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }, [])
  const expandAll = useCallback((ids: string[]) => setExpandedIds(new Set(ids)), [])
  const collapseAll = useCallback(() => setExpandedIds(new Set()), [])
  const toggleLeftPanel = useCallback(() => setLeftPanelOpen(v => !v), [])
  const [showMiniMap, setShowMiniMap] = useState(true)
  const toggleMiniMap = useCallback(() => setShowMiniMap(v => !v), [])

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'operation') return
    const allNodes = getNodes()
    const zones = allNodes.filter(n => n.type === 'zone')

    // compute absolute position of dragged node
    const parentNode = node.parentId ? allNodes.find(n => n.id === node.parentId) : undefined
    const absX = node.position.x + (parentNode?.position.x ?? 0)
    const absY = node.position.y + (parentNode?.position.y ?? 0)
    const cx = absX + (node.measured?.width ?? 160) / 2
    const cy = absY + (node.measured?.height ?? 80) / 2

    const hit = zones.find(z => {
      const zw = (z.style?.width as number | undefined) ?? 320
      const zh = (z.style?.height as number | undefined) ?? 220
      return cx >= z.position.x && cx <= z.position.x + zw &&
             cy >= z.position.y && cy <= z.position.y + zh
    })

    const newPid = hit?.id
    if (newPid === node.parentId) return

    setNodes(prev => prev.map(n => {
      if (n.id !== node.id) return n
      if (newPid) {
        const zone = zones.find(z => z.id === newPid)!
        return { ...n, parentId: newPid, zIndex: 1, position: { x: absX - zone.position.x, y: absY - zone.position.y } }
      }
      return { ...n, parentId: undefined, position: { x: absX, y: absY } }
    }))
  }, [getNodes, setNodes])

  const handleFileUpload = useCallback(async (file: File) => {
    const applyBg = (dataUrl: string) => {
      setBgImageUrl(dataUrl)
      setBgIsFile(true)
      if (bgLocalKey) localStorage.setItem(bgLocalKey, dataUrl)
    }
    if (file.type === 'application/pdf') {
      const buf = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise
      const page = await pdf.getPage(1)
      const vp = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      await page.render({ canvas, viewport: vp }).promise
      applyBg(canvas.toDataURL('image/jpeg', 0.85))
    } else {
      const reader = new FileReader()
      reader.onload = e => applyBg(e.target?.result as string)
      reader.readAsDataURL(file)
    }
  }, [bgLocalKey])

  const expandCtxValue = useMemo(() => ({ expandedIds, toggleExpand, expandAll, collapseAll, leftPanelOpen, toggleLeftPanel, showMiniMap, toggleMiniMap }), [expandedIds, toggleExpand, expandAll, collapseAll, leftPanelOpen, toggleLeftPanel, showMiniMap, toggleMiniMap])

  const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const parallelLabels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of edges) {
      const lbl = String(e.label ?? '').trim()
      if (lbl) counts.set(lbl, (counts.get(lbl) ?? 0) + 1)
    }
    const result = new Set<string>()
    for (const [lbl, cnt] of counts) if (cnt > 1) result.add(lbl)
    return result
  }, [edges])

  const seqMap = useMemo(() => {
    const m = new Map<string, number>()
    nodes.filter(n => n.type === 'operation').sort((a, b) => a.position.x - b.position.x).forEach((n, i) => m.set(n.id, i + 1))
    return m
  }, [nodes])

  const opNodes = nodes.filter(n => n.type === 'operation')

  const { data: opTypes = [] } = useQuery<OpTypeItem[]>({
    queryKey: ['op-types'],
    queryFn: async () => {
      const { data } = await apiClient.get('/op-types')
      return Array.isArray(data) ? data : data.items ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Simulation ────────────────────────────────────────────────
  const [simPhase, setSimPhase] = useState<SimPhase>('idle')
  const [simElapsed, setSimElapsed] = useState(0)   // sim-minutes elapsed
  const [simSpeed, setSimSpeed] = useState(30)       // sim-min per real-second
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const totalSimMinRef = useRef(0)

  const simOps = useMemo(() => {
    if (!previewMode) return []

    const opIds = new Set(opNodes.map(n => n.id))

    // Build op→op adjacency + in-degree for Kahn's toposort
    // Also track min incoming edge label per node for tiebreaking
    const adj = new Map<string, string[]>()
    const inDeg = new Map<string, number>()
    const inLabel = new Map<string, number>()
    for (const id of opIds) inDeg.set(id, 0)

    for (const e of edges) {
      const tgt = e.target
      if (!opIds.has(tgt)) continue
      const lbl = Number(e.label) || 0
      const prev = inLabel.get(tgt) ?? Infinity
      if (lbl < prev) inLabel.set(tgt, lbl)

      if (!opIds.has(e.source)) continue // skip 'start' source for inDeg/adj
      adj.set(e.source, [...(adj.get(e.source) ?? []), tgt])
      inDeg.set(tgt, (inDeg.get(tgt) ?? 0) + 1)
    }

    // Reachable set: BFS from start
    const reachable = new Set<string>()
    const bfsStack = edges.filter(e => e.source === 'start').map(e => e.target).filter(t => opIds.has(t))
    for (const t of bfsStack) reachable.add(t)
    let bi = 0
    while (bi < bfsStack.length) {
      for (const nxt of adj.get(bfsStack[bi++]) ?? []) {
        if (!reachable.has(nxt)) { reachable.add(nxt); bfsStack.push(nxt) }
      }
    }

    // Kahn's toposort on reachable nodes, ordered by edge label (execution sequence)
    const deg = new Map([...inDeg].filter(([id]) => reachable.has(id)))
    const topoQ = [...reachable].filter(id => (deg.get(id) ?? 0) === 0)
    topoQ.sort((a, b) => (inLabel.get(a) ?? 0) - (inLabel.get(b) ?? 0))

    const sortedIds: string[] = []
    while (topoQ.length > 0) {
      const cur = topoQ.shift()!
      sortedIds.push(cur)
      for (const nxt of adj.get(cur) ?? []) {
        if (!reachable.has(nxt)) continue
        const newDeg = (deg.get(nxt) ?? 0) - 1
        deg.set(nxt, newDeg)
        if (newDeg === 0) {
          const lbl = inLabel.get(nxt) ?? 0
          const idx = topoQ.findIndex(q => (inLabel.get(q) ?? 0) > lbl)
          if (idx === -1) topoQ.push(nxt); else topoQ.splice(idx, 0, nxt)
        }
      }
    }

    return sortedIds.flatMap(id => {
      const n = opNodes.find(n => n.id === id)!
      const d = n.data as OperationData
      const est = estimateOpMin(d, previewInputs)
      if (est === null || est <= 0) return []
      const opDef = opTypes.find(t => t.id === d.op_type_id)
      return [{ id: n.id, name: d.name, opCode: d.op_code, color: opDef?.color ?? '#757575', estMin: est }]
    })
  }, [opNodes, edges, previewInputs, previewMode, opTypes])

  const totalSimMin = simOps.reduce((s, o) => s + o.estMin, 0)
  totalSimMinRef.current = totalSimMin

  const activeOpId = useMemo(() => {
    if (simPhase === 'idle' || simOps.length === 0) return null
    let cum = 0
    for (const op of simOps) { cum += op.estMin; if (simElapsed < cum) return op.id }
    return null
  }, [simElapsed, simOps, simPhase])

  const simPastIds = useMemo(() => {
    if (simPhase === 'idle') return new Set<string>()
    const activeIdx = activeOpId ? simOps.findIndex(o => o.id === activeOpId) : simOps.length
    return new Set(simOps.slice(0, activeIdx < 0 ? simOps.length : activeIdx).map(o => o.id))
  }, [simPhase, activeOpId, simOps])

  useEffect(() => {
    if (simPhase !== 'playing') {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      lastTsRef.current = null
      return
    }
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts
      const deltaReal = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      setSimElapsed(prev => {
        const next = prev + deltaReal * simSpeed
        if (next >= totalSimMinRef.current) { setSimPhase('paused'); return totalSimMinRef.current }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  }, [simPhase, simSpeed])

  const resetSim = useCallback(() => { setSimPhase('idle'); setSimElapsed(0) }, [])

  useEffect(() => { if (!previewMode) resetSim() }, [previewMode, resetSim])

  const simCtxValue = useMemo<SimCtxType>(
    () => ({ simPhase, activeOpId, simPastIds }),
    [simPhase, activeOpId, simPastIds],
  )

  const previewVars = [...new Set(opNodes.flatMap(n => {
    const d = n.data as OperationData
    if (d.time_mode === 'formula' && d.formula) return extractVars(d.formula)
    if (d.time_mode === 'activities') return d.activities.filter(a => a.measure).map(a => a.measure)
    return []
  }))]

  const totalMin = previewMode
    ? opNodes.reduce<number | null>((acc, n) => {
        const est = estimateOpMin(n.data as OperationData, previewInputs)
        if (est === null) return null
        return (acc ?? 0) + est
      }, 0)
    : null

  const { data: workcenters = [] } = useQuery<WorkcenterItem[]>({
    queryKey: ['workcenters-palette'],
    queryFn: async () => {
      const { data } = await apiClient.get('/workcenters')
      return (Array.isArray(data) ? data : data.items ?? []).filter((w: WorkcenterItem) => w.id)
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: equipmentResources = [] } = useQuery<EquipmentResource[]>({
    queryKey: ['equipment-resources'],
    queryFn: async () => { const { data } = await apiClient.get('/equipment-resources'); return Array.isArray(data) ? data : [] },
    staleTime: 10 * 60 * 1000,
  })

  const { data: existing, isLoading: loadingTemplate } = useQuery<ExistingTemplate>({
    queryKey: ['routing-template-detail', templateId],
    queryFn: async () => { const { data } = await apiClient.get(`/routing-templates/${templateId}`); return data },
    enabled: isEdit && !!templateId,
    staleTime: Infinity,         // never auto-refetch — user is actively editing
    refetchOnWindowFocus: false, // switching tabs must not reset the canvas
  })

  useEffect(() => {
    if (!existing) return
    setCode(existing.code)
    setTemplateName(existing.name)
    setProductType(existing.applies_to_product_type ?? '')
    const localBg = bgLocalKey ? localStorage.getItem(bgLocalKey) : null
    setBgImageUrl(localBg ?? existing.bg_image_url ?? '')
    setBgIsFile(!!localBg)
    setBgRotation(existing.bg_rotation ?? 0)
    setBgScale(existing.bg_scale ?? 1)
    const opNds: Node[] = existing.operations.map((op, i) => ({
      id: `op-${op.id}`,
      type: 'operation',
      position: {
        x: op.canvas_x != null ? op.canvas_x : 320 + i * 240,
        y: op.canvas_y != null ? op.canvas_y : 160,
      },
      data: {
        existing_op_id: op.id,
        name: op.name,
        op_code: op.op_code,
        operation_type: op.op_type?.key ?? '',
        op_type_id: op.op_type?.id ?? undefined,
        workcenter_id: op.workcenter.id,
        workcenter_name: op.workcenter.name,
        method: op.method ?? undefined,
        time_mode: (['formula', 'manual', 'activities'].includes(op.time_mode) ? op.time_mode : 'formula') as TimeMode,
        duration_min: op.time_cycle_manual ? Number(op.time_cycle_manual) : undefined,
        formula: op.formula_expr ?? undefined,
        activities: (op.op_activities ?? []).map(oa => ({
          localId: `act-${oa.id}`,
          templateId: oa.activity_template.id,
          name: oa.activity_template.description,
          measure: oa.activity_template.formula_param_code ?? '',
          perMinute: oa.activity_template.per_minute ? Number(oa.activity_template.per_minute) : undefined,
          unit: oa.activity_template.unit ?? undefined,
          stdMeasure: oa.activity_template.std_measure ? Number(oa.activity_template.std_measure) : undefined,
          machineId: oa.machine_id ?? (oa.activity_template as any).machine_id ?? undefined,
          toolIds: (oa.tools ?? []).map((t: { resource_id: number }) => t.resource_id),
          consumables: (oa.consumables ?? []).map((c: { resource_id: number; qty: number | null; unit: string | null }) => ({
            resource_id: c.resource_id,
            qty: c.qty != null ? String(c.qty) : '',
            unit: c.unit ?? '',
          })),
        })),
      } satisfies OperationData,
    }))
    const maxX = opNds.length > 0 ? Math.max(...opNds.map(n => n.position.x)) : 320
    const endNode = { ...INITIAL_NODES[1], position: { x: maxX + 240, y: 180 } }
    setNodes([INITIAL_NODES[0], endNode, ...opNds])

    if (existing.canvas_edges && existing.canvas_edges.length > 0) {
      // Restore persisted edge layout
      setEdges(existing.canvas_edges.map((e, i) => ({
        id: `re-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle != null && { sourceHandle: e.sourceHandle }),
        ...(e.targetHandle != null && { targetHandle: e.targetHandle }),
        type: 'labeled',
        label: e.label,
        animated: true,
        style: { stroke: '#C8202A', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#C8202A' },
        data: { midOffsetX: e.midOffsetX ?? 0, midOffsetY: e.midOffsetY ?? 0 },
      })))
    } else {
      // First open (no saved edges) — auto-connect in sequence order
      const sorted = [...opNds].sort((a, b) => a.position.x - b.position.x)
      const mkAutoEdge = (id: string, source: string, target: string, num: number): Edge => ({
        id, source, target, type: 'labeled', label: String(num),
        animated: true, style: { stroke: '#C8202A', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#C8202A' },
      })
      if (sorted.length > 0) {
        setEdges([
          mkAutoEdge(`ae-start-${sorted[0].id}`, 'start', sorted[0].id, 1),
          ...sorted.slice(0, -1).map((op, i) => mkAutoEdge(`ae-${op.id}-${sorted[i + 1].id}`, op.id, sorted[i + 1].id, i + 2)),
          mkAutoEdge(`ae-${sorted[sorted.length - 1].id}-end`, sorted[sorted.length - 1].id, 'end', sorted.length + 1),
        ])
      } else {
        setEdges([])
      }
    }
  }, [existing, setNodes, setEdges, setBgRotation, setBgScale])

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => {
      // Outgoing edges from this source → parallel branch: reuse the same step number
      const sourceOut = eds.filter(e => e.source === params.source)
      let stepNum: number
      if (sourceOut.length > 0) {
        const nums = sourceOut.map(e => Number(e.label)).filter(n => !isNaN(n))
        stepNum = nums.length > 0 ? Math.min(...nums) : 1
      } else {
        // Sequential: incoming edges to source → +1
        const sourceIn = eds.filter(e => e.target === params.source)
        const maxIn = sourceIn.reduce((max, e) => { const n = Number(e.label); return isNaN(n) ? max : Math.max(max, n) }, 0)
        stepNum = maxIn + 1
      }
      return addEdge({ ...params, type: 'labeled', label: String(stepNum), animated: true, style: { stroke: '#C8202A', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#C8202A' } }, eds)
    }),
    [setEdges],
  )
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/bdt-op-library')
    if (!raw) return
    const opData = JSON.parse(raw) as Omit<OperationData, 'existing_op_id'>
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const nid = `op-${Date.now()}`
    const nodeData = { ...opData, existing_op_id: undefined } as OperationData
    dropDataRef.current[nid] = nodeData
    setNodes(nds => [...nds, { id: nid, type: 'operation', position: pos, data: nodeData }])
    setSelectedNodeId(nid)
  }, [screenToFlowPosition, setNodes])

  const addBlankOp = useCallback(() => {
    const count = nodes.filter(n => n.type === 'operation').length
    const nid = `op-${Date.now()}`
    setNodes(nds => [...nds, {
      id: nid, type: 'operation', position: { x: 320 + count * 240, y: 160 },
      data: { name: '', op_code: '', operation_type: '', op_type_id: undefined, workcenter_id: null, workcenter_name: '', time_mode: 'formula' as TimeMode, formula: '', activities: [] } satisfies OperationData,
    }])
    setSelectedNodeId(nid)
  }, [nodes, setNodes])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'operation') setSelectedNodeId(node.id)
  }, [])
  const onPaneClick = useCallback(() => { setSelectedNodeId(null); setShowBgPanel(false) }, [setShowBgPanel])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sorted = [...opNodes].sort((a, b) => a.position.x - b.position.x)
      const incomplete = sorted.filter(n => !isOpReady(n.data as OperationData))
      if (incomplete.length > 0) throw new Error('Some operations are incomplete — fill all required fields')

      // Build snapshot payload — same shape for both create and edit
      const operations = sorted.map((node, i) => {
        const d = node.data as OperationData
        return {
          ...(d.existing_op_id != null && { id: d.existing_op_id }),
          client_ref: node.id,          // frontend node ID — backend uses this to translate edge refs
          op_code: d.op_code.trim(),
          name: d.name.trim(),
          sequence: (i + 1) * 10,
          workcenter_id: d.workcenter_id!,
          op_type_id: d.op_type_id ?? null,
          method: d.method || null,
          time_mode: d.time_mode,
          time_cycle_manual: d.time_mode === 'manual' ? d.duration_min ?? null : null,
          formula_expr: d.time_mode === 'formula' ? d.formula || null : null,
          canvas_x: node.position.x,
          canvas_y: node.position.y,
          activity_template_ids: d.activities.filter(a => a.templateId).map(a => a.templateId!),
        }
      })

      const canvas_edges = edges.map(e => ({
        source: e.source,
        target: e.target,
        ...(e.sourceHandle != null && { sourceHandle: e.sourceHandle }),
        ...(e.targetHandle != null && { targetHandle: e.targetHandle }),
        ...(e.label != null && { label: String(e.label) }),
        ...((e.data?.midOffsetX as number) && { midOffsetX: e.data!.midOffsetX as number }),
        ...((e.data?.midOffsetY as number) && { midOffsetY: e.data!.midOffsetY as number }),
      }))

      const snapshot = {
        name: templateName.trim(),
        applies_to_product_type: productType || null,
        bg_image_url: bgIsFile ? null : (bgImageUrl.trim() || null),
        bg_rotation: bgRotation,
        bg_scale: bgScale,
        canvas_edges,
        operations,
      }

      if (isEdit && templateId) {
        await apiClient.put(`/routing-templates/${templateId}/snapshot`, snapshot)
      } else {
        // Create the template header first, then push the full snapshot
        const { data: tpl } = await apiClient.post('/routing-templates', {
          code: code.trim(), name: templateName.trim(),
          ...(productType ? { applies_to_product_type: productType } : {}),
        })
        if (bgIsFile && bgImageUrl) localStorage.setItem(`bdt_template_bg_${tpl.id}`, bgImageUrl)
        await apiClient.put(`/routing-templates/${tpl.id}/snapshot`, snapshot)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-template-detail', templateId] })
      navigate('/routings')
    },
  })

  const allReady = opNodes.length > 0 && opNodes.every(n => isOpReady(n.data as OperationData))
  const canSave = templateName.trim().length > 0 && (isEdit || code.trim().length > 0) && allReady

  const previewCtxValue = useMemo(
    () => ({ previewMode, inputs: previewInputs, setInputs: setPreviewInputs }),
    [previewMode, previewInputs]
  )
  const handleInspectorClose = useCallback(() => setSelectedNodeId(null), [])
  const handleInspectorDelete = useCallback(() => {
    setNodes(nds => nds.filter(n => n.id !== selectedNodeId))
    setSelectedNodeId(null)
  }, [selectedNodeId, setNodes])

  if (isEdit && loadingTemplate) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 13 }}>Loading template…</div>
  }

  return (
    <OpTypeCtx.Provider value={opTypes}>
    <WorkcenterCtx.Provider value={workcenters}>
    <EquipmentCtx.Provider value={equipmentResources}>
    <ExpandCtx.Provider value={expandCtxValue}>
      <SequenceCtx.Provider value={seqMap}>
      <ParallelCtx.Provider value={parallelLabels}>
        <SimCtx.Provider value={simCtxValue}>
        <PreviewCtx.Provider value={previewCtxValue}>
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>

            {/* Top bar */}
            <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 20 }}>
              <button onClick={() => navigate('/routings')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 13 }}>
                <ArrowLeft size={16} />Routings
              </button>
              <div style={{ width: 1, height: 20, background: '#E0E0E0' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', flexShrink: 0 }}>
                {isEdit ? `Edit: ${code}` : 'New Routing Template'}
              </span>
              <div style={{ flex: 1 }} />
              <input value={code} onChange={e => setCode(e.target.value)} disabled={isEdit}
                style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px', height: 34, fontSize: 13, width: 110, background: isEdit ? '#F5F5F5' : '#fff', color: isEdit ? '#9E9E9E' : '#1F1F1F' }}
                placeholder="Code" />
              <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px', height: 34, fontSize: 13, width: 220 }}
                placeholder="Template name" />
              <select value={productType} onChange={e => setProductType(e.target.value)}
                style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px', height: 34, fontSize: 13 }}>
                <option value="">All types</option>
                <option value="standard">Standard</option>
                <option value="custom">Custom</option>
              </select>
              {/* Background image button + popover */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowBgPanel(v => !v)} style={{
                  height: 34, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: bgImageUrl ? '#EFF6FF' : '#F5F5F5',
                  color: bgImageUrl ? '#1565C0' : '#555',
                  border: `1px solid ${bgImageUrl ? '#BBDEFB' : '#E0E0E0'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <ImageIcon size={13} />Background
                </button>
                {showBgPanel && (
                  <div style={{
                    position: 'absolute', top: 40, right: 0, zIndex: 500,
                    background: '#fff', border: '1px solid #E0E0E0', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14, width: 320,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1F1F1F', marginBottom: 10 }}>
                      Floor Plan Background
                    </div>
                    <div style={{ fontSize: 10, color: '#9E9E9E', marginBottom: 5 }}>IMAGE URL</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input
                        value={bgIsFile ? '' : bgImageUrl}
                        onChange={e => { setBgImageUrl(e.target.value); setBgIsFile(false) }}
                        placeholder="https://example.com/floor-plan.png"
                        style={{ flex: 1, border: '1px solid #E0E0E0', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}
                      />
                      {bgImageUrl && (
                        <button onClick={() => { setBgImageUrl(''); setBgIsFile(false); if (bgLocalKey) localStorage.removeItem(bgLocalKey) }}
                          style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #E0E0E0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <X size={11} style={{ color: '#9E9E9E' }} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 1, background: '#EFEFEF' }} />
                      <span style={{ fontSize: 9, color: '#C0C0C0', fontWeight: 600 }}>OR UPLOAD FILE</span>
                      <div style={{ flex: 1, height: 1, background: '#EFEFEF' }} />
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%', height: 30, borderRadius: 5, border: '1px dashed #D0D0D0',
                        background: bgIsFile ? '#EFF6FF' : '#FAFAFA', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 11, color: bgIsFile ? '#1565C0' : '#777', fontWeight: 500, marginBottom: 10,
                      }}>
                      <Upload size={11} />{bgIsFile ? 'Replace file…' : 'Upload image or PDF'}
                    </button>
                    <input
                      ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
                    />
                    {bgIsFile && (
                      <div style={{ fontSize: 10, color: '#1565C0', background: '#EFF6FF', borderRadius: 5, padding: '4px 8px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Upload size={9} /> Local file — saved in browser only
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#9E9E9E', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                      <span>OPACITY</span>
                      <span style={{ color: '#555', fontWeight: 600 }}>{Math.round(bgOpacity * 100)}%</span>
                    </div>
                    <input type="range" min={5} max={60} value={Math.round(bgOpacity * 100)}
                      onChange={e => setBgOpacity(Number(e.target.value) / 100)}
                      style={{ width: '100%', accentColor: '#C8202A', marginBottom: 10 }}
                    />
                    <div style={{ fontSize: 10, color: '#9E9E9E', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                      <span>ROTATION</span>
                      <button onClick={() => setBgRotation(0)} style={{ fontSize: 9, color: '#9E9E9E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                        Reset
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <button
                        onClick={() => setBgRotation(r => ((r - 270) % 360 + 360) % 360)}
                        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #E0E0E0', background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RotateCcw size={12} style={{ color: '#555' }} />
                      </button>
                      <input
                        type="number" min={0} max={359} value={bgRotation}
                        onChange={e => setBgRotation(((Number(e.target.value) % 360) + 360) % 360)}
                        style={{ flex: 1, border: '1px solid #E0E0E0', borderRadius: 5, padding: '4px 6px', fontSize: 11, outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 10, color: '#9E9E9E', flexShrink: 0 }}>°</span>
                      <button
                        onClick={() => setBgRotation(r => (r + 270) % 360)}
                        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #E0E0E0', background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RotateCw size={12} style={{ color: '#555' }} />
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: '#9E9E9E', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                      <span>SCALE</span>
                      <button onClick={() => setBgScale(1)} style={{ fontSize: 9, color: '#9E9E9E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                        Reset
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <button
                        onClick={() => setBgScale(s => Math.max(0.1, +(s - 0.1).toFixed(1)))}
                        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #E0E0E0', background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ZoomOut size={12} style={{ color: '#555' }} />
                      </button>
                      <input
                        type="number" min={0.1} max={5} step={0.1} value={bgScale}
                        onChange={e => setBgScale(Math.min(5, Math.max(0.1, +parseFloat(e.target.value).toFixed(1) || 1)))}
                        style={{ flex: 1, border: '1px solid #E0E0E0', borderRadius: 5, padding: '4px 6px', fontSize: 11, outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 10, color: '#9E9E9E', flexShrink: 0 }}>×</span>
                      <button
                        onClick={() => setBgScale(s => Math.min(5, +(s + 0.1).toFixed(1)))}
                        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #E0E0E0', background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ZoomIn size={12} style={{ color: '#555' }} />
                      </button>
                    </div>
                    {bgImageUrl && (
                      <div style={{ width: '100%', height: 80, borderRadius: 6, border: '1px solid #E0E0E0', overflow: 'hidden', marginBottom: 8 }}>
                        <img src={bgImageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    )}
                    <button onClick={() => setShowBgPanel(false)}
                      style={{ width: '100%', height: 28, borderRadius: 5, border: 'none', background: '#1F1F1F', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Done
                    </button>
                  </div>
                )}
              </div>

              <button onClick={() => setPreviewMode(v => !v)} style={{
                height: 34, padding: '0 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: previewMode ? '#E8F5E9' : '#F5F5F5',
                color: previewMode ? '#2E7D32' : '#555',
                border: `1px solid ${previewMode ? '#A5D6A7' : '#E0E0E0'}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {previewMode ? <Eye size={13} /> : <EyeOff size={13} />}Simulation
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
                title={!canSave
                  ? (!code.trim() && !isEdit ? 'กรอก Code ก่อน' : !templateName.trim() ? 'กรอก Template name ก่อน' : opNodes.length === 0 ? 'เพิ่ม Operation อย่างน้อย 1 ตัว' : 'กรอกข้อมูล Operation ให้ครบ (*)')
                  : undefined}
                style={{
                  height: 34, padding: '0 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: canSave ? '#C8202A' : '#E0E0E0',
                  color: canSave ? '#fff' : '#9E9E9E',
                  border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <Save size={14} />{saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Template'}
              </button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Left palette — Operation List */}
              <div style={{
                width: leftPanelOpen ? 220 : 28,
                transition: 'width 0.22s ease',
                background: '#FAFAFA', borderRight: '1px solid #E0E0E0',
                display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
                position: 'relative',
              }}>
                {/* Full panel — invisible when collapsed */}
                <div style={{ width: 220, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
                  opacity: leftPanelOpen ? 1 : 0, transition: 'opacity 0.15s ease', pointerEvents: leftPanelOpen ? 'auto' : 'none' }}>
                  <LeftPanel onAddBlank={addBlankOp} onNewOp={() => setShowNewOpModal(true)} />
                </div>
                {/* Collapsed tab */}
                {!leftPanelOpen && (
                  <button onClick={() => setLeftPanelOpen(true)} title="แสดง Operation List"
                    style={{ position: 'absolute', inset: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <ChevronRight size={12} style={{ color: '#9E9E9E' }} />
                    <span style={{ writingMode: 'vertical-rl', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#BDBDBD', transform: 'rotate(180deg)' }}>
                      Operations
                    </span>
                  </button>
                )}
              </div>

              {/* Canvas */}
              <div style={{ flex: 1, position: 'relative' }}>
                {bgImageUrl && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                    backgroundImage: `url(${bgImageUrl})`,
                    backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                    opacity: bgOpacity,
                    transform: (bgRotation || bgScale !== 1) ? `scale(${bgScale}) rotate(${bgRotation}deg)` : undefined,
                  }} />
                )}
                <ReactFlow style={{ background: 'transparent' }}
                  nodes={nodes} edges={edges}
                  onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                  onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
                  onNodeClick={onNodeClick} onPaneClick={onPaneClick}
                  onNodeDragStop={onNodeDragStop}
                  isValidConnection={(connection) => connection.source !== connection.target}
                  nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.5 }}
                  defaultEdgeOptions={{ animated: true, style: { stroke: '#C8202A', strokeWidth: 2, cursor: 'pointer' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#C8202A' } }}
                  deleteKeyCode="Delete"
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#D0D0D0" />
                  <Controls style={{ bottom: 16, left: 16 }}>
                    <ExpandAllControl />
                    <MiniMapControl />
                    <GatherControl />
                    <AutoEdgeControl />
                  </Controls>
                  {showMiniMap && <MiniMap nodeStrokeWidth={3} style={{ bottom: 16, right: 16, background: '#FAFAFA', border: '1px solid #E0E0E0' }} zoomable pannable />}
                </ReactFlow>
              </div>

              {/* Inspector drawer */}
              {selectedNodeId && (
                <InspectorDrawer
                  key={selectedNodeId}
                  nodeId={selectedNodeId}
                  initialData={dropDataRef.current[selectedNodeId] ?? (nodes.find(n => n.id === selectedNodeId)?.data as OperationData | undefined)}
                  onClose={handleInspectorClose}
                  onDelete={handleInspectorDelete}
                />
              )}
            </div>

            {/* Simulation panel */}
            {previewMode && simOps.length > 0 && (
              <div style={{ background: '#fff', borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
                {/* Controls */}
                <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #F0F0F0' }}>
                  <button
                    onClick={() => simPhase === 'playing' ? setSimPhase('paused') : setSimPhase('playing')}
                    style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#C8202A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {simPhase === 'playing' ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button onClick={resetSim}
                    style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #E0E0E0', cursor: 'pointer', background: '#FAFAFA', color: '#8E8E8E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RotateCcw size={13} />
                  </button>
                  <div style={{ width: 1, height: 20, background: '#E0E0E0', margin: '0 4px' }} />
                  <span style={{ fontSize: 10, color: '#8E8E8E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Speed</span>
                  {([1, 5, 30, 120] as const).map(s => (
                    <button key={s} onClick={() => setSimSpeed(s)}
                      style={{ height: 24, padding: '0 9px', borderRadius: 4, border: `1px solid ${simSpeed === s ? '#C8202A' : '#E0E0E0'}`, cursor: 'pointer', background: simSpeed === s ? '#FCEBEB' : '#FAFAFA', color: simSpeed === s ? '#C8202A' : '#555', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {s}×
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#555' }}>
                    {fmtMin(+simElapsed.toFixed(2))}
                    <span style={{ color: '#BDBDBD' }}> / </span>
                    {fmtMin(totalSimMin)}
                  </span>
                  {simElapsed >= totalSimMin && totalSimMin > 0 && (
                    <span style={{ fontSize: 10, background: '#E8F5E9', color: '#2E7D32', borderRadius: 4, padding: '2px 8px', fontWeight: 700, border: '1px solid #A5D6A7' }}>Done ✓</span>
                  )}
                </div>
                {/* Gantt */}
                <div style={{ padding: '8px 16px 10px' }}>
                  <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', background: '#F5F5F5', border: '1px solid #E0E0E0' }}>
                    {simOps.map((op, i) => {
                      const opStart = simOps.slice(0, i).reduce((s, o) => s + o.estMin, 0)
                      const fillMin = Math.min(op.estMin, Math.max(0, simElapsed - opStart))
                      const fillPct = op.estMin > 0 ? (fillMin / op.estMin) * 100 : 0
                      const isActive = op.id === activeOpId
                      return (
                        <div key={op.id} style={{ flex: op.estMin, position: 'relative', background: `${op.color}33`, borderRight: '1px solid #E0E0E0', minWidth: 0 }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${fillPct}%`, background: isActive ? op.color : `${op.color}CC`, transition: 'width 0.1s linear' }} />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', marginTop: 3, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, fontSize: 9, color: '#9E9E9E' }}>0</span>
                    {simOps.map((op, i) => {
                      const cumTime = simOps.slice(0, i + 1).reduce((s, o) => s + o.estMin, 0)
                      const isActive = op.id === activeOpId
                      const isDone = simPastIds.has(op.id)
                      const color = isDone ? '#4CAF50' : isActive ? op.color : '#555'
                      return (
                        <div key={op.id} style={{ flex: op.estMin, fontSize: 9, color, fontWeight: isDone || isActive ? 700 : 400, textAlign: 'right', paddingRight: 2, overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {fmtMin(cumTime)}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Preview footer */}
            {previewMode && previewVars.length > 0 && (
              <div style={{ background: '#F8F8F8', borderTop: '1px solid #E0E0E0', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, overflowX: 'auto' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Variables</span>
                {previewVars.map(v => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>{v}</label>
                    <input type="number" min={0}
                      value={previewInputs[v] ?? ''}
                      onChange={e => setPreviewInputs(prev => ({ ...prev, [v]: e.target.value ? Number(e.target.value) : 0 }))}
                      style={{ width: 72, border: '1px solid #E0E0E0', borderRadius: 4, padding: '3px 7px', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}
                      placeholder="0" />
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1F1F1F', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={13} />Total: {totalMin !== null ? fmtMin(totalMin) : '—'}
                </div>
              </div>
            )}

            {saveMutation.isError && (
              <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#C8202A', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999 }}>
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed — check code is unique'}
              </div>
            )}
          </div>
        </PreviewCtx.Provider>
        </SimCtx.Provider>
      </ParallelCtx.Provider>
      </SequenceCtx.Provider>
      {showNewOpModal && (
        <NewOpModal
          onClose={() => setShowNewOpModal(false)}
          onCreated={() => setShowNewOpModal(false)}
        />
      )}
    </ExpandCtx.Provider>
    </EquipmentCtx.Provider>
    </WorkcenterCtx.Provider>
    </OpTypeCtx.Provider>
  )
}

// ── Export ─────────────────────────────────────────────────────

export function RoutingBuilder() {
  return (
    <ReactFlowProvider>
      <RoutingBuilderInner />
    </ReactFlowProvider>
  )
}
