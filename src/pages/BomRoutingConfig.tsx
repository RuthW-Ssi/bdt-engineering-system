import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Cpu, Wrench, FlaskConical, ChevronDown, ChevronRight, X, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useDispatchDetail } from '../hooks/useBomDispatches'
import {
  getRoutingTemplates, getRoutingTemplate, createRouting,
  type RoutingTemplateDTO, type RoutingTemplateDetailDTO,
} from '../api/routings'
import { paintApi, PAINT_TYPES } from '../api/paint'
import type { PaintType, PaintMaterialDto } from '../api/paint'
import { weldingApi } from '../api/welding'
import type { WireMaterialDto } from '../api/welding'


const TH: React.CSSProperties = {
  position: 'sticky', top: 0, background: '#F5F5F5', zIndex: 2,
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#555',
  textAlign: 'left', borderBottom: '2px solid #D0D0D0', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '8px 12px', fontSize: 13, verticalAlign: 'middle' }

// ── Consumable estimate modal ─────────────────────────────────────────────────

interface ConsumableModalProps {
  templateId: number
  assemblyId: number
  dispatchId: number
  assemblyMark: string
  assemblyQty: number
  weightKg: number | null
  surfaceM2: number | null
  onClose: () => void
}

type MatSelKey = PaintType | 'wire'

