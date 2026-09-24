import { useProjects } from '../../hooks/useProjects'
import { useProjectZones } from '../../hooks/useProjectZones'

type SortBy = 'project' | 'zone' | 'subzone' | 'mark'
type GroupByOption = 'project,zone,subzone' | 'zone,subzone' | 'none'

export interface AssemblyFilter {
  sortBy: SortBy
  groupBy: GroupByOption
  // Scopes the assembly list to one project + one zone — an MO is created
  // for a single project/zone, never a mix (2026-09-22).
  projectId: number | null
  projectName: string | null
  zoneId: number | null
  zoneLabel: string | null
}

export const DEFAULT_FILTER: AssemblyFilter = {
  sortBy: 'project',
  groupBy: 'project,zone,subzone',
  projectId: null,
  projectName: null,
  zoneId: null,
  zoneLabel: null,
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#AAA',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 5,
}

const DROPDOWN: React.CSSProperties = {
  width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  color: '#555', background: '#fff', border: '1px solid #D4D4D4', cursor: 'pointer',
}

export function AssemblyFilterBar({
  filter,
  onChange,
}: {
  filter: AssemblyFilter
  onChange: (next: Partial<AssemblyFilter>) => void
}) {
  const set = (patch: Partial<AssemblyFilter>) => onChange(patch)

  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []
  const { data: zones = [] } = useProjectZones(filter.projectId ?? undefined)

  function onProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value ? Number(e.target.value) : null
    const project = projects.find(p => p.id === id)
    set({ projectId: id, projectName: project?.name ?? null, zoneId: null, zoneLabel: null })
  }

  function onZoneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value ? Number(e.target.value) : null
    const zone = zones.find(z => z.id === id)
    set({ zoneId: id, zoneLabel: zone?.label ?? null })
  }

  return (
    <div style={{
      border: '1px solid #E8E8E8', borderRadius: 10,
      background: '#fff', padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Project + Zone — an MO is scoped to exactly one of each */}
      <div>
        <div style={SECTION_LABEL}>Project</div>
        <select value={filter.projectId ?? ''} onChange={onProjectChange} style={DROPDOWN}>
          <option value="">Select project…</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <div style={SECTION_LABEL}>Zone</div>
        <select
          value={filter.zoneId ?? ''}
          onChange={onZoneChange}
          disabled={!filter.projectId}
          style={{ ...DROPDOWN, ...(!filter.projectId ? { color: '#BBB', cursor: 'not-allowed', background: '#FAFAFA' } : {}) }}
        >
          <option value="">{filter.projectId ? 'Select zone…' : 'Select a project first'}</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
