import { X, Loader2, ChevronDown, Cpu, Wrench, FlaskConical, Users } from 'lucide-react'
import { useState } from 'react'
import { useRoutingTemplateDetail } from '../../hooks/useMo'
import type { RoutingOpDetail, RoutingActivitySnap } from '../../api/mo'

export function RoutingDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useRoutingTemplateDetail(id)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,15,15,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580, maxHeight: '84vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', border: '1px solid #E8E8E8' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.3 }}>{data?.name ?? '—'}</div>
              {data && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0C447C', background: '#E3EEF8', borderRadius: 999, padding: '1px 8px' }}>{data.code}</span>
                  <span style={{ fontSize: 11, color: '#AAA' }}>{data.operations.length} operations</span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ background: '#F5F5F5', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, width: 30, height: 30, flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: '#CCC' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data?.operations.map((op, i) => <OpRow key={op.id} op={op} defaultOpen={i === 0} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OpRow({ op, defaultOpen }: { op: RoutingOpDetail; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const activities = op.activities_snapshot ?? []
  const color = op.op_type?.color ?? '#9CA3AF'

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #EEEEEE' }}>
      {/* Operation header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left', background: '#FAFAFA', border: 'none', cursor: 'pointer', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {/* Color stripe + sequence */}
        <span style={{ width: 24, height: 24, borderRadius: 7, background: color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '-0.02em' }}>
          {op.sequence}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{op.name}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{op.op_code}</div>
        </div>

        {/* Workcenter badge */}
        <span style={{ fontSize: 11, fontWeight: 500, color: '#555', background: '#EFEFEF', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
          {op.workcenter.name}
        </span>

        {/* Activity count */}
        {activities.length > 0 && (
          <span style={{ fontSize: 10, color: '#C0C0C0', flexShrink: 0 }}>{activities.length}A</span>
        )}

        <ChevronDown size={13} style={{ color: '#C0C0C0', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {/* Activities */}
      {open && (
        <div style={{ background: '#fff', padding: '10px 12px 12px', borderTop: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activities.length === 0
            ? <span style={{ fontSize: 12, color: '#D0D0D0', padding: '4px 0' }}>No activities defined</span>
            : activities.map((a, i) => <ActivityCard key={i} a={a} />)
          }
        </div>
      )}
    </div>
  )
}

function ActivityCard({ a }: { a: RoutingActivitySnap }) {
  const labors      = a.labors      ?? []
  const consumables = a.consumables ?? []
  const toolNames   = a.tool_names  ?? []
  const hasMachine  = !!a.machine_id
  const hasResources = hasMachine || toolNames.length > 0 || labors.length > 0 || consumables.length > 0

  return (
    <div style={{ background: '#F8F8F8', borderRadius: 8, padding: '9px 12px' }}>
      {/* Activity name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasResources ? 8 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#2A2A2A' }}>{a.name}</span>
        {a.measure && (
          <span style={{ fontSize: 10, color: '#888', background: '#ECECEC', borderRadius: 5, padding: '1px 6px' }}>{a.measure}</span>
        )}
        {a.per_minute != null && (
          <span style={{ fontSize: 10, color: '#AAA' }}>{a.per_minute}/min</span>
        )}
      </div>

      {/* Resource chips */}
      {hasResources && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {hasMachine && (
            <Chip icon={<Cpu size={10} />} text={a.machine_name ?? `#${a.machine_id}`} bg="#F3F4F6" color="#374151" border="#E5E7EB" />
          )}
          {toolNames.map((name, i) => (
            <Chip key={i} icon={<Wrench size={10} />} text={name} bg="#FFFBEB" color="#92400E" border="#FDE68A" />
          ))}
          {labors.map((l, i) => (
            <Chip key={i} icon={<Users size={10} />} text={`${l.skill}${l.level ? ` (${l.level})` : ''} ×${l.qty}`} bg="#F0FDF4" color="#166534" border="#BBF7D0" />
          ))}
          {consumables.map((c, i) => (
            <Chip key={i} icon={<FlaskConical size={10} />} text={`${c.code} ${c.name}`} bg="#EFF6FF" color="#1E40AF" border="#BFDBFE" />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ icon, text, bg, color, border }: { icon: React.ReactNode; text: string; bg: string; color: string; border: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '2px 8px' }}>
      <span style={{ display: 'flex', opacity: 0.8 }}>{icon}</span>
      {text}
    </span>
  )
}
