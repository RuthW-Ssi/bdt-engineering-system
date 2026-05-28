export type DispatchTab = 'compare'

const TABS: { id: DispatchTab; label: string }[] = [
  { id: 'compare', label: 'Compare' },
]

interface Props {
  active: DispatchTab
  onChange: (tab: DispatchTab) => void
}

export function DispatchTabs({ active, onChange }: Props) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8', paddingLeft: 24, gap: 0, background: '#fff', flexShrink: 0 }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: active === tab.id ? 600 : 400,
            color: active === tab.id ? '#C8202A' : '#555',
            borderBottom: active === tab.id ? '2px solid #C8202A' : '2px solid transparent',
            background: 'none',
            border: 'none',
            borderBottomWidth: 2,
            borderBottomStyle: 'solid',
            borderBottomColor: active === tab.id ? '#C8202A' : 'transparent',
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
