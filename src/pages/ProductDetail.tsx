import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Send, MoreHorizontal, GitBranch, FileText, Box, ExternalLink, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import * as Icons from 'lucide-react'
import { mockRoutingSteps } from '../data/mock'
import { mockBomTree } from '../data/mockBom'
import { CAT_META, PRODUCT_STATUS_META } from '../data/meta'
import type { ProductAttributes } from '../types'
import { ProductStatusPill } from '../components/ui/ProductStatusPill'
import { OpBadge } from '../components/ui/OpBadge'
import { fmtTime } from '../data/utils'
import type { BomNode } from '../types'
import { useMaterial, useActionSubmit } from '../hooks/useMaterials'
import { STATE_TO_PRODUCT_STATUS } from '../api/types'
import type { ProductStatus } from '../types'

const TABS = ['ภาพรวม', 'Routing', 'BOM', 'Versions', 'ประวัติ']
const TAB_BADGES: Record<string, string> = {
  Routing: '6 steps',
  BOM: '8 lines',
  Versions: 'v1.2.0',
}

function BomTreeRow({ node, depth = 0 }: { node: BomNode; depth?: number }) {
  const [expanded, setExpanded] = useState(node.expanded ?? true)
  const m = CAT_META[node.category]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined
  const hasChildren = node.children.length > 0

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-md cursor-pointer hover:bg-chrome-50 transition-colors"
        style={{ padding: '6px 10px', marginLeft: depth * 20, background: depth === 0 ? 'white' : 'transparent', border: depth === 0 ? '1px solid #C2C2C2' : '1px solid #E0E0E0', borderRadius: 6, marginBottom: 2 }}
        onClick={() => hasChildren && setExpanded(e => !e)}
      >
        <span style={{ width: 18, fontSize: 12, color: '#8E8E8E', flexShrink: 0 }}>
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span style={{ width: 18, height: 18, borderRadius: 999, background: `${m.color}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {Icon && <Icon size={10} color={m.color} />}
        </span>
        <span className="font-mono" style={{ fontSize: 12, fontWeight: depth === 0 ? 600 : 500, color: depth === 0 ? '#1F1F1F' : '#555', minWidth: 110 }}>{node.code}</span>
        <span className="flex-1 truncate" style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: '#1F1F1F' }}>{node.name}</span>
        <span className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: depth === 0 ? '#555' : '#1F1F1F', minWidth: 50, textAlign: 'right' }}>{node.qty}</span>
        <span style={{ fontSize: 12, color: '#8E8E8E', minWidth: 32 }}>{node.uom}</span>
        {node.scrap_pct > 0 && (
          <span style={{ background: '#FAEEDA', color: '#854F0B', padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
            +{node.scrap_pct}%
          </span>
        )}
      </div>
      {hasChildren && expanded && node.children.map(child => (
        <BomTreeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

export function ProductDetail() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('ภาพรวม')
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const { data: mat, isLoading, isError } = useMaterial(code ?? '')
  const { mutateAsync: doSubmit, isPending: submitting } = useActionSubmit(code ?? '')

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      <Loader2 size={20} className="animate-spin" />กำลังโหลด...
    </div>
  )

  if (isError || !mat) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      ไม่พบชิ้นงาน {code}
    </div>
  )

  // Map DTO → legacy shape for compatibility with existing UI
  const uiStatus = (STATE_TO_PRODUCT_STATUS[mat.state] as ProductStatus) ?? 'Draft'
  const product = {
    product_code: mat.default_code,
    name_th: mat.name,
    name_en: mat.description_sale,
    category: 'Part' as const,
    material_group: undefined,
    status: uiStatus,
    version: mat.version,
    uom: mat.uom?.name ?? '',
    odoo_ref_id: mat.odoo_ref_id,
    attributes: mat.attributes as ProductAttributes,
    spec: {
      drawing_ref: mat.drawing_ref,
      total_weight_kg: mat.total_weight_kg,
      description: mat.description_sale,
    },
    updated_at: new Date(mat.write_date).toLocaleDateString('th-TH'),
    updated_by: mat.write_user?.name ?? '-',
  }

  const catMeta = CAT_META['Part']
  const statusMeta = PRODUCT_STATUS_META[uiStatus]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CatIcon = (Icons as any)[catMeta.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined

  const totalTime = mockRoutingSteps.reduce((a, s) => a + s.std_time_min, 0)

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Blocked Banner */}
      {product.status === 'Blocked' && (
        <div className="flex items-center gap-3 px-5" style={{ height: 40, background: '#FCEBEB', borderBottom: '1px solid #EE9B9B', fontSize: 13, color: '#5C0D15', flexShrink: 0 }}>
          <span style={{ background: '#C8202A', color: 'white', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>ECO Critical</span>
          <span className="font-mono" style={{ fontWeight: 600 }}>ECO-0X123-00003</span>
          <span>— ระงับส่ง 3 รายการ ตรวจพบปัญหา weld specification</span>
          <button className="ml-auto flex items-center gap-1 hover:underline" style={{ fontSize: 12, color: '#C8202A', fontWeight: 600 }}>
            <ExternalLink size={12} />ดู ECO
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white flex items-center sticky border-b border-chrome-100 px-5 gap-3" style={{ top: product.status === 'Blocked' ? 96 : 56, height: 56, zIndex: 40 }}>
        <button onClick={() => navigate('/products')} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{product.product_code}</span>
        <span style={{ color: '#C2C2C2' }}>·</span>
        <span style={{ fontSize: 13, color: '#8E8E8E' }}>ชิ้นงาน</span>
        <ProductStatusPill status={product.status} />

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {product.status === 'Draft' && (
            <>
              <button className="flex items-center gap-1.5 rounded-md" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500, color: '#3A3A3A', border: '1px solid #C2C2C2' }}>
                <Pencil size={14} />แก้ไข
              </button>
              <button onClick={() => setSubmitOpen(true)} className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
                <Send size={14} />ส่งให้ตรวจสอบ
              </button>
            </>
          )}
          {product.status === 'Active' && (
            <>
              <button className="flex items-center gap-1.5 rounded-md" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500, color: '#3A3A3A', border: '1px solid #C2C2C2' }}>
                <FileText size={14} />ดู Drawing
              </button>
              <button className="flex items-center gap-1.5 rounded-md" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500, color: '#3A3A3A', border: '1px solid #C2C2C2' }}>
                <Box size={14} />ดู 3D BIM
              </button>
            </>
          )}
          {product.status === 'PendingReview' && (
            <>
              <button className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#639922' }}>
                <CheckCircle size={14} />อนุมัติ
              </button>
              <button className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
                <XCircle size={14} />ปฏิเสธ
              </button>
            </>
          )}
          <button className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 36, height: 36, color: '#8E8E8E', border: '1px solid #E0E0E0' }}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-chrome-100 sticky px-5 flex gap-1" style={{ top: product.status === 'Blocked' ? 152 : 112, zIndex: 39 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex items-center gap-1.5 transition-colors"
            style={{
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#C8202A' : '#8E8E8E',
              borderBottom: `2px solid ${activeTab === tab ? '#C8202A' : 'transparent'}`,
            }}
          >
            {tab}
            {TAB_BADGES[tab] && (
              <span className="font-mono" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '1px 7px', fontSize: 11, color: '#555' }}>
                {TAB_BADGES[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ padding: 24 }}>
        {activeTab === 'ภาพรวม' && (
          <div className="flex gap-6" style={{ maxWidth: 1100 }}>
            {/* Left */}
            <div className="flex-1 flex flex-col gap-4">
              {/* Product Info Card */}
              <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 16 }}>ข้อมูลชิ้นงาน</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>ประเภท</div>
                    <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: catMeta.color, fontWeight: 500 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 999, background: `${catMeta.color}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {CatIcon && <CatIcon size={10} color={catMeta.color} />}
                      </span>
                      {catMeta.label}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>หน่วย (UOM)</div>
                    <div className="font-mono" style={{ fontSize: 13, color: '#1F1F1F', fontWeight: 500 }}>{product.uom}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Odoo Ref</div>
                    <div className="font-mono" style={{ fontSize: 13, color: product.odoo_ref_id ? '#1F1F1F' : '#C2C2C2' }}>{product.odoo_ref_id ?? '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Drawing Ref</div>
                    <div className="flex items-center gap-1" style={{ fontSize: 13, color: product.spec.drawing_ref ? '#185FA5' : '#C2C2C2' }}>
                      {product.spec.drawing_ref ?? '—'}
                      {product.spec.drawing_ref && <ExternalLink size={11} />}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>น้ำหนักรวม</div>
                    <div className="font-mono" style={{ fontSize: 13, color: '#1F1F1F' }}>
                      {product.spec.total_weight_kg != null ? `${product.spec.total_weight_kg.toLocaleString()} kg` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>สถานะส่ง</div>
                    <span style={{ background: product.status === 'Blocked' ? '#FCEBEB' : '#EAF3DE', color: product.status === 'Blocked' ? '#5C0D15' : '#27500A', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500 }}>
                      {product.status === 'Blocked' ? 'ระงับส่ง' : 'OK'}
                    </span>
                  </div>
                  {product.spec.description && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>หมายเหตุ</div>
                      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>{product.spec.description}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* BOM Tree Card */}
              <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>โครงสร้าง BOM</div>
                  <button onClick={() => navigate(`/bom/${product.product_code}`)} className="flex items-center gap-1 hover:underline" style={{ fontSize: 12, color: '#185FA5' }}>
                    <GitBranch size={12} />เปิด BOM Editor
                  </button>
                </div>
                <div style={{ fontSize: 13 }}>
                  <BomTreeRow node={mockBomTree} />
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{ width: 280, flexShrink: 0 }} className="flex flex-col gap-4">
              {/* Status card */}
              <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>สถานะ</div>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: statusMeta.text, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: statusMeta.text }}>{statusMeta.label}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8E8E8E' }}>อัปเดตล่าสุด {product.updated_at} โดย {product.updated_by}</div>
              </div>

              {/* Stats card */}
              <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>สรุป</div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: '#555' }}><GitBranch size={14} style={{ color: '#8E8E8E' }} />BOM</span>
                    <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>8 รายการ</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: '#555' }}><Clock size={14} style={{ color: '#8E8E8E' }} />Routing</span>
                    <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{mockRoutingSteps.length} steps · {fmtTime(totalTime)}</span>
                  </div>
                </div>
              </div>

              {/* Versions card */}
              {product.version && (
                <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>เวอร์ชัน</div>
                  {[
                    { v: product.version, label: 'ปัจจุบัน', date: '24 เม.ย. 2569', current: true },
                    { v: '1.1.0', label: '', date: '20 เม.ย. 2569', current: false },
                    { v: '1.0.0', label: '', date: '15 เม.ย. 2569', current: false },
                  ].map(ver => (
                    <div key={ver.v} className="flex items-center justify-between py-2 border-b border-chrome-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: ver.current ? '#185FA5' : '#555' }}>v{ver.v}</span>
                        {ver.current && <span style={{ background: '#E6F1FB', color: '#185FA5', padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>ปัจจุบัน</span>}
                      </div>
                      <span style={{ fontSize: 11, color: '#8E8E8E' }}>{ver.date}</span>
                    </div>
                  ))}
                  <button onClick={() => navigate(`/bom/${product.product_code}/diff`)} className="flex items-center gap-1 mt-3 hover:underline" style={{ fontSize: 12, color: '#185FA5' }}>
                    เปรียบ versions →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Routing' && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20, maxWidth: 800 }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: 14, fontWeight: 600 }}>Routing Steps — {product.product_code}</div>
              <button onClick={() => navigate(`/routings/${product.product_code}`)} className="hover:underline" style={{ fontSize: 12, color: '#185FA5' }}>เปิด Editor →</button>
            </div>
            <div className="flex flex-col gap-2">
              {mockRoutingSteps.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-chrome-100" style={{ padding: '10px 14px' }}>
                  <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: '#555', background: '#F5F5F5', borderRadius: 4, padding: '2px 8px', minWidth: 40, textAlign: 'center' }}>{s.step_no}</span>
                  <OpBadge op={s.op_code} />
                  <div className="flex-1">
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name_th}</div>
                    {s.note && <div style={{ fontSize: 11, color: '#8E8E8E' }}>{s.note}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>{s.work_center}</div>
                  <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3A' }}>{s.std_time_min} นาที</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'BOM' && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20, maxWidth: 800 }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: 14, fontWeight: 600 }}>โครงสร้าง BOM</div>
              <button onClick={() => navigate(`/bom/${product.product_code}`)} className="hover:underline" style={{ fontSize: 12, color: '#185FA5' }}>เปิด BOM Editor →</button>
            </div>
            <BomTreeRow node={mockBomTree} />
          </div>
        )}

        {activeTab === 'Versions' && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20, maxWidth: 700 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>ประวัติเวอร์ชัน</div>
            {[
              { v: '1.2.0', log: 'เพิ่ม Stiffener Plate ตาม ECO-0X123-00002', by: 'somchai.k', date: '24 เม.ย. 2569', current: true },
              { v: '1.1.0', log: 'ปรับ Routing เพิ่ม GRIND step', by: 'somchai.k', date: '20 เม.ย. 2569', current: false },
              { v: '1.0.0', log: 'Initial release', by: 'nuch.p', date: '15 เม.ย. 2569', current: false },
            ].map(ver => (
              <div key={ver.v} className="flex gap-4 pb-4 mb-4 border-b border-chrome-50 last:border-0">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: ver.current ? '#185FA5' : '#555' }}>v{ver.v}</span>
                  {ver.current && <span style={{ background: '#E6F1FB', color: '#185FA5', padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>ปัจจุบัน</span>}
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: 13, color: '#1F1F1F' }}>{ver.log}</div>
                  <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 4 }}>อนุมัติโดย {ver.by} · {ver.date}</div>
                </div>
                <button onClick={() => navigate(`/bom/${product.product_code}/diff`)} className="hover:underline" style={{ fontSize: 12, color: '#185FA5', whiteSpace: 'nowrap' }}>ดู diff →</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ประวัติ' && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 20, maxWidth: 700 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>ประวัติกิจกรรม</div>
            {[
              { icon: <Send size={14} />, text: 'somchai.k ส่งให้ตรวจสอบ', time: '24 เม.ย. 2569 10:30', color: '#185FA5' },
              { icon: <Pencil size={14} />, text: 'somchai.k แก้ไข BOM — เพิ่ม Stiffener Plate', time: '24 เม.ย. 2569 09:15', color: '#854F0B' },
              { icon: <CheckCircle size={14} />, text: 'nuch.p อนุมัติ v1.1.0', time: '20 เม.ย. 2569 14:00', color: '#639922' },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 pb-4 mb-4 border-b border-chrome-50 last:border-0">
                <span style={{ color: item.color, marginTop: 2, flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 13, color: '#1F1F1F' }}>{item.text}</div>
                  <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit Modal */}
      {submitOpen && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl" style={{ width: 440, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="flex items-start gap-3 mb-4">
              <Send size={24} style={{ color: '#C8202A', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>ส่งให้ตรวจสอบ</div>
                <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 4 }}>{product.product_code} — {product.name_th}</div>
              </div>
            </div>
            <div className="rounded-lg" style={{ background: '#FCEBEB', border: '1px solid #F4AEAE', padding: '14px 16px', marginBottom: 16 }}>
              <div className="grid gap-2" style={{ gridTemplateColumns: '120px 1fr', fontSize: 13 }}>
                <span style={{ color: '#8A1520' }}>รหัส:</span><span className="font-mono">{product.product_code}</span>
                <span style={{ color: '#8A1520' }}>สถานะปัจจุบัน:</span><span>Draft</span>
                <span style={{ color: '#8A1520' }}>สถานะใหม่:</span><span>รอตรวจสอบ</span>
                <span style={{ color: '#8A1520' }}>ผู้ส่ง:</span><span>somchai.k@ssi-steel.com</span>
              </div>
            </div>
            {submitError && (
              <div className="rounded-lg mb-3" style={{ padding: 10, background: '#FCEBEB', color: '#5C0D15', fontSize: 13 }}>
                {submitError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setSubmitOpen(false); setSubmitError('') }} className="rounded-md hover:bg-chrome-50" style={{ padding: '10px 16px', fontSize: 13, color: '#555' }}>ยกเลิก</button>
              <button
                disabled={submitting}
                onClick={async () => {
                  try {
                    await doSubmit()
                    setSubmitOpen(false)
                    setSubmitError('')
                  } catch (e: any) {
                    setSubmitError(e?.response?.data?.message ?? 'เกิดข้อผิดพลาด')
                  }
                }}
                className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-60"
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                ยืนยันส่ง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
