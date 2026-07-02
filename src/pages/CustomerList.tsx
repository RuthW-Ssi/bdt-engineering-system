import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Loader2, Building2, Mail, Phone, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../hooks/useCustomers'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { getErrorMessage } from '../lib/getErrorMessage'
import type { Customer, CreateCustomerPayload } from '../api/customers'

const EMPTY: CreateCustomerPayload = { name: '' }

function CustomerCard({
  c,
  onEdit,
  onDelete,
}: {
  c: Customer
  onEdit: (c: Customer) => void
  onDelete: (c: Customer) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? '#C2C2C2' : '#E0E0E0'}`,
        borderRadius: 8,
        background: hovered ? '#FAFAFA' : '#fff',
        padding: '14px 20px',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: 8, flexShrink: 0,
        background: '#F5F5F5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Building2 size={18} style={{ color: '#8E8E8E' }} />
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          {c.ref && (
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 4, padding: '1px 6px' }}>{c.ref}</span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: 12, color: '#8E8E8E' }}>
          {c.email && (
            <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>
          )}
          {c.phone && (
            <span className="flex items-center gap-1"><Phone size={11} />{c.phone}</span>
          )}
          {c.city && (
            <span className="flex items-center gap-1"><MapPin size={11} />{c.city}</span>
          )}
          {!c.email && !c.phone && !c.city && (
            <span style={{ color: '#C2C2C2' }}>No contact info</span>
          )}
        </div>
      </div>

      {/* Projects count */}
      <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 60 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A', lineHeight: 1 }}>{c._count?.projects ?? 0}</div>
        <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>projects</div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
        <button
          onClick={() => onEdit(c)}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#8E8E8E' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F0F0F0')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(c)}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#C8202A' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FCEBEB')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export function CustomerList() {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ open: boolean; editing: Customer | null }>({ open: false, editing: null })
  const [form, setForm] = useState<CreateCustomerPayload>(EMPTY)
  const { data, isLoading } = useCustomers({ search: search || undefined, active: 'true', limit: 100 })
  const createMut = useCreateCustomer()
  const updateMut = useUpdateCustomer()
  const deleteMut = useDeleteCustomer()
  const confirm = useConfirm()

  const items = data?.items ?? []

  function openCreate() {
    setForm(EMPTY)
    setModal({ open: true, editing: null })
  }

  function openEdit(c: Customer) {
    setForm({ ref: c.ref ?? undefined, name: c.name, vat: c.vat ?? undefined, email: c.email ?? undefined, phone: c.phone ?? undefined, street: c.street ?? undefined, city: c.city ?? undefined })
    setModal({ open: true, editing: c })
  }

  async function handleSubmit() {
    if (!form.name) return
    try {
      if (modal.editing) {
        await updateMut.mutateAsync({ id: modal.editing.id, payload: form })
        toast.success('Customer updated')
      } else {
        await createMut.mutateAsync(form)
        toast.success('Customer created')
      }
      setModal({ open: false, editing: null })
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stop here so the modal stays open for the user to retry.
    }
  }

  async function handleDelete(c: Customer) {
    const ok = await confirm({
      title: 'Archive customer?',
      message: `"${c.name}" will be archived and hidden from active lists.`,
      variant: 'danger',
      confirmLabel: 'Archive',
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync(c.id)
      toast.success('Customer archived')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to archive customer. Please try again.'))
    }
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Customers</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${data?.total ?? 0} items`}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={14} />Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ height: 48, background: '#F5F5F5', flexShrink: 0 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customers..."
            style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 260 }}
          />
        </div>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            No customers found
          </div>
        ) : (
          items.map(c => (
            <CustomerCard key={c.id} c={c} onEdit={openEdit} onDelete={handleDelete} />
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.16)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
              {modal.editing ? 'Edit Customer' : 'New Customer'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                ['ref', 'Code (optional)', false],
                ['name', 'Name *', true],
                ['vat', 'VAT', false],
                ['email', 'Email', false],
                ['phone', 'Phone', false],
                ['city', 'City', false],
              ] as [keyof CreateCustomerPayload, string, boolean][]).map(([field, label, required]) => (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{label}</label>
                  <input
                    value={(form[field] as string) ?? ''}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value || undefined }))}
                    required={required}
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 24 }}>
              <button
                onClick={() => setModal({ open: false, editing: null })}
                style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !form.name}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: saving || !form.name ? '#C2C2C2' : '#C8202A', color: '#fff', cursor: saving || !form.name ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
