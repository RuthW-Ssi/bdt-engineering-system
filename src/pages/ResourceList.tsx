import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { Plus, X, Search, Loader2, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { PaginationBar } from '../components/PaginationBar'
import { useConfirm } from '../components/ui/ConfirmDialog'

const LIMIT = 10
import { useMachines } from '../hooks/useMachines'
import { useLaborSkills } from '../hooks/useLaborSkills'
import { MachineStatusPill } from '../components/machines/MachineStatusPill'
import { DaysSincePmBadge } from '../components/machines/DaysSincePmBadge'
import { createResource, updateResource } from '../api/machines'
import { createOperator, updateOperator, getSkills } from '../api/laborSkills'
import { consumeFormulasApi, FORMULA_CATEGORY_LABELS, type ConsumeFormula } from '../api/consumeFormulas'
import type { EquipmentStatus, Machine } from '../api/machines'
import type { Operator } from '../api/laborSkills'

type Tab = 'machine' | 'tool' | 'operator' | 'formula'

const TABS: { id: Tab; label: string }[] = [
  { id: 'machine',  label: 'Machine' },
  { id: 'tool',     label: 'Tool' },
  { id: 'operator', label: 'Operator' },
  { id: 'formula',  label: 'Formula' },
]

const STATUS_OPTIONS: { value: EquipmentStatus | ''; label: string }[] = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'OPERATIONAL', label: 'กำลังทำงาน' },
  { value: 'MAINTENANCE', label: 'ซ่อมบำรุง' },
  { value: 'REPAIR', label: 'ซ่อม' },
  { value: 'UNAVAILABLE', label: 'ไม่พร้อม' },
  { value: 'RETIRED', label: 'ปลดระวาง' },
]

type ModalState =
  | { tab: 'machine' | 'tool'; row?: Machine }
  | { tab: 'operator'; row?: Operator }
  | null

