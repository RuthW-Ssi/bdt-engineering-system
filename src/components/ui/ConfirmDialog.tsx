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
    iconColor: '#B91C1C',
    icon: Trash2,
    btnBg: '#B91C1C',
    btnHover: '#991B1B',
  },
  warning: {
    iconBg: '#FFFBEB',
    iconColor: '#B45309',
    icon: AlertTriangle,
    btnBg: '#B45309',
    btnHover: '#92400E',
  },
  normal: {
    iconBg: '#EFF6FF',
    iconColor: '#1D4ED8',
    icon: Info,
    btnBg: '#1D4ED8',
    btnHover: '#1E40AF',
  },
}

// ── Dialog UI ──────────────────────────────────────────────────

function ConfirmDialogModal({ state, onClose }: { state: ConfirmState; onClose: (v: boolean) => void }) {
  const variant = state.variant ?? 'normal'
  const cfg = VARIANT_CONFIG[variant]
  const Icon = cfg.icon

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(false) }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 12,
        width: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #E5E7EB',
      }}>

        {/* Body */}
        <div style={{ padding: '28px 28px 20px', display: 'flex', gap: 16 }}>

          {/* Icon */}
          <div style={{
            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
            background: cfg.iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={20} style={{ color: cfg.iconColor, strokeWidth: 1.75 }} />
          </div>

          {/* Text */}
          <div style={{ paddingTop: 2 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: state.message ? 6 : 0, lineHeight: 1.4 }}>
              {state.title}
            </div>
            {state.message && (
              <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
                {state.message}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '16px 28px',
          borderTop: '1px solid #F3F4F6',
        }}>
          <button
            onClick={() => onClose(false)}
            style={{
              height: 36, padding: '0 16px', borderRadius: 7,
              border: '1px solid #D1D5DB', background: '#fff',
              fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            onClick={() => onClose(true)}
            style={{
              height: 36, padding: '0 16px', borderRadius: 7,
              border: 'none', background: cfg.btnBg,
              fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = cfg.btnHover}
            onMouseLeave={e => e.currentTarget.style.background = cfg.btnBg}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
