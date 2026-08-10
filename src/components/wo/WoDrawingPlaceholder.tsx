import { FileText } from 'lucide-react'

// Sprint 28 · F-WO Visual Tab — static stub for a future Drawing feature
// meant to sit side by side with the 3D view, not behind a toggle. Its own
// file (not inlined in WoVisualTab) so the real Drawing panel later is a
// one-line import swap with zero restructuring of the tab layout.
export function WoDrawingPlaceholder({ mark }: { mark: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#F0F0F0',
        border: '1px dashed #D0D0D0',
        color: '#ABABAB',
        gap: 8,
        textAlign: 'center',
        padding: 16,
      }}
    >
      <FileText size={28} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>Drawing</span>
      <span style={{ fontSize: 12 }}>{mark} — Coming soon</span>
    </div>
  )
}
