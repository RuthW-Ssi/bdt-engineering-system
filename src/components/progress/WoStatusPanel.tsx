import { Loader2 } from 'lucide-react'
import { useWos } from '../../hooks/useWo'
import type { WoStatus } from '../../api/wo'

const WO_CHIP: Record<WoStatus, { label: string; bg: string; color: string }> = {
  NOT_STARTED: { label: 'Not started', bg: '#F0F0F0', color: '#8E8E8E' },
  RELEASED: { label: 'Released', bg: '#EAF1F8', color: '#4A85C4' },
  IN_PROGRESS: { label: 'In progress', bg: '#EAF1F8', color: '#4A85C4' },
  PAUSED: { label: 'Paused', bg: '#FBF3E4', color: '#E3A73D' },
  ON_HOLD: { label: 'On hold', bg: '#FCEBEB', color: '#C8202A' },
  DONE: { label: 'Done', bg: '#E8F5EE', color: '#2E9E5F' },
  CANCELLED: { label: 'Cancelled', bg: '#F0F0F0', color: '#ABABAB' },
}

interface Props {
  projectId: number
  zoneId: number
  assemblyMark: string | null
}

// Real WO execution state for the selected assembly — an independent data
// source to cross-check against the manually-entered progress fields. The
// two can disagree; that's informative, not a bug.
export function WoStatusPanel({ projectId, zoneId, assemblyMark }: Props) {
  const { data: wos, isLoading } = useWos(
    assemblyMark ? { assembly_mark: assemblyMark, project_id: projectId, zone_id: zoneId } : undefined,
  )

  return (
    <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #EDEFF2', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8E8E8E' }}>
        WO Status{assemblyMark ? ` — ${assemblyMark}` : ''}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!assemblyMark ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8E8E8E', fontSize: 12.5 }}>
            Select an assembly in the table or 3D view to see its work orders
          </div>
        ) : isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : !wos?.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8E8E8E', fontSize: 12.5 }}>
            No work orders for this mark
          </div>
        ) : (
          wos.map(wo => {
            const chip = WO_CHIP[wo.status]
            return (
              <div key={wo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderBottom: '1px solid #EDEFF2' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12, fontWeight: 600, color: '#1A1A1A' }}>{wo.wo_code}</div>
                  <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {wo.work_center.name}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0, background: chip.bg, color: chip.color }}>
                  {chip.label}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div style={{ padding: '10px 14px', fontSize: 11, color: '#ABABAB', borderTop: '1px solid #EDEFF2', lineHeight: 1.5 }}>
        Independent of the checkboxes at left — cross-check real WO execution against manually-entered progress.
      </div>
    </div>
  )
}
