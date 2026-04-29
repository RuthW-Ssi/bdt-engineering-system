import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowLeft, X, ChevronLeft, ChevronRight, Loader2, AlertCircle, Play } from 'lucide-react'
import { useActivityTemplates, useWorkcenters, useFormulaParams } from '../hooks/useRoutings'
import { previewTemplate } from '../api/routings'
import type { ActivityTemplateDTO } from '../api/routings'
import { HistoryDrawer } from '../components/HistoryDrawer'

// ── Helpers ────────────────────────────────────────────────────

const WC_COLOR: Record<string, string> = {
  'WC-BU': '#1565C0',
  'WC-AS': '#2E7D32',
  'WC-PT': '#7B1FA2',
  'WC-PR': '#E65100',
}

function WcBadge({ code }: { code: string }) {
  const color = WC_COLOR[code] ?? '#555'
  return (
    <span style={{ background: color, color: 'white', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
      {code}
    </span>
  )
}

// ── Preview Modal ──────────────────────────────────────────────

interface PreviewResult {
  formula_expression: string
  input_value: number
  std_measure: number
  per_minute: number
  manpower: number
  cycle_time_min: number
}

function PreviewModal({ template, onClose }: {
  template: ActivityTemplateDTO
  onClose: () => void
}) {
  useFormulaParams()

  const fp = template.formula_param
  const requiredInputs: string[] = fp?.inputs_required ?? []

  const [inputs, setInputs] = useState<Record<string, string>>(
    Object.fromEntries(requiredInputs.map(k => [k, '100']))
  )
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    const attrs: Record<string, number> = {}
    for (const [k, v] of Object.entries(inputs)) {
      const n = parseFloat(v)
      if (isNaN(n)) { setError(`"${k}" ต้องเป็นตัวเลข`); return }
      attrs[k] = n
    }
    setLoading(true)
    setError(null)
    try {
      const res = await previewTemplate(template.id, attrs)
      setResult(res)
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'คำนวณไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid #E0E0E0' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1F1F1F' }}>{template.description}</div>
            <div className="flex items-center gap-2 mt-1">
              <WcBadge code={template.workcenter.code} />
              <span style={{ fontSize: 11, color: '#8E8E8E' }}>op_code: {template.op_code}</span>
              <span style={{ background: '#F0F4FF', color: '#185FA5', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                {template.formula_param_code}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32 }}>
            <X size={16} style={{ color: '#555' }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Defaults */}
          <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#555' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#3A3A3A' }}>ค่าตั้งต้น (Template)</div>
            <div className="flex gap-4">
              <div><span style={{ color: '#8E8E8E' }}>Rate:</span> <span className="font-mono">{template.per_minute} min/{template.unit}</span></div>
              <div><span style={{ color: '#8E8E8E' }}>Std Measure:</span> <span className="font-mono">{template.std_measure} {template.unit}</span></div>
              <div><span style={{ color: '#8E8E8E' }}>Manpower:</span> <span className="font-mono">{template.manpower} คน</span></div>
            </div>
            {fp?.formula_expression && (
              <div className="mt-2 font-mono" style={{ fontSize: 11, background: '#EFEFEF', borderRadius: 4, padding: '4px 8px', color: '#3A3A3A' }}>
                {fp.formula_expression}
              </div>
            )}
          </div>

          {/* Inputs */}
          {requiredInputs.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3A', marginBottom: 8 }}>ค่า Input สำหรับทดสอบ</div>
              <div className="flex flex-col gap-2">
                {requiredInputs.map(key => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="font-mono" style={{ fontSize: 12, color: '#555', minWidth: 120 }}>{key}</label>
                    <input
                      type="number"
                      value={inputs[key] ?? ''}
                      onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                      className="border border-chrome-200 rounded-md font-mono focus:outline-none focus:border-steel-600"
                      style={{ height: 32, padding: '0 10px', fontSize: 13, width: 120 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16, fontSize: 12, color: '#8E8E8E' }}>ไม่ต้องการ input (ใช้ค่าคงที่)</div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2" style={{ background: '#FFEBEE', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#C8202A' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ background: '#EAF5E9', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2E7D32', marginBottom: 8 }}>ผลการคำนวณ</div>
              <div className="flex gap-6">
                <div>
                  <div style={{ fontSize: 10, color: '#8E8E8E' }}>Input Value</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#1F1F1F' }}>{result.input_value.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#8E8E8E' }}>Cycle Time</div>
                  <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#185FA5' }}>{result.cycle_time_min.toFixed(2)} min</div>
                </div>
              </div>
              <div className="font-mono mt-2" style={{ fontSize: 11, color: '#555' }}>
                ceil({result.input_value.toFixed(2)} / {result.std_measure}) × {result.per_minute} × {result.manpower} คน
              </div>
            </div>
          )}

          {/* Action */}
          <button
            onClick={handlePreview}
            disabled={loading}
            className="flex items-center gap-2 rounded-md text-white w-full justify-center"
            style={{ height: 36, background: '#185FA5', fontSize: 13, fontWeight: 600 }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            คำนวณ Cycle Time
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function ActivityTemplateMaster() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [opCodeFilter, setOpCodeFilter] = useState('')
  const [wcFilter, setWcFilter] = useState<number | ''>('')
  const [page, setPage] = useState(1)
  const [selectedTemplate, setSelectedTemplate] = useState<ActivityTemplateDTO | null>(null)

  const { data: wcs } = useWorkcenters()
  const { data, isLoading, error } = useActivityTemplates({
    op_code: opCodeFilter || undefined,
    workcenter_id: wcFilter !== '' ? wcFilter : undefined,
    page,
    limit: 20,
  })

  const items = data?.items ?? []
  const meta = data?.meta

  const filtered = search
    ? items.filter(t =>
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.op_code.toLowerCase().includes(search.toLowerCase()) ||
        t.formula_param_code.toLowerCase().includes(search.toLowerCase())
      )
    : items

  const handleFilterChange = () => setPage(1)

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {selectedTemplate && (
        <PreviewModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} />
      )}

      {/* Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/routings')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32 }}>
            <ArrowLeft size={18} style={{ color: '#555' }} />
          </button>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Activity Templates</span>
          {meta && (
            <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
              {meta.total} รายการ
            </span>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center sticky z-30 border-b border-chrome-100 px-6 gap-2" style={{ height: 44, top: 110, background: '#F5F5F5' }}>
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
            placeholder="ค้นหา ชื่อกิจกรรม, op_code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Op Code filter */}
        <input
          className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600 font-mono"
          style={{ height: 32, padding: '0 10px', fontSize: 12, width: 120 }}
          placeholder="Op Code"
          value={opCodeFilter}
          onChange={e => { setOpCodeFilter(e.target.value.toUpperCase()); handleFilterChange() }}
        />

        {/* Workcenter filter */}
        <select
          value={wcFilter}
          onChange={e => { setWcFilter(e.target.value === '' ? '' : Number(e.target.value)); handleFilterChange() }}
          className="border border-chrome-200 rounded-md bg-white cursor-pointer focus:outline-none"
          style={{ height: 32, padding: '0 10px', fontSize: 13 }}
        >
          <option value="">Work Center — ทั้งหมด</option>
          {(wcs ?? []).map(wc => (
            <option key={wc.id} value={wc.id}>{wc.code} — {wc.name}</option>
          ))}
        </select>

        {(search || opCodeFilter || wcFilter !== '') && (
          <button
            onClick={() => { setSearch(''); setOpCodeFilter(''); setWcFilter(''); setPage(1) }}
            className="text-steel-600 hover:underline"
            style={{ fontSize: 12 }}
          >
            รีเซ็ต
          </button>
        )}

        <span className="flex-1" />
        {meta && (
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>
            แสดง {filtered.length} จาก {meta.total}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white flex-1">
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 80px 1fr 90px 80px 80px 80px 70px', padding: '0 20px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', alignItems: 'center' }}>
          {['กิจกรรม', 'Op Code', 'Work Center', 'Formula', 'Rate', 'Std Measure', 'Manpower', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13, gap: 8 }}>
            <Loader2 size={16} className="animate-spin" /> กำลังโหลด...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 48, color: '#C8202A', fontSize: 13 }}>
            <AlertCircle size={16} /> โหลดข้อมูลไม่สำเร็จ
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
            ไม่พบ activity template ที่ตรงกับเงื่อนไข
          </div>
        ) : (
          filtered.map(t => (
            <div
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className="cursor-pointer hover:bg-chrome-50 transition-colors"
              style={{ display: 'grid', gridTemplateColumns: '200px 80px 1fr 90px 80px 80px 80px 70px', alignItems: 'center', padding: '0 20px', height: 48, borderBottom: '1px solid #F0F0F0' }}
            >
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{t.description}</div>

              <div className="font-mono" style={{ fontSize: 12, color: '#555' }}>{t.op_code}</div>

              <div className="flex items-center gap-2">
                <WcBadge code={t.workcenter.code} />
                <span style={{ fontSize: 12, color: '#555' }}>{t.workcenter.name}</span>
              </div>

              <div>
                <span style={{ background: '#F0F4FF', color: '#185FA5', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                  {t.formula_param_code}
                </span>
              </div>

              <div className="font-mono" style={{ fontSize: 12, color: '#3A3A3A' }}>{t.per_minute}/{t.unit}</div>

              <div className="font-mono" style={{ fontSize: 12, color: '#3A3A3A' }}>{t.std_measure} {t.unit}</div>

              <div style={{ fontSize: 12, color: '#555' }}>{t.manpower} คน</div>

              <div onClick={e => e.stopPropagation()}>
                <HistoryDrawer type="activity" id={t.id} name={t.description} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="sticky flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ bottom: 0, height: 44, zIndex: 30 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>
            หน้า {meta.page} จาก {meta.pages} ({meta.total} รายการ)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center justify-center rounded border border-chrome-200 hover:bg-chrome-50 disabled:opacity-40"
              style={{ width: 32, height: 32 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
              disabled={page === meta.pages}
              className="flex items-center justify-center rounded border border-chrome-200 hover:bg-chrome-50 disabled:opacity-40"
              style={{ width: 32, height: 32 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
