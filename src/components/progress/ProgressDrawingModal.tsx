import { X, FileText } from 'lucide-react'
import { ProgressDrawingPanel } from './ProgressDrawingPanel'

const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

// The Overview tab's 3D-click "show drawing" popup — wraps the same
// ProgressDrawingPanel a zone tab's Drawing toggle already uses, since
// Overview has no per-zone right-panel toggle to switch into Drawing mode.
// Same backdrop/card convention as ConfirmDialog.tsx / ProgressEditModal.
export function ProgressDrawingModal({ zoneId, mark, onClose }: { zoneId: number; mark: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        // Near-fullscreen, not a fixed card size — a DWG can carry several
        // Paper Space sheets that the Autodesk 2D viewer stacks vertically
        // in one continuous canvas (not one-sheet-at-a-time), so this needs
        // real room to be legible instead of cramming multiple sheets into
        // a small box.
        background: 'white', borderRadius: 12, width: '94vw', maxWidth: 1400, height: '94vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #EDEFF2', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={15} style={{ color: '#8E8E8E' }} />
            <span style={{ ...mono, fontWeight: 700, fontSize: 14, color: '#1A1A1A' }}>{mark}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 7, border: '1px solid #E0E0E0', background: 'white',
              color: '#8E8E8E', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ProgressDrawingPanel zoneId={zoneId} mark={mark} />
        </div>
      </div>
    </div>
  )
}
