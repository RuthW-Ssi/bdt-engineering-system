import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, Loader2 } from 'lucide-react'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../hooks/useCustomers'
import type { Customer, CreateCustomerPayload } from '../api/customers'

const EMPTY: CreateCustomerPayload = { name: '' }

export function CustomerList() {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ open: boolean; editing: Customer | null }>({ open: false, editing: null })
  const [form, setForm] = useState<CreateCustomerPayload>(EMPTY)
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null)

  const { data, isLoading } = useCustomers({ search: search || undefined, active: 'true', limit: 100 })
  const createMut = useCreateCustomer()
  const updateMut = useUpdateCustomer()
  const deleteMut = useDeleteCustomer()

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
    if (modal.editing) {
      await updateMut.mutateAsync({ id: modal.editing.id, payload: form })
    } else {
      await createMut.mutateAsync(form)
    }
    setModal({ open: false, editing: null })
  }

  async function handleDelete(c: Customer) {
    await deleteMut.mutateAsync(c.id)
    setConfirmDelete(null)
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
            {isLoading ? '...' : `${data?.total ?? 0} รายการ`}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
        >
          <Plus size={14} />เพิ่มลูกค้า
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ height: 48, background: '#F5F5F5', flexShrink: 0 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาลูกค้า..."
            style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 260 }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            ไม่พบข้อมูล
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F5F5F5', borderBottom: '1px solid #E0E0E0' }}>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: '#555', width: 120 }}>Code</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Name</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: '#555', width: 180 }}>Email</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: '#555', width: 120 }}>Phone</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: '#555', width: 80 }}>Projects</th>
                <th style={{ padding: '8px 16px', width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <td style={{ padding: '10px 16px', color: '#555' }}>{c.ref ?? '—'}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1A1A1A' }}>{c.name}</td>
                  <td style={{ padding: '10px 16px', color: '#555' }}>{c.email ?? '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#555' }}>{c.phone ?? '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#555', textAlign: 'center' }}>{c._count?.projects ?? 0}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} style={{ padding: 4, color: '#8E8E8E', cursor: 'pointer', background: 'none', border: 'none' }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDelete(c)} style={{ padding: 4, color: '#C8202A', cursor: 'pointer', background: 'none', border: 'none' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              {([ ['ref', 'Code (optional)', false], ['name', 'Name *', true], ['vat', 'VAT', false], ['email', 'Email', false], ['phone', 'Phone', false], ['city', 'City', false] ] as [keyof CreateCustomerPayload, string, boolean][]).map(([field, label, required]) => (
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

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 360 }}>
            <p style={{ fontSize: 14, marginBottom: 20, color: '#333' }}>
              Archive customer <strong>{confirmDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '7px 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: 'pointer' }}>Archive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
