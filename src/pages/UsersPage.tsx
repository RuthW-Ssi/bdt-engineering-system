import { useMemo, useState } from 'react'
import { Plus, Pencil, KeyRound, Loader2, X, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useSetUserPermissions,
  useResetUserPassword,
} from '../hooks/useUsers'
import { getErrorMessage } from '../lib/getErrorMessage'
import {
  ALL_MODULES,
  ALWAYS_VIEW_MODULES,
  MODULE_LABELS,
  KNOWN_DEPARTMENTS,
  ROLE_LABELS,
  ROLE_TEMPLATE,
  type ModuleKey,
  type PermissionEntry,
} from '../api/users'

type PermissionAction = 'view' | 'create' | 'update' | 'delete'

const fieldLabelStyle = { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 } as const
const inputClass = 'w-full border rounded-md focus:outline-none'
const inputStyle = { height: 36, padding: '0 10px', fontSize: 13, borderColor: '#E0E0E0' } as const
const checkboxStyle = { width: 15, height: 15, accentColor: '#C8202A', cursor: 'pointer' } as const

function templateFor(department: string): PermissionEntry[] {
  if (department === 'admin') return []
  const modules = ROLE_TEMPLATE[department] ?? []
  return modules.map(module => ({ module, can_view: true, can_create: true, can_update: true, can_delete: true }))
}

function togglePermission(permissions: PermissionEntry[], module: string, action: PermissionAction): PermissionEntry[] {
  const key = `can_${action}` as const
  const existing = permissions.find(p => p.module === module)
  if (existing) {
    const updated = { ...existing, [key]: !existing[key] }
    return permissions.map(p => (p.module === module ? updated : p))
  }
  return [...permissions, { module, can_view: false, can_create: false, can_update: false, can_delete: false, [key]: true }]
}

interface CreateForm {
  login: string
  name: string
  password: string
  role: string
  level: string
  job_title: string
  permissions: PermissionEntry[]
}

const EMPTY_CREATE: CreateForm = {
  login: '',
  name: '',
  password: '',
  role: 'BTE',
  level: '',
  job_title: '',
  permissions: templateFor('BTE'),
}

const ADD_NEW = '__add_new__'

// Dropdown of existing values with a trailing "+ Add new" option — picking it
// swaps in a text input to type a brand new value, which then becomes a
// normal option. No dedicated "manage list" screen needed.
function DropdownWithAdd({
  label,
  value,
  onChange,
  options,
  addLabel,
  labelFor,
  inputPlaceholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  addLabel: string
  labelFor?: (v: string) => string
  inputPlaceholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const allOptions = useMemo(() => {
    const set = new Set(options)
    if (value) set.add(value)
    return Array.from(set).sort()
  }, [options, value])

  function commitDraft() {
    const v = draft.trim()
    if (v) onChange(v)
    setAdding(false)
    setDraft('')
  }

  if (adding) {
    return (
      <div>
        <label style={fieldLabelStyle}>{label}</label>
        <div className="flex" style={{ gap: 6 }}>
          <input
            autoFocus
            value={draft}
            placeholder={inputPlaceholder}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitDraft()
              if (e.key === 'Escape') { setAdding(false); setDraft('') }
            }}
            className={inputClass}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={commitDraft}
            className="rounded-md text-white"
            style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, border: 'none', background: '#C8202A', cursor: 'pointer' }}
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setDraft('') }}
            className="rounded-md border"
            style={{ height: 36, padding: '0 14px', fontSize: 13, borderColor: '#E0E0E0', background: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <select
        value={value}
        onChange={e => (e.target.value === ADD_NEW ? setAdding(true) : onChange(e.target.value))}
        className={inputClass}
        style={{ ...inputStyle, background: '#fff' }}
      >
        {!value && <option value="">—</option>}
        {allOptions.map(o => (
          <option key={o} value={o}>{labelFor ? labelFor(o) : o}</option>
        ))}
        <option value={ADD_NEW}>{addLabel}</option>
      </select>
    </div>
  )
}

