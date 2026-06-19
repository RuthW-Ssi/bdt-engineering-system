
export type SortBy = 'project' | 'zone' | 'subzone' | 'mark'
export type GroupByOption = 'project,zone,subzone' | 'zone,subzone' | 'none'
export type DateLevel = 'project' | 'zone' | 'subzone'

export interface AssemblyFilter {
  sortBy: SortBy
  groupBy: GroupByOption
  urgentDays: 7 | 15 | 30 | null
  showOverdue: boolean
}

export const DEFAULT_FILTER: AssemblyFilter = {
  sortBy: 'project',
  groupBy: 'project,zone,subzone',
  urgentDays: null,
  showOverdue: false,
}

// Derives the primary date level from the current sort mode.
// 'mark' has no dedicated level — callers handle it by showing multiple dates.
export function sortByToDateLevel(sortBy: SortBy): DateLevel {
  if (sortBy === 'zone') return 'zone'
  if (sortBy === 'subzone') return 'subzone'
  return 'project'
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'zone',    label: 'Zone' },
  { value: 'subzone', label: 'Sub Zone' },
  { value: 'mark',    label: 'Mark' },
]

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#AAA',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 5,
}

function PillBtn({
  active, onClick, children, activeStyle,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  activeStyle?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap',
        background: active ? '#C8202A' : '#fff',
        color: active ? '#fff' : '#555',
        borderColor: active ? '#C8202A' : '#D4D4D4',
        transition: 'all 0.12s',
        ...(active ? activeStyle : {}),
      }}
    >
      {children}
    </button>
  )
}

export function AssemblyFilterBar({
  filter,
  onChange,
}: {
  filter: AssemblyFilter
  onChange: (next: Partial<AssemblyFilter>) => void
}) {
  const set = (patch: Partial<AssemblyFilter>) => onChange(patch)

  return (
    <div style={{
      border: '1px solid #E8E8E8', borderRadius: 10,
      background: '#fff', padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Sort by — also controls which due date is shown */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {SORT_OPTIONS.map(opt => (
          <PillBtn key={opt.value} active={filter.sortBy === opt.value} onClick={() => set({ sortBy: opt.value })}>
            {opt.label}
          </PillBtn>
        ))}
      </div>

      {/* Urgent + Overdue */}
      <div>
        <div style={SECTION_LABEL}>Quick Filter</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {([7, 15, 30] as const).map(d => (
            <PillBtn
              key={d}
              active={filter.urgentDays === d}
              onClick={() => set({ urgentDays: filter.urgentDays === d ? null : d })}
            >
              &le;{d}d
            </PillBtn>
          ))}
          <PillBtn
            active={filter.showOverdue}
            onClick={() => set({ showOverdue: !filter.showOverdue })}
            activeStyle={{ background: '#FFFBEB', color: '#92400E', borderColor: '#D97706' }}
          >
            Overdue
          </PillBtn>
        </div>
      </div>
    </div>
  )
}
