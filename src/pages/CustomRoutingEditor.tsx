import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertTriangle, Loader2, Plus, Trash2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import {
  getCustomRouting,
  createCustomRouting,
  restoreToTemplate,
  addCustomRoutingOp,
  deleteCustomRoutingOp,
  addCustomRoutingActivity,
  deleteCustomRoutingActivity,
  getRoutingTemplates,
} from '../api/routings'
import { useProduct } from '../hooks/useProducts'
import type { CustomRoutingDTO, CustomRoutingOpDTO } from '../api/routings'

// ── Custom Op Card ─────────────────────────────────────────────

function CustomOpCard({
  op, productCode, routingKey,
}: {
  op: CustomRoutingOpDTO
  productCode: string
  routingKey: unknown[]
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [addActForm, setAddActForm] = useState(false)
  const [actVals, setActVals] = useState({ description: '', per_minute: '', std_measure: '', unit: 'kg', formula_param_code: '', manpower: '1', workcenter_id: '' })

  const delOpMut = useMutation({
    mutationFn: () => deleteCustomRoutingOp(productCode, op.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: routingKey }),
  })

  const addActMut = useMutation({
    mutationFn: () => addCustomRoutingActivity(productCode, op.id, {
      description: actVals.description,
      per_minute: parseFloat(actVals.per_minute),
      formula_param_code: actVals.formula_param_code,
      std_measure: parseFloat(actVals.std_measure),
      unit: actVals.unit,
      manpower: parseFloat(actVals.manpower) || 1,
      workcenter_id: parseInt(actVals.workcenter_id),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: routingKey }); setAddActForm(false) },
  })

  return (
    <div style={{ border: '1px solid #E0E0E0', borderRadius: 8, overflow: 'hidden', marginBottom: 8, background: 'white' }}>
      <div className="flex items-center" style={{ padding: '10px 14px' }}>
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 flex-1 text-left">
          {expanded ? <ChevronDown size={14} style={{ color: '#8E8E8E' }} /> : <ChevronRight size={14} style={{ color: '#8E8E8E' }} />}
          <span className="font-mono" style={{ fontSize: 11, color: '#8E8E8E' }}>{String(op.sequence).padStart(2, '0')}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{op.name}</span>
          <span style={{ background: '#F0F4FF', color: '#185FA5', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>{op.op_code}</span>
          <span style={{ background: '#F3F4F6', color: '#555', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>{op.workcenter.code}</span>
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>{op.activities.length} activities</span>
        </button>
        <button
          onClick={() => { if (confirm(`ลบ operation "${op.name}"?`)) delOpMut.mutate() }}
          disabled={delOpMut.isPending}
          className="flex items-center justify-center rounded hover:bg-red-50"
          style={{ width: 28, height: 28, flexShrink: 0 }}
        >
          {delOpMut.isPending ? <Loader2 size={13} className="animate-spin" style={{ color: '#C8202A' }} /> : <Trash2 size={13} style={{ color: '#C8202A' }} />}
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #F0F0F0' }}>
          {/* Activity list */}
          {op.activities.map(act => (
            <ActivityRow key={act.id} act={act} opId={op.id} productCode={productCode} routingKey={routingKey} />
          ))}

          {/* Add activity form */}
          {addActForm ? (
            <div style={{ padding: '10px 16px', background: '#FAFAFA', borderTop: '1px dashed #E0E0E0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#1F1F1F' }}>เพิ่ม Activity</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { label: 'Description', key: 'description', width: 220 },
                  { label: 'Formula param code', key: 'formula_param_code', width: 160 },
                  { label: 'Unit', key: 'unit', width: 60 },
                  { label: 'Per minute', key: 'per_minute', width: 90, type: 'number' },
                  { label: 'Std measure', key: 'std_measure', width: 90, type: 'number' },
                  { label: 'Manpower', key: 'manpower', width: 70, type: 'number' },
                  { label: 'Workcenter ID', key: 'workcenter_id', width: 100, type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 2 }}>{f.label}</div>
                    <input
                      type={f.type ?? 'text'}
                      value={actVals[f.key as keyof typeof actVals]}
                      onChange={e => setActVals(v => ({ ...v, [f.key]: e.target.value }))}
                      className="border border-chrome-200 rounded focus:outline-none focus:border-steel-600 font-mono"
                      style={{ width: f.width, height: 28, padding: '0 6px', fontSize: 11 }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addActMut.mutate()}
                  disabled={addActMut.isPending}
                  className="flex items-center gap-1 rounded text-white"
                  style={{ height: 28, padding: '0 12px', fontSize: 11, fontWeight: 600, background: '#185FA5' }}
                >
                  {addActMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} บันทึก
                </button>
                <button onClick={() => setAddActForm(false)} className="flex items-center gap-1 rounded border border-chrome-200" style={{ height: 28, padding: '0 10px', fontSize: 11, color: '#555' }}>ยกเลิก</button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '8px 16px', borderTop: '1px dashed #E0E0E0' }}>
              <button
                onClick={() => setAddActForm(true)}
                className="flex items-center gap-1 rounded border border-dashed border-chrome-200 hover:bg-chrome-50"
                style={{ height: 26, padding: '0 10px', fontSize: 11, color: '#8E8E8E' }}
              >
                <Plus size={10} /> เพิ่ม Activity
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityRow({
  act, opId, productCode, routingKey,
}: {
  act: { id: number; sequence: number; description: string; per_minute: number; std_measure: number; unit: string; manpower: number }
  opId: number
  productCode: string
  routingKey: unknown[]
}) {
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: () => deleteCustomRoutingActivity(productCode, opId, act.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: routingKey }),
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 60px 40px', alignItems: 'center', padding: '5px 16px', borderBottom: '1px solid #F5F5F5', fontSize: 11, color: '#555' }}>
      <span style={{ color: '#1F1F1F' }}>{act.description}</span>
      <span className="font-mono">{act.per_minute} min/{act.unit}</span>
      <span className="font-mono">{act.std_measure} {act.unit}</span>
      <span>{act.manpower} คน</span>
      <button
        onClick={() => { if (confirm(`ลบ "${act.description}"?`)) delMut.mutate() }}
        disabled={delMut.isPending}
        className="flex items-center justify-center rounded hover:bg-red-50"
        style={{ width: 24, height: 24 }}
      >
        {delMut.isPending ? <Loader2 size={11} className="animate-spin" style={{ color: '#C8202A' }} /> : <Trash2 size={11} style={{ color: '#C8202A' }} />}
      </button>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

export function CustomRoutingEditor() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const routingKey = ['custom-routing', code]

  const { data: product, isLoading: productLoading } = useProduct(code ?? '')
  const { data: customRouting, isLoading: routingLoading } = useQuery<CustomRoutingDTO | null>({
    queryKey: routingKey,
    queryFn: () => getCustomRouting(code!),
    enabled: !!code,
  })
  const { data: templates = [] } = useQuery({ queryKey: ['routing-templates'], queryFn: getRoutingTemplates })

  const [addOpForm, setAddOpForm] = useState(false)
  const [opVals, setOpVals] = useState({ op_code: '', name: '', workcenter_id: '' })
  const [restoreTemplateId, setRestoreTemplateId] = useState<string>('')
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  const createMut = useMutation({
    mutationFn: (fromTemplateId?: number) => createCustomRouting(code!, { from_template_id: fromTemplateId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: routingKey }),
  })

  const addOpMut = useMutation({
    mutationFn: () => addCustomRoutingOp(code!, {
      op_code: opVals.op_code,
      name: opVals.name,
      workcenter_id: parseInt(opVals.workcenter_id),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: routingKey }); setAddOpForm(false) },
  })

  const restoreMut = useMutation({
    mutationFn: () => restoreToTemplate(code!, parseInt(restoreTemplateId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: routingKey }); navigate(`/routings/${code}`) },
  })

  const loading = productLoading || routingLoading

  if (loading) return (
    <div className="flex items-center justify-center gap-2" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      <Loader2 size={20} className="animate-spin" /> กำลังโหลด...
    </div>
  )

  if (!product) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      ไม่พบ Product {code}
    </div>
  )

  // Not yet custom — show conversion card
  if (!product.has_custom_routing) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Custom Routing — {code}</span>
        </div>

        <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 24 }}>
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={20} style={{ color: '#F57F17', marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 6 }}>สร้าง Custom Routing</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>
                Product นี้ยังไม่มี Custom Routing — กด "สร้าง" เพื่อแยก routing ออกจาก template
                (clone จาก template ปัจจุบัน หรือเริ่มใหม่เปล่า)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => createMut.mutate(t.id)}
                disabled={createMut.isPending}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
              >
                {createMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Clone จาก {t.code}
              </button>
            ))}
            <button
              onClick={() => createMut.mutate(undefined)}
              disabled={createMut.isPending}
              className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
              style={{ height: 36, padding: '0 16px', fontSize: 13, color: '#555' }}
            >
              เริ่มใหม่เปล่า
            </button>
          </div>

          {createMut.isError && (
            <div style={{ fontSize: 12, color: '#C8202A', marginTop: 8 }}>
              {(createMut.error as any)?.response?.data?.message ?? 'สร้างไม่สำเร็จ'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Has custom routing — show editor
  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div className="bg-white flex items-center sticky border-b border-chrome-100 px-5 gap-3" style={{ top: 56, height: 52, zIndex: 40 }}>
        <button onClick={() => navigate(-1)} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{code}</span>
        <span style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
          Custom Routing
        </span>
        {customRouting && (
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>v{customRouting.version} · {customRouting.state}</span>
        )}

        <div className="flex-1" />

        {/* Restore to template */}
        <button
          onClick={() => setShowRestoreConfirm(s => !s)}
          className="flex items-center gap-1.5 rounded-md border border-chrome-200 hover:bg-chrome-50"
          style={{ height: 34, padding: '0 12px', fontSize: 12, color: '#E65100' }}
        >
          <RotateCcw size={13} /> Restore to Template
        </button>
      </div>

      {/* Restore confirm */}
      {showRestoreConfirm && (
        <div className="bg-white border-b border-orange-100 px-6 py-3 flex items-center gap-3" style={{ background: '#FFF8F0' }}>
          <AlertTriangle size={16} style={{ color: '#E65100' }} />
          <span style={{ fontSize: 12, color: '#555' }}>เลือก template ที่ต้องการ restore:</span>
          <select
            value={restoreTemplateId}
            onChange={e => setRestoreTemplateId(e.target.value)}
            className="border border-chrome-200 rounded"
            style={{ height: 28, padding: '0 8px', fontSize: 12 }}
          >
            <option value="">— เลือก template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
          </select>
          <button
            onClick={() => restoreMut.mutate()}
            disabled={!restoreTemplateId || restoreMut.isPending}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 28, padding: '0 12px', fontSize: 11, fontWeight: 600, background: '#E65100' }}
          >
            {restoreMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} ยืนยัน
          </button>
          <button onClick={() => setShowRestoreConfirm(false)} style={{ fontSize: 11, color: '#8E8E8E' }}>ยกเลิก</button>
        </div>
      )}

      <div style={{ padding: '24px 24px 0' }}>
        {/* Orange banner */}
        <div className="flex items-center gap-2 rounded-lg mb-4" style={{ background: '#FFF3E0', border: '1px solid #FFCC80', padding: '10px 14px' }}>
          <AlertTriangle size={16} style={{ color: '#E65100' }} />
          <span style={{ fontSize: 12, color: '#E65100' }}>
            Custom routing — ไม่ inherit จาก template | {customRouting?.ops.length ?? 0} operations
          </span>
        </div>

        {/* Operations */}
        {customRouting?.ops.map(op => (
          <CustomOpCard key={op.id} op={op} productCode={code!} routingKey={routingKey} />
        ))}

        {/* Add op form */}
        {addOpForm ? (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 16, marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1F1F1F' }}>เพิ่ม Operation</div>
            <div className="flex flex-wrap gap-3 mb-3">
              {[
                { label: 'Op Code', key: 'op_code', width: 120 },
                { label: 'Name', key: 'name', width: 200 },
                { label: 'Workcenter ID', key: 'workcenter_id', width: 110, type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 3 }}>{f.label}</div>
                  <input
                    type={f.type ?? 'text'}
                    value={opVals[f.key as keyof typeof opVals]}
                    onChange={e => setOpVals(v => ({ ...v, [f.key]: e.target.value }))}
                    className="border border-chrome-200 rounded focus:outline-none focus:border-steel-600"
                    style={{ width: f.width, height: 32, padding: '0 8px', fontSize: 12 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addOpMut.mutate()}
                disabled={addOpMut.isPending}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#185FA5' }}
              >
                {addOpMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} บันทึก
              </button>
              <button onClick={() => setAddOpForm(false)} className="flex items-center gap-1 rounded border border-chrome-200 hover:bg-chrome-50" style={{ height: 32, padding: '0 12px', fontSize: 12, color: '#555' }}>ยกเลิก</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddOpForm(true)}
            className="flex items-center gap-2 rounded-lg border border-dashed border-chrome-200 hover:bg-chrome-50 w-full justify-center"
            style={{ height: 44, fontSize: 13, color: '#8E8E8E', marginTop: 8 }}
          >
            <Plus size={14} /> เพิ่ม Operation
          </button>
        )}
      </div>
    </div>
  )
}
