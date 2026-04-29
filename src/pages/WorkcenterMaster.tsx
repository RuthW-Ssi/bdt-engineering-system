import { useState } from 'react'
import { ArrowLeft, Edit2, X, Save, Loader2, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkcenters, useWorkcenter } from '../hooks/useRoutings'
import type { WorkcenterDTO } from '../api/routings'

// ── OEE gauge ─────────────────────────────────────────────────

function OeeGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex flex-col items-center" style={{ gap: 4 }}>
      <div style={{ fontSize: 10, color: '#8E8E8E', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ width: 48, height: 48, borderRadius: '50%', position: 'relative', background: `conic-gradient(${color} ${pct}%, #E0E0E0 ${pct}%)` }}>
        <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1F1F1F' }}>
          {Math.round(pct)}%
        </div>
      </div>
    </div>
  )
}

// ── Slider input ───────────────────────────────────────────────

function SliderField({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div>
      <div className="flex justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color }}>{value}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────

function EditModal({ wc, onClose }: { wc: WorkcenterDTO; onClose: () => void }) {
  const { update } = useWorkcenter(wc.id)
  const [availability, setAvailability] = useState(Number(wc.availability))
  const [performance, setPerformance] = useState(Number(wc.performance))
  const [quality, setQuality] = useState(Number(wc.quality))
  const [oeeTarget, setOeeTarget] = useState(Number(wc.oee_target))
  const [laborMix, setLaborMix] = useState({ ...wc.labor_mix })
  const [laborCost, setLaborCost] = useState(Number(wc.labor_cost_per_min))
  const [electricityCost, setElectricityCost] = useState(Number(wc.electricity_cost_per_min))
  const [consumableCost, setConsumableCost] = useState(Number(wc.consumable_cost_per_min))
  const [overheadCost, setOverheadCost] = useState(Number(wc.overhead_cost_per_min))
  const [error, setError] = useState<string | null>(null)

  const oeeActual = (availability * performance * quality) / 10000

  const laborSum = laborMix.operator + laborMix.skilled + laborMix.group_head
  const laborValid = Math.abs(laborSum - 100) <= 0.5

  const handleSave = async () => {
    if (!laborValid) { setError(`Labor mix รวมได้ ${laborSum}% (ต้องเท่ากับ 100%)`); return }
    setError(null)
    try {
      await update.mutateAsync({
        availability, performance, quality, oee_target: oeeTarget,
        labor_mix: laborMix,
        labor_cost_per_min: laborCost,
        electricity_cost_per_min: electricityCost,
        consumable_cost_per_min: consumableCost,
        overhead_cost_per_min: overheadCost,
      })
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 100 }}>
      <div style={{ background: 'white', borderRadius: 12, width: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>{wc.code} — {wc.name}</div>
          <button onClick={onClose}><X size={18} style={{ color: '#8E8E8E' }} /></button>
        </div>

        {/* OEE live preview */}
        <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E8E', marginBottom: 12, textTransform: 'uppercase' }}>OEE Preview</div>
          <div className="flex items-center gap-6 justify-center">
            <OeeGauge value={availability} label="A" color="#1565C0" />
            <OeeGauge value={performance} label="P" color="#2E7D32" />
            <OeeGauge value={quality} label="Q" color="#7B1FA2" />
            <div style={{ borderLeft: '1px solid #E0E0E0', paddingLeft: 16 }}>
              <div style={{ fontSize: 10, color: '#8E8E8E', fontWeight: 600 }}>OEE</div>
              <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: oeeActual >= 70 ? '#2E7D32' : oeeActual >= 50 ? '#F57F17' : '#C8202A' }}>
                {oeeActual.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* OEE sliders */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', marginBottom: 12 }}>OEE Components</div>
          <div className="flex flex-col gap-3">
            <SliderField label="Availability (A)" value={availability} onChange={setAvailability} color="#1565C0" />
            <SliderField label="Performance (P)" value={performance} onChange={setPerformance} color="#2E7D32" />
            <SliderField label="Quality (Q)" value={quality} onChange={setQuality} color="#7B1FA2" />
            <SliderField label="OEE Target" value={oeeTarget} onChange={setOeeTarget} color="#F57F17" />
          </div>
        </div>

        {/* Labor mix */}
        <div style={{ marginBottom: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>Labor Mix</span>
            <span style={{ fontSize: 11, color: laborValid ? '#2E7D32' : '#C8202A' }}>รวม {laborSum}%</span>
          </div>
          <div className="flex flex-col gap-2">
            {(['operator', 'skilled', 'group_head'] as const).map(k => (
              <div key={k} className="flex items-center gap-3">
                <span style={{ fontSize: 12, color: '#555', width: 100 }}>{k === 'operator' ? 'Operator' : k === 'skilled' ? 'Skilled' : 'Group Head'}</span>
                <input
                  type="number" min={0} max={100} value={laborMix[k]}
                  onChange={e => setLaborMix(prev => ({ ...prev, [k]: Number(e.target.value) }))}
                  className="border border-chrome-200 rounded-md font-mono"
                  style={{ width: 70, height: 30, padding: '0 8px', fontSize: 12 }}
                />
                <span style={{ fontSize: 11, color: '#8E8E8E' }}>%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cost components */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', marginBottom: 12 }}>ต้นทุน (THB/นาที)</div>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Labor', value: laborCost, setter: setLaborCost },
              { label: 'Electricity', value: electricityCost, setter: setElectricityCost },
              { label: 'Consumable', value: consumableCost, setter: setConsumableCost },
              { label: 'Overhead', value: overheadCost, setter: setOverheadCost },
            ].map(({ label, value, setter }) => (
              <div key={label} className="flex items-center gap-3">
                <span style={{ fontSize: 12, color: '#555', width: 100 }}>{label}</span>
                <input
                  type="number" min={0} step={0.0001} value={value}
                  onChange={e => setter(Number(e.target.value))}
                  className="border border-chrome-200 rounded-md font-mono"
                  style={{ width: 110, height: 30, padding: '0 8px', fontSize: 12 }}
                />
                <span style={{ fontSize: 11, color: '#8E8E8E' }}>THB/min</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
            รวม: <span className="font-mono" style={{ fontWeight: 600 }}>
              {(laborCost + electricityCost + consumableCost + overheadCost).toFixed(4)} THB/min
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2" style={{ background: '#FFF0F0', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#C8202A' }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-chrome-200 hover:bg-chrome-50" style={{ height: 36, padding: '0 16px', fontSize: 13 }}>ยกเลิก</button>
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
          >
            {update.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}

// ── WC Card ────────────────────────────────────────────────────

const WC_ACCENT: Record<string, string> = {
  'WC-BU': '#1565C0', 'WC-AS': '#2E7D32', 'WC-PT': '#7B1FA2', 'WC-PR': '#E65100',
}

function WcCard({ wc, onEdit }: { wc: WorkcenterDTO; onEdit: () => void }) {
  const a = Number(wc.availability)
  const p = Number(wc.performance)
  const q = Number(wc.quality)
  const oee = (a * p * q) / 10000
  const accent = WC_ACCENT[wc.code] ?? '#185FA5'

  return (
    <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, padding: 20, position: 'relative' }}>
      <div style={{ borderLeft: `4px solid ${accent}`, paddingLeft: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: accent }}>{wc.code}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>{wc.name}</div>
      </div>

      {/* OEE badges */}
      <div className="flex items-center gap-3 justify-center" style={{ marginBottom: 16 }}>
        <OeeGauge value={a} label="A" color="#1565C0" />
        <OeeGauge value={p} label="P" color="#2E7D32" />
        <OeeGauge value={q} label="Q" color="#7B1FA2" />
        <div style={{ borderLeft: '1px solid #E0E0E0', paddingLeft: 12 }}>
          <div style={{ fontSize: 9, color: '#8E8E8E', fontWeight: 600 }}>OEE</div>
          <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, color: oee >= 70 ? '#2E7D32' : oee >= 50 ? '#F57F17' : '#C8202A' }}>
            {oee.toFixed(1)}%
          </div>
          <div style={{ fontSize: 9, color: '#8E8E8E' }}>target {wc.oee_target}%</div>
        </div>
      </div>

      {/* Labor mix */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: '#8E8E8E', fontWeight: 600, marginBottom: 4 }}>LABOR MIX</div>
        <div className="flex gap-1" style={{ height: 8, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ flex: wc.labor_mix.operator, background: '#1565C0' }} />
          <div style={{ flex: wc.labor_mix.skilled, background: '#2E7D32' }} />
          <div style={{ flex: wc.labor_mix.group_head, background: '#7B1FA2' }} />
        </div>
        <div className="flex gap-3" style={{ marginTop: 4, fontSize: 10, color: '#555' }}>
          <span>Op {wc.labor_mix.operator}%</span>
          <span>Skilled {wc.labor_mix.skilled}%</span>
          <span>GH {wc.labor_mix.group_head}%</span>
        </div>
      </div>

      {/* Cost */}
      <div style={{ fontSize: 11, color: '#8E8E8E' }}>
        ต้นทุนรวม: <span className="font-mono" style={{ color: '#3A3A3A', fontWeight: 600 }}>
          {(Number(wc.labor_cost_per_min) + Number(wc.electricity_cost_per_min) + Number(wc.consumable_cost_per_min) + Number(wc.overhead_cost_per_min)).toFixed(4)} THB/min
        </span>
      </div>

      <button
        onClick={onEdit}
        className="absolute flex items-center gap-1 rounded-md border border-chrome-200 hover:bg-chrome-50"
        style={{ top: 16, right: 16, height: 28, padding: '0 10px', fontSize: 11, color: '#555' }}
      >
        <Edit2 size={11} /> แก้ไข
      </button>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

export function WorkcenterMaster() {
  const navigate = useNavigate()
  const { data: wcs = [], isLoading } = useWorkcenters()
  const [editingId, setEditingId] = useState<number | null>(null)
  const editingWc = wcs.find(w => w.id === editingId)

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="bg-white flex items-center gap-3 sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <button onClick={() => navigate('/routings')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32 }}>
          <ArrowLeft size={18} style={{ color: '#555' }} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Work Centers</span>
        <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
          {wcs.length} WC
        </span>
      </div>

      <div style={{ padding: 24 }}>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#8E8E8E' }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {wcs.map(wc => (
              <WcCard key={wc.id} wc={wc} onEdit={() => setEditingId(wc.id)} />
            ))}
          </div>
        )}
      </div>

      {editingWc && <EditModal wc={editingWc} onClose={() => setEditingId(null)} />}
    </div>
  )
}
