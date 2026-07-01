import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Send, ArrowDownLeft, Package, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useMaterial, useMaterialAction, useMaterialMessages } from '../hooks/useMaterials'

// ── State display ─────────────────────────────────────────────────
const STATE_META: Record<string, { label: string; bg: string; text: string }> = {
  draft:      { label: 'Draft',          bg: '#F5F5F5', text: '#555' },
  to_approve: { label: 'Pending Review', bg: '#FAEEDA', text: '#854F0B' },
  confirmed:  { label: 'Active',         bg: '#EAF3DE', text: '#27500A' },
  cancel:     { label: 'Rejected',       bg: '#FEF2F2', text: '#991B1B' },
  blocked:    { label: 'Blocked',        bg: '#F3E8FF', text: '#6D28D9' },
}

// ── Action config ─────────────────────────────────────────────────
type ActionDef = { action: string; label: string; bg: string; confirm: string; destructive?: boolean }
const ACTIONS_BY_STATE: Record<string, ActionDef[]> = {
  draft:      [{ action: 'action_submit',  label: 'Submit for Review', bg: '#854F0B', confirm: 'Submit this material for review?' },
               { action: 'action_cancel',  label: 'Cancel',            bg: '#C8202A', confirm: 'Cancel this material?', destructive: true }],
  to_approve: [{ action: 'action_confirm', label: 'Confirm / Approve', bg: '#27500A', confirm: 'Confirm and approve this material?' },
               { action: 'action_reset',   label: 'Reset to Draft',    bg: '#8E8E8E', confirm: 'Reset to Draft?', destructive: true },
               { action: 'action_cancel',  label: 'Cancel',            bg: '#C8202A', confirm: 'Cancel this material?', destructive: true }],
  confirmed:  [{ action: 'action_block',   label: 'Block',             bg: '#6D28D9', confirm: 'Block this material?', destructive: true },
               { action: 'action_cancel',  label: 'Cancel',            bg: '#C8202A', confirm: 'Cancel this material?', destructive: true }],
  cancel:     [{ action: 'action_reset',   label: 'Restore to Draft',  bg: '#0C447C', confirm: 'Restore this material to Draft?' }],
  blocked:    [{ action: 'action_unblock', label: 'Unblock',           bg: '#27500A', confirm: 'Unblock this material?' }],
}

// ── Field component (2-col card grid) ────────────────────────────
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F1F1F' }}>{value}</div>
    </div>
  )
}


function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return undefined
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

// ── Tabs ──────────────────────────────────────────────────────────
const TABS = ['Overview', 'History'] as const
type Tab = typeof TABS[number]

