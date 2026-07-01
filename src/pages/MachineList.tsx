import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachines } from '../hooks/useMachines'
import { MachineStatusPill } from '../components/machines/MachineStatusPill'
import { DaysSincePmBadge } from '../components/machines/DaysSincePmBadge'
import type { EquipmentStatus } from '../api/machines'

const STATUS_OPTIONS: { value: EquipmentStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'OPERATIONAL', label: 'Operational' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'UNAVAILABLE', label: 'Unavailable' },
  { value: 'RETIRED', label: 'Retired' },
]

export function MachineList() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | ''>('')
  const [areaFilter, setAreaFilter] = useState('')
  const [nameSearch, setNameSearch] = useState('')

  const { data: machines, isLoading, error } = useMachines({
    status: statusFilter || undefined,
    area: areaFilter || undefined,
    name: nameSearch || undefined,
  })

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#111827' }}>Machines</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>
          Track machine PM status and maintenance
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as EquipmentStatus | '')}
          style={filterStyle}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          placeholder="Search location..."
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
          style={filterStyle}
        />
        <input
          placeholder="Search name/code..."
          value={nameSearch}
          onChange={e => setNameSearch(e.target.value)}
          style={{ ...filterStyle, minWidth: 200 }}
        />
      </div>

      {isLoading && (
        <div style={{ color: '#6b7280', fontSize: 14, padding: 32, textAlign: 'center' }}>Loading...</div>
      )}

      {error && (
        <div style={{ color: '#dc2626', fontSize: 14, padding: 16 }}>Error loading data</div>
      )}

      {machines && machines.length === 0 && (
        <div style={{ color: '#6b7280', fontSize: 14, padding: 32, textAlign: 'center' }}>No machines found</div>
      )}

      {machines && machines.length > 0 && (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Machine name</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Last PM</th>
                <th style={thStyle}>PM age</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m, idx) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/machines/${m.id}`)}
                  style={{
                    borderBottom: idx < machines.length - 1 ? '1px solid #f3f4f6' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                >
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{m.code}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{m.name}</div>
                    {(m.manufacturer || m.model) && (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        {[m.manufacturer, m.model].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, color: '#374151' }}>{m.location ?? '—'}</span>
                  </td>
                  <td style={tdStyle}>
                    <MachineStatusPill status={m.current_status} size="sm" />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, color: '#374151' }}>
                      {m.last_maintenance_at
                        ? new Date(m.last_maintenance_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <DaysSincePmBadge days={m.days_since_pm} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const filterStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, minWidth: 140, background: 'white',
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px', verticalAlign: 'middle',
}