export function ResourceList() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('machine')
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | ''>('')
  const [nameSearch, setNameSearch] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [page, setPage] = useState(1)
  const [formulaModal, setFormulaModal] = useState<{ open: boolean; row?: ConsumeFormula } | null>(null)
  const qc = useQueryClient()
  const confirm = useConfirm()
  const formulaDeleteMutation = useMutation({
    mutationFn: (id: number) => consumeFormulasApi.remove(id),
    onSuccess: () => {
      toast.success('ลบสำเร็จ')
      qc.invalidateQueries({ queryKey: ['consume-formulas'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'ลบไม่สำเร็จ'),
  })

  const machineQuery = useMachines({ type: 'machine', name: nameSearch || undefined, status: statusFilter || undefined })
  const handlingQuery = useMachines({ type: 'handling', name: nameSearch || undefined, status: statusFilter || undefined })
  const laborQuery = useLaborSkills()
  const toolQuery = useMachines({ type: 'tool', name: nameSearch || undefined })

  const machineRows = useMemo(() => [
    ...(machineQuery.data ?? []),
    ...(handlingQuery.data ?? []),
  ], [machineQuery.data, handlingQuery.data])

  const operatorRows = useMemo(() => {
    const q = nameSearch.toLowerCase()
    return (laborQuery.data ?? []).filter(o =>
      !q || o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
    )
  }, [laborQuery.data, nameSearch])

  const formulaQuery = useQuery({ queryKey: ['consume-formulas'], queryFn: consumeFormulasApi.list, staleTime: 5 * 60 * 1000 })

  const formulaRows = useMemo(() => {
    const q = nameSearch.toLowerCase()
    return (formulaQuery.data ?? []).filter(f =>
      !q || f.name.toLowerCase().includes(q) || f.expr.toLowerCase().includes(q) || (f.category ?? '').toLowerCase().includes(q)
    )
  }, [formulaQuery.data, nameSearch])

  const isLoading =
    (activeTab === 'machine' && (machineQuery.isLoading || handlingQuery.isLoading)) ||
    (activeTab === 'operator' && laborQuery.isLoading) ||
    (activeTab === 'tool' && toolQuery.isLoading) ||
    (activeTab === 'formula' && formulaQuery.isLoading)

  const totalCount =
    activeTab === 'machine' ? machineRows.length :
    activeTab === 'tool' ? (toolQuery.data?.length ?? 0) :
    activeTab === 'formula' ? formulaRows.length :
    operatorRows.length

  // reset page when tab or filters change
  useEffect(() => { setPage(1) }, [activeTab, nameSearch, statusFilter])

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    setStatusFilter('')
    setNameSearch('')
    setModal(null)
  }

  const addLabel =
    activeTab === 'machine' ? 'Add Machine' :
    activeTab === 'tool' ? 'Add Tool' :
    activeTab === 'formula' ? 'Add Formula' : 'Add Operator'

  const allRows =
    activeTab === 'machine' ? machineRows :
    activeTab === 'tool' ? (toolQuery.data ?? []) :
    activeTab === 'operator' ? operatorRows :
    formulaRows
  const totalForPage = allRows.length
  const totalPages = Math.max(1, Math.ceil(totalForPage / LIMIT))
  const sliceStart = (page - 1) * LIMIT
  const sliceEnd = page * LIMIT

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F8F8F8', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E0E0E0',
        height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>Machine & Resources</div>
          <div style={{ fontSize: 11, color: '#9E9E9E' }}>จัดการทรัพยากรการผลิต — เครื่องจักร เครื่องมือ และ Operator</div>
        </div>
        <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
          {isLoading ? '...' : `${totalCount} items`}
        </span>
        {activeTab !== 'formula' && (
          <button
            onClick={() => setModal({ tab: activeTab as 'machine' | 'tool' | 'operator' })}
            style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} />{addLabel}
          </button>
        )}
        {activeTab === 'formula' && (
          <button
            onClick={() => setFormulaModal({ open: true })}
            style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} />Add Formula
          </button>
        )}
      </div>

      {/* ── Tab + Filter bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E0E0E0',
        padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16,
        flexShrink: 0, minHeight: 44,
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, height: 44, alignItems: 'stretch' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: '0 16px', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? '#C8202A' : '#8E8E8E',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '2px solid #C8202A' : '2px solid transparent',
                transition: 'color 0.1s, border-color 0.1s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: '#E0E0E0' }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#C2C2C2', pointerEvents: 'none' }} />
          <input
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส…"
            style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px 0 28px', height: 30, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 200, background: '#FAFAFA' }}
          />
        </div>

        {/* Status filter — machine tab only */}
        {activeTab === 'machine' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setStatusFilter(o.value as EquipmentStatus | '')}
                style={{
                  height: 26, padding: '0 10px', fontSize: 11, fontWeight: 600, borderRadius: 999,
                  border: '1px solid ' + (statusFilter === o.value ? '#C8202A' : '#D8D8D8'),
                  background: statusFilter === o.value ? '#FCEBEB' : '#fff',
                  color: statusFilter === o.value ? '#C8202A' : '#666', cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Loader2 size={20} style={{ color: '#C2C2C2', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {activeTab === 'machine' && (
              <MachineTable
                rows={machineRows.slice(sliceStart, sliceEnd)}
                onRowClick={id => navigate(`/machines/${id}`)}
                onEdit={row => setModal({ tab: 'machine', row })}
              />
            )}
            {activeTab === 'operator' && (
              <LaborTable
                operators={operatorRows.slice(sliceStart, sliceEnd)}
                onEdit={row => setModal({ tab: 'operator', row })}
              />
            )}
            {activeTab === 'tool' && (
              <ToolTable
                rows={(toolQuery.data ?? []).slice(sliceStart, sliceEnd)}
                onEdit={row => setModal({ tab: 'tool', row })}
              />
            )}
            {activeTab === 'formula' && (
              <FormulaTable
                rows={formulaRows.slice(sliceStart, sliceEnd)}
                onEdit={row => setFormulaModal({ open: true, row })}
                onDelete={async row => { const ok = await confirm({ title: `ลบ "${row.name}"?`, variant: 'danger', confirmLabel: 'ลบ' }); if (ok) formulaDeleteMutation.mutate(row.id) }}
              />
            )}
          </>
        )}
      </div>
      <PaginationBar page={page} totalPages={totalPages} total={totalForPage} limit={LIMIT} onChange={setPage} />

      {modal !== null && (
        modal.tab === 'operator'
          ? <OperatorModal row={modal.row} onClose={() => setModal(null)} />
          : <ResourceModal tab={modal.tab} row={(modal as { tab: 'machine' | 'tool'; row?: Machine }).row} onClose={() => setModal(null)} />
      )}
      {formulaModal?.open && (
        <FormulaModal row={formulaModal.row} onClose={() => setFormulaModal(null)} />
      )}
    </div>
  )
}

