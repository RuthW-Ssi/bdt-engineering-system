import { useState } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { useCategories } from '../../hooks/useMasters'
import { useProjects } from '../../hooks/useProjects'
import { useProjectZones } from '../../hooks/useProjectZones'
import { useCreateProduct } from '../../hooks/useProducts'
import { MarkPrefixDropdown } from './MarkPrefixDropdown'
import { productsApi } from '../../api/products'
import type { CreateCustomProductPayload } from '../../api/types'

interface Props { onClose: () => void }

export function NewCustomProductModal({ onClose }: Props) {
  const { data: categories = [], isLoading: loadingCats } = useCategories()
  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []
  const { mutateAsync: create, isPending } = useCreateProduct()

  const [form, setForm] = useState({
    name: '', categ_id: '', project_id: '', erection_zone_id: '',
    mark_prefix: '', mark_number: '', engineer_hours_est: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState('')
  const [dupWarning, setDupWarning] = useState('')

  const selectedProjectId = form.project_id ? parseInt(form.project_id) : undefined
  const { data: zones = [] } = useProjectZones(selectedProjectId)

  const selectedZone = zones.find(z => z.id === parseInt(form.erection_zone_id || '0'))

  // Live preview: "{Zone}-{Prefix}-{Number}"
  const markPreview = [
    selectedZone?.code,
    form.mark_prefix,
    form.mark_number,
  ].filter(Boolean).join('-')

  const setField = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const checkDuplicate = async () => {
    if (!form.project_id || !form.mark_prefix || !form.mark_number) return
    try {
      const result = await productsApi.list({
        product_type: 'custom',
        project_id: parseInt(form.project_id),
        q: form.mark_number,
        limit: 5,
      })
      const dup = result.items.find(p =>
        p.mark_prefix === form.mark_prefix
        && p.mark_number === form.mark_number
        && (form.erection_zone_id ? p.erection_zone_id === parseInt(form.erection_zone_id) : !p.erection_zone_id)
      )
      setDupWarning(dup ? `Mark ซ้ำกับ ${dup.product_code} (${dup.name})` : '')
    } catch { /* ignore */ }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.categ_id) errs.categ_id = 'กรุณาเลือกกลุ่ม'
    if (!form.name.trim()) errs.name = 'กรุณาระบุชื่อ'
    if (!form.project_id) errs.project_id = 'กรุณาเลือก Project'
    if (!form.mark_prefix) errs.mark_prefix = 'กรุณาเลือก Mark Prefix'
    if (!form.mark_number.trim()) errs.mark_number = 'กรุณาระบุ Mark Number'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload: CreateCustomProductPayload = {
      product_type: 'custom',
      name: form.name,
      categ_id: parseInt(form.categ_id),
      project_id: parseInt(form.project_id),
      erection_zone_id: form.erection_zone_id ? parseInt(form.erection_zone_id) : undefined,
      mark_prefix: form.mark_prefix,
      mark_number: form.mark_number,
      engineer_hours_est: form.engineer_hours_est ? parseFloat(form.engineer_hours_est) : undefined,
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
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 580, maxHeight: '90vh', overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>เพิ่ม Custom Product</span>
          <button onClick={onClose} className="rounded hover:bg-chrome-50" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {errors._form && (
              <div className="rounded-lg" style={{ padding: 12, background: '#FCEBEB', color: '#5C0D15', fontSize: 13 }}>{errors._form}</div>
            )}

            {/* Project */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Project *</label>
              <select className="w-full border rounded-md" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.project_id ? '#C8202A' : '#E0E0E0' }}
                value={form.project_id} onChange={e => { setField('project_id', e.target.value); setField('erection_zone_id', '') }}>
                <option value="">— เลือก Project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
              </select>
              {errors.project_id && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.project_id}</div>}
            </div>

            {/* Zone */}
            {selectedProjectId && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Zone (Erection Area)</label>
                <select className="w-full border rounded-md" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                  value={form.erection_zone_id} onChange={e => setField('erection_zone_id', e.target.value)}>
                  <option value="">— ไม่ระบุ Zone —</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)}
                </select>
              </div>
            )}

            {/* Mark Prefix */}
            <MarkPrefixDropdown value={form.mark_prefix} onChange={v => setField('mark_prefix', v)} error={errors.mark_prefix} />

            {/* Mark Number */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Mark Number *</label>
              <input className="w-full border rounded-md font-mono" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: errors.mark_number ? '#C8202A' : dupWarning ? '#B45309' : '#E0E0E0' }}
                value={form.mark_number} onChange={e => { setField('mark_number', e.target.value); setDupWarning('') }} onBlur={checkDuplicate} placeholder="1" />
              {errors.mark_number && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.mark_number}</div>}
              {dupWarning && !errors.mark_number && (
                <div className="flex items-center gap-1" style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                  <AlertTriangle size={12} />{dupWarning}
                </div>
              )}
            </div>

            {/* Live Mark Preview */}
            {markPreview && (
              <div className="rounded-lg" style={{ padding: 10, background: '#FFF3E0', fontSize: 12, color: '#B45309' }}>
                Mark Display: <span className="font-mono font-bold">{markPreview}</span>
              </div>
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
                value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Column C-1 Warehouse" />
              {errors.name && <div style={{ fontSize: 11, color: '#C8202A', marginTop: 2 }}>{errors.name}</div>}
            </div>

            {/* Engineer Hours */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Engineer Hours (Est.)</label>
              <input type="number" min="0" step="0.5" className="w-full border rounded-md font-mono" style={{ height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' }}
                value={form.engineer_hours_est} onChange={e => setField('engineer_hours_est', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6" style={{ height: 60, borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
            <button type="button" onClick={onClose} className="rounded-md border" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, borderColor: '#E0E0E0' }}>ยกเลิก</button>
            <button type="submit" disabled={isPending} className="flex items-center gap-2 rounded-md text-white disabled:opacity-60"
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#B45309' }}>
              {isPending && <Loader2 size={14} className="animate-spin" />}
              สร้าง Custom Product
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