function ConsumableModal({
  templateId, assemblyId, dispatchId, assemblyMark, assemblyQty, weightKg, surfaceM2, onClose,
}: ConsumableModalProps) {
  const [detail, setDetail] = useState<RoutingTemplateDetailDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'summary' | 'detail'>('summary')
  const [matSel, setMatSel] = useState<Map<MatSelKey, number | null>>(new Map())
  const [paintMaterials, setPaintMaterials] = useState<PaintMaterialDto[]>([])
  const [wireMaterials, setWireMaterials] = useState<WireMaterialDto[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getRoutingTemplate(templateId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
    paintApi.getPaintMaterials().then(setPaintMaterials).catch(() => {})
    weldingApi.getWireMaterials().then(setWireMaterials).catch(() => {})
    // Pre-populate from saved config
    paintApi.getConfig(dispatchId).then(cfg => {
      const asmCfg = cfg.assemblies.find(a => a.assembly_id === assemblyId)
      if (!asmCfg) return
      setMatSel(prev => {
        const next = new Map(prev)
        for (const c of asmCfg.configs) if (c.material_id) next.set(c.paint_type, c.material_id)
        return next
      })
    }).catch(() => {})
    weldingApi.getConfig(dispatchId).then(cfg => {
      const asmCfg = cfg.assemblies.find(a => a.assembly_id === assemblyId)
      if (asmCfg?.material_id) setMatSel(prev => new Map(prev).set('wire', asmCfg.material_id))
    }).catch(() => {})
  }, [templateId, assemblyId, dispatchId])

  // Save material selections to paint/wire config
  const handleSaveMaterials = async () => {
    setSaving(true)
    try {
      await paintApi.saveConfig(dispatchId, {
        configs: PAINT_TYPES.map(pt => ({ assembly_id: assemblyId, paint_type: pt, material_id: matSel.get(pt) ?? null, layers: 1 })),
      })
      await weldingApi.saveConfig(dispatchId, {
        configs: [{ assembly_id: assemblyId, material_id: matSel.get('wire') ?? null, fillet_mm: null, sides: null, weld_layers: null }],
      })
      toast.success('บันทึกสำเร็จ')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  // Sprint 11b: rebuild consumable detection from Activity Library
  const { templatePaintTypes, templateHasWire } = useMemo(() => {
    return { templatePaintTypes: [] as PaintType[], templateHasWire: false }
  }, [])

  // Helpers
  const fmt = (n: number) => n.toFixed(4).replace(/\.?0+$/, '')

  // Calculate total and build formula string for one consumable row
  function calcRow(rate: number, unit: string | null, basis: string | null): {
    total: number | null; formula: string; basisLabel: string; basisValue: number | null
  } {
    const u = unit ?? ''
    if (basis === 'per_m2') {
      if (surfaceM2 == null) return { total: null, formula: `${fmt(rate)} ${u}/m² × ? m² × ${assemblyQty} pcs`, basisLabel: 'Surface area', basisValue: null }
      const total = rate * surfaceM2 * assemblyQty
      return { total, formula: `${fmt(rate)} ${u}/m² × ${fmt(surfaceM2)} m² × ${assemblyQty} pcs`, basisLabel: 'Surface area', basisValue: surfaceM2 }
    }
    if (basis === 'per_kg') {
      if (weightKg == null) return { total: null, formula: `${fmt(rate)} ${u}/kg × ? kg × ${assemblyQty} pcs`, basisLabel: 'Weight', basisValue: null }
      const total = rate * weightKg * assemblyQty
      return { total, formula: `${fmt(rate)} ${u}/kg × ${fmt(weightKg)} kg × ${assemblyQty} pcs`, basisLabel: 'Weight', basisValue: weightKg }
    }
    // per_unit or null
    const total = rate * assemblyQty
    return { total, formula: `${fmt(rate)} ${u}/pcs × ${assemblyQty} pcs`, basisLabel: 'Per piece', basisValue: null }
  }

  // Aggregate consumables across all ops, grouped by resource code
  type AggRow = {
    code: string; name: string; ops: Set<string>
    rate: number | null; unit: string | null; basis: string | null
  }
  const summaryMap = new Map<string, AggRow>()

  // Sprint 11b: consumable aggregation rebuilt with Activity Library
  const summary = [...summaryMap.values()]

  const PAINT_TYPE_LABEL: Record<PaintType, string> = {
    primer: 'Primer', intermediate: 'Intermediate', fireproof: 'Fireproof', topcoat: 'Topcoat',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <FlaskConical size={15} style={{ color: '#92400E' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1F1F1F' }}>Consumable Estimate</span>
              {detail && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>{detail.code}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'Assembly', value: assemblyMark, color: '#B45309', bg: '#FEF9C3' },
                { label: 'Qty', value: `${assemblyQty} pcs`, color: '#1F1F1F', bg: '#F3F4F6' },
                ...(weightKg != null ? [{ label: 'Weight', value: `${fmt(weightKg)} kg`, color: '#0C447C', bg: '#E6F1FB' }] : []),
                ...(surfaceM2 != null ? [{ label: 'Surface', value: `${fmt(surfaceM2)} m²`, color: '#065F46', bg: '#ECFDF5' }] : []),
              ].map(chip => (
                <span key={chip.label} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: chip.bg, color: chip.color, fontWeight: 500 }}>
                  {chip.label}: <strong>{chip.value}</strong>
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', marginLeft: 12 }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F0F0F0', padding: '0 20px' }}>
          {(['summary', 'detail'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: activeTab === tab ? '#92400E' : 'transparent', background: 'none', cursor: 'pointer', color: activeTab === tab ? '#92400E' : '#8E8E8E', marginBottom: -1 }}>
              {tab === 'summary' ? 'Summary' : 'Activity Detail'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div className="flex items-center justify-center" style={{ height: 120 }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#9CA3AF' }} />
            </div>
          )}

          {/* ── Summary Tab ── */}
          {!loading && activeTab === 'summary' && (
            <>
              {summary.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No consumables assigned in this template.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, position: 'sticky', top: 0 }}>Material</th>
                      <th style={{ ...TH, position: 'sticky', top: 0 }}>Operations</th>
                      <th style={{ ...TH, position: 'sticky', top: 0 }}>Formula</th>
                      <th style={{ ...TH, position: 'sticky', top: 0, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, i) => {
                      const calc = row.rate != null ? calcRow(row.rate, row.unit, row.basis) : null
                      const basisBadge = row.basis === 'per_m2' ? { label: '× m²', color: '#065F46', bg: '#ECFDF5' }
                        : row.basis === 'per_kg' ? { label: '× kg', color: '#0C447C', bg: '#E6F1FB' }
                        : { label: '× pcs', color: '#6B7280', bg: '#F3F4F6' }
                      return (
                        <tr key={row.code} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: '1px solid #F0F0F0', verticalAlign: 'top' }}>
                          <td style={{ ...TD, paddingTop: 10 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 6px', borderRadius: 3, display: 'inline-block' }}>{row.code}</span>
                              <span style={{ fontSize: 12, color: '#374151' }}>{row.name}</span>
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: basisBadge.bg, color: basisBadge.color, fontWeight: 600, display: 'inline-block', marginTop: 1 }}>{basisBadge.label}</span>
                            </div>
                          </td>
                          <td style={{ ...TD, paddingTop: 10 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {[...row.ops].map(op => <span key={op} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: '#F0F4FF', color: '#4B5EAA', fontWeight: 500 }}>{op}</span>)}
                            </div>
                          </td>
                          <td style={{ ...TD, paddingTop: 10 }}>
                            {calc ? <span className="font-mono" style={{ fontSize: 11, color: '#374151', background: '#F9FAFB', padding: '3px 7px', borderRadius: 4, display: 'inline-block', border: '1px solid #E5E7EB' }}>{calc.formula}</span>
                              : <span style={{ fontSize: 11, color: '#9CA3AF' }}>rate not set</span>}
                          </td>
                          <td style={{ ...TD, paddingTop: 10, textAlign: 'right' }}>
                            {calc?.total != null ? <span style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>{fmt(calc.total)} {row.unit ?? ''}</span>
                              : <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ── Activity Detail Tab ── */}
          {!loading && activeTab === 'detail' && (
            <div>
              {/* Material Brand Selectors */}
              {(templatePaintTypes.length > 0 || templateHasWire) && (
                <div style={{ padding: '12px 16px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Select Material Brand
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                    {templatePaintTypes.map(pt => (
                      <div key={pt} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#78350F' }}>{PAINT_TYPE_LABEL[pt]}</span>
                        <select
                          value={matSel.get(pt) ?? ''}
                          onChange={e => setMatSel(prev => { const m = new Map(prev); m.set(pt, e.target.value ? Number(e.target.value) : null); return m })}
                          style={{ height: 30, padding: '0 6px', fontSize: 11, border: '1px solid #FCD34D', borderRadius: 5, background: '#fff', minWidth: 180 }}
                        >
                          <option value="">— not selected —</option>
                          {paintMaterials.filter(m => (m.attributes as Record<string,unknown>)?.paint_type === pt).map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {templateHasWire && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#1E3A5F' }}>Welding Wire</span>
                        <select
                          value={matSel.get('wire') ?? ''}
                          onChange={e => setMatSel(prev => { const m = new Map(prev); m.set('wire', e.target.value ? Number(e.target.value) : null); return m })}
                          style={{ height: 30, padding: '0 6px', fontSize: 11, border: '1px solid #93C5FD', borderRadius: 5, background: '#fff', minWidth: 180 }}
                        >
                          <option value="">— not selected —</option>
                          {wireMaterials.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      onClick={handleSaveMaterials}
                      disabled={saving}
                      style={{ height: 30, padding: '0 12px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none', background: saving ? '#D1D5DB' : '#92400E', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Save size={11} />{saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Per-operation breakdown */}
              {detail && detail.operations.map(op => {
                return (
                  <div key={op.id}>
                    {/* Operation header */}
                    <div style={{ padding: '8px 16px', background: '#F0F4FF', borderBottom: '1px solid #DDE5FF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1F2D6E' }}>{op.name}</span>
                        <span style={{ fontSize: 10, color: '#6B7280', background: '#E5E7EB', padding: '1px 6px', borderRadius: 3 }}>{op.workcenter.code}</span>
                      </div>
                    </div>
                    {/* Sprint 11b: activity detail rebuilt with Activity Library */}
                  </div>
                )
              })}

              {detail && detail.operations.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No operations in this template.</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{ padding: '8px 20px', borderTop: '1px solid #F0F0F0', fontSize: 11, color: '#9CA3AF', display: 'flex', gap: 12, alignItems: 'center' }}>
            {activeTab === 'summary' && summary.length > 0 && (
              <>
                <span>{summary.length} consumable{summary.length > 1 ? 's' : ''}</span>
                <span style={{ color: '#fff', background: '#065F46', padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontSize: 10 }}>× m²</span>
                <span>= rate × area × qty</span>
                <span style={{ color: '#fff', background: '#0C447C', padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontSize: 10 }}>× kg</span>
                <span>= rate × weight × qty</span>
              </>
            )}
            {activeTab === 'detail' && (
              <span style={{ color: '#92400E' }}>* = estimated from template default (actual value unknown)</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Right panel: template resource preview ────────────────────────────────────

function TemplatePreviewPanel({ templateId }: { templateId: number }) {
  const [detail, setDetail] = useState<RoutingTemplateDetailDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  useEffect(() => {
    setDetail(null)
    setLoading(true)
    getRoutingTemplate(templateId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [templateId])

  const toggleOp = (opId: number) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(opId) ? next.delete(opId) : next.add(opId)
      return next
    })

  if (loading) return (
    <div className="flex items-center justify-center" style={{ height: 120 }}>
      <Loader2 size={16} className="animate-spin" style={{ color: '#9CA3AF' }} />
    </div>
  )

  if (!detail) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ padding: '10px 14px', background: '#F0F4FF', borderBottom: '1px solid #DDE5FF' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5EAA', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {detail.code}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', marginTop: 2 }}>{detail.name}</div>
        <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>{detail.operations.length} operations</div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {detail.operations.map(op => {
          const isOpen = !collapsed.has(op.id)
          const allMachines: { name: string }[] = []
          const allTools: { name: string }[] = []
          const allConsumables: { name: string }[] = []

          return (
            <div key={op.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
              {/* Operation header */}
              <button
                onClick={() => toggleOp(op.id)}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isOpen ? <ChevronDown size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#8E8E8E', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1F1F1F' }}>{op.name}</span>
                  <span style={{ fontSize: 11, color: '#8E8E8E', marginLeft: 6 }}>{op.workcenter.code}</span>
                </div>
              </button>

              {/* Resource rows */}
              {isOpen && (
                <div style={{ padding: '0 14px 10px 30px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allMachines.length > 0 && (
                    <ResourceRow icon={<Cpu size={11} />} label="Machine" color="#0C447C" bg="#E6F1FB"
                      items={allMachines.map(m => m!.name)} />
                  )}
                  {allTools.length > 0 && (
                    <ResourceRow icon={<Wrench size={11} />} label="Tool & Equipment" color="#065F46" bg="#ECFDF5"
                      items={[...new Set(allTools.map(t => t.name))]} />
                  )}
                  {allConsumables.length > 0 && (
                    <ResourceRow icon={<FlaskConical size={11} />} label="Consumable" color="#92400E" bg="#FEF3C7"
                      items={[...new Set(allConsumables.map(c => c.name))]} />
                  )}
                  {allMachines.length === 0 && allTools.length === 0 && allConsumables.length === 0 && (
                    <span style={{ fontSize: 11, color: '#C2C2C2' }}>No resources assigned</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResourceRow({ icon, label, color, bg, items }: {
  icon: React.ReactNode; label: string; color: string; bg: string; items: string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map((name, i) => (
          <span key={i} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: bg, color, fontWeight: 500 }}>
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────

export function RoutingConfigContent({ dispatchId }: { dispatchId: number }) {
  const { data: detail, isLoading } = useDispatchDetail(dispatchId)
  const [templates, setTemplates] = useState<RoutingTemplateDTO[]>([])
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null)
  const [modal, setModal] = useState<{
    templateId: number; assemblyId: number; assemblyMark: string; assemblyQty: number
    weightKg: number | null; surfaceM2: number | null
  } | null>(null)

  useEffect(() => {
    getRoutingTemplates().then(setTemplates).catch(() => setTemplates([]))
  }, [])

  const assemblies = (detail?.assemblies ?? []).filter(a => a.product)

  const handleApply = async () => {
    if (!selected.size) return
    setSaving(true)
    const newSaved = new Set(saved)
    try {
      for (const [productCode, templateId] of selected) {
        const tpl = templates.find(t => t.id === templateId)
        if (!tpl) continue
        await createRouting(productCode, { from_template: tpl.code })
        newSaved.add(productCode)
      }
      setSaved(newSaved)
      setSelected(new Map())
      toast.success('Apply routing สำเร็จ')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to apply routing')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center" style={{ height: 200 }}>
      <Loader2 size={20} className="animate-spin" style={{ color: '#9CA3AF' }} />
    </div>
  )

  if (assemblies.length === 0) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
      No matched assemblies found in this dispatch.
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 16, padding: '20px 0', minHeight: 0 }}>
      {/* ── Left: assembly table ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ border: '1px solid #E0E0E0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Assembly Mark</th>
                  <th style={TH}>Name</th>
                  <th style={TH}>Product Code</th>
                  <th style={TH}>Routing Template</th>
                </tr>
              </thead>
              <tbody>
                {assemblies.map((asm, i) => {
                  const productCode = asm.product!.product_code
                  const isSaved = saved.has(productCode)
                  return (
                    <tr key={asm.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>
                      <td style={TD}>
                        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: '#B45309' }}>
                          {asm.assembly_mark}
                        </span>
                      </td>
                      <td style={TD}>
                        <span style={{ color: '#555' }}>{asm.name ?? '—'}</span>
                      </td>
                      <td style={TD}>
                        <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: '#0C447C',
                          background: '#E6F1FB', borderRadius: 4, padding: '2px 8px' }}>
                          {productCode}
                        </span>
                      </td>
                      <td style={TD}>
                        {isSaved ? (
                          <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>✓ Applied</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select
                              style={{ height: 32, padding: '0 8px', fontSize: 12, border: '1px solid #E0E0E0',
                                borderRadius: 6, background: '#fff', minWidth: 180 }}
                              value={selected.get(productCode) ?? ''}
                              onChange={e => {
                                const v = e.target.value
                                const numV = Number(v)
                                setSelected(prev => {
                                  const next = new Map(prev)
                                  if (v) next.set(productCode, numV)
                                  else next.delete(productCode)
                                  return next
                                })
                                if (v) setPreviewTemplateId(numV)
                              }}>
                              <option value="">— Select template —</option>
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
                              ))}
                            </select>
                            {selected.get(productCode) && (
                              <button
                                title="View consumable estimate"
                                onClick={() => setModal({
                                  templateId: selected.get(productCode)!,
                                  assemblyId: asm.id,
                                  assemblyMark: asm.assembly_mark,
                                  assemblyQty: asm.assembly_qty,
                                  weightKg: asm.total_weight_kg,
                                  surfaceM2: asm.surface_area_m2,
                                })}
                                style={{ height: 32, width: 32, borderRadius: 6, border: '1px solid #FCD34D',
                                  background: '#FFFBEB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <FlaskConical size={14} style={{ color: '#92400E' }} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>
            {assemblies.length} assemblies · {saved.size} routing(s) applied
          </span>
          <button
            onClick={handleApply}
            disabled={saving || selected.size === 0}
            className="flex items-center gap-2 rounded-md text-white disabled:opacity-50"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#065F46' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Apply Routing ({selected.size})
          </button>
        </div>
      </div>

      {/* ── Right: template preview ── */}
      <div style={{
        width: 280, flexShrink: 0, border: '1px solid #E0E0E0', borderRadius: 8,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        background: previewTemplateId ? '#fff' : '#FAFAFA',
        alignSelf: 'flex-start',
      }}>
        {previewTemplateId ? (
          <TemplatePreviewPanel templateId={previewTemplateId} />
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#C2C2C2', fontSize: 12 }}>
            Select a template to preview resources
          </div>
        )}
      </div>

      {/* ── Consumable modal ── */}
      {modal && (
        <ConsumableModal
          templateId={modal.templateId}
          assemblyId={modal.assemblyId}
          dispatchId={dispatchId}
          assemblyMark={modal.assemblyMark}
          assemblyQty={modal.assemblyQty}
          weightKg={modal.weightKg}
          surfaceM2={modal.surfaceM2}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Standalone page wrapper ───────────────────────────────────────────────────

export function BomRoutingConfig() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatchId = id ? Number(id) : undefined

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
        <button onClick={() => navigate('/bom')}
          className="flex items-center gap-1 hover:underline"
          style={{ fontSize: 13, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ChevronLeft size={14} /> Back
        </button>
        <span style={{ color: '#D0D0D0' }}>|</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Config Routing</span>
      </div>
      {dispatchId && <RoutingConfigContent dispatchId={dispatchId} />}
    </div>
  )
}