// ── Machine Table ─────────────────────────────────────────────────────────────
function MachineTable({ rows, onRowClick, onEdit }: {
  rows: ReturnType<typeof useMachines>['data'] & object[]
  onRowClick: (id: number) => void
  onEdit: (row: Machine) => void
}) {
  if (!rows.length) return <EmptyState label="ไม่พบข้อมูล Machine" />
  return (
    <>
      <ColHeader cols={['Code', 'ชื่อ', 'สถานะ', 'อายุ PM', '']}
        widths="140px 1fr 130px 110px 60px" />
      {rows.map(m => (
        <div
          key={m.id}
          style={rowCardStyle}
          onClick={() => onRowClick(m.id)}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; (e.currentTarget as HTMLElement).style.background = '#FAFAFA' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.background = '#fff' }}
        >
          <div style={gridStyle('140px 1fr 130px 110px 60px')}>
            <Cell><span style={monoStyle}>{m.code}</span></Cell>
            <Cell>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1F1F1F' }}>{m.name}</div>
                {(m.manufacturer || m.model) && (
                  <div style={{ fontSize: 11, color: '#9E9E9E', marginTop: 1 }}>{[m.manufacturer, m.model].filter(Boolean).join(' · ')}</div>
                )}
              </div>
            </Cell>
            <Cell><MachineStatusPill status={m.current_status} size="sm" /></Cell>
            <Cell><DaysSincePmBadge days={m.days_since_pm} /></Cell>
            <Cell>
              <button
                onClick={e => { e.stopPropagation(); onEdit(m) }}
                style={editBtnStyle}
              >แก้ไข</button>
            </Cell>
          </div>
        </div>
      ))}
    </>
  )
}

// ── Operator Table ────────────────────────────────────────────────────────────
function LaborTable({ operators, onEdit }: { operators: Operator[]; onEdit: (row: Operator) => void }) {
  if (!operators.length) return <EmptyState label="ไม่พบข้อมูล Operator" />
  return (
    <>
      <ColHeader cols={['Code', 'ชื่อ', 'สัญชาติ', 'ตำแหน่ง', 'Skills', '']}
        widths="180px 200px 90px 160px 1fr 60px" />
      {operators.map(r => (
        <div key={r.id} style={rowCardStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
          <div style={gridStyle('180px 200px 90px 160px 1fr 60px')}>
            <Cell><span style={monoStyle}>{r.code}</span></Cell>
            <Cell><span style={{ fontWeight: 600, fontSize: 13, color: '#1F1F1F' }}>{r.name}</span></Cell>
            <Cell>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                background: r.nationality === 'TH' ? '#F0FDF4' : '#EFF6FF',
                color: r.nationality === 'TH' ? '#16A34A' : '#1D4ED8',
                border: `1px solid ${r.nationality === 'TH' ? '#BBF7D0' : '#BFDBFE'}`,
              }}>{r.nationality ?? '—'}</span>
            </Cell>
            <Cell><span style={{ fontSize: 12, color: '#555' }}>{r.position_raw ?? '—'}</span></Cell>
            <Cell>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {r.skills.length === 0
                  ? <span style={{ fontSize: 12, color: '#C2C2C2' }}>—</span>
                  : r.skills.map(s => (
                    <span key={s.skill.id} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' }}>
                      {s.skill.name}{s.level ? ` (${s.level})` : ''}
                    </span>
                  ))
                }
              </div>
            </Cell>
            <Cell>
              <button onClick={() => onEdit(r)} style={editBtnStyle}>แก้ไข</button>
            </Cell>
          </div>
        </div>
      ))}
    </>
  )
}

