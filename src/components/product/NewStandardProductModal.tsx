import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useCategories } from '../../hooks/useMasters'
import { useCreateProduct } from '../../hooks/useProducts'
import { CostComponentInput } from './CostComponentInput'
import type { CreateStandardProductPayload } from '../../api/types'

interface Props { onClose: () => void }

export function NewStandardProductModal({ onClose }: Props) {
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const { mutateAsync: create, isPending } = useCreateProduct()

  const [form, setForm] = useState({
    name: '', categ_id: '', engineering_code: '', item_code: '',
    sale_ok: false, purchase_ok: false,
    stock_policy: '',
    reorder_min: '', reorder_max: '',
  })
  const [costs, setCosts] = useState({
    cost_raw_material: '', cost_transport: '', cost_production: '', cost_warehouse: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')

  const setField = (k: string, v: string | boolean) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.categ_id) errs.categ_id = 'กรุณาเลือกกลุ่ม'
    if (!form.name.trim()) errs.name = 'กรุณาระบุชื่อ'
    if ((form.sale_ok || form.purchase_ok) && !form.item_code) errs.item_code = 'item_code จำเป็นเมื่อ sale_ok หรือ purchase_ok'
    if (form.item_code && !/^[A-Z0-9]{10}$/.test(form.item_code)) errs.item_code = 'ต้องเป็นตัวอักษร A-Z0-9 ครบ 10 ตัว'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload: CreateStandardProductPayload = {
      product_type: 'standard',
      name: form.name,
      categ_id: parseInt(form.categ_id),
      sale_ok: form.sale_ok,
      purchase_ok: form.purchase_ok,
      engineering_code: form.engineering_code || undefined,
      item_code: form.item_code || undefined,
      cost_raw_material: costs.cost_raw_material ? parseFloat(costs.cost_raw_material) : undefined,
      cost_transport: costs.cost_transport ? parseFloat(costs.cost_transport) : undefined,
      cost_production: costs.cost_production ? parseFloat(costs.cost_production) : undefined,
      cost_warehouse: costs.cost_warehouse ? parseFloat(costs.cost_warehouse) : undefined,
      stock_policy: form.stock_policy || undefined,
      reorder_min: form.reorder_min ? parseFloat(form.reorder_min) : undefined,
      reorder_max: form.reorder_max ? parseFloat(form.reorder_max) : undefined,
    }

    try {
      const result = await create(payload)
      setSuccess(`สร้างสำเร็จ: ${result.product_code}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      setErrors(prev => ({ ...prev, _form: typeof msg === 'string' ? msg : JSON.stringify(msg) }))
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-white rounded-xl shadow-xl" style={{ width: 440, padding: 32 }}>
          <div className="flex flex-col items-center gap-4">
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#27500A' }}>{success}</div>
            <button onClick={onClose} className="rounded-md text-white" style={{ background: '#C8202A', padding: '8px 24px', fontWeight: 600 }}>ปิด</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 620, maxHeight: '90vh', overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>เพิ่ม Standard Product</span>
          <button onClick={onClose} className="rounded hover:bg-chrome-50" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {errors._form && (
              <div className="rounded-lg" style={{ padding: 12, background: '#FCEBEB', color: '#5C0D15', fontSize: 13 }}>{errors._form}</div>
            )}

            {/* Category */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>กลุ่ม (Category) *</label>
              <select className="w-full border rounded-md" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.categ_id ? '#C8202A' : '#E0E0E0' }}
                value={form.categ_id} onChange={e => setField('categ_id', e.target.value)} disabled={loadingCats}>
                <option value="">— เลือกกลุ่ม —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.complete_name ?? c.name}</option>)}
              </select>
              {errors.categ_id && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.categ_id}</div>}
            </div>

            {/* Name */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>ชื่อ Product *</label>
              <input className="w-full border rounded-md" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.name ? '#C8202A' : '#E0E0E0' }}
                value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Cee Purlin C-200" />
              {errors.name && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.name}</div>}
            </div>

            {/* Engineering Code */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Engineering Code</label>
              <input className="w-full border rounded-md font-mono" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                value={form.engineering_code} onChange={e => setField('engineering_code', e.target.value)} placeholder="BDTCM_001" />
            </div>

            {/* Sale / Purchase toggles */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={form.sale_ok} onChange={e => setField('sale_ok', e.target.checked)} style={{ accentColor: '#C8202A' }} />
                sale_ok (ขายได้)
              </label>
              <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={form.purchase_ok} onChange={e => setField('purchase_ok', e.target.checked)} style={{ accentColor: '#C8202A' }} />
                purchase_ok (ซื้อได้)
              </label>
            </div>

            {/* Item Code (shown when sale_ok or purchase_ok) */}
            {(form.sale_ok || form.purchase_ok) && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Item Code (10 ตัว) *</label>
                <input className="w-full border rounded-md font-mono" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.item_code ? '#C8202A' : '#E0E0E0' }}
                  value={form.item_code} onChange={e => setField('item_code', e.target.value.toUpperCase())} placeholder="BDTC000123" maxLength={10} />
                {errors.item_code && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.item_code}</div>}
              </div>
            )}

            {/* Cost Components */}
            <CostComponentInput values={costs} onChange={(k, v) => setCosts(c => ({ ...c, [k]: v }))} />
          </div>

          <div className="flex items-center justify-end gap-3 px-6" style={{ height: 60, borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
            <button type="button" onClick={onClose} className="rounded-md border" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, borderColor: '#E0E0E0' }}>ยกเลิก</button>
            <button type="submit" disabled={isPending} className="flex items-center gap-2 rounded-md text-white disabled:opacity-60"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}>
              {isPending && <Loader2 size={14} className="animate-spin" />}
              สร้าง Standard Product
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
