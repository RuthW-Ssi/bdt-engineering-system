export interface ScheduleMeta {
  due_date: string
}

/** Section 4 · envelope metadata (P21) · pilot UI: due date only. */
export function ScheduleMetadataForm({
  value,
  onChange,
}: {
  value: ScheduleMeta
  onChange: (v: ScheduleMeta) => void
}) {
  const set = (patch: Partial<ScheduleMeta>) => onChange({ ...value, ...patch })

  return (
    <div>
      <Field label="Due date">
        <input
          type="date" value={value.due_date}
          onChange={e => set({ due_date: e.target.value })}
          style={{ ...inputStyle, width: '100%' }}
        />
      </Field>
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, height: 34 }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{label}</label>
      {children}
    </div>
  )
}
