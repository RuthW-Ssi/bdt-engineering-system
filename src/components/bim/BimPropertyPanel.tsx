import type { BimElement } from '../../api/bim'

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #F5F5F5', fontSize: 12.5 }}>
      <span style={{ color: '#8E8E8E' }}>{k}</span>
      <span style={{ fontWeight: 600, color: '#1F1F1F', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12 }}>{v}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 14px 4px', fontSize: 11, fontWeight: 700, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </div>
  )
}

interface Props {
  element: BimElement | null
  instanceIndex?: number // index of `element` among every other assembly sharing its mark — -1/undefined when not applicable
  instanceCount?: number // total assemblies sharing that mark — the cycling row only shows above 1
  onNextInstance?: () => void
}

export function BimPropertyPanel({ element, instanceIndex, instanceCount, onNextInstance }: Props) {
  if (!element) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>
        Select an element in the 3D viewer to see its properties
      </div>
    )
  }

  // Several property groups repeat the same key (e.g. every attached Pset
  // has its own "GLOBALID") — keep the group name in the row key so React
  // doesn't see duplicate keys across groups.
  const otherProps = Object.entries(element.properties ?? {}).flatMap(([groupName, group]) =>
    group && typeof group === 'object'
      ? Object.entries(group).map(([k, v]) => [`${groupName}.${k}`, v] as const)
      : [],
  )

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SectionTitle>Identity</SectionTitle>
      <div style={{ padding: '0 14px 14px' }}>
        <Row k="Mark" v={element.mark ?? '—'} />
        <Row k="IFC Type" v={element.ifc_type ?? '—'} />
        <Row k="GUID" v={element.global_id ? `${element.global_id.slice(0, 8)}...${element.global_id.slice(-4)}` : '—'} />
        {element.assembly_mark && <Row k="Assembly" v={element.assembly_mark} />}
        {element.phase && <Row k="Phase" v={element.phase} />}
        {element.position && <Row k="Position" v={element.position} />}
        <Row k="Status" v={
          <span style={{ background: '#E0E0E0', color: '#555', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>
            {element.status}
          </span>
        } />
      </div>

      {instanceCount != null && instanceCount > 1 && (
        <div style={{ margin: '0 14px 14px', padding: '9px 11px', background: '#F7F7F7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#555' }}>
            Instance {(instanceIndex ?? 0) + 1} / {instanceCount}
          </span>
          <button
            onClick={onNextInstance}
            style={{ fontSize: 12, fontWeight: 600, color: '#185FA5', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Next mark →
          </button>
        </div>
      )}

      <SectionTitle>Quantities</SectionTitle>
      <div style={{ padding: '0 14px 14px' }}>
        <Row k="Weight" v={element.weight_kg != null ? `${element.weight_kg} kg` : '—'} />
        <Row k="Area" v={element.area_m2 != null ? `${element.area_m2} m²` : '—'} />
        <Row k="Length" v={element.length_mm != null ? `${element.length_mm} mm` : '—'} />
        <Row k="Width" v={element.width_mm != null ? `${element.width_mm} mm` : '—'} />
        <Row k="Height" v={element.height_mm != null ? `${element.height_mm} mm` : '—'} />
      </div>

      {otherProps.length > 0 && (
        <>
          <SectionTitle>Other (raw property set)</SectionTitle>
          <div style={{ padding: '0 14px 14px' }}>
            {otherProps.map(([k, v]) => <Row key={k} k={k} v={String(v)} />)}
          </div>
        </>
      )}
    </div>
  )
}
