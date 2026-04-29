import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Loader2, Save } from 'lucide-react'
import {
  getBindingRules,
  createBindingRule,
  deleteBindingRule,
  getRoutingTemplates,
} from '../api/routings'
import type { BindingRuleDTO } from '../api/routings'

export function BindingRuleManager() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const rulesKey = ['binding-rules']

  const { data: rules = [], isLoading } = useQuery({ queryKey: rulesKey, queryFn: getBindingRules })
  const { data: templates = [] } = useQuery({ queryKey: ['routing-templates'], queryFn: getRoutingTemplates })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    priority: '100',
    description: '',
    match_product_type: '',
    match_mark_prefix: '',
    routing_template_id: '',
  })

  const createMut = useMutation({
    mutationFn: () => createBindingRule({
      priority: parseInt(form.priority),
      description: form.description || undefined,
      match_product_type: form.match_product_type || undefined,
      match_mark_prefix: form.match_mark_prefix || undefined,
      routing_template_id: parseInt(form.routing_template_id),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rulesKey })
      setShowForm(false)
      setForm({ priority: '100', description: '', match_product_type: '', match_mark_prefix: '', routing_template_id: '' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteBindingRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKey }),
  })

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>Routing Template Binding Rules</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 34, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#185FA5' }}
        >
          <Plus size={13} /> เพิ่ม Rule
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-chrome-100 mb-4" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1F1F1F' }}>เพิ่ม Binding Rule</div>
          <div className="flex flex-wrap gap-3 mb-3">
            <div>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 3 }}>Priority</div>
              <input
                type="number"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="border border-chrome-200 rounded focus:outline-none"
                style={{ width: 80, height: 30, padding: '0 8px', fontSize: 12 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 3 }}>Description</div>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="border border-chrome-200 rounded focus:outline-none"
                style={{ width: 220, height: 30, padding: '0 8px', fontSize: 12 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 3 }}>Match Product Type</div>
              <select
                value={form.match_product_type}
                onChange={e => setForm(f => ({ ...f, match_product_type: e.target.value }))}
                className="border border-chrome-200 rounded"
                style={{ width: 120, height: 30, padding: '0 6px', fontSize: 12 }}
              >
                <option value="">— ทั้งหมด —</option>
                <option value="standard">standard</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 3 }}>Mark Prefix</div>
              <input
                value={form.match_mark_prefix}
                onChange={e => setForm(f => ({ ...f, match_mark_prefix: e.target.value }))}
                placeholder="WH, CO, BR..."
                className="border border-chrome-200 rounded focus:outline-none font-mono"
                style={{ width: 90, height: 30, padding: '0 8px', fontSize: 12 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8E8E8E', marginBottom: 3 }}>Routing Template</div>
              <select
                value={form.routing_template_id}
                onChange={e => setForm(f => ({ ...f, routing_template_id: e.target.value }))}
                className="border border-chrome-200 rounded"
                style={{ width: 160, height: 30, padding: '0 6px', fontSize: 12 }}
              >
                <option value="">— เลือก template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !form.routing_template_id}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#185FA5' }}
            >
              {createMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} บันทึก
            </button>
            <button onClick={() => setShowForm(false)} className="flex items-center gap-1 rounded border border-chrome-200 hover:bg-chrome-50" style={{ height: 32, padding: '0 12px', fontSize: 12, color: '#555' }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Rules table */}
      <div className="bg-white rounded-lg border border-chrome-100" style={{ overflow: 'hidden' }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 100px 140px 48px', padding: '8px 16px', borderBottom: '1px solid #E0E0E0', fontSize: 11, fontWeight: 600, color: '#8E8E8E', background: '#FAFAFA' }}>
          <span>Priority</span>
          <span>Description</span>
          <span>Product Type</span>
          <span>Mark Prefix</span>
          <span>Template</span>
          <span />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 32, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> กำลังโหลด...
          </div>
        ) : rules.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#8E8E8E' }}>
            ยังไม่มี binding rules
          </div>
        ) : (
          rules.map((rule: BindingRuleDTO) => (
            <div key={rule.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 100px 140px 48px', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #F5F5F5', fontSize: 12, color: '#3A3A3A' }}>
              <span className="font-mono" style={{ fontWeight: 600, color: '#185FA5' }}>{rule.priority}</span>
              <span style={{ color: '#555' }}>{rule.description ?? '—'}</span>
              <span>{rule.match_product_type
                ? <span style={{ background: '#F0F4FF', color: '#185FA5', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>{rule.match_product_type}</span>
                : <span style={{ color: '#C2C2C2' }}>—</span>
              }</span>
              <span className="font-mono" style={{ fontWeight: 600 }}>{rule.match_mark_prefix ?? <span style={{ color: '#C2C2C2' }}>—</span>}</span>
              <span style={{ fontWeight: 600, color: '#1F1F1F' }}>{rule.routing_template?.code} <span style={{ fontWeight: 400, color: '#8E8E8E', fontSize: 11 }}>— {rule.routing_template?.name}</span></span>
              <button
                onClick={() => { if (confirm(`ลบ rule "${rule.description ?? rule.id}"?`)) deleteMut.mutate(rule.id) }}
                disabled={deleteMut.isPending}
                className="flex items-center justify-center rounded hover:bg-red-50"
                style={{ width: 28, height: 28 }}
              >
                {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" style={{ color: '#C8202A' }} /> : <Trash2 size={12} style={{ color: '#C8202A' }} />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
