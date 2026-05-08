import { useState, useEffect } from 'react'
import { Plus, Loader2, ChevronDown, GripVertical, Check, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useActiveProject } from '../context/ProjectContext'
import { useProjectZones, useCreateZone, useUpdateZone } from '../hooks/useProjectZones'
import { useSubZones, useCreateSubZone, useDeleteSubZone } from '../hooks/useSubZones'
import type { ProjectZoneDTO } from '../api/types'
import type { CreateZonePayload } from '../api/project-zones'

// ── Sortable zone row ───────────────────────────────────────────
function SortableZoneRow({
  zone,
  index,
  expandedZone,
  setExpandedZone,
  subZones,
  onAddSub,
  onDeleteSub,
  reorderMode,
}: {
  zone: any
  index: number
  expandedZone: number | null
  setExpandedZone: (id: number | null) => void
  subZones: any[]
  onAddSub: (zoneId: number) => void
  onDeleteSub: (id: number) => void
  reorderMode: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: zone.id })

  const isActive = expandedZone === zone.id

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        border: `1px solid ${reorderMode ? '#C8202A' : isActive ? '#C8202A' : '#E0E0E0'}`,
        borderRadius: 6,
        background: isDragging ? '#FEF6F6' : reorderMode ? '#FAFAFA' : '#fff',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => !reorderMode && setExpandedZone(isActive ? null : zone.id)}
        style={{ padding: '12px 16px', cursor: reorderMode ? 'default' : 'pointer', background: !reorderMode && isActive ? '#FEF6F6' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {reorderMode && (
            <div
              {...attributes}
              {...listeners}
              style={{ cursor: 'grab', color: '#C2C2C2', display: 'flex', alignItems: 'center', touchAction: 'none' }}
              onClick={e => e.stopPropagation()}
            >
              <GripVertical size={16} />
            </div>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: reorderMode ? '#C8202A' : isActive ? '#C8202A' : '#8E8E8E', borderRadius: 4, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>
            {index + 1}
          </span>
          <span style={{ fontWeight: 700, color: !reorderMode && isActive ? '#C8202A' : '#1A1A1A', fontFamily: 'monospace', fontSize: 13 }}>{zone.code}</span>
          <span style={{ color: '#555', fontSize: 13 }}>{zone.label}</span>
          {!reorderMode && zone.sub_zones?.length > 0 && (
            <span style={{ fontSize: 11, background: '#EEF2FF', borderRadius: 4, padding: '2px 7px', color: '#4F6EF7' }}>
              {zone.sub_zones.length} sub-zones
            </span>
          )}
        </div>
        {!reorderMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onAddSub(zone.id) }}
              style={{ fontSize: 12, color: '#C8202A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={12} />Add Sub-zone
            </button>
            <ChevronDown size={16} style={{ color: '#8E8E8E', transform: isActive ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </div>
        )}
      </div>

      {!reorderMode && isActive && (
        <div style={{ borderTop: '1px solid #F0F0F0', padding: '8px 16px 12px 16px' }}>
          {!subZones || subZones.length === 0 ? (
            <p style={{ fontSize: 12, color: '#8E8E8E', margin: 0 }}>ยังไม่มี sub-zone — กด "Add Sub-zone" เพื่อเพิ่ม</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {subZones.map(sz => (
                <div key={sz.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#F8F8F8', borderRadius: 4 }}>
                  <span style={{ fontSize: 13, color: '#333' }}>
                    <span style={{ fontWeight: 500 }}>{sz.code ?? '—'}</span>
                    {sz.code && <span style={{ color: '#8E8E8E', margin: '0 8px' }}>·</span>}
                    {sz.name}
                  </span>
                  <button onClick={() => onDeleteSub(sz.id)} style={{ fontSize: 11, color: '#C8202A', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Archive
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────
export function ZoneList() {
  const { activeProject } = useActiveProject()
  const projectId = activeProject?.id ?? null

  const { data: zones, isLoading: zonesLoading } = useProjectZones(projectId ?? undefined)
  const zoneList: ProjectZoneDTO[] = (zones as any) ?? []

  const [expandedZone, setExpandedZone] = useState<number | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [orderedIds, setOrderedIds] = useState<number[]>([])
  const [savingReorder, setSavingReorder] = useState(false)

  const [zoneModal, setZoneModal] = useState(false)
  const [zoneForm, setZoneForm] = useState<Partial<CreateZonePayload>>({})
  const [zoneTouched, setZoneTouched] = useState(false)

  const [subModal, setSubModal] = useState<{ open: boolean; zoneId: number | null }>({ open: false, zoneId: null })
  const [subForm, setSubForm] = useState({ name: '', code: '' })

  useEffect(() => {
    if (zoneList.length > 0) setExpandedZone(zoneList[0].id)
    else setExpandedZone(null)
  }, [projectId, zoneList.length])

  useEffect(() => { setReorderMode(false) }, [projectId])

  const createZoneMut = useCreateZone(projectId ?? 0)
  const updateZoneMut = useUpdateZone(projectId ?? 0)
  const { data: subZones } = useSubZones(expandedZone)
  const createSubMut = useCreateSubZone(subModal.zoneId ?? 0, projectId ?? undefined)
  const deleteSubMut = useDeleteSubZone(expandedZone ?? 0, projectId ?? undefined)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function enterReorder() {
    setOrderedIds(zoneList.map(z => z.id))
    setReorderMode(true)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setOrderedIds(prev => {
        const oldIdx = prev.indexOf(active.id as number)
        const newIdx = prev.indexOf(over.id as number)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  async function saveReorder() {
    setSavingReorder(true)
    await Promise.all(
      orderedIds.map((id, idx) =>
        updateZoneMut.mutateAsync({ zoneId: id, payload: { erection_sequence: idx + 1 } })
      )
    )
    setSavingReorder(false)
    setReorderMode(false)
  }

  function openZoneModal() {
    const nextSeq = zoneList.length > 0
      ? Math.max(...zoneList.map(z => z.erection_sequence ?? 0)) + 1
      : 1
    setZoneForm({ code: '', label: '', erection_sequence: nextSeq })
    setZoneTouched(false)
    setZoneModal(true)
  }

  async function handleCreateZone() {
    setZoneTouched(true)
    if (!zoneForm.code?.trim() || !zoneForm.label?.trim() || !projectId) return
    const created = await createZoneMut.mutateAsync(zoneForm as CreateZonePayload)
    setZoneModal(false)
    setExpandedZone(created.id)
  }

  async function handleCreateSub() {
    if (!subForm.name || !subModal.zoneId) return
    await createSubMut.mutateAsync({ name: subForm.name, code: subForm.code || undefined })
    setSubModal({ open: false, zoneId: null })
    setSubForm({ name: '', code: '' })
  }

  // Build ordered zone objects for render
  const displayZones = reorderMode
    ? orderedIds.map(id => zoneList.find(z => z.id === id)!).filter(Boolean)
    : zoneList

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Zones</span>
          {activeProject && (
            <>
              <span style={{ color: '#C2C2C2' }}>·</span>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#C8202A' }}>{activeProject.project_code}</span>
              <span style={{ fontSize: 13, color: '#8E8E8E' }}>{activeProject.name}</span>
            </>
          )}
        </div>
        {activeProject && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {reorderMode ? (
              <>
                <button
                  onClick={() => setReorderMode(false)}
                  style={{ height: 36, padding: '0 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <X size={14} />ยกเลิก
                </button>
                <button
                  onClick={saveReorder}
                  disabled={savingReorder}
                  style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: savingReorder ? '#C2C2C2' : '#1A7F4B', color: '#fff', cursor: savingReorder ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Check size={14} />{savingReorder ? 'กำลังบันทึก...' : 'บันทึกลำดับ'}
                </button>
              </>
            ) : (
              <>
                {zoneList.length > 1 && (
                  <button
                    onClick={enterReorder}
                    style={{ height: 36, padding: '0 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#555' }}
                  >
                    <GripVertical size={14} />จัดลำดับ
                  </button>
                )}
                <button
                  onClick={openZoneModal}
                  style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: '#C8202A', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={14} />เพิ่ม Zone
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Zone list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!projectId ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            เลือก Project จาก dropdown ด้านบนก่อน
          </div>
        ) : zonesLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : zoneList.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            ไม่พบโซนในโปรเจกต์นี้
          </div>
        ) : (
          <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reorderMode && (
              <p style={{ fontSize: 12, color: '#8E8E8E', marginBottom: 4 }}>
                ลากเพื่อเรียงลำดับ — ตัวเลขจะอัปเดตตามตำแหน่ง กด <strong>บันทึกลำดับ</strong> เพื่อยืนยัน
              </p>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayZones.map(z => z.id)} strategy={verticalListSortingStrategy}>
                {displayZones.map((zone, index) => (
                  <SortableZoneRow
                    key={zone.id}
                    zone={zone}
                    index={index}
                    expandedZone={expandedZone}
                    setExpandedZone={setExpandedZone}
                    subZones={expandedZone === zone.id ? (subZones ?? []) : []}
                    onAddSub={id => { setSubModal({ open: true, zoneId: id }); setExpandedZone(id) }}
                    onDeleteSub={id => deleteSubMut.mutate(id)}
                    reorderMode={reorderMode}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* Add Zone Modal */}
      {zoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 460, boxShadow: '0 4px 24px rgba(0,0,0,0.16)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>เพิ่ม Zone</h2>
            <p style={{ fontSize: 12, color: '#8E8E8E', marginBottom: 20 }}>
              Project: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#C8202A' }}>{activeProject?.project_code}</span> · {activeProject?.name}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Zone Code <span style={{ color: '#C8202A' }}>*</span></label>
                <input
                  value={zoneForm.code ?? ''}
                  onChange={e => setZoneForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="เช่น A1, WH"
                  style={{ padding: '7px 10px', fontSize: 13, border: `1px solid ${zoneTouched && !zoneForm.code?.trim() ? '#C8202A' : '#C2C2C2'}`, borderRadius: 4, fontFamily: 'monospace' }}
                />
                {zoneTouched && !zoneForm.code?.trim() && <span style={{ fontSize: 11, color: '#C8202A' }}>กรุณากรอก Code</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Label <span style={{ color: '#C8202A' }}>*</span></label>
                <input
                  value={zoneForm.label ?? ''}
                  onChange={e => setZoneForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="เช่น โรงงาน Block A1"
                  style={{ padding: '7px 10px', fontSize: 13, border: `1px solid ${zoneTouched && !zoneForm.label?.trim() ? '#C8202A' : '#C2C2C2'}`, borderRadius: 4 }}
                />
                {zoneTouched && !zoneForm.label?.trim() && <span style={{ fontSize: 11, color: '#C8202A' }}>กรุณากรอก Label</span>}
              </div>
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 24 }}>
              <button onClick={() => setZoneModal(false)} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                ยกเลิก
              </button>
              <button
                onClick={handleCreateZone}
                disabled={createZoneMut.isPending}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: createZoneMut.isPending ? '#C2C2C2' : '#C8202A', color: '#fff', cursor: createZoneMut.isPending ? 'not-allowed' : 'pointer' }}
              >
                {createZoneMut.isPending ? 'กำลังสร้าง...' : 'สร้าง Zone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-zone Modal */}
      {subModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 360 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>New Sub-zone</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Code (optional)</label>
                <input value={subForm.code} onChange={e => setSubForm(f => ({ ...f, code: e.target.value }))} style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Name *</label>
                <input value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} required style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }} />
              </div>
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
              <button onClick={() => setSubModal({ open: false, zoneId: null })} style={{ padding: '7px 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateSub} disabled={!subForm.name || createSubMut.isPending} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: !subForm.name ? '#C2C2C2' : '#C8202A', color: '#fff', cursor: !subForm.name ? 'not-allowed' : 'pointer' }}>
                {createSubMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
