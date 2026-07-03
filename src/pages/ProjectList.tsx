import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, Plus, FolderOpen, Building2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { useProjects, useCreateProject } from '../hooks/useProjects'
import { useCustomers } from '../hooks/useCustomers'
import { useActiveProject } from '../context/ProjectContext'
import type { CreateProjectPayload } from '../api/projects'
import type { ProjectDTO } from '../api/types'

const STATE_LABELS: Record<string, string> = {
  lead: 'Lead',
  won: 'Won',
  in_design: 'In Design',
  in_fab: 'In Fabrication',
  in_erection: 'In Erection',
  handover: 'Handover',
  closed: 'Closed',
}

const STATE_STYLE: Record<string, { bg: string; color: string }> = {
  lead:        { bg: '#F0F4FF', color: '#3B5BDB' },
  won:         { bg: '#E6FCF5', color: '#0CA678' },
  in_design:   { bg: '#FFF3BF', color: '#E67700' },
  in_fab:      { bg: '#FFF0F6', color: '#C2255C' },
  in_erection: { bg: '#F3F0FF', color: '#7048E8' },
  handover:    { bg: '#E8F5E9', color: '#2E7D32' },
  closed:      { bg: '#F5F5F5', color: '#757575' },
}

const ALL_STATES = Object.keys(STATE_LABELS)

