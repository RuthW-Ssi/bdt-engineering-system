// Sprint 28 · F-WO Visual Tab — placeholder for a future Drawing feature
// meant to sit side by side with the 3D view, not behind a toggle. Its own
// file (not inlined in WoVisualTab) so the real Drawing panel later is a
// one-line import swap with zero restructuring of the tab layout.
//
// Styled as an unfinished shop-drawing sheet (drafting-paper grid, a line
// figure of a generic column+bracket assembly with dimension lines, a
// title block) rather than a generic icon+text empty state — grounded in
// what a real fabrication shop drawing actually looks like, not a literal
// "blueprint" (modern CAD/Tekla output is white-background/black-line, not
// cyanotype blue). The one accent color (the app's own red) is spent on a
// single element: a rotated "COMING SOON" stamp, the way a real drawing
// sheet gets stamped "PRELIMINARY" or "NOT FOR CONSTRUCTION".
export function WoDrawingPlaceholder({ mark }: { mark: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#FAFAF8',
        border: '1px solid #E0E0E0',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          backgroundImage:
            'linear-gradient(#EFEFEA 1px, transparent 1px), linear-gradient(90deg, #EFEFEA 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <svg
          viewBox="0 0 320 240"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Shop drawing placeholder for ${mark} — not yet available`}
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <marker id="dimStart" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
              <path d="M0,4 L7,1 L7,7 Z" fill="#9A9A9A" />
            </marker>
            <marker id="dimEnd" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M8,4 L1,1 L1,7 Z" fill="#9A9A9A" />
            </marker>
          </defs>

          {/* center line — technical-drawing convention */}
          <line x1="200" y1="14" x2="200" y2="222" stroke="#C6C6C6" strokeWidth="1" strokeDasharray="10 3 2 3" />

          {/* column shaft + base plate + bolts */}
          <rect x="180" y="30" width="40" height="160" fill="none" stroke="#4A4A4A" strokeWidth="1.5" />
          <rect x="140" y="190" width="120" height="16" fill="none" stroke="#4A4A4A" strokeWidth="1.5" />
          <circle cx="155" cy="198" r="3" fill="none" stroke="#4A4A4A" strokeWidth="1.2" />
          <circle cx="245" cy="198" r="3" fill="none" stroke="#4A4A4A" strokeWidth="1.2" />

          {/* bracket + gusset */}
          <rect x="220" y="50" width="46" height="16" fill="none" stroke="#4A4A4A" strokeWidth="1.5" />
          <line x1="220" y1="66" x2="248" y2="88" stroke="#4A4A4A" strokeWidth="1.2" />

          {/* height dimension (left) */}
          <line x1="180" y1="30" x2="112" y2="30" stroke="#C6C6C6" strokeWidth="0.75" />
          <line x1="180" y1="190" x2="112" y2="190" stroke="#C6C6C6" strokeWidth="0.75" />
          <line x1="120" y1="30" x2="120" y2="190" stroke="#9A9A9A" strokeWidth="1" markerStart="url(#dimStart)" markerEnd="url(#dimEnd)" />
          <text x="108" y="110" fontSize="10" fill="#ABABAB" fontFamily="IBM Plex Mono, ui-monospace, monospace" textAnchor="middle" transform="rotate(-90 108 110)">3000</text>

          {/* base-plate width dimension (bottom) */}
          <line x1="140" y1="206" x2="140" y2="216" stroke="#C6C6C6" strokeWidth="0.75" />
          <line x1="260" y1="206" x2="260" y2="216" stroke="#C6C6C6" strokeWidth="0.75" />
          <line x1="140" y1="212" x2="260" y2="212" stroke="#9A9A9A" strokeWidth="1" markerStart="url(#dimStart)" markerEnd="url(#dimEnd)" />
          <text x="200" y="228" fontSize="10" fill="#ABABAB" fontFamily="IBM Plex Mono, ui-monospace, monospace" textAnchor="middle">450</text>
        </svg>

        <div
          style={{
            position: 'absolute',
            right: 22,
            bottom: 28,
            padding: '5px 14px',
            border: '2px solid #C8202A',
            borderRadius: 3,
            color: '#C8202A',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            transform: 'rotate(-9deg)',
            opacity: 0.85,
            background: 'rgba(250,250,248,0.6)',
          }}
        >
          COMING SOON
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          borderTop: '1px solid #E0E0E0',
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 10,
          color: '#8A8A8A',
          flexShrink: 0,
        }}
      >
        <TitleCell label="MARK" value={mark} />
        <TitleCell label="SCALE" value="N.T.S." />
        <TitleCell label="STATUS" value="COMING SOON" last />
      </div>
    </div>
  )
}

function TitleCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '6px 10px',
        borderRight: last ? undefined : '1px solid #E0E0E0',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 8.5, color: '#B5B5B5', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#5A5A5A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
