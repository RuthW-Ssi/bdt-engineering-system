import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Edit2, X, Save, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useWorkcenters, useWorkcenter } from '../hooks/useRoutings'
import { useMachines } from '../hooks/useMachines'
import type { WorkcenterDTO } from '../api/routings'

// ── Station color by name ──────────────────────────────────────

const STATION_COLOR: Record<string, string> = {
  'Cutting':              '#185FA5',
  'Press & Forming':      '#BA7517',
  'Drilling & Threading': '#14B8A6',
  'H-beam Fabrication':   '#3A3A3A',
  'Welding':              '#C8202A',
  'Surface & Finishing':  '#639922',
  'Assembly':             '#555555',
  'Material Preparation': '#8E8E8E',
  'Subcontract':          '#8E8E8E',
}

function stationColor(name: string) {
  const base = name.replace(' (manual)', '').trim()
  return STATION_COLOR[base] ?? '#185FA5'
}

const STATION_ORDER = [
  'Cutting', 'Press & Forming', 'Drilling & Threading',
  'H-beam Fabrication', 'Welding', 'Welding (manual)',
  'Surface & Finishing', 'Surface & Finishing (manual)',
  'Assembly', 'Assembly (manual)', 'Material Preparation (manual)',
  'Subcontract',
]

// ── Machine combobox ───────────────────────────────────────────

function MachineCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  const [search, setSearch] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  const { data: machines = [] } = useMachines({ type: 'machine' })

  // keep search in sync when value is cleared from outside
  useEffect(() => { if (!value) setSearch('') }, [value])

  const filtered = machines.filter(m => {
    const q = search.toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
  })

  const showList = focused && machines.length > 0

  useEffect(() => {
    if (!focused) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [focused])

  const handleSelect = (name: string) => {
    onChange(name)
    setSearch(name)
    setFocused(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSearch('')
    setFocused(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Search input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 38, border: `1px solid ${focused ? '#185FA5' : '#E0E0E0'}`, borderRadius: showList ? '6px 6px 0 0' : 6, background: '#fff', transition: 'border-color 0.15s' }}>
        <Search size={13} style={{ color: '#BDBDBD', flexShrink: 0 }} />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); onChange('') }}
          onFocus={() => setFocused(true)}
          placeholder="ค้นหาเครื่องจักร…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', color: '#1F1F1F' }}
        />
        {(search || value) && (
          <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#BDBDBD', lineHeight: 1, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#555')}
            onMouseLeave={e => (e.currentTarget.style.color = '#BDBDBD')}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Inline results list */}
      {showList && (
        <div style={{ border: '1px solid #185FA5', borderTop: 'none', borderRadius: '0 0 6px 6px', background: '#fff', maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 200, position: 'absolute', left: 0, right: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '14px', fontSize: 12, color: '#BDBDBD', textAlign: 'center' }}>ไม่พบเครื่องจักร</div>
          ) : filtered.map(m => (
            <div
              key={m.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(m.name) }}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
                borderBottom: '1px solid #F5F5F5',
                background: value === m.name ? '#F0F7FF' : 'transparent',
              }}
              onMouseEnter={e => { if (value !== m.name) (e.currentTarget as HTMLElement).style.background = '#F8F8F8' }}
              onMouseLeave={e => { if (value !== m.name) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{ fontSize: 13, color: '#1F1F1F', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Slider field ───────────────────────────────────────────────

function SliderField({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div>
      <div className="flex justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color }}>{value}%</span>
      </div>
      <input type="range" min={0} max={100} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color }} />
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
      {children}
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────

function EditModal({ wc, onClose }: { wc: WorkcenterDTO; onClose: () => void }) {
  const { update } = useWorkcenter(wc.id)
  const [machine, setMachine] = useState(wc.machine ?? '')
  const [active, setActive] = useState(wc.active)
  const [availability, setAvailability] = useState(Number(wc.availability))
  const [performance, setPerformance] = useState(Number(wc.performance))
  const [quality, setQuality] = useState(Number(wc.quality))
  const [oeeTarget, setOeeTarget] = useState(Number(wc.oee_target))
  const [laborMix, setLaborMix] = useState({ ...wc.labor_mix })
  const [laborCost, setLaborCost] = useState(Number(wc.labor_cost_per_min))
  const [electricityCost, setElectricityCost] = useState(Number(wc.electricity_cost_per_min))
  const [consumableCost, setConsumableCost] = useState(Number(wc.consumable_cost_per_min))
  const [overheadCost, setOverheadCost] = useState(Number(wc.overhead_cost_per_min))
  const laborSum = laborMix.operator + laborMix.skilled + laborMix.group_head
  const laborValid = Math.abs(laborSum - 100) <= 0.5

  const handleSave = async () => {
    if (!laborValid) { toast.error(`Operator mix totals ${laborSum}% (must equal 100%)`); return }
    try {
      await update.mutateAsync({
        machine: machine.trim() || null,
        active,
        availability, performance, quality, oee_target: oeeTarget,
        labor_mix: laborMix, labor_cost_per_min: laborCost,
        electricity_cost_per_min: electricityCost,
        consumable_cost_per_min: consumableCost,
        overhead_cost_per_min: overheadCost,
      } as any)
      toast.success('บันทึกสำเร็จ')
      onClose()
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Save failed')
    }
  }

  const totalCost = laborCost + electricityCost + consumableCost + overheadCost

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 100 }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 520, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-chrome-100 flex-shrink-0" style={{ padding: '16px 20px' }}>
          <div>
            <div className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: '#1F1F1F' }}>{wc.code}</div>
            <div style={{ fontSize: 12, color: '#9E9E9E', marginTop: 1 }}>{wc.name}</div>
          </div>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={15} style={{ color: '#9E9E9E' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col" style={{ padding: 20, gap: 20 }}>

          {/* Machine + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Machine</label>
              <MachineCombobox value={machine} onChange={setMachine} />
            </div>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
              <div style={{ display: 'flex', background: '#F5F5F5', borderRadius: 6, padding: 2, gap: 2, height: 38, alignItems: 'center' }}>
                {([{ label: 'Active', value: true }, { label: 'Inactive', value: false }] as const).map(opt => (
                  <button key={String(opt.value)} onClick={() => setActive(opt.value)}
                    style={{
                      height: 30, padding: '0 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      background: active === opt.value ? '#fff' : 'transparent',
                      color: active === opt.value ? (opt.value ? '#2E7D32' : '#C8202A') : '#9E9E9E',
                      boxShadow: active === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* OEE sliders */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
            <SectionLabel>OEE Components</SectionLabel>
            <div className="flex flex-col" style={{ gap: 12 }}>
              <SliderField label="Availability (A)" value={availability} onChange={setAvailability} color="#185FA5" />
              <SliderField label="Performance (P)" value={performance} onChange={setPerformance} color="#639922" />
              <SliderField label="Quality (Q)" value={quality} onChange={setQuality} color="#7B1FA2" />
              <SliderField label="OEE Target" value={oeeTarget} onChange={setOeeTarget} color="#BA7517" />
            </div>
          </div>

          {/* Operator mix */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <SectionLabel>Operator Mix</SectionLabel>
              <span style={{ fontSize: 11, fontWeight: 600, color: laborValid ? '#2E7D32' : '#C8202A' }}>
                Total {laborSum}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {(['operator', 'skilled', 'group_head'] as const).map(k => (
                <div key={k} className="flex flex-col" style={{ gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {k === 'operator' ? 'Operator' : k === 'skilled' ? 'Skilled' : 'Group Head'}
                  </label>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={100} value={laborMix[k]}
                      onChange={e => setLaborMix(prev => ({ ...prev, [k]: Number(e.target.value) }))}
                      className="border rounded-md font-mono focus:outline-none"
                      style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }} />
                    <span style={{ fontSize: 11, color: '#9E9E9E', flexShrink: 0 }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
            <SectionLabel>Cost Rate (THB / min)</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {[
                { label: 'Labor', value: laborCost, setter: setLaborCost },
                { label: 'Electricity', value: electricityCost, setter: setElectricityCost },
                { label: 'Consumable', value: consumableCost, setter: setConsumableCost },
                { label: 'Overhead', value: overheadCost, setter: setOverheadCost },
              ].map(({ label, value, setter }) => (
                <div key={label} className="flex flex-col" style={{ gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
                  <input type="number" min={0} step={0.0001} value={value}
                    onChange={e => setter(Number(e.target.value))}
                    className="border rounded-md font-mono focus:outline-none"
                    style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }} />
                </div>
              ))}
            </div>
            <div style={{ background: '#F8F8F8', borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
              <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: totalCost > 0 ? '#1F1F1F' : '#BDBDBD' }}>
                {totalCost.toFixed(4)} THB/min
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2" style={{ borderTop: '1px solid #F0F0F0', paddingTop: 16 }}>
            <button onClick={onClose} className="rounded-md hover:bg-chrome-50"
              style={{ height: 36, padding: '0 16px', fontSize: 13, border: '1px solid #E0E0E0', background: 'white', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={update.isPending}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 18px', fontSize: 13, fontWeight: 600, background: '#185FA5', border: 'none', cursor: 'pointer', opacity: update.isPending ? 0.7 : 1 }}>
              {update.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create modal ───────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const { create } = useWorkcenters()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [machine, setMachine] = useState('')
  const [active, setActive] = useState(true)
  const [availability, setAvailability] = useState(100)
  const [performance, setPerformance] = useState(100)
  const [quality, setQuality] = useState(100)
  const [oeeTarget, setOeeTarget] = useState(90)
  const [laborMix, setLaborMix] = useState({ operator: 100, skilled: 0, group_head: 0 })
  const [laborCost, setLaborCost] = useState(0)
  const [electricityCost, setElectricityCost] = useState(0)
  const [consumableCost, setConsumableCost] = useState(0)
  const [overheadCost, setOverheadCost] = useState(0)
  const laborSum = laborMix.operator + laborMix.skilled + laborMix.group_head
  const laborValid = Math.abs(laborSum - 100) <= 0.5
  const totalCost = laborCost + electricityCost + consumableCost + overheadCost

  const handleSave = async () => {
    if (!code.trim()) { toast.error('Code is required'); return }
    if (!name.trim()) { toast.error('Name (station) is required'); return }
    if (!laborValid) { toast.error(`Operator mix totals ${laborSum}% (must equal 100%)`); return }
    try {
      await create.mutateAsync({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        machine: machine.trim() || null,
        active,
        availability, performance, quality, oee_target: oeeTarget,
        labor_mix: laborMix, labor_cost_per_min: laborCost,
        electricity_cost_per_min: electricityCost,
        consumable_cost_per_min: consumableCost,
        overhead_cost_per_min: overheadCost,
      } as any)
      toast.success('สร้าง Work Center สำเร็จ')
      onClose()
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Save failed')
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 100 }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 520, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-chrome-100 flex-shrink-0" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>New Work Center</span>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={15} style={{ color: '#9E9E9E' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col" style={{ padding: 20, gap: 20 }}>

          {/* Identity */}
          <div>
            <SectionLabel>Identity</SectionLabel>
            <div className="flex flex-col" style={{ gap: 10 }}>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Code <span style={{ color: '#C8202A' }}>*</span>
                </label>
                <input autoFocus
                  value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WC-CNC"
                  className="border rounded-md focus:outline-none font-mono"
                  style={{ height: 38, padding: '0 12px', fontSize: 14, borderColor: '#E0E0E0' }} />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col flex-1" style={{ gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Station (name) <span style={{ color: '#C8202A' }}>*</span>
                  </label>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Cutting"
                    className="border rounded-md focus:outline-none"
                    style={{ height: 38, padding: '0 12px', fontSize: 14, borderColor: '#E0E0E0' }} />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Machine</label>
                  <MachineCombobox value={machine} onChange={setMachine} />
                </div>
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
                <div style={{ display: 'flex', background: '#F5F5F5', borderRadius: 6, padding: 2, gap: 2, alignSelf: 'flex-start' }}>
                  {([{ label: 'Active', value: true }, { label: 'Inactive', value: false }] as const).map(opt => (
                    <button key={String(opt.value)} onClick={() => setActive(opt.value)}
                      style={{
                        height: 30, padding: '0 16px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        background: active === opt.value ? '#fff' : 'transparent',
                        color: active === opt.value ? (opt.value ? '#2E7D32' : '#C8202A') : '#9E9E9E',
                        boxShadow: active === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* OEE sliders */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
            <SectionLabel>OEE Components</SectionLabel>
            <div className="flex flex-col" style={{ gap: 12 }}>
              <SliderField label="Availability (A)" value={availability} onChange={setAvailability} color="#185FA5" />
              <SliderField label="Performance (P)" value={performance} onChange={setPerformance} color="#639922" />
              <SliderField label="Quality (Q)" value={quality} onChange={setQuality} color="#7B1FA2" />
              <SliderField label="OEE Target" value={oeeTarget} onChange={setOeeTarget} color="#BA7517" />
            </div>
          </div>

          {/* Operator mix */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <SectionLabel>Operator Mix</SectionLabel>
              <span style={{ fontSize: 11, fontWeight: 600, color: laborValid ? '#2E7D32' : '#C8202A' }}>
                Total {laborSum}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {(['operator', 'skilled', 'group_head'] as const).map(k => (
                <div key={k} className="flex flex-col" style={{ gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {k === 'operator' ? 'Operator' : k === 'skilled' ? 'Skilled' : 'Group Head'}
                  </label>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={100} value={laborMix[k]}
                      onChange={e => setLaborMix(prev => ({ ...prev, [k]: Number(e.target.value) }))}
                      className="border rounded-md font-mono focus:outline-none"
                      style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }} />
                    <span style={{ fontSize: 11, color: '#9E9E9E', flexShrink: 0 }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost */}
          <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
            <SectionLabel>Cost Rate (THB / min)</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {[
                { label: 'Labor', value: laborCost, setter: setLaborCost },
                { label: 'Electricity', value: electricityCost, setter: setElectricityCost },
                { label: 'Consumable', value: consumableCost, setter: setConsumableCost },
                { label: 'Overhead', value: overheadCost, setter: setOverheadCost },
              ].map(({ label, value, setter }) => (
                <div key={label} className="flex flex-col" style={{ gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
                  <input type="number" min={0} step={0.0001} value={value}
                    onChange={e => setter(Number(e.target.value))}
                    className="border rounded-md font-mono focus:outline-none"
                    style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }} />
                </div>
              ))}
            </div>
            <div style={{ background: '#F8F8F8', borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
              <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: totalCost > 0 ? '#1F1F1F' : '#BDBDBD' }}>
                {totalCost.toFixed(4)} THB/min
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2" style={{ borderTop: '1px solid #F0F0F0', paddingTop: 16 }}>
            <button onClick={onClose} className="rounded-md hover:bg-chrome-50"
              style={{ height: 36, padding: '0 16px', fontSize: 13, border: '1px solid #E0E0E0', background: 'white', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={create.isPending}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 18px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer', opacity: create.isPending ? 0.7 : 1 }}>
              {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

const COLS = '160px 1fr 80px 110px 80px 100px 36px'

export function WorkcenterMaster() {
  const navigate = useNavigate()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean>(true)
  const { data: wcs = [], isLoading } = useWorkcenters(activeFilter)
  const editingWc = wcs.find(w => w.id === editingId)

  const q = search.trim().toLowerCase()
  const filtered = q
    ? wcs.filter(w => w.code.toLowerCase().includes(q) || w.name.toLowerCase().includes(q) || (w.machine ?? '').toLowerCase().includes(q))
    : wcs

  const grouped = STATION_ORDER.reduce<Record<string, WorkcenterDTO[]>>((acc, name) => {
    const machines = filtered.filter(w => w.name === name)
    if (machines.length) acc[name] = machines
    return acc
  }, {})
  filtered.forEach(w => {
    if (!grouped[w.name]) grouped[w.name] = [w]
    else if (!grouped[w.name].find(x => x.id === w.id)) grouped[w.name].push(w)
  })

  const stationCount = Object.keys(grouped).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', background: '#F8F8F8' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 56, zIndex: 20 }}>
        <button onClick={() => navigate('/routings')}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F5')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>Work Centers</div>
          <div style={{ fontSize: 11, color: '#9E9E9E' }}>Stations and machines — OEE and cost parameters</div>
        </div>
        <button onClick={() => setCreating(true)}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} />New Work Center
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 44, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'sticky', top: 112, zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code, machine…"
            style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px 0 28px', height: 30, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 220 }}
          />
        </div>
        {/* Active / Inactive toggle */}
        <div style={{ display: 'flex', background: '#F5F5F5', borderRadius: 6, padding: 2, gap: 2 }}>
          {([{ label: 'Active', value: true }, { label: 'Inactive', value: false }] as const).map(opt => (
            <button key={String(opt.value)} onClick={() => setActiveFilter(opt.value)}
              style={{
                height: 26, padding: '0 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: activeFilter === opt.value ? '#fff' : 'transparent',
                color: activeFilter === opt.value ? '#1F1F1F' : '#9E9E9E',
                boxShadow: activeFilter === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#9E9E9E' }}>
          {stationCount} station{stationCount !== 1 ? 's' : ''} · {filtered.length} machine{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 16px', marginBottom: 6 }}>
          {['Code', 'Machine', 'Status', 'A · P · Q', 'OEE', 'THB / min', ''].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>No results</div>
        ) : (
          Object.entries(grouped).map(([stationName, machines]) => {
            const color = stationColor(stationName)
            const isManual = stationName.includes('(manual)')
            const baseName = stationName.replace(' (manual)', '').trim()

            return (
              <div key={stationName} style={{ marginBottom: 8 }}>
                {/* Station header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 6px', marginBottom: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3A3A3A', letterSpacing: '0.03em' }}>{baseName}</span>
                  {isManual && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#9E9E9E', background: '#EEEEEE', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.05em' }}>MANUAL</span>
                  )}
                  <span style={{ fontSize: 11, color: '#BDBDBD' }}>{machines.length}</span>
                </div>

                {/* Machine rows */}
                {machines.map(wc => {
                  const a = Number(wc.availability)
                  const p = Number(wc.performance)
                  const q2 = Number(wc.quality)
                  const oee = (a * p * q2) / 10000
                  const oeeColor = oee >= 70 ? '#2E7D32' : oee >= 50 ? '#BA7517' : '#C8202A'
                  const totalCost = Number(wc.labor_cost_per_min) + Number(wc.electricity_cost_per_min)
                    + Number(wc.consumable_cost_per_min) + Number(wc.overhead_cost_per_min)

                  return (
                    <div key={wc.id}
                      style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 16px', height: 48, alignItems: 'center', background: '#fff', borderRadius: 8, marginBottom: 3, border: '1px solid #E8E8E8', transition: 'box-shadow 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>

                      {/* Code */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 3, height: 24, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1F1F1F', fontFamily: 'monospace' }}>{wc.code}</span>
                      </div>

                      {/* Machine */}
                      <div style={{ fontSize: 13, color: wc.machine ? '#1F1F1F' : '#BDBDBD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wc.machine ?? '—'}
                      </div>

                      {/* Status */}
                      <div>
                        <span style={{
                          fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                          ...(wc.active
                            ? { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }
                            : { background: '#F5F5F5', color: '#9E9E9E', border: '1px solid #E0E0E0' }),
                        }}>
                          {wc.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {/* A · P · Q */}
                      <div style={{ fontSize: 11, color: '#9E9E9E', fontFamily: 'monospace' }}>
                        {a}·{p}·{q2}
                      </div>

                      {/* OEE */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: oeeColor, fontFamily: 'monospace' }}>
                        {oee.toFixed(1)}%
                      </div>

                      {/* Cost */}
                      <div style={{ fontSize: 12, color: totalCost > 0 ? '#555' : '#BDBDBD', fontFamily: 'monospace' }}>
                        {totalCost > 0 ? totalCost.toFixed(4) : '—'}
                      </div>

                      {/* Edit */}
                      <button onClick={() => setEditingId(wc.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#185FA5'; (e.currentTarget as HTMLElement).style.background = '#E6F1FB' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#BDBDBD'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                        <Edit2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {editingWc && <EditModal wc={editingWc} onClose={() => setEditingId(null)} />}
      {creating && <CreateModal onClose={() => setCreating(false)} />}
    </div>
  )
}
