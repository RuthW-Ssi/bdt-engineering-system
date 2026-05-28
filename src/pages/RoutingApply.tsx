import { useState, useEffect, useMemo } from 'react'
import { Loader2, Package } from 'lucide-react'
import { useDispatches } from '../hooks/useBomDispatches'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useActiveProject } from '../context/ProjectContext'
import { RoutingConfigContent } from './BomRoutingConfig'
import { ZoneSummaryTab } from '../components/bom/ZoneSummaryTab'
import type { DispatchSummaryDto } from '../api/dispatches'

type PageTab = 'install' | 'summary'

const TABS: { id: PageTab; label: string }[] = [
  { id: 'install', label: 'Install' },
  { id: 'summary', label: 'Summary' },
]

export function RoutingApply() {
  const { activeProject } = useActiveProject()
  const [zoneId, setZoneId] = useState<number | null>(null)
  const [subZoneId, setSubZoneId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<PageTab>('install')

  const { data: zonesData } = useProjectZones(activeProject?.id)
  const zones = zonesData ?? []

  const { data: subZonesData } = useSubZones(zoneId)
  const subZones = subZonesData ?? []

  // Auto-select first zone
  useEffect(() => {
    if (zones.length > 0 && !zoneId) setZoneId(zones[0].id)
  }, [zones]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset sub-zone + dispatch when zone changes
  useEffect(() => {
    setSubZoneId(null)
    setSelectedId(null)
  }, [zoneId])

  // Auto-select first sub-zone
  useEffect(() => {
    if (subZones.length > 0 && !subZoneId) setSubZoneId(subZones[0].id)
  }, [subZones]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useDispatches(
    activeProject && zoneId
      ? { project_id: activeProject.id, zone_id: zoneId, sub_zone_id: subZoneId ?? undefined, page: 1, limit: 100 }
      : undefined
  )

  const dispatches: DispatchSummaryDto[] = useMemo(() => data?.items ?? [], [data?.items])

  // Build version map: API returns desc → reverse per group to number oldest=v1
  const { versionMap, latestId } = useMemo(() => {
    const groups = new Map<string, DispatchSummaryDto[]>()
    for (const d of dispatches) {
      const key = `${d.zone_id}-${d.sub_zone_id ?? ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(d)
    }
    const versionMap = new Map<number, number>()
    for (const group of groups.values()) {
      const asc = [...group].reverse()
      asc.forEach((d, i) => versionMap.set(d.id, i + 1))
    }
    return { versionMap, latestId: dispatches[0]?.id ?? null }
  }, [dispatches])

  // Auto-select latest dispatch
  useEffect(() => {
    setSelectedId(latestId)
  }, [latestId])

  const selected = dispatches.find(d => d.id === selectedId)

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E8E8', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Install</span>

        <span style={{ width: 1, height: 20, background: '#E0E0E0' }} />

        {/* Zone selector */}
        <select
          disabled={!activeProject || zones.length === 0}
          value={zoneId ?? ''}
          onChange={e => setZoneId(Number(e.target.value))}
          style={{ height: 32, padding: '0 8px', fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, minWidth: 160, background: '#fff' }}
        >
          {zones.length === 0
            ? <option value="">— No zones —</option>
            : zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)
          }
        </select>

        {/* Sub-zone selector */}
        {subZones.length > 0 && (
          <select
            value={subZoneId ?? ''}
            onChange={e => setSubZoneId(Number(e.target.value))}
            style={{ height: 32, padding: '0 8px', fontSize: 12, border: '1px solid #E0E0E0', borderRadius: 6, minWidth: 140, background: '#fff' }}
          >
            {subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>)}
          </select>
        )}

        {/* Dispatch version selector */}
        {dispatches.length > 0 && (
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            style={{ height: 32, padding: '0 8px', fontSize: 12, border: `1px solid ${selectedId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6, minWidth: 80, background: '#fff' }}
          >
            {dispatches.map(d => (
              <option key={d.id} value={d.id}>v{versionMap.get(d.id) ?? 1}</option>
            ))}
          </select>
        )}

        {selected && (
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>
            {selected.assembly_count ?? 0} assemblies · {new Date(selected.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8', background: '#fff', paddingLeft: 24, flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '9px 16px', fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#C8202A' : '#555',
              borderBottom: `2px solid ${activeTab === tab.id ? '#C8202A' : 'transparent'}`,
              background: 'none', border: 'none',
              borderBottomWidth: 2, borderBottomStyle: 'solid',
              borderBottomColor: activeTab === tab.id ? '#C8202A' : 'transparent',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {!activeProject ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Select a Project from the header first</div>
        </div>
      ) : isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: '#8E8E8E', fontSize: 13 }}>
          <Loader2 size={18} className="animate-spin" />Loading...
        </div>
      ) : !selectedId ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>No dispatches found for this zone</div>
        </div>
      ) : activeTab === 'install' ? (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 24px' }}>
          <RoutingConfigContent dispatchId={selectedId} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 20px' }}>
          <ZoneSummaryTab dispatchId={selectedId} />
        </div>
      )}
    </div>
  )
}
