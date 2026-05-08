import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Loader2, ChevronDown } from 'lucide-react'
import { useProjects } from '../hooks/useProjects'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones, useCreateSubZone, useDeleteSubZone } from '../hooks/useSubZones'
import type { ProjectZoneDTO } from '../api/types'

export function ZoneList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('project_id') ? Number(searchParams.get('project_id')) : null

  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []

  const { data: zones, isLoading: zonesLoading } = useProjectZones(projectId ?? 0)
  const zoneList: ProjectZoneDTO[] = (zones as any) ?? []

  const [expandedZone, setExpandedZone] = useState<number | null>(null)
  const [subModal, setSubModal] = useState<{ open: boolean; zoneId: number | null }>({ open: false, zoneId: null })
  const [subForm, setSubForm] = useState({ name: '', code: '' })

  const { data: subZones } = useSubZones(expandedZone)
  const createSubMut = useCreateSubZone(subModal.zoneId ?? 0)
  const deleteSubMut = useDeleteSubZone(expandedZone ?? 0)

  async function handleCreateSub() {
    if (!subForm.name || !subModal.zoneId) return
    await createSubMut.mutateAsync({ name: subForm.name, code: subForm.code || undefined })
    setSubModal({ open: false, zoneId: null })
    setSubForm({ name: '', code: '' })
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Zones</span>
      </div>

      {/* Filter */}
      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ height: 48, background: '#F5F5F5', flexShrink: 0 }}>
        <select
          value={projectId ?? ''}
          onChange={e => {
            const p = new URLSearchParams(searchParams)
            if (e.target.value) p.set('project_id', e.target.value)
            else p.delete('project_id')
            setSearchParams(p)
          }}
          style={{ padding: '5px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', minWidth: 240 }}
        >
          <option value="">— Select Project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>
          ))}
        </select>
      </div>

      {/* Zone list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!projectId ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>เลือกโปรเจกต์ก่อน</div>
        ) : zonesLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : zoneList.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>ไม่พบโซน</div>
        ) : (
          <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {zoneList.map((zone: any) => (
              <div key={zone.id} style={{ border: '1px solid #E0E0E0', borderRadius: 6, background: '#fff', overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedZone(expandedZone === zone.id ? null : zone.id)}
                  className="flex items-center justify-between cursor-pointer"
                  style={{ padding: '12px 16px' }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{zone.code}</span>
                    <span style={{ color: '#555' }}>{zone.label}</span>
                    <span style={{ fontSize: 11, background: '#F0F0F0', borderRadius: 4, padding: '2px 7px', color: '#8E8E8E' }}>{zone.zone_type}</span>
                    {zone.sub_zones?.length > 0 && (
                      <span style={{ fontSize: 11, background: '#EEF2FF', borderRadius: 4, padding: '2px 7px', color: '#4F6EF7' }}>{zone.sub_zones.length} sub-zones</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setSubModal({ open: true, zoneId: zone.id }); setExpandedZone(zone.id) }}
                      className="flex items-center gap-1"
                      style={{ fontSize: 12, color: '#C8202A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      <Plus size={12} />Add Sub-zone
                    </button>
                    <ChevronDown size={16} style={{ color: '#8E8E8E', transform: expandedZone === zone.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </div>
                </div>

                {expandedZone === zone.id && (
                  <div style={{ borderTop: '1px solid #F0F0F0', padding: '8px 16px 12px 16px' }}>
                    {!subZones || subZones.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#8E8E8E', margin: 0 }}>No sub-zones yet. Click "Add Sub-zone" to create one.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {subZones.map(sz => (
                          <div key={sz.id} className="flex items-center justify-between" style={{ padding: '6px 8px', background: '#F8F8F8', borderRadius: 4 }}>
                            <span style={{ fontSize: 13, color: '#333' }}>
                              <span style={{ fontWeight: 500 }}>{sz.code ?? '—'}</span>
                              {sz.code && <span style={{ color: '#8E8E8E', margin: '0 8px' }}>·</span>}
                              {sz.name}
                            </span>
                            <button
                              onClick={() => deleteSubMut.mutate(sz.id)}
                              style={{ fontSize: 11, color: '#C8202A', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              Archive
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-zone Modal */}
      {subModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 360 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>New Sub-zone</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Code (optional)</label>
                <input value={subForm.code} onChange={e => setSubForm(f => ({ ...f, code: e.target.value }))} style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Name *</label>
                <input value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} required style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4 }} />
              </div>
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
              <button onClick={() => setSubModal({ open: false, zoneId: null })} style={{ padding: '7px 14px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateSub} disabled={!subForm.name || createSubMut.isPending} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: !subForm.name ? '#C2C2C2' : '#C8202A', color: '#fff', cursor: !subForm.name ? 'not-allowed' : 'pointer' }}>
                {createSubMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
