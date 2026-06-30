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
                <div style={{ marginTop: 4 }}>
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

const TIME_MODE_LABEL: Record<string, string> = {
  by_activities: 'By Activities',
  formula: 'Formula',
  manual: 'Manual',
}

function OpRow({ op, defaultOpen }: { op: RoutingOpDetail; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const activities = op.activities_snapshot ?? []
  const color = op.op_type?.color ?? '#9CA3AF'
  const timeModeLabel = TIME_MODE_LABEL[op.time_mode] ?? op.time_mode

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#666' }}>{op.workcenter.name}</span>
            {op.workcenter.machine && (
              <>
                <span style={{ fontSize: 10, color: '#CCC' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#1565C0' }}>
                  <Cpu size={10} />{op.workcenter.machine}
                </span>
              </>
            )}
            <span style={{ fontSize: 10, color: '#CCC' }}>·</span>
            <span style={{ fontSize: 10, color: '#888', background: '#F0F0F0', borderRadius: 4, padding: '1px 5px' }}>{timeModeLabel}</span>
            {op.time_mode === 'manual' && (
              <span style={{ fontSize: 10, color: '#555' }}>{Math.round(Number(op.time_cycle_manual ?? op.time_cycle ?? 0))} min</span>
            )}
          </div>
        </div>

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
  const hasResources = toolNames.length > 0 || labors.length > 0 || consumables.length > 0

  return (
    <div style={{ background: '#F8F8F8', borderRadius: 8, padding: '9px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasResources ? 7 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#2A2A2A' }}>{a.name}</span>
        {a.measure && <span style={{ fontSize: 10, color: '#888', background: '#ECECEC', borderRadius: 5, padding: '1px 6px' }}>{a.measure}</span>}
      </div>

      {hasResources && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {labors.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#166534', background: '#DCFCE7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>SKILL</span>
              {labors.map((l, i) => <Chip key={i} icon={<Users size={10} />} text={`${l.skill}${l.level ? ` (${l.level})` : ''} ×${l.qty}`} bg="#F0FDF4" color="#166534" border="#BBF7D0" />)}
            </div>
          )}
          {toolNames.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#1E40AF', background: '#DBEAFE', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>TOOL</span>
              {toolNames.map((name, i) => <Chip key={i} icon={<Wrench size={10} />} text={name} bg="#EFF6FF" color="#1E40AF" border="#BFDBFE" />)}
            </div>
          )}
          {consumables.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#92400E', background: '#FEF3C7', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>USE</span>
              {consumables.map((c, i) => <Chip key={i} icon={<FlaskConical size={10} />} text={c.name} bg="#FFFBEB" color="#92400E" border="#FDE68A" />)}
            </div>
          )}
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
