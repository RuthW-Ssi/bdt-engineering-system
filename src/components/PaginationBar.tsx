interface PaginationBarProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onChange: (page: number) => void
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 5) return [1, 2, 3, 4, 5, 6, 7, '...', total]
  if (current >= total - 4) return [1, '...', total - 6, total - 5, total - 4, total - 3, total - 2, total - 1, total]
  return [1, '...', current - 2, current - 1, current, current + 1, current + 2, '...', total]
}

export function PaginationBar({ page, totalPages, total, limit, onChange }: PaginationBarProps) {
  const pages = getPageNumbers(page, totalPages)
  const showing = Math.min(limit, total - (page - 1) * limit)

  return (
    <div style={{ borderTop: '1px solid #E8E8E8', background: '#fff', fontFamily: 'inherit' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 44 }}>
        {/* Left: page info */}
        <span style={{ fontSize: 12, color: '#616161' }}>
          Page {page} / {Math.max(1, totalPages)}
          <span style={{ color: '#BDBDBD', margin: '0 6px' }}>·</span>
          {total.toLocaleString()} items
        </span>

        {/* Right: page numbers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Prev */}
          <button
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: '1px solid #E0E0E0', background: '#fff', color: page <= 1 ? '#BDBDBD' : '#1F1F1F', cursor: page <= 1 ? 'default' : 'pointer', fontSize: 13 }}
          >
            ‹
          </button>

          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} style={{ width: 28, textAlign: 'center', fontSize: 12, color: '#BDBDBD' }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 5, border: p === page ? 'none' : '1px solid #E0E0E0',
                  background: p === page ? '#C8202A' : '#fff',
                  color: p === page ? '#fff' : '#1F1F1F',
                  fontSize: 12, fontWeight: p === page ? 700 : 400,
                  cursor: p === page ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {p}
              </button>
            )
          )}

          {/* Next */}
          <button
            onClick={() => onChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: '1px solid #E0E0E0', background: '#fff', color: page >= totalPages ? '#BDBDBD' : '#1F1F1F', cursor: page >= totalPages ? 'default' : 'pointer', fontSize: 13 }}
          >
            ›
          </button>
        </div>
      </div>

      {/* Footer row */}
      <div style={{ borderTop: '1px solid #F0F0F0', padding: '5px 20px', fontSize: 11, color: '#9E9E9E' }}>
        Showing {showing} of {total.toLocaleString()} items
      </div>
    </div>
  )
}