// ── Main ──────────────────────────────────────────────────────────
export function MaterialDetail() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null)

  const { data: mat, isLoading, isError } = useMaterial(code ?? '')
  const action = useMaterialAction(code ?? '')
  const { data: messages } = useMaterialMessages(code ?? '')

  const stateMeta = STATE_META[mat?.state ?? 'draft'] ?? STATE_META.draft
  const availableActions = ACTIONS_BY_STATE[mat?.state ?? ''] ?? []

  async function handleAction(def: ActionDef) {
    try {
      await action.mutateAsync(def.action)
      setConfirmAction(null)
      toast.success(`${def.label} สำเร็จ`)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Action failed — please try again')
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      <Loader2 size={20} className="animate-spin" />Loading...
    </div>
  )

  if (isError || !mat) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
      Material {code} not found
    </div>
  )

  const hasSpecs = !!(mat.grade || mat.thickness_mm || mat.width_ft || mat.width_mm || mat.length_mm || mat.total_weight_kg)
  const hasPricing = mat.sales_price != null || mat.cost != null

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="bg-white flex items-center sticky border-b border-chrome-100 px-5 gap-3" style={{ top: 56, height: 56, zIndex: 40 }}>
        <button onClick={() => navigate('/materials')}
          className="flex items-center justify-center rounded-md hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <Package size={15} style={{ color: '#8E8E8E' }} />
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>{mat.default_code}</span>
        <span style={{ color: '#C2C2C2' }}>·</span>
        <span className="truncate" style={{ fontSize: 13, color: '#555', maxWidth: 320 }}>{mat.name}</span>
        <span style={{
          padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: stateMeta.bg, color: stateMeta.text, flexShrink: 0,
        }}>{stateMeta.label}</span>

        <div className="flex-1" />

        {availableActions.map(def => (
          <button key={def.action}
            onClick={() => setConfirmAction(def)}
            disabled={action.isPending}
            className="flex items-center gap-1.5 rounded-md"
            style={{
              height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600,
              ...(def.destructive
                ? { background: 'transparent', color: def.bg, border: `1px solid ${def.bg}` }
                : { background: def.bg, color: 'white', border: 'none' }),
              opacity: action.isPending ? 0.6 : 1, cursor: 'pointer',
            }}>
            {def.destructive ? <ArrowDownLeft size={14} /> : <Send size={14} />}
            {def.label}
          </button>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-chrome-100 sticky px-5 flex gap-1" style={{ top: 112, zIndex: 39 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 14px', fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#C8202A' : '#8E8E8E',
              borderBottom: `2px solid ${tab === t ? '#C8202A' : 'transparent'}`,
              background: 'none', border: 'none', borderBottomStyle: 'solid',
              borderBottomWidth: 2, borderBottomColor: tab === t ? '#C8202A' : 'transparent',
              cursor: 'pointer',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto" style={{ padding: 24 }}>

        {/* Overview — single card, all fields */}
        {tab === 'Overview' && (
          <div>
            <div className="bg-white rounded-lg border border-chrome-100" style={{ padding: 24 }}>

              {/* Description prominent for consu/service */}
              {mat.type !== 'product' && mat.description_sale && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#1F1F1F', lineHeight: 1.5 }}>{mat.description_sale}</div>
                  <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 3 }}>{mat.name}</div>
                </div>
              )}

              {/* Basic info — 4 col grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                <Field label="Name"            value={mat.name} />
                <Field label="Category"        value={mat.category?.name} />
                <Field label="Type"            value={{ product: 'Product', consu: 'Consumable', service: 'Service' }[mat.type] ?? mat.type} />
                <Field label="Unit of Measure" value={mat.uom?.name} />
                <Field label="Purchase UoM"    value={mat.uom_po?.name ?? undefined} />
                <Field label="Criticality"     value={mat.criticality ?? undefined} />
                <Field label="Version"         value={mat.version ?? undefined} />
              </div>

              {/* Description for product */}
              {mat.type === 'product' && mat.description_sale && (
                <div style={{ marginTop: 16 }}>
                  <Field label="Description" value={mat.description_sale} />
                </div>
              )}

              {/* Physical Specs */}
              {hasSpecs && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Physical Specifications</div>
                  {mat.grade && (
                    <div style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '8px 14px', background: '#F8F8F8', borderRadius: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Grade</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#1F1F1F', letterSpacing: '-0.02em' }}>{mat.grade}</span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                    <Field label="Thickness (mm)"    value={fmt(mat.thickness_mm)} />
                    <Field label="Width (mm)"        value={fmt(mat.width_mm)} />
                    <Field label="Width (ft)"        value={fmt(mat.width_ft, 3)} />
                    <Field label="Length (mm)"       value={fmt(mat.length_mm)} />
                    <Field label="Total Weight (kg)" value={fmt(mat.total_weight_kg, 3)} />
                  </div>
                </div>
              )}

              {/* Pricing */}
              {hasPricing && (
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                  {mat.sales_price != null && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Sales Price</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>฿ {fmt(mat.sales_price)}</div>
                    </div>
                  )}
                  {mat.cost != null && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cost</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>฿ {fmt(mat.cost)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* References */}
              {(mat.odoo_ref_id || mat.drawing_ref) && (
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                  {mat.odoo_ref_id && <Field label="Odoo Ref"    value={<span className="font-mono" style={{ fontSize: 12 }}>{mat.odoo_ref_id}</span>} />}
                  {mat.drawing_ref && <Field label="Drawing Ref" value={mat.drawing_ref} />}
                </div>
              )}

              {/* Custom attributes */}
              {mat.attributes && Object.keys(mat.attributes).length > 0 && (
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                  {Object.entries(mat.attributes)
                    .filter(([, v]) => v != null && v !== '')
                    .map(([k, v]) => <Field key={k} label={k} value={String(v)} />)}
                </div>
              )}

              {/* Audit */}
              {(mat.audit_status || mat.audited_by || mat.audited_date || mat.activity_exception_decoration) && (
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                  <Field label="Audit Status"  value={mat.audit_status ?? undefined} />
                  <Field label="Audited By"    value={mat.audited_by ?? undefined} />
                  <Field label="Audited Date"  value={mat.audited_date ? new Date(mat.audited_date).toLocaleDateString('en-GB') : undefined} />
                  <Field label="Activity Flag" value={mat.activity_exception_decoration ?? undefined} />
                </div>
              )}

              {/* Record */}
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px 24px' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{new Date(mat.create_date).toLocaleDateString('en-GB')} · {mat.create_user?.name ?? `#${mat.create_uid}`}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Last Updated</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{new Date(mat.write_date).toLocaleDateString('en-GB')} · {mat.write_user?.name ?? `#${mat.write_uid}`}</div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* History */}
        {tab === 'History' && (
          <div style={{ maxWidth: 720 }}>
            {!messages || messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
                <Clock size={24} style={{ opacity: 0.3 }} />
                No history yet
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg: any) => (
                  <div key={msg.id} className="bg-white rounded-lg border border-chrome-100" style={{ padding: '14px 18px' }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{msg.subject ?? 'Note'}</span>
                      <span style={{ fontSize: 11, color: '#8E8E8E' }}>{new Date(msg.create_date).toLocaleString('en-GB')}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#555' }}>{msg.body}</div>
                    {msg.tracking?.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {msg.tracking.map((t: any, i: number) => (
                          <div key={i} style={{ fontSize: 11, color: '#8E8E8E', fontFamily: 'monospace' }}>
                            {t.field}: <span style={{ color: '#C8202A', textDecoration: 'line-through' }}>{String(t.old_value ?? '—')}</span>
                            {' → '}
                            <span style={{ color: '#27500A' }}>{String(t.new_value ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm dialog ────────────────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 50 }}>
          <div className="bg-white rounded-xl" style={{ padding: '28px 32px', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F', marginBottom: 8 }}>Confirm Action</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>{confirmAction.confirm}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)} disabled={action.isPending}
                className="rounded-md" style={{ padding: '7px 18px', fontSize: 13, fontWeight: 500, background: '#F5F5F5', border: '1px solid #E0E0E0', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleAction(confirmAction)} disabled={action.isPending}
                className="rounded-md text-white" style={{ padding: '7px 18px', fontSize: 13, fontWeight: 600, background: confirmAction.bg, border: 'none', cursor: 'pointer', opacity: action.isPending ? 0.6 : 1 }}>
                {action.isPending ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