function StatePill({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? { bg: '#F5F5F5', color: '#555' }
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {STATE_LABELS[state] ?? state}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function ProjectCard({ p, isActive, onClick, onDoubleClick }: { p: ProjectDTO; isActive: boolean; onClick: () => void; onDoubleClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${isActive ? '#C8202A' : hovered ? '#C2C2C2' : '#E0E0E0'}`,
        borderRadius: 8,
        background: isActive ? '#FEF6F6' : hovered ? '#FAFAFA' : '#fff',
        padding: '14px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 8, flexShrink: 0,
        background: isActive ? '#FCEBEB' : '#F5F5F5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FolderOpen size={18} style={{ color: isActive ? '#C8202A' : '#8E8E8E' }} />
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#C8202A' }}>{p.project_code}</span>
          <span style={{ color: '#C2C2C2', fontSize: 12 }}>·</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
        </div>
        <div className="flex items-center gap-3" style={{ fontSize: 12, color: '#8E8E8E' }}>
          {p.customer ? (
            <span className="flex items-center gap-1">
              <Building2 size={11} />
              {p.customer.ref && <span style={{ fontWeight: 500 }}>{p.customer.ref}</span>}
              {p.customer.ref && <span>·</span>}
              <span>{p.customer.name}</span>
            </span>
          ) : (
            <span style={{ color: '#C2C2C2' }}>No customer</span>
          )}
        </div>
      </div>

      {/* Right meta */}
      <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
        <StatePill state={p.state} />

        <div className="flex items-center gap-1" style={{ fontSize: 12, color: '#8E8E8E', minWidth: 60 }}>
          <span style={{ fontWeight: 600, color: '#555' }}>{p._count?.zones ?? 0}</span>
          <span>zones</span>
        </div>

        <div className="flex items-center gap-1" style={{ fontSize: 12, color: '#8E8E8E', minWidth: 72 }}>
          <span style={{ fontWeight: 600, color: '#555' }}>{p._count?.products ?? 0}</span>
          <span>products</span>
        </div>

        <div className="flex items-center gap-1" style={{ fontSize: 11, color: '#8E8E8E', minWidth: 140 }}>
          <Calendar size={11} />
          {p.start_date && p.target_handover ? (
            <span>{fmtDate(p.start_date)} → {fmtDate(p.target_handover)}</span>
          ) : p.start_date ? (
            <span>Start {fmtDate(p.start_date)}</span>
          ) : p.target_handover ? (
            <span>Due {fmtDate(p.target_handover)}</span>
          ) : (
            <span style={{ color: '#C2C2C2' }}>No dates set</span>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM: Partial<CreateProjectPayload> = { project_code: '', name: '', customer_id: undefined }

export function ProjectList() {
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<Partial<CreateProjectPayload>>(EMPTY_FORM)
  const [touched, setTouched] = useState(false)

  const navigate = useNavigate()
  const { activeProject, setActiveProject } = useActiveProject()
  const { data, isLoading } = useProjects({ q: search || undefined, state: stateFilter || undefined, limit: 100 })
  const { data: customersData } = useCustomers({ active: 'true', limit: 200 })
  const createMut = useCreateProject()

  const items = data?.items ?? []
  const customers = customersData?.items ?? []
  const isValid = !!form.project_code?.trim() && !!form.name?.trim() && !!form.customer_id

  function openModal() {
    setForm(EMPTY_FORM)
    setTouched(false)
    setModalOpen(true)
  }

  async function handleSubmit() {
    setTouched(true)
    if (!isValid) return
    try {
      const created = await createMut.mutateAsync(form as CreateProjectPayload)
      toast.success('Project created')
      setModalOpen(false)
      setActiveProject(created)
    } catch {
      // Global handler (meta.showGlobalErrorToast on the mutation) already showed
      // the error toast — stop here so the modal stays open for the user to retry.
    }
  }

  function errBorder(key: keyof CreateProjectPayload) {
    return touched && !form[key] ? '#C8202A' : '#C2C2C2'
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Projects</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${data?.total ?? 0} items`}
          </span>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={14} />New Project
        </button>
      </div>

      {/* Filter bar */}
      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ height: 48, background: '#F5F5F5', flexShrink: 0 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 240 }}
          />
        </div>
        <select
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', color: stateFilter ? '#1A1A1A' : '#8E8E8E' }}
        >
          <option value="">All Statuses</option>
          {ALL_STATES.map(s => (
            <option key={s} value={s}>{STATE_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            No projects found
          </div>
        ) : (
          items.map(p => (
            <ProjectCard
              key={p.id}
              p={p}
              isActive={activeProject?.id === p.id}
              onClick={() => setActiveProject(p)}
              onDoubleClick={() => navigate(`/zones?project_id=${p.id}`)}
            />
          ))
        )}
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 460, boxShadow: '0 4px 24px rgba(0,0,0,0.16)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Create New Project</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Project Code <span style={{ color: '#C8202A' }}>*</span></label>
                <input
                  value={form.project_code ?? ''}
                  onChange={e => setForm(f => ({ ...f, project_code: e.target.value }))}
                  placeholder="e.g. 0X203"
                  style={{ padding: '7px 10px', fontSize: 13, border: `1px solid ${errBorder('project_code')}`, borderRadius: 4, fontFamily: 'monospace' }}
                />
                {touched && !form.project_code?.trim() && <span style={{ fontSize: 11, color: '#C8202A' }}>Please enter a Project Code</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Project Name <span style={{ color: '#C8202A' }}>*</span></label>
                <input
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Factory Building Phase 2"
                  style={{ padding: '7px 10px', fontSize: 13, border: `1px solid ${errBorder('name')}`, borderRadius: 4 }}
                />
                {touched && !form.name?.trim() && <span style={{ fontSize: 11, color: '#C8202A' }}>Please enter a project name</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Customer <span style={{ color: '#C8202A' }}>*</span></label>
                <select
                  value={form.customer_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, customer_id: e.target.value ? Number(e.target.value) : undefined }))}
                  style={{ padding: '7px 10px', fontSize: 13, border: `1px solid ${errBorder('customer_id')}`, borderRadius: 4, background: '#fff', color: form.customer_id ? '#1A1A1A' : '#8E8E8E' }}
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.ref ? `${c.ref} · ` : ''}{c.name}</option>
                  ))}
                </select>
                {touched && !form.customer_id && <span style={{ fontSize: 11, color: '#C8202A' }}>Please select a Customer</span>}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Start Date</label>
                  <input
                    type="date"
                    value={form.start_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value || undefined }))}
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Due Date</label>
                  <input
                    type="date"
                    value={form.target_handover ?? ''}
                    onChange={e => setForm(f => ({ ...f, target_handover: e.target.value || undefined }))}
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2" style={{ marginTop: 24 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMut.isPending}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: createMut.isPending ? '#C2C2C2' : '#C8202A', color: '#fff', cursor: createMut.isPending ? 'not-allowed' : 'pointer' }}
              >
                {createMut.isPending ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
