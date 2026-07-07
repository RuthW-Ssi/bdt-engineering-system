export function DiffExportButtons() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        disabled
        style={{
          height: 32, padding: '0 14px', fontSize: 13, fontWeight: 500,
          border: '1px solid #D0D5DD', borderRadius: 6, background: 'white',
          color: '#344054', opacity: 0.45, cursor: 'not-allowed',
        }}
      >
        Export Excel
      </button>
      <button
        disabled
        style={{
          height: 32, padding: '0 14px', fontSize: 13, fontWeight: 500,
          border: '1px solid #D0D5DD', borderRadius: 6, background: 'white',
          color: '#344054', opacity: 0.45, cursor: 'not-allowed',
        }}
      >
        Export PDF
      </button>
    </div>
  )
}
