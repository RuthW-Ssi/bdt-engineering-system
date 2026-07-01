import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, Trash2, Info } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────

export type ConfirmVariant = 'danger' | 'warning' | 'normal'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

// ── Context ────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({ ...opts, resolve })
    })
  }, [])

  const handleClose = (value: boolean) => {
    state?.resolve(value)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && <ConfirmDialogModal state={state} onClose={handleClose} />}
    </ConfirmContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx.confirm
}

// ── Variant config ─────────────────────────────────────────────

const VARIANT_CONFIG = {
  danger: {
    iconBg: '#FEF2F2',
    iconColor: '#C8202A',
    icon: Trash2,
    titleColor: '#C8202A',
    btnBg: '#C8202A',
    btnHover: '#A81B22',
  },
  warning: {
    iconBg: '#FFFBEB',
    iconColor: '#BA7517',
    icon: AlertTriangle,
    titleColor: '#92400E',
    btnBg: '#BA7517',
    btnHover: '#9A6112',
  },
  normal: {
    iconBg: '#EFF6FF',
    iconColor: '#185FA5',
    icon: Info,
    titleColor: '#1F1F1F',
    btnBg: '#185FA5',
    btnHover: '#144D87',
  },
}

// ── Dialog UI ──────────────────────────────────────────────────

function ConfirmDialogModal({ state, onClose }: { state: ConfirmState; onClose: (v: boolean) => void }) {
  const variant = state.variant ?? 'normal'
  const cfg = VARIANT_CONFIG[variant]
  const Icon = cfg.icon

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(false) }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: 400, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={20} style={{ color: cfg.iconColor }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: cfg.titleColor, marginBottom: state.message ? 4 : 0 }}>
              {state.title}
            </div>
            {state.message && (
              <div style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.5 }}>{state.message}</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => onClose(false)}
            style={{ height: 36, padding: '0 18px', borderRadius: 8, border: '1px solid #E0E0E0', background: '#fff', fontSize: 13, fontWeight: 500, color: '#555', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
          >
            {state.cancelLabel ?? 'ยกเลิก'}
          </button>
          <button
            onClick={() => onClose(true)}
            style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: cfg.btnBg, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = cfg.btnHover)}
            onMouseLeave={e => (e.currentTarget.style.background = cfg.btnBg)}
          >
            {state.confirmLabel ?? 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  )
}
