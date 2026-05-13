export function DiffExportButtons() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        disabled
        style={{
          height: 30, padding: '0 12px', fontSize: 12, fontWeight: 500,
          border: '1px solid #D0D5DD', borderRadius: 6, background: 'white',
          color: '#344054', opacity: 0.45, cursor: 'not-allowed',
        }}
      >
        Export Excel
      </button>
      <button
        disabled
        style={{
          height: 30, padding: '0 12px', fontSize: 12, fontWeight: 500,
          border: '1px solid #D0D5DD', borderRadius: 6, background: 'white',
          color: '#344054', opacity: 0.45, cursor: 'not-allowed',
        }}
      >
        Export PDF
      </button>
    </div>
  )
}
