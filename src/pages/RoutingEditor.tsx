import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, CheckCheck, Send, GripVertical, MoreHorizontal,
  Building2, Edit2, Copy, Trash2, AlertCircle, CheckCircle,
  PlusCircle, Plus, X, Save, Clock, ListOrdered, User, Calendar,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'

import { useRoutingStore } from '../store/routingStore'
import { StatusPill } from '../components/ui/StatusPill'
import { OpBadge } from '../components/ui/OpBadge'
import { OP_META } from '../data/meta'
import { fmtTime, fmtDate } from '../data/utils'
import type { OpCode, RoutingStep } from '../types'

// ── Sortable Step Row ──────────────────────────────────────────

interface StepRowProps {
  step: RoutingStep
  isEditing: boolean
  isDeleteConfirm: boolean
  validateState: 'pass' | 'fail' | null
  onEdit: () => void
  onSaveEdit: (patch: Partial<RoutingStep>) => void
  onCancelEdit: () => void
  onDuplicate: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

function SortableStepRow(props: StepRowProps) {
  const { step, isEditing, isDeleteConfirm, validateState } = props
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const [editOp, setEditOp] = useState<OpCode>(step.op_code)
  const [editWC, setEditWC] = useState(step.work_center)
  const [editTime, setEditTime] = useState(step.std_time_min)
  const [editNote, setEditNote] = useState(step.note)

  const isError = validateState === 'fail' && !step.work_center
  const isValidated = validateState === 'pass'

  const rowBorder = isEditing
    ? '1.5px solid #185FA5'
    : isError
    ? '1.5px solid #F4AEAE'
    : isValidated
    ? '1px solid #C0DD97'
    : '1px solid #E0E0E0'

  const rowBg = isEditing ? 'white' : isError ? '#FCEBEB' : 'white'
  const rowShadow = isEditing ? '0 0 0 3px #E6F1FB' : isDragging ? '0 8px 24px rgba(0,0,0,0.14)' : undefined

  if (isDeleteConfirm) {
    return (
      <div style={{ background: 'white', border: '1.5px solid #F4AEAE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 16, margin: '4px 0 4px 24px' }}>
        <div className="flex items-start gap-3 mb-3">
          <AlertCircle size={20} style={{ color: '#C8202A', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>ลบขั้นตอน step {step.step_no}?</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{step.op_code} — {step.work_center || '(ไม่มี work center)'}</div>
            <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 6 }}>step_no ที่เหลือจะถูก reorder อัตโนมัติ</div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={props.onDeleteCancel} className="rounded-md hover:bg-chrome-50" style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 500, color: '#555', border: '1px solid #E0E0E0' }}>ยกเลิก</button>
          <button onClick={props.onDeleteConfirm} className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
            <Trash2 size={14} />ลบ
          </button>
        </div>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={{ ...style, border: rowBorder, borderRadius: 8, background: rowBg, boxShadow: rowShadow, margin: '4px 0', padding: '14px 12px' }}>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#555', background: '#F5F5F5', borderRadius: 4, padding: '2px 8px' }}>{step.step_no}</span>
          <select
            value={editOp}
            onChange={e => setEditOp(e.target.value as OpCode)}
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 34, padding: '0 10px', fontSize: 13, minWidth: 200 }}
          >
            {(Object.keys(OP_META) as OpCode[]).map(op => (
              <option key={op} value={op}>{OP_META[op].label}</option>
            ))}
          </select>
          <input
            value={editWC}
            onChange={e => setEditWC(e.target.value)}
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 34, padding: '0 10px', fontSize: 13, width: 220 }}
            placeholder="เช่น เครื่องตัดพลาสม่า #2"
          />
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={999}
              value={editTime}
              onChange={e => setEditTime(Number(e.target.value))}
              className="border border-chrome-200 rounded-md bg-white font-mono focus:outline-none focus:border-steel-600"
              style={{ height: 34, padding: '0 10px', fontSize: 13, width: 72 }}
            />
            <span style={{ fontSize: 12, color: '#8E8E8E' }}>นาที</span>
          </div>
          <button
            onClick={() => props.onSaveEdit({ op_code: editOp, work_center: editWC, std_time_min: editTime, note: editNote })}
            className="rounded-md text-white flex items-center gap-1.5"
            style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
          >
            <Save size={14} />บันทึก
          </button>
          <button onClick={props.onCancelEdit} className="rounded-md hover:bg-chrome-50" style={{ height: 34, padding: '0 12px', fontSize: 13, color: '#555', border: '1px solid #E0E0E0' }}>ยกเลิก</button>
        </div>
        <input
          value={editNote}
          onChange={e => setEditNote(e.target.value)}
          className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600 w-full"
          style={{ height: 34, padding: '0 10px', fontSize: 13, boxSizing: 'border-box' }}
          placeholder="หมายเหตุ (ไม่บังคับ)"
        />
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: '24px 52px 180px 1fr 160px 80px 40px',
        alignItems: 'center',
        gap: '0 8px',
        padding: '0 12px',
        height: 56,
        background: rowBg,
        border: rowBorder,
        borderRadius: 8,
        margin: '4px 0',
        boxShadow: rowShadow,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="flex items-center cursor-grab hover:text-chrome-600" style={{ color: '#C2C2C2' }}>
        <GripVertical size={16} />
      </div>

      {/* Step no */}
      <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#555', background: '#F5F5F5', borderRadius: 4, textAlign: 'center', padding: '2px 8px' }}>
        {step.step_no}
      </div>

      {/* Op badge */}
      <div><OpBadge op={step.op_code} /></div>

      {/* Name + note */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1F1F1F' }}>{step.name_th}</div>
        {step.note && <div style={{ fontSize: 12, color: '#8E8E8E' }}>{step.note}</div>}
      </div>

      {/* Work center */}
      <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: '#555' }}>
        <Building2 size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} />
        {step.work_center
          ? <span style={{ lineHeight: 1.35 }}>{step.work_center}</span>
          : <span style={{ color: '#EE9B9B' }}>ไม่มี work center</span>
        }
      </div>

      {/* Time */}
      <div>
        <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3A' }}>{step.std_time_min} นาที</div>
        <div style={{ fontSize: 10, color: '#8E8E8E' }}>std</div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center relative">
        {isValidated && <CheckCircle size={16} style={{ color: '#639922' }} />}
        {isError && <AlertCircle size={16} style={{ color: '#C8202A' }} />}
        {!isValidated && !isError && (
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
              className="flex items-center justify-center rounded hover:bg-chrome-50"
              style={{ width: 28, height: 28, color: '#8E8E8E' }}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full bg-white border border-chrome-100 rounded-lg shadow-dropdown"
                style={{ zIndex: 30, minWidth: 140, padding: 4 }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button onClick={() => { setMenuOpen(false); props.onEdit() }} className="w-full flex items-center gap-2 hover:bg-chrome-50 rounded-md" style={{ padding: '8px 12px', fontSize: 13, color: '#1F1F1F' }}>
                  <Edit2 size={14} style={{ color: '#555' }} />แก้ไข
                </button>
                <button onClick={() => { setMenuOpen(false); props.onDuplicate() }} className="w-full flex items-center gap-2 hover:bg-chrome-50 rounded-md" style={{ padding: '8px 12px', fontSize: 13, color: '#1F1F1F' }}>
                  <Copy size={14} style={{ color: '#555' }} />ทำซ้ำ
                </button>
                <button onClick={() => { setMenuOpen(false); props.onDeleteRequest() }} className="w-full flex items-center gap-2 hover:bg-chrome-50 rounded-md" style={{ padding: '8px 12px', fontSize: 13, color: '#C8202A' }}>
                  <Trash2 size={14} />ลบ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Add Step Panel ─────────────────────────────────────────────

function AddStepPanel({ onClose }: { onClose: () => void }) {
  const { addStep } = useRoutingStore()
  const [selectedOp, setSelectedOp] = useState<OpCode | null>(null)
  const [wc, setWc] = useState('')
  const [time, setTime] = useState(10)
  const [note, setNote] = useState('')

  const opKeys = Object.keys(OP_META) as OpCode[]

  return (
    <div style={{ border: '1.5px solid #185FA5', background: '#F0F7FF', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#185FA5', marginBottom: 10 }}>เลือก Operation:</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {opKeys.map(op => {
          const m = OP_META[op]
          const c = m.color
          const sel = selectedOp === op
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Icon = (LucideIcons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined
          return (
            <button
              key={op}
              onClick={() => setSelectedOp(op)}
              className="inline-flex items-center gap-1.5 rounded-md font-semibold transition-all"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                background: sel ? `${c}28` : `${c}18`,
                color: c,
                border: `${sel ? 2 : 1.5}px solid ${sel ? c : c + '30'}`,
              }}
            >
              {Icon && <Icon size={14} color={c} />}{op}
            </button>
          )
        })}
      </div>

      {selectedOp && (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <input
            value={wc}
            onChange={e => setWc(e.target.value)}
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 34, padding: '0 10px', fontSize: 13, width: 220 }}
            placeholder="Work Center เช่น สถานีเชื่อม #3"
          />
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={999}
              value={time}
              onChange={e => setTime(Number(e.target.value))}
              className="border border-chrome-200 rounded-md bg-white font-mono focus:outline-none focus:border-steel-600"
              style={{ height: 34, padding: '0 10px', fontSize: 13, width: 72 }}
              placeholder="นาที"
            />
            <span style={{ fontSize: 12, color: '#8E8E8E' }}>นาที</span>
          </div>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 34, padding: '0 10px', fontSize: 13, width: 200 }}
            placeholder="หมายเหตุ (ไม่บังคับ)"
          />
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <span className="font-mono" style={{ fontSize: 11, color: '#8E8E8E' }}>step_no จะถูก assign อัตโนมัติ</span>
        <span className="flex-1" />
        <button onClick={onClose} className="rounded-md hover:bg-chrome-50" style={{ height: 34, padding: '0 12px', fontSize: 13, color: '#555', border: '1px solid #E0E0E0' }}>ยกเลิก</button>
        {selectedOp && (
          <button
            onClick={() => { if (selectedOp) addStep(selectedOp, wc, time, note) }}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
          >
            <Plus size={14} />เพิ่มขั้นตอน
          </button>
        )}
      </div>
    </div>
  )
}

