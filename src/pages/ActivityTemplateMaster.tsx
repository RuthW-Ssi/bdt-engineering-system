import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowLeft, X, ChevronLeft, ChevronRight, Loader2, AlertCircle, Play, Plus, Edit2, Save } from 'lucide-react'
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
      if (isNaN(n)) { setError(`"${k}" must be a number`); return }
      attrs[k] = n
    }
    setLoading(true)
    setError(null)
    try {
      const res = await previewTemplate(template.id, attrs)
      setResult(res)
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Calculation failed')
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
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#3A3A3A' }}>Defaults (Template)</div>
            <div className="flex gap-4">
              <div><span style={{ color: '#8E8E8E' }}>Rate:</span> <span className="font-mono">{template.per_minute} min/{template.unit}</span></div>
              <div><span style={{ color: '#8E8E8E' }}>Std Measure:</span> <span className="font-mono">{template.std_measure} {template.unit}</span></div>
              <div><span style={{ color: '#8E8E8E' }}>Manpower:</span> <span className="font-mono">{template.manpower} ppl</span></div>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3A', marginBottom: 8 }}>Test Input Values</div>
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
            <div style={{ marginBottom: 16, fontSize: 12, color: '#8E8E8E' }}>No input required (uses constant value)</div>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2E7D32', marginBottom: 8 }}>Calculation Result</div>
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
                ceil({result.input_value.toFixed(2)} / {result.std_measure}) × {result.per_minute} × {result.manpower} ppl
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
            Calculate Cycle Time
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Activity Form Modal (create + edit) ───────────────────────

const COMMON_UNITS = ['m', 'kg', 'pc', 'min', 'm²', 'joint', 'pass']
const COMMON_OP_CODES = ['buildup_fit', 'buildup_welding', 'fitup', 'welding', 'painting']

function ActivityFormModal({
  existing,
  onClose,
}: {
  existing?: ActivityTemplateDTO
  onClose: () => void
}) {
  const { create, update } = useActivityTemplates()
  const { data: wcs = [] } = useWorkcenters()
  const { data: params = [] } = useFormulaParams()

  const isEdit = !!existing

  const [opCode, setOpCode] = useState(existing?.op_code ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [workcenterId, setWorkcenterId] = useState<number | ''>(existing?.workcenter.id ?? '')
  const [formulaParam, setFormulaParam] = useState(existing?.formula_param_code ?? '')
  const [perMinute, setPerMinute] = useState(existing?.per_minute ?? 0)
  const [stdMeasure, setStdMeasure] = useState(existing?.std_measure ?? 1)
  const [unit, setUnit] = useState(existing?.unit ?? 'm')
  const [manpower, setManpower] = useState(existing?.manpower ?? 1)
  const [sequence, setSequence] = useState(existing?.sequence ?? 10)
  const [error, setError] = useState<string | null>(null)

  const isPending = create.isPending || update.isPending

  const handleSave = async () => {
    if (!opCode.trim()) { setError('Op Code is required'); return }
    if (!description.trim()) { setError('Description is required'); return }
    if (!workcenterId) { setError('Work Center is required'); return }
    if (!formulaParam) { setError('Formula Param is required'); return }
    setError(null)
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: existing.id,
          body: { op_code: opCode, description, workcenter_id: Number(workcenterId), formula_param_code: formulaParam, per_minute: Number(perMinute), std_measure: Number(stdMeasure), unit, manpower: Number(manpower), sequence: Number(sequence) },
        })
      } else {
        await create.mutateAsync({ op_code: opCode, description, workcenter_id: Number(workcenterId), formula_param_code: formulaParam, per_minute: Number(perMinute), std_measure: Number(stdMeasure), unit, manpower: Number(manpower), sequence: Number(sequence) })
      }
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Save failed')
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 100 }}>
      <div style={{ background: 'white', borderRadius: 12, width: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>{isEdit ? `Edit: ${existing.description}` : 'New Activity Template'}</div>
          <button onClick={onClose}><X size={18} style={{ color: '#8E8E8E' }} /></button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Op Code */}
          <div className="flex gap-3">
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Op Code <span style={{ color: '#C8202A' }}>*</span></label>
              <input
                list="op-code-list"
                className="border border-chrome-200 rounded-md font-mono focus:outline-none focus:border-steel-600"
                style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13 }}
                placeholder="e.g. buildup_fit"
                value={opCode}
                onChange={e => setOpCode(e.target.value)}
              />
              <datalist id="op-code-list">
                {COMMON_OP_CODES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Sequence</label>
              <input type="number" min={1} value={sequence} onChange={e => setSequence(Number(e.target.value))}
                className="border border-chrome-200 rounded-md font-mono focus:outline-none"
                style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 13 }} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Description <span style={{ color: '#C8202A' }}>*</span></label>
            <input
              className="border border-chrome-200 rounded-md focus:outline-none focus:border-steel-600"
              style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13 }}
              placeholder="e.g. Fit-up cut pass"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Work Center */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Work Center <span style={{ color: '#C8202A' }}>*</span></label>
            <select value={workcenterId} onChange={e => setWorkcenterId(Number(e.target.value))}
              className="border border-chrome-200 rounded-md bg-white focus:outline-none"
              style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13 }}>
              <option value="">Select work center…</option>
              {wcs.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>

          {/* Formula Param */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Formula Param <span style={{ color: '#C8202A' }}>*</span></label>
            <select value={formulaParam} onChange={e => setFormulaParam(e.target.value)}
              className="border border-chrome-200 rounded-md bg-white focus:outline-none"
              style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13 }}>
              <option value="">Select formula param…</option>
              {(params as any[]).map((p: any) => (
                <option key={p.code} value={p.code}>{p.code} — {p.description}</option>
              ))}
            </select>
          </div>

          {/* Rate fields */}
          <div style={{ background: '#F8F8F8', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3A', marginBottom: 10 }}>Rate & Measure</div>
            <div className="flex gap-3">
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>Per Minute (rate)</label>
                <input type="number" min={0} step={0.0001} value={perMinute} onChange={e => setPerMinute(Number(e.target.value))}
                  className="border border-chrome-200 rounded-md font-mono focus:outline-none"
                  style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>Std Measure</label>
                <input type="number" min={0} step={0.01} value={stdMeasure} onChange={e => setStdMeasure(Number(e.target.value))}
                  className="border border-chrome-200 rounded-md font-mono focus:outline-none"
                  style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12 }} />
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>Unit</label>
                <input list="unit-list" value={unit} onChange={e => setUnit(e.target.value)}
                  className="border border-chrome-200 rounded-md focus:outline-none"
                  style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12 }} />
                <datalist id="unit-list">
                  {COMMON_UNITS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div style={{ width: 80 }}>
                <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>Manpower</label>
                <input type="number" min={1} step={0.5} value={manpower} onChange={e => setManpower(Number(e.target.value))}
                  className="border border-chrome-200 rounded-md font-mono focus:outline-none"
                  style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12 }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 8 }}>
              cycle_time = ⌈measure / {stdMeasure || '?'}⌉ × {perMinute || '?'} × {manpower || '?'} ppl
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2" style={{ background: '#FFF0F0', borderRadius: 6, padding: '8px 12px', marginTop: 16, fontSize: 12, color: '#C8202A' }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
          <button onClick={onClose} className="rounded-md border border-chrome-200 hover:bg-chrome-50" style={{ height: 36, padding: '0 16px', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isEdit ? 'Save Changes' : 'Create'}
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
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ActivityTemplateDTO | null>(null)

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
      {creating && <ActivityFormModal onClose={() => setCreating(false)} />}
      {editing && <ActivityFormModal existing={editing} onClose={() => setEditing(null)} />}

      {/* Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/routings')} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 32, height: 32 }}>
            <ArrowLeft size={18} style={{ color: '#555' }} />
          </button>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Activity Templates</span>
          {meta && (
            <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
              {meta.total} items
            </span>
          )}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md flex items-center gap-1.5"
          style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#C8202A', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={13} /> New Activity
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center sticky z-30 border-b border-chrome-100 px-6 gap-2" style={{ height: 44, top: 110, background: '#F5F5F5' }}>
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
            placeholder="Search activity name, op_code..."
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
          <option value="">Work Center — All</option>
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
            Reset
          </button>
        )}

        <span className="flex-1" />
        {meta && (
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>
            Showing {filtered.length} of {meta.total}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white flex-1">
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 80px 1fr 90px 80px 80px 80px 110px', padding: '0 20px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', alignItems: 'center' }}>
          {['Activity', 'Op Code', 'Work Center', 'Formula', 'Rate', 'Std Measure', 'Manpower', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13, gap: 8 }}>
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 48, color: '#C8202A', fontSize: 13 }}>
            <AlertCircle size={16} /> Failed to load data
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
            No activity templates match the current filters
          </div>
        ) : (
          filtered.map(t => (
            <div
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className="cursor-pointer hover:bg-chrome-50 transition-colors"
              style={{ display: 'grid', gridTemplateColumns: '200px 80px 1fr 90px 80px 80px 80px 110px', alignItems: 'center', padding: '0 20px', height: 48, borderBottom: '1px solid #F0F0F0' }}
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

              <div style={{ fontSize: 12, color: '#555' }}>{t.manpower} ppl</div>

              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setEditing(t)}
                  className="flex items-center gap-1 rounded border border-chrome-200 hover:bg-chrome-50"
                  style={{ height: 26, padding: '0 8px', fontSize: 11, color: '#555' }}
                >
                  <Edit2 size={11} /> Edit
                </button>
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
            Page {meta.page} of {meta.pages} ({meta.total} items)
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
