import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Clock, XCircle, ArrowDownLeft, GitBranch, FileText, Download, AlertCircle, RefreshCw, Layers, ExternalLink, Pencil } from 'lucide-react'
import { useProduct, useProductAction, useProductMessages, useUpdateProductSpec } from '../hooks/useProducts'
import type { PaintSpecPreset, WeldingSpecPreset } from '../api/types'
import { useMaterialsByPrefix } from '../hooks/useMasters'
import { useDrawings } from '../hooks/useDrawings'
import { useRouting, useStdCost } from '../hooks/useRoutings'
import { ProductTypeBadge } from '../components/product/ProductTypeBadge'
import { ProductStatePill } from '../components/product/ProductStatePill'
import type { ProductState } from '../api/types'

const TABS = ['Overview', 'Drawings', 'Routing', 'Cost', 'Audit Log']

const ROUTING_STATE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: '#F5F5F5', text: '#555', label: 'Draft' },
  active:   { bg: '#EAF5E9', text: '#2E7D32', label: 'Active' },
  obsolete: { bg: '#FFF3E0', text: '#E65100', label: 'Obsolete' },
}

function fmtTime(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const DRAWING_STATE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  draft:      { bg: '#F5F5F5',  text: '#555555', border: '#C2C2C2' },
  in_review:  { bg: '#FAEEDA',  text: '#854F0B', border: '#FAC775' },
  approved:   { bg: '#EAF3DE',  text: '#27500A', border: '#C0DD97' },
  released:   { bg: '#E6F1FB',  text: '#0C447C', border: '#B5D4F4' },
  superseded: { bg: '#F3E8FF',  text: '#6D28D9', border: '#C4B5FD' },
  obsolete:   { bg: '#F5F5F5',  text: '#8E8E8E', border: '#E0E0E0' },
}

const DRAWING_STATE_LABELS: Record<string, string> = {
  draft: 'Draft', in_review: 'In Review', approved: 'Approved',
  released: 'Released', superseded: 'Superseded', obsolete: 'Obsolete',
}

