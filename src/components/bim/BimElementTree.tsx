import { useMemo, useState } from 'react'
import type { BimElement } from '../../api/bim'

type TreeTab = 'assemblies' | 'phases'

interface Props {
  elements: BimElement[]
  selectedMark: string | null
  onSelectMark: (mark: string) => void
  onSelectPhase: (phase: string | null) => void
}

function ListRow({ label, count, selected, isLast, onClick }: {
  label: string; count: number; selected: boolean; isLast: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="hover:bg-chrome-50"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
        fontSize: 12.5, cursor: 'pointer',
        borderBottom: isLast ? undefined : '1px solid #F0F0F0',
        background: selected ? '#FCEBEB' : undefined,
        color: selected ? '#C8202A' : '#333',
        fontWeight: selected ? 600 : 400,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C2C2C2', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: '#8E8E8E' }}>{count}</span>
    </div>
  )
}

export function BimElementTree({ elements, selectedMark, onSelectMark, onSelectPhase }: Props) {
  const [tab, setTab] = useState<TreeTab>('assemblies')
  const [search, setSearch] = useState('')
  // undefined = nothing clicked yet — distinct from `null`, which is itself a
  // real group (elements with no phase set).
  const [selectedPhase, setSelectedPhase] = useState<string | null | undefined>(undefined)

  const groups = useMemo(() => {
    const byMark = new Map<string, number>()
    // Only real Tekla-Assembly-level entities belong in this list — the raw
    // element set also includes individual parts, bolts/fasteners, and
    // duplicate geometry-representation nodes for the same real assembly.
    for (const el of elements) {
      if (el.ifc_type !== 'IfcElementAssembly') continue
      const mark = el.mark ?? '(no mark)'
      byMark.set(mark, (byMark.get(mark) ?? 0) + 1)
    }
    return Array.from(byMark.entries())
      .filter(([mark]) => mark.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [elements, search])

  // Phase is set on both assembly and part rows independently (confirmed in
  // property-extractor.ts — unlike position/assembly_mark it's not qualified
  // "assembly-level only"), so this groups every element, not just
  // assemblies — clicking a phase highlights the whole thing, parts included.
  const phaseGroups = useMemo(() => {
    const byPhase = new Map<string | null, number>()
    for (const el of elements) {
      byPhase.set(el.phase, (byPhase.get(el.phase) ?? 0) + 1)
    }
    return Array.from(byPhase.entries())
      .filter(([phase]) => (phase ?? '(no phase)').toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
  }, [elements, search])

  const handleSelectPhase = (phase: string | null) => {
    setSelectedPhase(phase)
    onSelectPhase(phase)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <button
          onClick={() => setTab('assemblies')}
          style={{
            flex: '1 1 0%', width: '100%', boxSizing: 'border-box', padding: '10px 0', fontSize: 12,
            fontWeight: tab === 'assemblies' ? 600 : 400, textAlign: 'center',
            color: tab === 'assemblies' ? '#C8202A' : '#8E8E8E',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === 'assemblies' ? '#C8202A' : '#E0E0E0'}`,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          Assemblies ({groups.length})
        </button>
        <button
          onClick={() => setTab('phases')}
          style={{
            flex: '1 1 0%', width: '100%', boxSizing: 'border-box', padding: '10px 0', fontSize: 12,
            fontWeight: tab === 'phases' ? 600 : 400, textAlign: 'center',
            color: tab === 'phases' ? '#C8202A' : '#8E8E8E',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === 'phases' ? '#C8202A' : '#E0E0E0'}`,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          Phases ({phaseGroups.length})
        </button>
      </div>
      <div style={{ margin: '10px 12px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'assemblies' ? 'Search mark...' : 'Search phase...'}
          style={{ width: '100%', border: '1px solid #C2C2C2', borderRadius: 7, padding: '7px 10px', fontSize: 12 }}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 6px 10px' }}>
        {tab === 'assemblies'
          ? groups.map(([mark, count], i) => (
              <ListRow
                key={mark}
                label={mark}
                count={count}
                selected={mark === selectedMark}
                isLast={i === groups.length - 1}
                onClick={() => onSelectMark(mark)}
              />
            ))
          : phaseGroups.map(([phase, count], i) => (
              <ListRow
                key={phase ?? '__no_phase__'}
                label={phase ?? '(no phase)'}
                count={count}
                selected={phase === selectedPhase}
                isLast={i === phaseGroups.length - 1}
                onClick={() => handleSelectPhase(phase)}
              />
            ))}
      </div>
    </div>
  )
}