// Feature list with View/Create/Update/Delete checkboxes per row. Removing
// View blocks the feature entirely — no implicit read-all for these modules.
function PermissionChecklist({
  permissions,
  onToggle,
}: {
  permissions: PermissionEntry[]
  onToggle: (module: ModuleKey, action: PermissionAction) => void
}) {
  const byModule = new Map(permissions.map(p => [p.module, p]))
  return (
    <div className="rounded-md border border-chrome-100" style={{ maxHeight: 320, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: '#F5F5F5', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ padding: '6px 10px', textAlign: 'left' }}>Feature</th>
            <th style={{ padding: '6px 10px' }}>View</th>
            <th style={{ padding: '6px 10px' }}>Create</th>
            <th style={{ padding: '6px 10px' }}>Update</th>
            <th style={{ padding: '6px 10px' }}>Delete</th>
          </tr>
        </thead>
        <tbody>
          {ALL_MODULES.map(module => {
            const p = byModule.get(module)
            const alwaysView = ALWAYS_VIEW_MODULES.includes(module)
            return (
              <tr key={module} className="border-t border-chrome-100">
                <td style={{ padding: '6px 10px', color: '#1F1F1F' }}>{MODULE_LABELS[module]}</td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={alwaysView ? true : (p?.can_view ?? false)}
                    disabled={alwaysView}
                    title={alwaysView ? 'Always viewable — reference data used by other features' : undefined}
                    onChange={() => onToggle(module, 'view')}
                    style={checkboxStyle}
                  />
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <input type="checkbox" checked={p?.can_create ?? false} onChange={() => onToggle(module, 'create')} style={checkboxStyle} />
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <input type="checkbox" checked={p?.can_update ?? false} onChange={() => onToggle(module, 'update')} style={checkboxStyle} />
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <input type="checkbox" checked={p?.can_delete ?? false} onChange={() => onToggle(module, 'delete')} style={checkboxStyle} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ModalShell({
  title,
  width,
  onClose,
  children,
  footer,
}: {
  title: string
  width: number
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width, maxHeight: '90vh', overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-6" style={{ height: 56, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>{title}</span>
          <button onClick={onClose} className="rounded hover:bg-chrome-50" style={{ padding: 4, color: '#8E8E8E' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        <div className="flex items-center justify-end gap-3 px-6" style={{ height: 60, borderTop: '1px solid #E0E0E0', flexShrink: 0 }}>
          {footer}
        </div>
      </div>
    </div>
  )
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md border" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, borderColor: '#E0E0E0', background: '#fff', cursor: 'pointer' }}>
      Cancel
    </button>
  )
}

function SaveButton({ onClick, disabled, pending, label = 'Save' }: { onClick: () => void; disabled?: boolean; pending?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-md text-white disabled:opacity-60"
      style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, border: 'none', background: '#C8202A', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Saving…' : label}
    </button>
  )
}

function CreateUserModal({
  onClose,
  departmentSuggestions,
  levelSuggestions,
  jobTitleSuggestions,
}: {
  onClose: () => void
  departmentSuggestions: string[]
  levelSuggestions: string[]
  jobTitleSuggestions: string[]
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE)
  const createMut = useCreateUser()

  function handleDepartmentChange(role: string) {
    setForm(f => ({ ...f, role, permissions: templateFor(role) }))
  }

  function handleToggle(module: ModuleKey, action: PermissionAction) {
    setForm(f => ({ ...f, permissions: togglePermission(f.permissions, module, action) }))
  }

  async function handleSubmit() {
    if (!form.login || !form.name || form.password.length < 8 || !form.role) return
    try {
      await createMut.mutateAsync({
        login: form.login,
        name: form.name,
        password: form.password,
        role: form.role,
        level: form.level || undefined,
        job_title: form.job_title || undefined,
        permissions: form.permissions,
      })
      toast.success('User created')
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to create user. Please try again.'))
    }
  }

  const valid = form.login && form.name && form.password.length >= 8 && form.role

  return (
    <ModalShell
      title="New User"
      width={560}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SaveButton onClick={handleSubmit} disabled={createMut.isPending || !valid} pending={createMut.isPending} />
        </>
      }
    >
      <div>
        <label style={fieldLabelStyle}>Login *</label>
        <input
          value={form.login}
          onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
          className={inputClass}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={fieldLabelStyle}>Name *</label>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className={inputClass}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={fieldLabelStyle}>Initial password * (min 8 chars)</label>
        <input
          type="password"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          className={inputClass}
          style={inputStyle}
        />
      </div>
      <DropdownWithAdd
        label="Department *"
        value={form.role}
        onChange={handleDepartmentChange}
        options={departmentSuggestions}
        addLabel="+ Add new department"
        labelFor={v => ROLE_LABELS[v] ?? v}
        inputPlaceholder="e.g. BTE"
      />
      <DropdownWithAdd
        label="Level"
        value={form.level}
        onChange={v => setForm(f => ({ ...f, level: v }))}
        options={levelSuggestions}
        addLabel="+ Add new level"
        inputPlaceholder="e.g. Supervisor"
      />
      <DropdownWithAdd
        label="Job Title"
        value={form.job_title}
        onChange={v => setForm(f => ({ ...f, job_title: v }))}
        options={jobTitleSuggestions}
        addLabel="+ Add new job title"
        inputPlaceholder="e.g. Business System Developer"
      />
      <div>
        <label style={fieldLabelStyle}>
          Permissions {form.role !== 'admin' && '(pre-filled from department — adjust as needed)'}
        </label>
        <div style={{ marginTop: 6 }}>
          {form.role === 'admin' ? (
            <div style={{ fontSize: 12, color: '#8E8E8E', padding: '8px 4px' }}>Admin has full access to every module — no rows needed.</div>
          ) : (
            <PermissionChecklist permissions={form.permissions} onToggle={handleToggle} />
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function EditUserModal({
  userId,
  departmentSuggestions,
  levelSuggestions,
  jobTitleSuggestions,
  onClose,
}: {
  userId: number
  departmentSuggestions: string[]
  levelSuggestions: string[]
  jobTitleSuggestions: string[]
  onClose: () => void
}) {
  const { data: user, isLoading } = useUser(userId)
  const updateMut = useUpdateUser()
  const setPermsMut = useSetUserPermissions()

  const [name, setName] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [active, setActive] = useState<boolean | null>(null)
  const [permissions, setPermissions] = useState<PermissionEntry[] | null>(null)

  const nameVal = name ?? user?.name ?? ''
  const roleVal = role ?? user?.role ?? ''
  const levelVal = level ?? user?.level ?? ''
  const jobTitleVal = jobTitle ?? user?.job_title ?? ''
  const activeVal = active ?? user?.active ?? true
  const permissionsVal = permissions ?? user?.module_permissions ?? []

  function handleToggle(module: ModuleKey, action: PermissionAction) {
    setPermissions(togglePermission(permissionsVal, module, action))
  }

  const saving = updateMut.isPending || setPermsMut.isPending

  async function handleSubmit() {
    try {
      await updateMut.mutateAsync({
        id: userId,
        payload: { name: nameVal, role: roleVal, level: levelVal || undefined, job_title: jobTitleVal || undefined, active: activeVal },
      })
      if (roleVal !== 'admin') {
        await setPermsMut.mutateAsync({ id: userId, permissions: permissionsVal })
      }
      toast.success('User updated')
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to update user. Please try again.'))
    }
  }

  return (
    <ModalShell
      title={`Edit User — ${user?.login ?? ''}`}
      width={560}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SaveButton onClick={handleSubmit} disabled={saving || isLoading} pending={saving} />
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 160 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
        </div>
      ) : (
        <>
          <div>
            <label style={fieldLabelStyle}>Name</label>
            <input value={nameVal} onChange={e => setName(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <DropdownWithAdd
            label="Department"
            value={roleVal}
            onChange={setRole}
            options={departmentSuggestions}
            addLabel="+ Add new department"
            labelFor={v => ROLE_LABELS[v] ?? v}
            inputPlaceholder="e.g. BTE"
          />
          <DropdownWithAdd
            label="Level"
            value={levelVal}
            onChange={setLevel}
            options={levelSuggestions}
            addLabel="+ Add new level"
            inputPlaceholder="e.g. Supervisor"
          />
          <DropdownWithAdd
            label="Job Title"
            value={jobTitleVal}
            onChange={setJobTitle}
            options={jobTitleSuggestions}
            addLabel="+ Add new job title"
            inputPlaceholder="e.g. Business System Developer"
          />
          <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#1F1F1F' }}>
            <input type="checkbox" checked={activeVal} onChange={e => setActive(e.target.checked)} style={checkboxStyle} />
            Active
          </label>

          <div>
            <label style={fieldLabelStyle}>Permissions</label>
            <div style={{ marginTop: 6 }}>
              {roleVal === 'admin' ? (
                <div style={{ fontSize: 12, color: '#8E8E8E', padding: '8px 4px' }}>Admin has full access to every module — no rows to manage.</div>
              ) : (
                <PermissionChecklist permissions={permissionsVal} onToggle={handleToggle} />
              )}
            </div>
          </div>
        </>
      )}
    </ModalShell>
  )
}

function ResetPasswordModal({ userId, login, onClose }: { userId: number; login: string; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const resetMut = useResetUserPassword()

  async function handleSubmit() {
    if (password.length < 8) return
    try {
      await resetMut.mutateAsync({ id: userId, password })
      toast.success('Password reset')
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to reset password. Please try again.'))
    }
  }

  return (
    <ModalShell
      title={`Reset Password — ${login}`}
      width={380}
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} />
          <SaveButton onClick={handleSubmit} disabled={resetMut.isPending || password.length < 8} pending={resetMut.isPending} label="Reset" />
        </>
      }
    >
      <div>
        <label style={fieldLabelStyle}>New password (min 8 chars)</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={inputClass}
          style={inputStyle}
        />
      </div>
    </ModalShell>
  )
}

function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full"
      style={{
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 600,
        background: active ? '#EAF3DE' : '#F5F5F5',
        color: active ? '#27500A' : '#8E8E8E',
      }}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function distinctSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort()
}

const COL_TEMPLATE = '150px 1fr 110px 130px 220px 90px 80px'

export function UsersPage() {
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active')
  const { data, isLoading, isError } = useUsers({ limit: 100, active: statusFilter === 'active' ? 'true' : 'false' })
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [resetFor, setResetFor] = useState<{ id: number; login: string } | null>(null)

  const items = useMemo(() => data?.items ?? [], [data])

  const departmentSuggestions = useMemo(
    () => distinctSorted(['admin', ...KNOWN_DEPARTMENTS, ...items.map(u => u.role)]),
    [items],
  )
  const levelSuggestions = useMemo(() => distinctSorted(items.map(u => u.level)), [items])
  const jobTitleSuggestions = useMemo(() => distinctSorted(items.map(u => u.job_title)), [items])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Users</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${data?.total ?? 0} items`}
          </span>
          <div className="flex items-center" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: 2, marginLeft: 4 }}>
            {(['active', 'inactive'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  height: 24, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                  background: statusFilter === s ? '#fff' : 'transparent',
                  color: statusFilter === s ? '#1F1F1F' : '#8E8E8E',
                  boxShadow: statusFilter === s ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={14} />Add User
        </button>
      </div>

      <div className="bg-white flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 10,
            display: 'grid', gridTemplateColumns: COL_TEMPLATE,
            alignItems: 'center', padding: '0 24px', height: 36,
            background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Login</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Name</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Department</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Level</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Job Title</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Status</div>
          <div />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={20} className="animate-spin" />Loading users...
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            Unable to load users — verify that the backend is running
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <UsersIcon size={32} style={{ opacity: 0.3 }} />
            <div>{statusFilter === 'active' ? 'No active users yet' : 'No inactive users'}</div>
          </div>
        )}

        {!isLoading && !isError && items.map(u => (
          <div
            key={u.id}
            className="hover:bg-chrome-50"
            style={{
              display: 'grid', gridTemplateColumns: COL_TEMPLATE,
              alignItems: 'center', padding: '0 24px', height: 52, borderBottom: '1px solid #E0E0E0',
            }}
          >
            <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{u.login}</div>
            <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{u.name}</div>
            <div style={{ fontSize: 13, color: '#555' }}>{ROLE_LABELS[u.role] ?? u.role}</div>
            <div style={{ fontSize: 13, color: u.level ? '#555' : '#C2C2C2' }}>{u.level ?? '—'}</div>
            <div className="truncate" style={{ fontSize: 13, color: u.job_title ? '#555' : '#C2C2C2' }}>{u.job_title ?? '—'}</div>
            <div><ActivePill active={u.active} /></div>
            <div className="flex items-center justify-end gap-1">
              <button onClick={() => setEditingId(u.id)} title="Edit / Permissions" className="flex items-center justify-center rounded hover:bg-chrome-100" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => setResetFor({ id: u.id, login: u.login })} title="Reset password" className="flex items-center justify-center rounded hover:bg-chrome-100" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                <KeyRound size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E', flexShrink: 0 }}>
        {isLoading ? 'Loading...' : `Showing ${items.length} of ${data?.total ?? 0} users`}
      </div>

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          departmentSuggestions={departmentSuggestions}
          levelSuggestions={levelSuggestions}
          jobTitleSuggestions={jobTitleSuggestions}
        />
      )}
      {editingId != null && (
        <EditUserModal
          userId={editingId}
          onClose={() => setEditingId(null)}
          departmentSuggestions={departmentSuggestions}
          levelSuggestions={levelSuggestions}
          jobTitleSuggestions={jobTitleSuggestions}
        />
      )}
      {resetFor && <ResetPasswordModal userId={resetFor.id} login={resetFor.login} onClose={() => setResetFor(null)} />}
    </div>
  )
}
