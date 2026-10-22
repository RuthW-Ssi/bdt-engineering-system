import { useState } from 'react'
import { Info } from 'lucide-react'

// An ⓘ icon with the app's custom hover tooltip (aria-label + onMouseEnter/
// Leave + role="tooltip", see DrawingUploadModal's BOM-mark warning) — never
// the native `title` attribute. Shared by the BOM rename UI (2026-10-21).
export function InfoTip({ label, text, size = 12, color = '#8E8E8E' }: { label: string; text: string; size?: number; color?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        tabIndex={0}
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{ display: 'inline-flex', cursor: 'help', color, outline: 'none' }}
      >
        <Info size={size} />
      </span>
      {open && (
        <div role="tooltip" style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 20, width: 'max-content', maxWidth: 240, whiteSpace: 'normal', background: '#1F1F1F', color: 'white', fontSize: 11, fontWeight: 400, lineHeight: 1.4, borderRadius: 6, padding: '6px 8px', boxShadow: '0 4px 8px rgba(0,0,0,0.18)' }}>
          {text}
        </div>
      )}
    </span>
  )
}