// ── Submit Modal ───────────────────────────────────────────────

function SubmitModal({ onClose, steps }: { onClose: () => void; steps: RoutingStep[] }) {
  const tt = steps.reduce((a, s) => a + s.std_time_min, 0)
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl" style={{ width: 440, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div className="flex items-start gap-3 mb-2">
          <Send size={24} style={{ color: '#C8202A', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>ส่งตรวจสอบ Routing</div>
            <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 4 }}>SA-00124 — SubAssembly คาน I-beam R1 ขวา</div>
          </div>
        </div>
        <div className="rounded-lg" style={{ background: '#FCEBEB', border: '1px solid #F4AEAE', padding: '14px 16px', margin: '16px 0' }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: '120px 1fr', fontSize: 13 }}>
            <span style={{ color: '#8A1520' }}>ชิ้นงาน:</span><span className="font-mono">SA-00124</span>
            <span style={{ color: '#8A1520' }}>ขั้นตอน:</span><span>{steps.length} steps</span>
            <span style={{ color: '#8A1520' }}>เวลารวม:</span><span className="font-mono">{tt} นาที ({fmtTime(tt)})</span>
            <span style={{ color: '#8A1520' }}>Work Centers:</span><span>{new Set(steps.map(s => s.work_center).filter(Boolean)).size} แห่ง</span>
            <span style={{ color: '#8A1520' }}>ผู้ส่ง:</span><span>somchai.k@ssi-steel.com</span>
            <span style={{ color: '#8A1520' }}>ส่งเมื่อ:</span><span>27 เม.ย. 2569 (ตอนนี้)</span>
          </div>
          <div style={{ fontSize: 12, color: '#8E8E8E', fontStyle: 'italic', marginTop: 10 }}>สถานะจะเปลี่ยนเป็น รอตรวจสอบ — Reviewer จะได้รับการแจ้งเตือน</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md hover:bg-chrome-50" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#555' }}>ยกเลิก</button>
          <button className="flex items-center gap-1.5 rounded-md text-white" style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
            <Send size={14} />ยืนยันส่ง
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Editor Page ───────────────────────────────────────────