// ── Tool Table ────────────────────────────────────────────────────────────────
function ToolTable({ rows, onEdit }: { rows: ReturnType<typeof useMachines>['data']; onEdit: (row: Machine) => void }) {
  if (!rows?.length) return <EmptyState label="ไม่พบข้อมูล Tool" />
  return (
    <>
      <ColHeader cols={['Code', 'ชื่อ', 'จำนวน', '']} widths="140px 1fr 100px 60px" />
      {rows.map(r => (
        <div key={r.id} style={rowCardStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
          <div style={gridStyle('140px 1fr 100px 60px')}>
            <Cell><span style={monoStyle}>{r.code}</span></Cell>
            <Cell><span style={{ fontWeight: 600, fontSize: 13, color: '#1F1F1F' }}>{r.name}</span></Cell>
            <Cell><span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{r.qty ?? '—'}</span></Cell>
            <Cell>
              <button onClick={() => onEdit(r)} style={editBtnStyle}>แก้ไข</button>
            </Cell>
          </div>
        </div>
      ))}
    </>
  )
}


// ── Resource Modal (Machine + Tool) ───────────────────────────────────────────
function ResourceModal({ tab, row, onClose }: { tab: 'machine' | 'tool'; row?: Machine; onClose: () => void }) {
  const qc = useQueryClient()
  const isTool = tab === 'tool'
  const isEdit = !!row

  const [form, setForm] = useState({
    type: row?.type ?? (isTool ? 'tool' : 'machine') as string,
    name: row?.name ?? '',
    location: row?.location ?? '',
    manufacturer: row?.manufacturer ?? '',
    model: row?.model ?? '',
    qty: row?.qty?.toString() ?? '',
  })
  const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }))

  const tabLabel = isTool ? 'Tool' : 'Machine'

  const mutation = useMutation({
    mutationFn: () => {
      const qty = form.qty !== '' ? Number(form.qty) : undefined
      return isEdit && row
        ? updateResource(row.id, { name: form.name || undefined, location: form.location || undefined,
            manufacturer: form.manufacturer || undefined, model: form.model || undefined, qty })
        : createResource({ type: form.type as 'machine' | 'handling' | 'tool',
            name: form.name, location: form.location || undefined,
            manufacturer: form.manufacturer || undefined, model: form.model || undefined, qty })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); onClose() },
  })

  return (
    <ModalOverlay onClose={onClose}>
      <div style={modalBoxStyle}>
        <ModalHeader title={isEdit ? `แก้ไข ${tabLabel}` : `เพิ่ม ${tabLabel}`} onClose={onClose} />
        <div style={formBodyStyle}>
          {!isTool && !isEdit && (
            <FormField label="ประเภท">
              <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
                <option value="machine">Machine</option>
                <option value="handling">Handling</option>
              </select>
            </FormField>
          )}
          <FormField label="ชื่อ *">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="ชื่อ..." style={inputStyle} autoFocus />
          </FormField>
          <FormField label="จำนวน">
            <input type="number" min={0} value={form.qty} onChange={e => set('qty', e.target.value)}
              placeholder="0" style={inputStyle} />
          </FormField>
          {!isTool && (
            <>
              <FormField label="พื้นที่ / Location">
                <input value={form.location} onChange={e => set('location', e.target.value)}
                  placeholder="โรงงาน A..." style={inputStyle} />
              </FormField>
              <FormField label="Manufacturer">
                <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                  placeholder="TRUMPF..." style={inputStyle} />
              </FormField>
              <FormField label="Model">
                <input value={form.model} onChange={e => set('model', e.target.value)}
                  placeholder="TruLaser 3030..." style={inputStyle} />
              </FormField>
            </>
          )}
        </div>
        {mutation.isError && <ErrMsg />}
        <ModalFooter onClose={onClose} onSave={() => mutation.mutate()} saving={mutation.isPending} disabled={!form.name.trim()} />
      </div>
    </ModalOverlay>
  )
}

// ── Operator Modal ────────────────────────────────────────────────────────────
const LEVEL_OPTIONS = ['A', 'B+', 'B', 'C']

