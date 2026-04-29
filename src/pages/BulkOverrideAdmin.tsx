import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, Play, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getRoutingTemplates, getActivityTemplates, bulkUpsertOverrides } from '../api/routings'
import type { BulkOverrideResultDTO } from '../api/routings'

export function BulkOverrideAdmin() {
  const [criteria, setCriteria] = useState({
    routing_template_id: '' as string | number,
    product_type: '',
    mark_prefix: '',
    attribute_path: '',
    attribute_value: '',
  })
  const [override, setOverride] = useState({
    activity_template_id: '' as string | number,
    override_per_minute: '',
    override_std_measure: '',
    override_manpower: '',
    reason: '',
  })
  const [preview, setPreview] = useState<BulkOverrideResultDTO | null>(null)
  const [applied, setApplied] = useState<BulkOverrideResultDTO | null>(null)

  const { data: templates } = useQuery({ queryKey: ['routing-templates'], queryFn: getRoutingTemplates })
  const { data: activities } = useQuery({
    queryKey: ['activity-templates'],
    queryFn: () => getActivityTemplates({ limit: 200 }),
  })

  const buildBody = (previewOnly: boolean) => ({
    criteria: {
      ...(criteria.routing_template_id ? { routing_template_id: Number(criteria.routing_template_id) } : {}),
      ...(criteria.product_type ? { product_type: criteria.product_type } : {}),
      ...(criteria.mark_prefix ? { mark_prefix: criteria.mark_prefix } : {}),
      ...(criteria.attribute_path && criteria.attribute_value
        ? { attribute_filter: { path: criteria.attribute_path, value: criteria.attribute_value } }
        : {}),
    },
    override: {
      activity_template_id: Number(override.activity_template_id),
      ...(override.override_per_minute ? { override_per_minute: Number(override.override_per_minute) } : {}),
      ...(override.override_std_measure ? { override_std_measure: Number(override.override_std_measure) } : {}),
      ...(override.override_manpower ? { override_manpower: Number(override.override_manpower) } : {}),
      reason: override.reason,
    },
    preview_only: previewOnly,
  })

  const previewMut = useMutation({
    mutationFn: () => bulkUpsertOverrides(buildBody(true)),
    onSuccess: data => {
      setPreview(data)
      setApplied(null)
    },
  })

  const applyMut = useMutation({
    mutationFn: () => bulkUpsertOverrides(buildBody(false)),
    onSuccess: data => {
      setApplied(data)
      setPreview(null)
    },
  })

  const canApply = preview && Number(override.activity_template_id) > 0 && override.reason.trim().length > 0

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: 13,
    width: '100%',
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#555', marginBottom: 4 }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Bulk Override</h2>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
        Apply one override to multiple products matching criteria. Products with custom routing are skipped.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Criteria */}
        <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Filter Criteria</div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>Template</div>
            <select
              style={inputStyle}
              value={criteria.routing_template_id}
              onChange={e => setCriteria(c => ({ ...c, routing_template_id: e.target.value }))}
            >
              <option value="">— All templates —</option>
              {templates?.map(t => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>Product Type</div>
            <select
              style={inputStyle}
              value={criteria.product_type}
              onChange={e => setCriteria(c => ({ ...c, product_type: e.target.value }))}
            >
              <option value="">— Any —</option>
              <option value="custom">Custom</option>
              <option value="standard">Standard</option>
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>Mark Prefix (e.g. WH-CO)</div>
            <input
              style={inputStyle}
              value={criteria.mark_prefix}
              onChange={e => setCriteria(c => ({ ...c, mark_prefix: e.target.value }))}
              placeholder="WH-CO"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={labelStyle}>Attr Path</div>
              <input
                style={inputStyle}
                value={criteria.attribute_path}
                onChange={e => setCriteria(c => ({ ...c, attribute_path: e.target.value }))}
                placeholder="material_group"
              />
            </div>
            <div>
              <div style={labelStyle}>Attr Value</div>
              <input
                style={inputStyle}
                value={criteria.attribute_value}
                onChange={e => setCriteria(c => ({ ...c, attribute_value: e.target.value }))}
                placeholder="STEEL_PLATE"
              />
            </div>
          </div>
        </div>

        {/* Override */}
        <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Override Values</div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>Activity Template *</div>
            <select
              style={inputStyle}
              value={override.activity_template_id}
              onChange={e => setOverride(o => ({ ...o, activity_template_id: e.target.value }))}
            >
              <option value="">— Select activity —</option>
              {activities?.map(a => (
                <option key={a.id} value={a.id}>
                  [{a.op_code}] {a.description}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={labelStyle}>Per Minute</div>
              <input
                style={inputStyle}
                type="number"
                step="0.01"
                value={override.override_per_minute}
                onChange={e => setOverride(o => ({ ...o, override_per_minute: e.target.value }))}
                placeholder="leave blank"
              />
            </div>
            <div>
              <div style={labelStyle}>Std Measure</div>
              <input
                style={inputStyle}
                type="number"
                step="0.01"
                value={override.override_std_measure}
                onChange={e => setOverride(o => ({ ...o, override_std_measure: e.target.value }))}
                placeholder="leave blank"
              />
            </div>
            <div>
              <div style={labelStyle}>Manpower</div>
              <input
                style={inputStyle}
                type="number"
                step="0.01"
                value={override.override_manpower}
                onChange={e => setOverride(o => ({ ...o, override_manpower: e.target.value }))}
                placeholder="leave blank"
              />
            </div>
          </div>

          <div>
            <div style={labelStyle}>Reason *</div>
            <input
              style={inputStyle}
              value={override.reason}
              onChange={e => setOverride(o => ({ ...o, reason: e.target.value }))}
              placeholder="e.g. Updated rate from production study Q2-2026"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => previewMut.mutate()}
          disabled={!override.activity_template_id || previewMut.isPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: '#1565c0',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: override.activity_template_id ? 'pointer' : 'not-allowed',
            opacity: override.activity_template_id ? 1 : 0.5,
          }}
        >
          <Search size={14} /> Find Products
        </button>

        {canApply && (
          <button
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: '#2e7d32',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Play size={14} /> Apply to {preview!.matched_count - preview!.skipped_count} Products
          </button>
        )}
      </div>

      {/* Preview result */}
      {preview && !applied && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AlertTriangle size={15} color="#f57f17" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Preview — {preview.matched_count} products matched</span>
            {preview.skipped_count > 0 && (
              <span style={{ fontSize: 12, color: '#888' }}>({preview.skipped_count} skipped — custom routing)</span>
            )}
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {preview.affected_products.map(p => (
              <div key={p.id} style={{ fontSize: 12, padding: '2px 0', color: '#555' }}>
                {p.product_code} — {p.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applied result */}
      {applied && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={15} color="#2e7d32" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Applied to {applied.applied_count} products
              {applied.skipped_count > 0 && ` (${applied.skipped_count} skipped)`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