export function RoutingEditor() {
  const navigate = useNavigate()
  const {
    selectedCode, steps, unsaved, validateState,
    editingStepId, addStepOpen, deleteConfirmId,
    setSteps, updateStep, duplicateStep, deleteStep,
    setEditingStep, setAddStepOpen, setDeleteConfirm, setValidateState,
  } = useRoutingStore()

  const [submitOpen, setSubmitOpen] = useState(false)

  const routing = useRoutingStore(s => s.routings.find(r => r.product_code === selectedCode))

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const tt = steps.reduce((a, s) => a + s.std_time_min, 0)
  const opsStr = steps.map(s => s.op_code).join('·')

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = steps.findIndex(s => s.id === active.id)
      const newIdx = steps.findIndex(s => s.id === over.id)
      const reordered = arrayMove(steps, oldIdx, newIdx).map((s, i) => ({ ...s, step_no: (i + 1) * 10 }))
      setSteps(reordered)
    }
  }

  function validate() {
    const hasSteps = steps.length > 0
    const allHaveWC = steps.every(s => s.work_center.trim())
    const allHaveTime = steps.every(s => s.std_time_min > 0)
    const hasQC = steps.some(s => s.op_code === 'QC')
    setValidateState(hasSteps && allHaveWC && allHaveTime && hasQC ? 'pass' : 'fail')
  }

  if (!routing) return null

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      {/* Page Header */}
      <div className="bg-white flex items-center sticky top-14 z-40 border-b border-chrome-100 px-5 gap-3" style={{ height: 56 }}>
        <button
          onClick={() => { navigate('/routings') }}
          className="flex items-center justify-center rounded-md hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{routing.product_code}</span>
        <span style={{ color: '#C2C2C2' }}>·</span>
        <span style={{ fontSize: 13, color: '#8E8E8E' }}>Routing Editor</span>
        <StatusPill status={routing.status} />

        <div className="flex-1 flex justify-center">
          {unsaved && (
            <span className="inline-flex items-center gap-1.5 rounded-full" style={{ background: '#FAEEDA', color: '#854F0B', padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>
              <Edit2 size={14} style={{ color: '#BA7517' }} />มีการเปลี่ยนแปลง
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={validate}
            className="flex items-center gap-1.5 rounded-md hover:bg-chrome-50"
            style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500, color: '#3A3A3A', border: '1px solid #C2C2C2' }}
          >
            <CheckCheck size={14} />Validate Routing
          </button>
          <button
            onClick={() => validateState === 'pass' && setSubmitOpen(true)}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{
              height: 40, padding: '0 20px', fontSize: 13, fontWeight: 600,
              background: '#C8202A', minWidth: 120, justifyContent: 'center',
              opacity: validateState !== 'pass' ? 0.4 : 1,
              cursor: validateState !== 'pass' ? 'not-allowed' : 'pointer',
            }}
          >
            <Send size={14} />ส่งตรวจสอบ
          </button>
        </div>
      </div>

      {/* Validate Panel */}
      {validateState && (
        <div style={{ borderBottom: '1px solid #E0E0E0', padding: '12px 20px', animation: 'none' }}>
          {validateState === 'pass' ? (
            <div className="rounded-lg flex items-start gap-3" style={{ background: '#EAF3DE', border: '1px solid #C0DD97', padding: '12px 16px' }}>
              <CheckCircle size={20} style={{ color: '#639922', flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1">
                <div style={{ fontSize: 14, fontWeight: 600, color: '#27500A' }}>Routing ผ่านการตรวจสอบ</div>
                <div className="mt-2 flex flex-col gap-1">
                  {['มีอย่างน้อย 1 ขั้นตอน', 'ทุก step มี work_center', 'ทุก step มีเวลา > 0', 'มี QC step อย่างน้อย 1 step'].map(c => (
                    <div key={c} className="flex items-center gap-2" style={{ fontSize: 13, color: '#27500A' }}>
                      <CheckCircle size={14} style={{ color: '#639922', flexShrink: 0 }} />{c}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setValidateState(null)} style={{ color: '#8E8E8E', padding: 2 }}><X size={16} /></button>
            </div>
          ) : (
            <div className="rounded-lg flex items-start gap-3" style={{ background: '#FCEBEB', border: '1px solid #F4AEAE', padding: '12px 16px' }}>
              <AlertCircle size={20} style={{ color: '#C8202A', flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1">
                <div style={{ fontSize: 14, fontWeight: 600, color: '#5C0D15' }}>พบข้อผิดพลาด</div>
                <div className="mt-2 flex flex-col gap-1">
                  {steps.filter(s => !s.work_center).map(s => (
                    <div key={s.id} className="flex items-center gap-2" style={{ fontSize: 13, color: '#8A1520' }}>
                      <X size={14} style={{ color: '#C8202A', flexShrink: 0 }} />step {s.step_no} ({s.op_code}): ไม่มี work_center
                    </div>
                  ))}
                  {!steps.some(s => s.op_code === 'QC') && (
                    <div className="flex items-center gap-2" style={{ fontSize: 13, color: '#8A1520' }}>
                      <X size={14} style={{ color: '#C8202A', flexShrink: 0 }} />ไม่มี QC step — ต้องมีอย่างน้อย 1
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setValidateState(null)} style={{ color: '#8E8E8E', padding: 2 }}><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      {/* Meta Bar */}
      <div className="flex items-center border-b border-chrome-100 px-5 gap-4" style={{ height: 40, background: '#F5F5F5', fontSize: 12, color: '#555', flexShrink: 0 }}>
        <span className="flex items-center gap-1.5"><ListOrdered size={14} style={{ color: '#8E8E8E' }} />{steps.length} ขั้นตอน</span>
        <span style={{ width: 1, height: 14, background: '#C2C2C2' }} />
        <span className="flex items-center gap-1.5"><Clock size={14} style={{ color: '#8E8E8E' }} />รวม {tt} นาที ({fmtTime(tt)})</span>
        <span style={{ width: 1, height: 14, background: '#C2C2C2' }} />
        <span className="flex items-center gap-1.5"><User size={14} style={{ color: '#8E8E8E' }} />{routing.updated_by}@ssi-steel.com</span>
        <span style={{ width: 1, height: 14, background: '#C2C2C2' }} />
        <span className="flex items-center gap-1.5"><Calendar size={14} style={{ color: '#8E8E8E' }} />แก้ไขล่าสุด: {fmtDate(routing.updated_at)}</span>
      </div>

      {/* Step List */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Column header */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px 52px 180px 1fr 160px 80px 40px', columnGap: 8, padding: '0 12px', height: 32, background: '#FAFAFA', borderBottom: '1px solid #E0E0E0', alignItems: 'center', flexShrink: 0 }}>
          {['', 'ลำดับ', 'Operation', 'ชื่อ/รายละเอียด', 'Work Center', 'เวลา', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {/* Scrollable */}
        <div className="scroll-thin" style={{ flex: 1, overflowY: 'auto', padding: '0 0 80px' }}>
          <div style={{ padding: '4px 12px' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {steps.map(step => (
                  <SortableStepRow
                    key={step.id}
                    step={step}
                    isEditing={editingStepId === step.id}
                    isDeleteConfirm={deleteConfirmId === step.id}
                    validateState={validateState}
                    onEdit={() => setEditingStep(step.id)}
                    onSaveEdit={(patch) => { updateStep(step.id, patch); setEditingStep(null) }}
                    onCancelEdit={() => setEditingStep(null)}
                    onDuplicate={() => duplicateStep(step.id)}
                    onDeleteRequest={() => setDeleteConfirm(step.id)}
                    onDeleteConfirm={() => deleteStep(step.id)}
                    onDeleteCancel={() => setDeleteConfirm(null)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Add step */}
            <div style={{ marginTop: 8 }}>
              {addStepOpen ? (
                <AddStepPanel onClose={() => setAddStepOpen(false)} />
              ) : (
                <button
                  onClick={() => setAddStepOpen(true)}
                  className="w-full flex items-center justify-center gap-2 transition-all hover:border-steel-600 hover:text-steel-600 hover:bg-blue-50"
                  style={{ height: 44, border: '2px dashed #C2C2C2', borderRadius: 8, cursor: 'pointer', color: '#8E8E8E', fontSize: 13, fontWeight: 500 }}
                >
                  <PlusCircle size={16} />เพิ่มขั้นตอน
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor Footer */}
      <div className="flex items-center sticky" style={{ bottom: 0, height: 40, background: '#1F1F1F', color: 'white', padding: '0 20px', gap: 16, fontSize: 12, zIndex: 30, flexShrink: 0 }}>
        <span className="flex items-center gap-1.5" style={{ color: '#8E8E8E' }}><ListOrdered size={14} />{steps.length} ขั้นตอน</span>
        <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
        <span className="flex items-center gap-1.5" style={{ color: '#8E8E8E' }}><Clock size={14} />รวม {tt} นาที</span>
        <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
        <span className="font-mono" style={{ color: '#8E8E8E', fontSize: 11 }}>op: {opsStr}</span>

        <div className="flex-1 text-center">
          {unsaved ? (
            <span className="flex items-center justify-center gap-1.5">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#BA7517', display: 'inline-block' }} />
              <span style={{ color: '#D9A75D', fontSize: 12 }}>ยังไม่ได้บันทึก</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#86C04B', display: 'inline-block' }} />
              <span style={{ color: '#86C04B', fontSize: 12 }}>บันทึกแล้ว</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="inline-flex items-center justify-center rounded-full font-mono" style={{ width: 24, height: 24, background: '#FCEBEB', color: '#C8202A', fontSize: 11, fontWeight: 600 }}>SK</span>
          <span style={{ color: '#8E8E8E' }}>Somchai K.</span>
          <span style={{ color: '#555' }}>แก้ไขเมื่อ {fmtDate(routing.updated_at)}</span>
        </div>
      </div>

      {submitOpen && <SubmitModal onClose={() => setSubmitOpen(false)} steps={steps} />}
    </div>
  )
}