// Parse legacy formats like "20/2/23" or "20/02/2023" → "YYYY-MM-DD" for <input type="date">
function toDateInputValue(raw: string): string {
  if (!raw) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // DD/MM/YY or DD/M/YY or DD/MM/YYYY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return ''
  const [, d, mo, y] = m
  const year = y.length === 2 ? (Number(y) < 50 ? `20${y}` : `19${y}`) : y
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function OperatorModal({ row, onClose }: { row?: Operator; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!row

  const [form, setForm] = useState({
    code: row?.code ?? '',
    name: row?.name ?? '',
    nationality: row?.nationality ?? 'TH',
    position_raw: row?.position_raw ?? '',
    start_raw: toDateInputValue(row?.start_raw ?? ''),
  })
  const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }))

  // skill selection state: { skill_id, name, level? }
  const [selectedSkills, setSelectedSkills] = useState<{ skill_id: number; name: string; level?: string }[]>(
    () => (row?.skills ?? []).map(s => ({ skill_id: s.skill.id, name: s.skill.name, level: s.level ?? undefined }))
  )
  const [pickSkillId, setPickSkillId] = useState<string>('')
  const [pickLevel, setPickLevel] = useState<string>('')

  const { data: allSkills = [] } = useQuery({ queryKey: ['skills'], queryFn: getSkills })

  const availableSkills = allSkills.filter(s => !selectedSkills.find(sel => sel.skill_id === s.id))

  function addSkill() {
    const id = Number(pickSkillId)
    if (!id) return
    const found = allSkills.find(s => s.id === id)
    if (!found) return
    setSelectedSkills(prev => [...prev, { skill_id: id, name: found.name, level: pickLevel || undefined }])
    setPickSkillId('')
    setPickLevel('')
  }

  function removeSkill(skill_id: number) {
    setSelectedSkills(prev => prev.filter(s => s.skill_id !== skill_id))
  }

  function setSkillLevel(skill_id: number, level: string) {
    setSelectedSkills(prev => prev.map(s => s.skill_id === skill_id ? { ...s, level: level || undefined } : s))
  }

  const skillPayload = selectedSkills.map(s => ({ skill_id: s.skill_id, ...(s.level ? { level: s.level } : {}) }))

  const mutation = useMutation({
    mutationFn: () => isEdit && row
      ? updateOperator(row.id, { code: form.code || undefined, name: form.name || undefined,
          nationality: form.nationality || undefined, position_raw: form.position_raw || undefined,
          start_raw: form.start_raw || undefined, skills: skillPayload })
      : createOperator({ code: form.code, name: form.name, nationality: form.nationality || undefined,
          position_raw: form.position_raw || undefined, start_raw: form.start_raw || undefined,
          skills: skillPayload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operators'] }); onClose() },
  })

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ ...modalBoxStyle, maxWidth: 520 }}>
        <ModalHeader title={isEdit ? 'แก้ไข Operator' : 'เพิ่ม Operator'} onClose={onClose} />
        <div style={formBodyStyle}>
          <FormField label="รหัส (Code) *">
            <input value={form.code} onChange={e => set('code', e.target.value)}
              placeholder="BPD2022-02/B-001" style={{ ...inputStyle, fontFamily: 'monospace' }} autoFocus />
          </FormField>
          <FormField label="ชื่อ *">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="นาย ..." style={inputStyle} />
          </FormField>
          <FormField label="สัญชาติ">
            <select value={form.nationality} onChange={e => set('nationality', e.target.value)} style={inputStyle}>
              <option value="TH">TH — ไทย</option>
              <option value="MM">MM — พม่า</option>
            </select>
          </FormField>
          <FormField label="ตำแหน่ง">
            <input value={form.position_raw} onChange={e => set('position_raw', e.target.value)}
              placeholder="ช่างเชื่อม B..." style={inputStyle} />
          </FormField>
          <FormField label="วันที่เริ่มงาน">
            <input type="date" value={form.start_raw} onChange={e => set('start_raw', e.target.value)}
              style={inputStyle} />
          </FormField>

          {/* Skill picker */}
          <FormField label="Skills">
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={pickSkillId} onChange={e => setPickSkillId(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}>
                <option value="">— เลือก Skill —</option>
                {availableSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={pickLevel} onChange={e => setPickLevel(e.target.value)}
                style={{ ...inputStyle, width: 72 }}>
                <option value="">-</option>
                {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button onClick={addSkill} disabled={!pickSkillId}
                style={{ padding: '0 12px', borderRadius: 6, border: 'none', background: pickSkillId ? '#1976D2' : '#E0E0E0',
                  color: pickSkillId ? '#fff' : '#9E9E9E', cursor: pickSkillId ? 'pointer' : 'default', fontSize: 13, fontWeight: 600 }}>
                + Add
              </button>
            </div>
            {/* Selected skill chips */}
            {selectedSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {selectedSkills.map(s => (
                  <div key={s.skill_id} style={{ display: 'flex', alignItems: 'center', gap: 4,
                    background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 999,
                    padding: '2px 6px 2px 10px', fontSize: 12, color: '#6D28D9' }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <select value={s.level ?? ''} onChange={e => setSkillLevel(s.skill_id, e.target.value)}
                      style={{ border: 'none', background: 'transparent', fontSize: 11, color: '#6D28D9',
                        cursor: 'pointer', padding: 0, outline: 'none' }}>
                      <option value="">-</option>
                      {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button onClick={() => removeSkill(s.skill_id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                        color: '#9E9E9E', display: 'flex', alignItems: 'center' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormField>
        </div>
        {mutation.isError && <ErrMsg />}
        <ModalFooter onClose={onClose} onSave={() => mutation.mutate()} saving={mutation.isPending} disabled={!form.code.trim() || !form.name.trim()} />
      </div>
    </ModalOverlay>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function ColHeader({ cols, widths }: { cols: string[]; widths: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: widths, gap: 12, padding: '0 16px', marginBottom: 4 }}>
      {cols.map((h, i) => (
        <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
      ))}
    </div>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>{children}</div>
}

function EmptyState({ label }: { label: string }) {
  return <div style={{ textAlign: 'center', padding: 48, fontSize: 13, color: '#8E8E8E' }}>{label}</div>
}

function ErrMsg() {
  return <div style={{ padding: '0 20px 12px', fontSize: 12, color: '#C8202A' }}>เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง</div>
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      {children}
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E0E0E0' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#1F1F1F' }}>{title}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9E9E9E', padding: 4, display: 'flex' }}>
        <X size={17} />
      </button>
    </div>
  )
}

function ModalFooter({ onClose, onSave, saving, disabled }: { onClose: () => void; onSave: () => void; saving: boolean; disabled: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid #E0E0E0' }}>
      <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #D8D8D8', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer' }}>
        ยกเลิก
      </button>
      <button
        onClick={onSave}
        disabled={disabled || saving}
        style={{ padding: '7px 20px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: disabled || saving ? 'not-allowed' : 'pointer', opacity: disabled || saving ? 0.5 : 1 }}
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{label}</label>
      {children}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const rowCardStyle: React.CSSProperties = {
  border: '1px solid #E8E8E8', borderRadius: 8, background: '#fff',
  padding: '0 16px', minHeight: 52, display: 'flex', alignItems: 'stretch',
  cursor: 'pointer', transition: 'box-shadow 0.1s, background 0.1s',
}
const monoStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, color: '#8E8E8E' }
const editBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid #D8D8D8', borderRadius: 6,
  padding: '3px 10px', fontSize: 11, color: '#555', cursor: 'pointer', whiteSpace: 'nowrap',
}
const modalBoxStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 10, width: 460,
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)', overflow: 'hidden',
}
const formBodyStyle: React.CSSProperties = { padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #E0E0E0',
  fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#FAFAFA',
}
const gridStyle = (cols: string): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: cols, gap: 12, width: '100%', alignItems: 'center', minHeight: 52,
})

// ── Expression Builder ────────────────────────────────────────────────────────
type ExprToken = { type: 'var'; val: string } | { type: 'op'; val: string } | { type: 'num'; val: string }

const EXPR_VARS = ['area', 'weight', 'length', 'width', 'height', 'thickness', 'qty']
const EXPR_OPS = [
  { label: '×', val: '*' }, { label: '÷', val: '/' },
  { label: '+', val: '+' }, { label: '−', val: '-' },
  { label: '(', val: '(' }, { label: ')', val: ')' },
]

function parseExprTokens(expr: string): ExprToken[] {
  const varSet = new Set(EXPR_VARS)
  const opSet = new Set(['+', '-', '*', '/', '(', ')'])
  return expr.trim().split(/\s+/).filter(Boolean).map(s => {
    if (varSet.has(s)) return { type: 'var' as const, val: s }
    if (opSet.has(s)) return { type: 'op' as const, val: s }
    return { type: 'num' as const, val: s }
  })
}

function tokensToExpr(tokens: ExprToken[]): string {
  return tokens.map(t => t.val).join(' ')
}

function ExprBuilder({ tokens, onChange }: { tokens: ExprToken[]; onChange: (t: ExprToken[]) => void }) {
  const [num, setNum] = useState('')

  const push = (tok: ExprToken) => onChange([...tokens, tok])
  const back = () => onChange(tokens.slice(0, -1))
  const insertNum = () => {
    const v = num.trim()
    if (v && !isNaN(Number(v))) { push({ type: 'num', val: v }); setNum('') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#ABABAB', letterSpacing: '0.07em' }}>VAR</span>
        {EXPR_VARS.map(v => (
          <button key={v} onClick={() => push({ type: 'var', val: v })}
            style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #FBBEBE', background: '#FFF5F5', color: '#C8202A', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', fontWeight: 700 }}>
            {v}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#ABABAB', letterSpacing: '0.07em' }}>OP</span>
        {EXPR_OPS.map(op => (
          <button key={op.val} onClick={() => push({ type: 'op', val: op.val })}
            style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #E0E0E0', background: '#F5F5F5', color: '#444', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {op.label}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
          <input value={num} onChange={e => setNum(e.target.value)} onKeyDown={e => e.key === 'Enter' && insertNum()}
            style={{ width: 72, padding: '5px 8px', border: '1px solid #D4D4D4', borderRadius: 5, fontSize: 13, fontFamily: 'monospace', background: '#fff' }}
            placeholder="0.00" />
          <button onClick={insertNum} title="ใส่ตัวเลข"
            style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #D4D4D4', background: '#F5F5F5', color: '#333', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            ↵
          </button>
        </div>
        <button onClick={back} disabled={tokens.length === 0}
          style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 5, border: '1px solid #D4D4D4', background: '#F5F5F5', color: tokens.length === 0 ? '#CACACA' : '#555', fontSize: 12, cursor: tokens.length === 0 ? 'not-allowed' : 'pointer' }}>
          ⌫ ลบ
        </button>
      </div>
      <div style={{ background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 6, padding: '10px 14px', minHeight: 42, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
        {tokens.length === 0
          ? <span style={{ fontSize: 12, color: '#BBBBBB' }}>กด Variable → Operator → ตัวเลข ด้านบนเพื่อสร้าง expression</span>
          : tokens.map((t, i) => (
            <span key={i} style={{
              fontFamily: 'monospace', fontSize: 13,
              fontWeight: t.type === 'var' ? 700 : 400,
              color: t.type === 'var' ? '#C8202A' : '#444',
              background: t.type === 'var' ? '#FFF5F5' : 'transparent',
              border: t.type === 'var' ? '1px solid #FBBEBE' : 'none',
              borderRadius: t.type === 'var' ? 4 : 0,
              padding: t.type === 'var' ? '1px 7px' : '0 2px',
            }}>{t.val}</span>
          ))
        }
      </div>
    </div>
  )
}

// ── Formula Table ─────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  paint:    { bg: '#FFF3E0', color: '#E65100', border: '#FFCC80' },
  welding:  { bg: '#FCE4EC', color: '#880E4F', border: '#F48FB1' },
  cutting:  { bg: '#E8EAF6', color: '#283593', border: '#9FA8DA' },
  abrasive: { bg: '#F3E5F5', color: '#4A148C', border: '#CE93D8' },
  fastener: { bg: '#E8F5E9', color: '#1B5E20', border: '#A5D6A7' },
}

function FormulaTable({ rows, onEdit, onDelete }: { rows: ConsumeFormula[]; onEdit: (row: ConsumeFormula) => void; onDelete: (row: ConsumeFormula) => void }) {
  if (!rows.length) return <EmptyState label="ยังไม่มี Formula Template" />
  const grouped = rows.reduce<Record<string, ConsumeFormula[]>>((acc, f) => {
    const cat = f.category ?? 'other'
    ;(acc[cat] ??= []).push(f)
    return acc
  }, {})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
      {Object.entries(grouped).map(([cat, items]) => {
        const palette = CATEGORY_COLORS[cat] ?? { bg: '#F5F5F5', color: '#555', border: '#E0E0E0' }
        return (
          <div key={cat}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FlaskConical size={13} style={{ color: palette.color }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: palette.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {FORMULA_CATEGORY_LABELS[cat] ?? cat}
              </span>
              <span style={{ fontSize: 10, color: '#CCC' }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(f => (
                <div key={f.id} style={{ ...rowCardStyle, cursor: 'default', padding: '10px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{f.name}</span>
                      {f.result_unit && (
                        <span style={{ fontSize: 10, background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color, borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                          {f.result_unit}
                        </span>
                      )}
                    </div>
                    <code style={{ fontSize: 12, background: '#F5F5F5', border: '1px solid #E8E8E8', borderRadius: 4, padding: '2px 8px', color: '#1976D2', display: 'inline-block', marginBottom: 2 }}>
                      {f.expr}
                    </code>
                    {f.variables.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {f.variables.map(v => (
                          <span key={v} style={{ fontSize: 10, background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', borderRadius: 4, padding: '1px 6px' }}>{v}</span>
                        ))}
                      </div>
                    )}
                    {f.description && <div style={{ fontSize: 11, color: '#9E9E9E', marginTop: 4 }}>{f.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onEdit(f)} style={editBtnStyle}>Edit</button>
                    <button onClick={() => onDelete(f)} style={{ ...editBtnStyle, color: '#C8202A', borderColor: '#FBBEBE' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Formula Modal ─────────────────────────────────────────────────────────────
function FormulaModal({ row, onClose }: { row?: ConsumeFormula; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!row
  const [tokens, setTokens] = useState<ExprToken[]>(() =>
    row?.expr ? parseExprTokens(row.expr) : []
  )
  const [form, setForm] = useState({
    name: row?.name ?? '',
    result_unit: row?.result_unit ?? '',
    category: row?.category ?? 'paint',
    description: row?.description ?? '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const derivedVars = [...new Set(tokens.filter(t => t.type === 'var').map(t => t.val))]
  const exprStr = tokensToExpr(tokens)

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        expr: exprStr,
        result_unit: form.result_unit.trim() || undefined,
        variables: derivedVars,
        category: form.category || undefined,
        description: form.description.trim() || undefined,
      }
      if (isEdit) return consumeFormulasApi.update(row!.id, payload)
      return consumeFormulasApi.create(payload as Parameters<typeof consumeFormulasApi.create>[0])
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consume-formulas'] }); onClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: () => consumeFormulasApi.remove(row!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consume-formulas'] }); onClose() },
  })

  const CATS = ['paint', 'welding', 'cutting', 'abrasive', 'fastener']
  const canSave = form.name.trim().length > 0 && tokens.length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...modalBoxStyle, width: 560 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{isEdit ? 'Edit Formula' : 'New Formula Template'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9E9E9E', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={formBodyStyle}>
          <FormField label="ชื่อ Formula *">
            <input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} placeholder="e.g. Zinc Primer – by area (50µm)" />
          </FormField>
          <FormField label="Expression *">
            <ExprBuilder tokens={tokens} onChange={setTokens} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="หน่วยผลลัพธ์">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['L', 'kg', 'm³', 'pcs', 'm', 'm²'].map(u => (
                  <button key={u} onClick={() => set('result_unit', form.result_unit === u ? '' : u)}
                    style={{ padding: '5px 12px', borderRadius: 5, fontFamily: 'monospace', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: form.result_unit === u ? '1px solid #C8202A' : '1px solid #E0E0E0',
                      background: form.result_unit === u ? '#FFF0F0' : '#FAFAFA',
                      color: form.result_unit === u ? '#C8202A' : '#555',
                    }}>{u}</button>
                ))}
              </div>
            </FormField>
            <FormField label="Category">
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
                {CATS.map(c => <option key={c} value={c}>{FORMULA_CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="หมายเหตุ">
            <input value={form.description} onChange={e => set('description', e.target.value)} style={inputStyle} placeholder="อธิบายการใช้งาน" />
          </FormField>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                style={{ ...editBtnStyle, color: '#C8202A', borderColor: '#FFCDD2' }}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={editBtnStyle}>Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!canSave || mutation.isPending}
              style={{ height: 32, padding: '0 18px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canSave && !mutation.isPending ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5 }}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
