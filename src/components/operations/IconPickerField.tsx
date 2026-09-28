import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FAB_ICON_COMPONENTS } from '../../lib/fabIcons'

// Picked-icon field for OperationBuilder's Identity section (2026-09-29:
// "ตอนสร้าง operation จะต้องเลือก icon ด้วย" → "จะเอาไปใช้ตอน print mo wo
// ตรง qr code และ water mark"). Same curated set explored in the fab-icons
// picker artifact, narrowed to lucide-react only (see src/lib/fabIcons.ts's
// header comment for why Flaticon picks were left out of the real
// feature). Flat, unlabeled grid (2026-09-29, revised same day: "ไม่ต้องใส่
// 01 · Cut (ตัด) ให้ user เลือกใช้เองแบบ freestyle ได้เลย") — no more
// per-category headers/step numbers grouping the options; every curated
// icon is just one flat pool to pick from freely.
const ALL_ICON_IDS = Object.keys(FAB_ICON_COMPONENTS)
export default function IconPickerField({ value, onChange }: { value: string | null; onChange: (icon: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const SelectedIcon = value ? FAB_ICON_COMPONENTS[value] : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          border: '1px solid #E0E0E0', borderRadius: 6, padding: '7px 10px',
          fontSize: 13, background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{
          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 5, background: '#F5F5F5', flexShrink: 0,
        }}>
          {SelectedIcon ? <SelectedIcon size={14} color="#1F1F1F" /> : null}
        </span>
        <span style={{ flex: 1, textAlign: 'left', color: value ? '#1F1F1F' : '#9E9E9E' }}>
          {value ?? '— No icon —'}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(null) }}
            style={{ display: 'flex', color: '#9E9E9E', cursor: 'pointer' }}
            title="Clear icon"
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={14} color="#9E9E9E" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4,
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto', padding: 10,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {ALL_ICON_IDS.map(id => {
              const Icon = FAB_ICON_COMPONENTS[id]
              const selected = value === id
              return (
                <button
                  key={id}
                  type="button"
                  title={id}
                  onClick={() => { onChange(id); setOpen(false) }}
                  style={{
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 6, cursor: 'pointer',
                    border: selected ? '1.5px solid #C8202A' : '1px solid #E0E0E0',
                    background: selected ? '#FBEAEA' : '#FAFAFA',
                  }}
                >
                  <Icon size={15} color={selected ? '#C8202A' : '#555'} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
