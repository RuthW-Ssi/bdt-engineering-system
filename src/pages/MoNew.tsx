import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateMo, useMo, useUpdateMo } from '../hooks/useMo'
import { changeMoStatus, getZoneMo, getZoneHasBom } from '../api/mo'
import { useQuery } from '@tanstack/react-query'
import { AssemblyPicker } from '../components/mo/AssemblyPicker'
import { PreshopPanel } from '../components/mo/PreshopPanel'
import type { UploadedFile } from '../lib/preshopCombine'
import { RoutingPicker } from '../components/mo/RoutingPicker'
import { AssemblyFilterBar, DEFAULT_FILTER, type AssemblyFilter } from '../components/mo/AssemblyFilterBar'
import { StickySaveBar } from '../components/mo/StickySaveBar'
import { SHOP_TYPE_LABEL, type AssemblyPickerItem, type MoShopType, type PreshopAssembly } from '../api/mo'
import { preshopErrors } from '../lib/preshop'
import { usePermission } from '../hooks/usePermission'
import { toDatetimeLocal } from '../lib/datetimeLocal'

const PANEL: React.CSSProperties = { border: '1px solid #E8E8E8', borderRadius: 10, background: '#fff' }
const PANEL_SCROLL: React.CSSProperties = { ...PANEL, flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }
const FIELD_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#AAA',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 5,
}
const DATE_INPUT: React.CSSProperties = {
  width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  color: '#555', background: '#fff', border: '1px solid #D4D4D4',
}

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

  // MO type replaces the mark-prefix choice (2026-10-07).
  const [shopType, setShopType] = useState<MoShopType | null>(null)
  const [preshop, setPreshop] = useState<PreshopAssembly[]>([])
  const [uploadedFrom, setUploadedFrom] = useState<UploadedFile[]>([])
  const [selected, setSelected] = useState<Record<number, { item: AssemblyPickerItem; qty: number }>>({})
  const [routingId, setRoutingId] = useState<number | null>(null)
  const [filter, setFilter] = useState<AssemblyFilter>(DEFAULT_FILTER)
  const [routingName, setRoutingName] = useState<string | null>(null)
  const [planStart, setPlanStart] = useState('')
  const [planFinish, setPlanFinish] = useState('')

  // Project/zone scope the assembly list — changing either invalidates
  // whatever was already picked under the old scope (same reset selectPrefix
  // does for mark prefix, 2026-09-22).
  function patchFilter(patch: Partial<AssemblyFilter>) {
    setFilter(prev => ({ ...prev, ...patch }))
    if ('projectId' in patch || 'zoneId' in patch) {
      setSelected({})
      setPreshop([])
      setUploadedFrom([])
    }
  }

  // prefill once when editing (only DRAFT is editable — bounce otherwise)
  const seeded = useRef(false)
  useEffect(() => {
    if (!isEdit || !existing || seeded.current) return
    if (existing.status !== 'DRAFT') {
      navigate(`/mo/${editId}`, { replace: true })
      return
    }
    seeded.current = true
    setShopType(existing.shop_type ?? 'FULL_SHOP')
    setRoutingId(existing.routing_template_id)
    setRoutingName(existing.routing_template?.name ?? null)
    setPlanStart(toDatetimeLocal(existing.plan_start))
    setPlanFinish(toDatetimeLocal(existing.plan_finish))
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
    // Only prefill when the existing draft is unambiguously single-project/
    // zone — an older multi-project draft (predates this scoping rule) is
    // left unset so the user picks one explicitly rather than guessing.
    if (existing.project && existing.zone) {
      const p = existing.project, z = existing.zone
      setFilter(prev => ({ ...prev, projectId: p.id, projectName: p.name, zoneId: z.id, zoneLabel: z.label }))
    } else if (existing.projects_involved.length === 1 && existing.zones_involved.length === 1) {
      const p = existing.projects_involved[0]
      const z = existing.zones_involved[0]
      setFilter(prev => ({ ...prev, projectId: p.id, projectName: p.name, zoneId: z.id, zoneLabel: z.label }))
    }
  }, [isEdit, existing, editId, navigate])

  function selectType(t: MoShopType) {
    if (t === shopType) return
    if (isEdit) return // the type is fixed once the MO exists (2026-10-09) — it is in the MO code
    if ((Object.keys(selected).length || preshop.length) && !window.confirm('เปลี่ยน MO type จะล้าง assembly ที่เลือกไว้ ต้องการต่อไหม?')) return
    setShopType(t)
    setSelected({})
    setPreshop([])
    setUploadedFrom([])
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
  const canWrite = usePermission('orders', isEdit ? 'update' : 'create')
  // 1 zone = 1 MO (2026-10-07): a new MO can't take a zone another live MO holds.
  const { data: zoneMo } = useQuery({
    queryKey: ['mo', 'zone-check', filter.zoneId],
    queryFn: () => getZoneMo(filter.zoneId!),
    enabled: !isEdit && filter.zoneId != null,
  })
  // Full shop needs a real BOM in the zone (2026-10-08) — create and edit.
  const { data: zoneHasBom } = useQuery({
    queryKey: ['mo', 'zone-bom', filter.zoneId],
    queryFn: () => getZoneHasBom(filter.zoneId!),
    enabled: filter.zoneId != null,
  })
  const fullShopBlocked = zoneHasBom === false
  // …and a zone that has its real BOM takes no pre-shop (2026-10-09, user)
  const preshopBlocked = zoneHasBom === true
  useEffect(() => {
    // a new MO switched to a zone where its type isn't allowed drops the choice
    if (!isEdit && fullShopBlocked && shopType === 'FULL_SHOP') setShopType(null)
    if (!isEdit && preshopBlocked && shopType === 'PRE_SHOP') setShopType(null)
  }, [isEdit, fullShopBlocked, preshopBlocked, shopType])
  const zoneTaken = !isEdit && !!zoneMo
  const readyForAssemblies = !!shopType && !!filter.projectId && !!filter.zoneId && !zoneTaken
  const preshopInvalid = shopType === 'PRE_SHOP' && preshopErrors(preshop).length > 0
  // PRE_SHOP is created EMPTY (project, zone, plan; routing optional) — its
  // assemblies are uploaded on the MO page before it can be confirmed (2026-10-07).
  const isPreshopNew = !isEdit && shopType === 'PRE_SHOP'
  // PRE_SHOP (new or edit) saves without assemblies / routing — both are
  // required only to Confirm; FULL_SHOP needs both to save.
  // Edit (2026-10-08): only MO type, routing and plan — assemblies come in
  // through the MO page's Upload button.
  const editLines = existing?.assembly_lines ?? []
  // A routing is required to create or edit any MO (2026-10-08, user: "ห้ามสร้าง
  // หรือแก้ไขถ้าไม่ได้เลือก routing").
  const canSave = canWrite && readyForAssemblies && !!routingId && (isEdit || (shopType === 'PRE_SHOP' ? !preshopInvalid : lines.length > 0))
  const canConfirm = isEdit ? editLines.length > 0 && !!routingId : !isPreshopNew
  const totalAll = totalQty + preshop.reduce((s, a) => s + (Number(a.qty) || 0), 0)
  const saving = createMut.isPending || updateMut.isPending

  async function save(confirm: boolean) {
    if (!canSave || !shopType || !routingId) return
    const uploads = shopType === 'PRE_SHOP' && preshop.length ? preshop.map(a => ({ ...a, assembly_mark: a.assembly_mark.trim() })) : undefined
    const payload = {
      routing_template_id: routingId,
      // datetime-local's value has no timezone — new Date(...) reads it in
      // the browser's own local time, so .toISOString() converts it to an
      // unambiguous UTC instant before it leaves the client.
      plan_start: planStart ? new Date(planStart).toISOString() : undefined,
      plan_finish: planFinish ? new Date(planFinish).toISOString() : undefined,
      assembly_lines: lines.map(l => ({ bom_assembly_id: l.item.id, qty: l.qty })),
      preshop_assemblies: uploads,
    }
    try {
      if (isEdit && editId) {
        await updateMut.mutateAsync({ routing_template_id: payload.routing_template_id, plan_start: payload.plan_start, plan_finish: payload.plan_finish })
        if (confirm) await changeMoStatus(editId, { to_status: 'CONFIRMED', reason: 'Confirmed on edit' })
        navigate(`/mo/${editId}`)
      } else {
        const mo = await createMut.mutateAsync({
          ...payload, shop_type: shopType, confirm,
          project_id: filter.projectId ?? undefined, zone_id: filter.zoneId ?? undefined,
        })
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
          {/* Left col — Select By + MO Type */}
          <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 10 }}>
            <div style={{ flexShrink: 0 }}>
              <ColHead n={1} title="Select By" />
              {isEdit
                ? <div style={{ ...PANEL, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div><div style={FIELD_LABEL}>Project</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{filter.projectName ?? '—'}</div></div>
                    <div><div style={FIELD_LABEL}>Zone</div><div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{filter.zoneLabel ?? '—'}</div></div>
                  </div>
                : <AssemblyFilterBar filter={filter} onChange={patchFilter} />}
              {zoneTaken && (
                <div style={{ marginTop: 8, background: '#FCEBEB', color: '#C8202A', fontSize: 12, padding: '8px 10px', borderRadius: 6, lineHeight: 1.45 }}>
                  Zone นี้มี <Link to={`/mo/${zoneMo!.id}`} style={{ fontWeight: 700, textDecoration: 'underline' }}>{zoneMo!.mo_code}</Link> อยู่แล้ว — 1 zone ได้ 1 MO
                  <div style={{ color: '#8A2A0D' }}>เพิ่ม assembly ใน MO เดิม หรือยกเลิก MO นั้นก่อน</div>
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              <ColHead n={2} title="MO Type" hint={isEdit ? 'เปลี่ยนไม่ได้หลังสร้าง' : undefined} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <TypeCard active={shopType === 'PRE_SHOP'} disabled={isEdit || preshopBlocked} blockedNote={!isEdit && preshopBlocked ? 'Zone นี้มี BOM แล้ว — ใช้ Full shop แทน' : undefined} title="Pre-shop drawing" desc="ยังไม่มี shop drawing เต็ม · อัปโหลด Dispatch Note / Pre-shop drawing · เทียบกับ BOM เมื่อ BOM มา · เพิ่ม Op 000 Build-up(Pre-Shop)" onClick={() => selectType('PRE_SHOP')} />
                <TypeCard active={shopType === 'FULL_SHOP'} disabled={isEdit || fullShopBlocked} title="Full shop drawing" desc="แบบเดิม · เลือก assembly จาก BOM ที่อัปโหลดแล้ว" onClick={() => selectType('FULL_SHOP')}
                  blockedNote={!isEdit && fullShopBlocked ? 'Zone นี้ยังไม่มี BOM — เลือกไม่ได้' : undefined} />
              </div>
            </div>
          </div>

          {/* 3. Assemblies */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ColHead n={3} title="Assemblies" hint={isEdit ? 'เพิ่ม/แก้ที่ปุ่ม Upload ในหน้า MO' : readyForAssemblies ? (shopType === 'PRE_SHOP' ? 'แก้ได้ทุกช่อง' : 'qty ≤ remaining') : undefined} />
            <div style={PANEL_SCROLL}>
              {isEdit
                ? <EditAssemblies lines={editLines} />
                : !readyForAssemblies
                ? <PickFirst label={!filter.projectId || !filter.zoneId ? 'Select a project & zone first' : zoneTaken ? 'Zone นี้มี MO อยู่แล้ว' : 'เลือก MO type ก่อน'} />
                : isPreshopNew
                  ? <PreshopEmptyNote />
                  : shopType === 'PRE_SHOP'
                  ? <PreshopPanel assemblies={preshop} onChange={setPreshop} uploadedFrom={uploadedFrom} onUploadedFrom={setUploadedFrom} />
                  : <AssemblyPicker markPrefix={null} selected={selected} onSetQty={setQty} filter={filter} />}
            </div>
          </div>

          {/* 4. Routing */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ColHead n={4} title="Routing" hint={routingId ? undefined : 'ต้องเลือกก่อนบันทึก'} />
            <div style={PANEL_SCROLL}>
              {shopType
                ? <RoutingPicker value={routingId} preshop={shopType === 'PRE_SHOP'} onChange={(rid, name) => { setRoutingId(rid); setRoutingName(name) }} />
                : <PickFirst label="เลือก MO type ก่อน" />}
            </div>
            <div style={{ marginTop: 10, flexShrink: 0 }}>
              <ColHead n={5} title="Plan" />
            </div>
            <div style={{ ...PANEL, flexShrink: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={FIELD_LABEL}>Plan Start</div>
                <input type="datetime-local" value={planStart} onChange={e => setPlanStart(e.target.value)} style={DATE_INPUT} />
              </div>
              <div>
                <div style={FIELD_LABEL}>Plan Finish</div>
                <input type="datetime-local" value={planFinish} min={planStart || undefined} onChange={e => setPlanFinish(e.target.value)} style={DATE_INPUT} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <StickySaveBar
        typeLabel={shopType ? SHOP_TYPE_LABEL[shopType] : null}
        assemblyCount={lines.length + preshop.length}
        totalQty={Number(totalAll.toFixed(3))}
        routingName={routingName}
        canSave={canSave}
        saving={saving}
        onCancel={() => navigate(isEdit ? `/mo/${editId}` : '/mo')}
        onSaveDraft={() => save(false)}
        onSaveConfirm={canConfirm ? () => save(true) : undefined}
      />
    </div>
  )
}

function EditAssemblies({ lines }: { lines: { id: number; qty: string | number; bom_assembly: { assembly_mark: string } }[] }) {
  if (!lines.length) {
    return (
      <div className="rounded-lg border border-molten-100 bg-molten-50 text-molten-600" style={{ padding: '10px 12px', fontSize: 13 }}>
        ยังไม่มี assembly — บันทึกแล้วกด <strong>Upload</strong> ที่หน้า MO เพื่อเพิ่มข้อมูล
      </div>
    )
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ color: '#8E8E8E', fontSize: 11, textAlign: 'left' }}>
          <th style={{ padding: '6px 8px', fontWeight: 600 }}>ASSEMBLY MARK</th>
          <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>QTY</th>
        </tr>
      </thead>
      <tbody>
        {lines.map(l => (
          <tr key={l.id} style={{ borderTop: '1px solid #E0E0E0' }}>
            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1F1F1F' }}>{l.bom_assembly.assembly_mark}</td>
            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(l.qty)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PreshopEmptyNote() {
  return (
    <div style={{ border: '1px dashed #C9D3DE', background: '#F6F8FA', borderRadius: 8, padding: '18px 16px', color: '#41566F', fontSize: 13, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>MO Pre-shop จะสร้างแบบว่าง (Draft)</div>
      <div>1. เลือก <strong>routing</strong> (ต้องเลือก) แล้วกด <strong>Save as Draft</strong> — ใช้ project, zone, routing และแผนวันที่</div>
      <div>2. ที่หน้า MO กด <strong>Upload</strong> แล้วเลือก Dispatch Note, Pre-shop drawing หรือทั้ง 2 อย่าง</div>
      <div>3. กด <strong>Confirm</strong> แล้วเริ่มงานได้</div>
    </div>
  )
}

function TypeCard({ active, disabled, title, desc, onClick, blockedNote }: { active: boolean; disabled: boolean; title: string; desc: string; onClick: () => void; blockedNote?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled && !active} title={blockedNote}
      style={{
        textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${active ? '#C8202A' : '#E8E8E8'}`, background: active ? '#FCEBEB' : '#fff', opacity: disabled && !active ? 0.45 : 1,
      }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: active ? '#C8202A' : '#1A1A1A' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#777', marginTop: 3, lineHeight: 1.4 }}>{desc}</div>
      {blockedNote && <div className="text-molten-600" style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{blockedNote}</div>}
    </button>
  )
}

function PickFirst({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 160, color: '#B0B0B0', fontSize: 13, border: '1px dashed #DDD', borderRadius: 8 }}>
      {label}
    </div>
  )
}