function formatFileSize(bytes: string | null): string {
  if (!bytes) return ''
  const n = Number(bytes)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} KB`
  return `${n} B`
}

interface ActionDef { action: string; label: string; bg: string; confirm: string; destructive?: boolean }

const ACTION_BUTTONS: Record<string, ActionDef[]> = {
  draft:     [{ action: 'action_submit_design', label: 'Submit for Design', bg: '#0C447C', confirm: 'Confirm submission to the design stage?' }],
  in_design: [
    { action: 'action_reset', label: 'Back to Draft', bg: '#8E8E8E', confirm: 'Revert to Draft?', destructive: true },
    { action: 'action_submit_review', label: 'Submit for Review', bg: '#854F0B', confirm: 'Confirm submission to Reviewer?' },
  ],
  in_review: [
    { action: 'action_reset', label: 'Reject', bg: '#C8202A', confirm: 'Reject and revert to Draft?', destructive: true },
    { action: 'action_approve', label: 'Approve', bg: '#639922', confirm: 'Confirm approval of this Product?' },
  ],
  approved:  [
    { action: 'action_reset', label: 'Revert', bg: '#8E8E8E', confirm: 'Revert to Draft?', destructive: true },
    { action: 'action_release', label: 'Release', bg: '#065F46', confirm: 'Confirm release? (Mark will be locked and cannot be edited)' },
  ],
  released:  [{ action: 'action_obsolete', label: 'Obsolete', bg: '#8A1520', confirm: 'Confirm marking this Product as Obsolete? (Cannot be undone)', destructive: true }],
}

export function ProductDetail() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null)
  const [actionComment, setActionComment] = useState('')
  const [actionError, setActionError] = useState('')

  const [editingSpec, setEditingSpec] = useState(false)
  const [specDraft, setSpecDraft] = useState<{ paint: PaintSpecPreset | null; welding: WeldingSpecPreset | null }>({ paint: null, welding: null })
  const [specSaveError, setSpecSaveError] = useState('')

  const { data: product, isLoading, isError } = useProduct(code ?? '')
  const { mutateAsync: doAction, isPending: actioning } = useProductAction(code ?? '')
  const { data: messages = [] } = useProductMessages(code ?? '')
  const { mutateAsync: saveSpec, isPending: savingSpec } = useUpdateProductSpec(code ?? '')
  const { drawings, loading: drawingsLoading, error: drawingsError } = useDrawings(code)
  const { routing, state: routingState, totalTimeMin, loading: routingLoading, recompute } = useRouting(code)
  const { stdCost, recompute: recomputeCost } = useStdCost(code)

  const { data: paintMaterials = [] } = useMaterialsByPrefix('PAINT')
  const { data: weldingMaterials = [] } = useMaterialsByPrefix('WC000')
  const paintByCode = Object.fromEntries(paintMaterials.map(m => [m.default_code, m.name]))
  const weldByCode = Object.fromEntries(weldingMaterials.map(m => [m.default_code, m.name]))

  const handleRoutingRecompute = async () => {
    try {
      await recompute.mutateAsync()
      await recomputeCost.mutateAsync()
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Recompute failed')
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      <Loader2 size={20} className="animate-spin" />Loading...
    </div>
  )

  if (isError || !product) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      Product {code} not found
    </div>
  )

  const actions = ACTION_BUTTONS[product.state] ?? []

  const markDisplay = product.product_type === 'custom'
    ? [product.erection_zone?.code, product.mark_prefix, product.mark_number].filter(Boolean).join('-')
    : null

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="bg-white flex items-center sticky border-b border-chrome-100 px-5 gap-3" style={{ top: 56, height: 56, zIndex: 40 }}>
        <button onClick={() => navigate('/engineer-products')} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{product.product_code}</span>
        {product.engineering_code && (
          <>
            <span style={{ color: '#C2C2C2' }}>·</span>
            <span className="font-mono" style={{ fontSize: 12, color: '#555' }}>{product.engineering_code}</span>
          </>
        )}
        {product.item_code && (
          <>
            <span style={{ color: '#C2C2C2' }}>·</span>
            <span className="font-mono" style={{ fontSize: 12, color: '#185FA5' }}>{product.item_code}</span>
          </>
        )}
        <ProductTypeBadge type={product.product_type} />
        <ProductStatePill state={product.state as ProductState} />
        {product.has_custom_routing && (
          <button
            onClick={() => navigate(`/products/${product.product_code}/custom-routing`)}
            style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Custom Routing
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => navigate(`/bom/${product.product_code}`)}
          className="flex items-center gap-1.5 rounded-md"
          style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500, border: '1px solid #C2C2C2', color: '#3A3A3A', background: 'white' }}
        >
          <GitBranch size={14} />BOM Editor
        </button>

        {actions.map(a => (
          <button key={a.action}
            onClick={() => { setConfirmAction(a); setActionComment(''); setActionError('') }}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{
              height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: a.bg,
              ...(a.destructive ? { background: 'transparent', color: a.bg, border: `1px solid ${a.bg}` } : {}),
            }}>
            {a.destructive ? <ArrowDownLeft size={14} /> : <Send size={14} />}
            {a.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-chrome-100 sticky px-5 flex gap-1" style={{ top: 112, zIndex: 39 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 14px', fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#C8202A' : '#8E8E8E',
              borderBottom: `2px solid ${activeTab === tab ? '#C8202A' : 'transparent'}`,
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ padding: 24 }}>
        {activeTab === 'Overview' && (
          <div className="flex gap-6" style={{ maxWidth: 1100 }}>
            <div className="flex-1 flex flex-col gap-4">
              {/* Product Info */}
              <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 16 }}>Product Info</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Name</div>
                    <div style={{ fontSize: 13, color: '#1F1F1F', fontWeight: 500 }}>{product.name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Category</div>
                    <div style={{ fontSize: 13, color: '#555' }}>{product.category?.name ?? '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Product Code</div>
                    <div className="font-mono" style={{ fontSize: 13, fontWeight: 600 }}>{product.product_code}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Odoo Compliance</div>
                    <div style={{ fontSize: 13, color: '#555' }}>{product.odoo_compliance_status}</div>
                  </div>

                  {/* Standard-only fields */}
                  {product.product_type === 'standard' && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>sale_ok</div>
                        <div style={{ fontSize: 13 }}>{product.sale_ok ? '✓ Yes' : '✗ No'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>purchase_ok</div>
                        <div style={{ fontSize: 13 }}>{product.purchase_ok ? '✓ Yes' : '✗ No'}</div>
                      </div>
                    </>
                  )}

                  {/* Custom-only fields */}
                  {product.product_type === 'custom' && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Project</div>
                        <div style={{ fontSize: 13, color: '#555' }}>
                          {product.project ? `${product.project.project_code} — ${product.project.name}` : '-'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Zone</div>
                        <div style={{ fontSize: 13, color: '#555' }}>
                          {product.erection_zone ? `${product.erection_zone.code} — ${product.erection_zone.label}` : '-'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Mark</div>
                        <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#B45309' }}>{markDisplay}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 4 }}>Mark Prefix</div>
                        <div style={{ fontSize: 13, color: '#555' }}>
                          {product.mark ? `${product.mark.code} — ${product.mark.label}` : '-'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Variant Attributes — Profile & Assembly Info */}
              {product.product_type === 'standard' && product.variant_attributes && Object.keys(product.variant_attributes).length > 0 && (() => {
                const va = product.variant_attributes as Record<string, any>
                const isAssembly = va.assembly_type != null || Array.isArray(va.typical_parts)
                const typicalParts = Array.isArray(va.typical_parts)
                  ? va.typical_parts as Array<{ product_code: string; name: string; profile?: string; grade?: string; qty: number }>
                  : []
                const DIMS = [
                  { key: 'height_mm', label: 'Height' }, { key: 'width_mm', label: 'Width' },
                  { key: 'web_thickness_mm', label: 'Web t' }, { key: 'flange_thickness_mm', label: 'Flange t' },
                  { key: 'thickness_mm', label: 'Thickness' }, { key: 'diameter_mm', label: 'Diameter' },
                  { key: 'outer_diameter_mm', label: 'OD' }, { key: 'leg_a_mm', label: 'Leg A' },
                  { key: 'leg_b_mm', label: 'Leg B' },
                ].filter(d => va[d.key] != null)
                return (
                  <>
                    <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 16 }}>
                        {isAssembly ? 'Assembly Info' : 'Profile & Material'}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        {va.profile && (
                          <span className="font-mono" style={{ background: '#E6F1FB', color: '#0C447C', border: '1px solid #B5D4F4', borderRadius: 6, padding: '4px 14px', fontSize: 15, fontWeight: 700 }}>
                            {va.profile}
                          </span>
                        )}
                        {va.grade && (
                          <span style={{ background: '#EAF3DE', color: '#27500A', border: '1px solid #C0DD97', borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
                            {va.grade}
                          </span>
                        )}
                        {va.assembly_type && (
                          <span style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                            {String(va.assembly_type).replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      {DIMS.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px 16px' }}>
                          {DIMS.map(d => (
                            <div key={d.key}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 2 }}>{d.label}</div>
                              <div className="font-mono" style={{ fontSize: 13, color: '#1F1F1F' }}>{va[d.key]} mm</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {isAssembly && typicalParts.length > 0 && (
                      <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 16 }}>
                          Assembly Parts <span style={{ fontSize: 12, fontWeight: 400, color: '#8E8E8E' }}>({typicalParts.length} items)</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 50px', gap: '0 12px', padding: '6px 0', borderBottom: '2px solid #E0E0E0', fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>
                          <div>Code</div><div>Name</div><div>Profile</div><div>Qty</div>
                        </div>
                        {typicalParts.map((p, i) => (
                          <div
                            key={i}
                            onClick={() => navigate(`/engineer-products/${p.product_code}`)}
                            style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 50px', gap: '0 12px', padding: '8px 0', borderBottom: '1px solid #F5F5F5', alignItems: 'center', cursor: 'pointer', borderRadius: 4 }}
                            className="hover:bg-chrome-50"
                          >
                            <div className="font-mono" style={{ fontSize: 12, color: '#185FA5', fontWeight: 600 }}>{p.product_code}</div>
                            <div style={{ fontSize: 12, color: '#1F1F1F' }} className="truncate">{p.name}</div>
                            <div className="font-mono" style={{ fontSize: 11, color: '#555' }}>{p.profile ?? '—'}</div>
                            <div className="font-mono" style={{ fontSize: 13, fontWeight: 700 }}>×{p.qty}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}


              {/* Spec Presets (standard products) */}
              {product.product_type === 'standard' && (product.default_paint_spec || product.default_welding_spec) && (() => {
                const PAINT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
                  primer:       { bg: '#E6F1FB', text: '#0C447C', border: '#B5D4F4' },
                  intermediate: { bg: '#F3E8FF', text: '#6D28D9', border: '#C4B5FD' },
                  fireproof:    { bg: '#FFF3E0', text: '#92400E', border: '#FFCC80' },
                  topcoat:      { bg: '#EAF3DE', text: '#27500A', border: '#C0DD97' },
                }
                return (
                  <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>Spec Presets</div>
                      <button
                        onClick={() => {
                          setSpecDraft({
                            paint: product.default_paint_spec ? JSON.parse(JSON.stringify(product.default_paint_spec)) : null,
                            welding: product.default_welding_spec ? JSON.parse(JSON.stringify(product.default_welding_spec)) : null,
                          })
                          setSpecSaveError('')
                          setEditingSpec(true)
                        }}
                        className="flex items-center gap-1 rounded hover:bg-chrome-50"
                        style={{ padding: '4px 10px', fontSize: 12, color: '#555', border: '1px solid #E0E0E0' }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    </div>

                    {product.default_paint_spec && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 8 }}>Paint Spec</div>
                        <div className="flex flex-col gap-1.5">
                          {product.default_paint_spec.layers.map((layer, i) => {
                            const col = PAINT_COLORS[layer.paint_type] ?? PAINT_COLORS.primer
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: col.bg, border: `1px solid ${col.border}`, borderRadius: 6, padding: '7px 14px' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: col.text, minWidth: 90, textTransform: 'uppercase' }}>{layer.paint_type}</span>
                                <span style={{ fontSize: 12, color: '#1F1F1F', flex: 1 }}>{paintByCode[layer.material_code] ?? layer.material_code}</span>
                                {layer.microns != null && (
                                  <span style={{ fontSize: 11, color: '#555' }}>{layer.microns} μm</span>
                                )}
                                <span style={{ fontSize: 11, color: '#8E8E8E' }}>×{layer.layers} coat</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {product.default_welding_spec && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 8 }}>Welding Spec</div>
                        <div style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 6, padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px' }}>
                          <div>
                            <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 2 }}>Wire</div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{weldByCode[product.default_welding_spec.material_code] ?? product.default_welding_spec.material_code}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 2 }}>Fillet</div>
                            <div className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{product.default_welding_spec.fillet_mm} mm</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 2 }}>Sides</div>
                            <div className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{product.default_welding_spec.sides}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 2 }}>Weld Layers</div>
                            <div className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{product.default_welding_spec.weld_layers}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Raw fallback — non-standard products, or any unhandled attribute keys */}
              {product.attributes && (() => {
                const a = product.attributes as Record<string, any>
                const HANDLED = new Set(['surface_area_m2', 'primer', 'primer_dft_um', 'primer_liters', 'intermediate', 'intermediate_dft_um', 'intermediate_liters', 'fireproof', 'fireproof_dft_um', 'fireproof_liters', 'topcoat', 'topcoat_dft_um', 'topcoat_liters', 'welding_wire', 'weld_type', 'welding_fillet_mm', 'part_thickness_mm', 'welding_layer', 'welding_path_m', 'tak_point_ea', 'weld_wire_kg', 'weld_wire_boxes'])
                const remaining = Object.entries(a).filter(([k]) => product.product_type !== 'standard' || !HANDLED.has(k))
                if (remaining.length === 0) return null
                return (
                  <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 16 }}>Engineering Attributes</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px' }}>
                      {remaining.map(([key, val]) => (
                        <div key={key}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 2 }}>{key}</div>
                          <div className="font-mono" style={{ fontSize: 13, color: '#1F1F1F' }}>{String(val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Right sidebar */}
            <div style={{ width: 280, flexShrink: 0 }} className="flex flex-col gap-4">
              <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 12 }}>Status</div>
                <ProductStatePill state={product.state as ProductState} />
                <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 8 }}>
                  Last updated {new Date(product.write_date).toLocaleDateString('en-GB')} by {product.write_user?.name ?? '-'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Drawings' && (
          <div style={{ maxWidth: 860 }}>
            {drawingsLoading && (
              <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E' }}>
                <Loader2 size={20} className="animate-spin" />Loading...
              </div>
            )}
            {drawingsError && !drawingsLoading && (
              <div className="flex items-center gap-2" style={{ padding: 32, color: '#C8202A', fontSize: 13 }}>
                <AlertCircle size={16} />{drawingsError}
              </div>
            )}
            {!drawingsLoading && !drawingsError && drawings.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
                <FileText size={32} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 13 }}>No Shop Drawings found for {code}</div>
              </div>
            )}
            {!drawingsLoading && drawings.map(dwg => {
              const st = DRAWING_STATE_STYLE[dwg.state] ?? DRAWING_STATE_STYLE.draft
              const revs = [...dwg.revisions].sort((a, b) => b.sequence - a.sequence)
              return (
                <div key={dwg.id} className="bg-white rounded-lg border border-chrome-100 mb-4" style={{ overflow: 'hidden' }}>
                  {/* Drawing header */}
                  <div className="flex items-center gap-3 border-b border-chrome-100" style={{ padding: '14px 20px' }}>
                    <FileText size={16} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                    <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{dwg.drawing_number}</span>
                    <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#555' }}>
                      {dwg.drawing_type}
                    </span>
                    <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#555' }}>
                      {dwg.cad_source}
                    </span>
                    <span style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 500, color: st.text }}>
                      {DRAWING_STATE_LABELS[dwg.state] ?? dwg.state}
                    </span>
                    {dwg.current_revision && (
                      <span style={{ fontSize: 12, color: '#8E8E8E', marginLeft: 'auto' }}>
                        Rev <span className="font-mono" style={{ fontWeight: 700, color: '#0C447C' }}>{dwg.current_revision}</span> (current)
                      </span>
                    )}
                  </div>

                  {/* Revisions table */}
                  {revs.length === 0 ? (
                    <div style={{ padding: '16px 20px', fontSize: 12, color: '#8E8E8E' }}>No revisions yet</div>
                  ) : (
                    <>
                      {/* Column headers */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px 120px 44px',
                        padding: '6px 20px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
                        fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase',
                      }}>
                        <div>Rev</div><div>Description</div><div>Size</div><div>Type</div><div>Date</div><div />
                      </div>
                      {revs.map(rev => (
                        <div key={rev.id} style={{
                          display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px 120px 44px',
                          alignItems: 'center', padding: '10px 20px',
                          borderBottom: '1px solid #F5F5F5',
                          background: rev.is_current ? '#F0F7FF' : 'white',
                        }}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono" style={{
                              fontSize: 13, fontWeight: 700,
                              color: rev.is_current ? '#0C447C' : '#555',
                              background: rev.is_current ? '#DCE8F8' : '#F5F5F5',
                              border: `1px solid ${rev.is_current ? '#B5D4F4' : '#E0E0E0'}`,
                              borderRadius: 4, padding: '1px 6px',
                            }}>{rev.revision}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#555', paddingRight: 12 }} className="truncate">
                            {rev.change_summary || <span style={{ color: '#C2C2C2' }}>—</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#8E8E8E' }}>{formatFileSize(rev.file_size_bytes)}</div>
                          <div style={{ fontSize: 11, color: '#8E8E8E' }}>{rev.file_mime_type?.split('/')[1]?.toUpperCase() ?? '—'}</div>
                          <div style={{ fontSize: 11, color: '#8E8E8E' }}>
                            {new Date(rev.create_date).toLocaleDateString('en-GB')}
                            {rev.approver && <div style={{ fontSize: 10, color: '#C2C2C2' }}>Approved by {rev.approver.name}</div>}
                          </div>
                          <div className="flex items-center justify-center">
                            <a
                              href={rev.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center rounded hover:bg-chrome-100"
                              style={{ width: 28, height: 28, color: '#0C447C' }}
                              title="Download"
                            >
                              <Download size={14} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'Routing' && (
          <div style={{ maxWidth: 760 }}>
            {routingLoading ? (
              <div className="flex items-center gap-2" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
                <Loader2 size={16} className="animate-spin" /> Loading routing...
              </div>
            ) : routing.length === 0 ? (
              <div className="bg-white rounded-lg border border-chrome-100 flex flex-col items-center justify-center gap-3" style={{ padding: 48 }}>
                <Layers size={32} style={{ color: '#C2C2C2' }} />
                <div style={{ fontSize: 13, color: '#8E8E8E' }}>No Routing found for {code}</div>
                <button
                  onClick={() => navigate(`/routings/${code}`)}
                  className="flex items-center gap-1.5 rounded-md text-white"
                  style={{ height: 34, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#185FA5' }}
                >
                  <ExternalLink size={13} /> Open Routing Editor
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Summary card */}
                <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>Routing Summary</div>
                      {routingState && (
                        <span style={{
                          background: ROUTING_STATE_STYLE[routingState]?.bg ?? '#F5F5F5',
                          color: ROUTING_STATE_STYLE[routingState]?.text ?? '#555',
                          borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                        }}>
                          {ROUTING_STATE_STYLE[routingState]?.label ?? routingState}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRoutingRecompute}
                        disabled={recompute.isPending || recomputeCost.isPending}
                        className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
                        style={{ height: 30, padding: '0 10px', fontSize: 12, color: '#555' }}
                      >
                        {(recompute.isPending || recomputeCost.isPending)
                          ? <Loader2 size={12} className="animate-spin" />
                          : <RefreshCw size={12} />}
                        Recompute
                      </button>
                      <button
                        onClick={() => navigate(product.has_custom_routing ? `/products/${code}/custom-routing` : `/routings/${code}`)}
                        className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
                        style={{ height: 30, padding: '0 10px', fontSize: 12, color: product.has_custom_routing ? '#E65100' : '#185FA5' }}
                      >
                        <ExternalLink size={12} /> {product.has_custom_routing ? 'Custom Routing' : 'Routing Editor'}
                      </button>
                    </div>
                  </div>

                  {/* Total time */}
                  <div className="flex items-center gap-8 mb-4">
                    <div>
                      <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 2 }}>Total Cycle Time</div>
                      <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: totalTimeMin > 0 ? '#185FA5' : '#8E8E8E' }}>
                        {totalTimeMin > 0 ? fmtTime(totalTimeMin) : '—'}
                      </div>
                      {totalTimeMin > 0 && <div style={{ fontSize: 11, color: '#8E8E8E' }}>{Math.round(totalTimeMin)} min</div>}
                    </div>
                    {stdCost && (
                      <div>
                        <div style={{ fontSize: 11, color: '#8E8E8E', marginBottom: 2 }}>Production Cost</div>
                        <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: '#1F1F1F' }}>
                          ฿{stdCost.total_production_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 11, color: '#8E8E8E' }}>
                          Computed on {new Date(stdCost.computed_at).toLocaleDateString('en-GB')}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Operations table */}
                  <div style={{ borderTop: '1px solid #E0E0E0', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', marginBottom: 8 }}>Operations</div>
                    {routing.map(op => (
                      <div key={op.id} className="flex items-center justify-between py-2 border-b border-chrome-50">
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ fontSize: 11, color: '#8E8E8E' }}>seq {op.sequence}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{op.name}</span>
                          <span style={{ fontSize: 11, color: '#8E8E8E' }}>({op.workcenter.code})</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span style={{ fontSize: 11, color: '#8E8E8E' }}>{op.activities.length} activities</span>
                          <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: Number(op.time_cycle) > 0 ? '#185FA5' : '#8E8E8E' }}>
                            {Number(op.time_cycle) > 0 ? `${Math.round(Number(op.time_cycle))} min` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Cost' && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20, maxWidth: 500 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Cost Components</div>
            {[
              { label: 'Raw Material', val: product.cost_raw_material },
              { label: 'Transport', val: product.cost_transport },
              { label: 'Production', val: product.cost_production },
              { label: 'Warehouse', val: product.cost_warehouse },
            ].map(c => (
              <div key={c.label} className="flex items-center justify-between py-2 border-b border-chrome-50">
                <span style={{ fontSize: 13, color: '#555' }}>{c.label}</span>
                <span className="font-mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {c.val ? parseFloat(c.val).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '—'}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3" style={{ borderTop: '2px solid #1F1F1F', marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Standard Cost Total</span>
              <span className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: '#1F1F1F' }}>
                {[product.cost_raw_material, product.cost_transport, product.cost_production, product.cost_warehouse]
                  .reduce((sum, v) => sum + (v ? parseFloat(v) : 0), 0)
                  .toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB
              </span>
            </div>
          </div>
        )}

        {activeTab === 'Audit Log' && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20, maxWidth: 700 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Activity Log</div>
            {(messages as any[]).length === 0 && (
              <div style={{ color: '#8E8E8E', fontSize: 13 }}>No activity yet</div>
            )}
            {(messages as any[]).map((msg: any) => (
              <div key={msg.id} className="flex gap-3 pb-4 mb-4 border-b border-chrome-50 last:border-0">
                <Clock size={14} style={{ color: '#8E8E8E', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{msg.subject}</div>
                  {msg.body && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{msg.body}</div>}
                  {msg.tracking && Array.isArray(msg.tracking) && msg.tracking.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {msg.tracking.map((t: any, ti: number) => (
                        <div key={ti} className="font-mono" style={{ fontSize: 11, color: '#854F0B', background: '#FAEEDA', padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginRight: 4, marginTop: 2 }}>
                          {t.field}: {String(t.old_value ?? '—')} → {String(t.new_value ?? '—')}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 4 }}>
                    {new Date(msg.date).toLocaleString('en-GB')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Spec Modal */}
      {editingSpec && specDraft && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl" style={{ width: 560, maxHeight: '85vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Edit Spec Presets</div>
            <div style={{ fontSize: 12, color: '#8E8E8E', marginBottom: 20 }}>{product.product_code} — {product.name}</div>

            {/* Welding Spec */}
            {specDraft.welding && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Welding Spec</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Welding Wire</label>
                    <select
                      className="w-full border rounded-md focus:outline-none"
                      style={{ height: 34, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0', background: '#fff' }}
                      value={specDraft.welding.material_code}
                      onChange={e => setSpecDraft(d => ({ ...d, welding: { ...d.welding!, material_code: e.target.value } }))}
                    >
                      <option value="">— Select —</option>
                      {weldingMaterials.map(m => <option key={m.default_code} value={m.default_code}>{m.name}</option>)}
                    </select>
                  </div>
                  {[
                    { key: 'fillet_mm', label: 'Fillet Size (mm)' },
                    { key: 'sides', label: 'Sides' },
                    { key: 'weld_layers', label: 'Weld Layers' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>{f.label}</label>
                      <input
                        type="number"
                        className="w-full border rounded-md font-mono focus:outline-none"
                        style={{ height: 34, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                        value={(specDraft.welding as any)[f.key]}
                        onChange={e => setSpecDraft(d => ({
                          ...d,
                          welding: { ...d.welding!, [f.key]: Number(e.target.value) },
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paint Spec Layers */}
            {specDraft.paint && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Paint Spec Layers</div>
                <div className="flex flex-col gap-3">
                  {specDraft.paint.layers.map((layer, i) => (
                    <div key={i} style={{ background: '#F8F8F8', border: '1px solid #E0E0E0', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', marginBottom: 8 }}>
                        Layer {i + 1} — {layer.paint_type}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', display: 'block', marginBottom: 3 }}>Material</label>
                          <select
                            className="w-full border rounded focus:outline-none"
                            style={{ height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0', background: '#fff' }}
                            value={layer.material_code}
                            onChange={e => {
                              const mat = paintMaterials.find(m => m.default_code === e.target.value)
                              setSpecDraft(d => {
                                const layers = [...d.paint!.layers]
                                layers[i] = {
                                  ...layers[i],
                                  material_code: e.target.value,
                                  ...(mat?.attributes?.paint_micron ? { microns: Number(mat.attributes.paint_micron) } : {}),
                                }
                                return { ...d, paint: { layers } }
                              })
                            }}
                          >
                            <option value="">— Select —</option>
                            {paintMaterials
                              .filter(m => (m.attributes as any)?.paint_type === layer.paint_type)
                              .map(m => <option key={m.default_code} value={m.default_code}>{m.name}</option>)
                            }
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', display: 'block', marginBottom: 3 }}>DFT (μm)</label>
                          <input
                            type="number"
                            className="w-full border rounded font-mono focus:outline-none"
                            style={{ height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0' }}
                            value={layer.microns ?? ''}
                            onChange={e => setSpecDraft(d => {
                              const layers = [...d.paint!.layers]
                              layers[i] = { ...layers[i], microns: e.target.value ? Number(e.target.value) : undefined }
                              return { ...d, paint: { layers } }
                            })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', display: 'block', marginBottom: 3 }}>Coats</label>
                          <input
                            type="number"
                            className="w-full border rounded font-mono focus:outline-none"
                            style={{ height: 32, padding: '0 8px', fontSize: 12, borderColor: '#E0E0E0' }}
                            value={layer.layers}
                            onChange={e => setSpecDraft(d => {
                              const layers = [...d.paint!.layers]
                              layers[i] = { ...layers[i], layers: Number(e.target.value) }
                              return { ...d, paint: { layers } }
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {specSaveError && (
              <div style={{ fontSize: 12, color: '#C8202A', marginBottom: 12 }}>{specSaveError}</div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingSpec(false)} className="rounded-md hover:bg-chrome-50"
                style={{ padding: '10px 16px', fontSize: 13, color: '#555' }}>Cancel</button>
              <button
                disabled={savingSpec}
                onClick={async () => {
                  try {
                    setSpecSaveError('')
                    await saveSpec({ default_paint_spec: specDraft.paint, default_welding_spec: specDraft.welding })
                    setEditingSpec(false)
                  } catch (e: any) {
                    setSpecSaveError(e?.response?.data?.message ?? 'Save failed')
                  }
                }}
                className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-60"
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
              >
                {savingSpec ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                Save Spec
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl" style={{ width: 480, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="flex items-start gap-3 mb-4">
              {confirmAction.destructive
                ? <XCircle size={24} style={{ color: '#C8202A', flexShrink: 0, marginTop: 2 }} />
                : <Send size={24} style={{ color: confirmAction.bg, flexShrink: 0, marginTop: 2 }} />
              }
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{confirmAction.label}</div>
                <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 4 }}>{product.product_code} — {product.name}</div>
              </div>
            </div>

            <div className="rounded-lg" style={{
              padding: '14px 16px', marginBottom: 16,
              background: confirmAction.destructive ? '#FCEBEB' : '#E6F1FB',
              border: `1px solid ${confirmAction.destructive ? '#F4AEAE' : '#B5D4F4'}`,
            }}>
              <div style={{ fontSize: 13, color: confirmAction.destructive ? '#5C0D15' : '#0C447C' }}>
                {confirmAction.confirm}
              </div>
            </div>

            {/* Comment / Reason field */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                {confirmAction.destructive ? 'Reason *' : 'Note (optional)'}
              </label>
              <textarea
                className="w-full border rounded-md focus:outline-none"
                style={{ height: 72, padding: '8px 10px', fontSize: 13, borderColor: actionError && confirmAction.destructive && !actionComment.trim() ? '#C8202A' : '#E0E0E0', resize: 'none' }}
                value={actionComment}
                onChange={e => { setActionComment(e.target.value); setActionError('') }}
                placeholder={confirmAction.destructive ? 'Please provide a reason...' : 'Add a note (optional)...'}
              />
              {actionError && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{actionError}</div>}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="rounded-md hover:bg-chrome-50"
                style={{ padding: '10px 16px', fontSize: 13, color: '#555' }}>Cancel</button>
              <button
                disabled={actioning}
                onClick={async () => {
                  if (confirmAction.destructive && !actionComment.trim()) {
                    setActionError('Please provide a reason')
                    return
                  }
                  try {
                    await doAction(confirmAction.action)
                    setConfirmAction(null)
                    setActionComment('')
                  } catch (e: any) {
                    setActionError(e?.response?.data?.message ?? 'An error occurred')
                  }
                }}
                className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-60"
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, background: confirmAction.bg }}>
                {actioning ? <Loader2 size={14} className="animate-spin" /> : (confirmAction.destructive ? <XCircle size={14} /> : <Send size={14} />)}
                Confirm {confirmAction.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
