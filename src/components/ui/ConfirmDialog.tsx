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
    iconBg: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
    iconColor: '#DC2626',
    icon: Trash2,
    titleColor: '#111827',
    accentColor: '#DC2626',
    btnBg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    btnShadow: '0 4px 12px rgba(220,38,38,0.35)',
    btnHoverShadow: '0 6px 16px rgba(220,38,38,0.45)',
    dividerColor: '#FEE2E2',
  },
  warning: {
    iconBg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
    iconColor: '#D97706',
    icon: AlertTriangle,
    titleColor: '#111827',
    accentColor: '#D97706',
    btnBg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    btnShadow: '0 4px 12px rgba(217,119,6,0.35)',
    btnHoverShadow: '0 6px 16px rgba(217,119,6,0.45)',
    dividerColor: '#FEF3C7',
  },
  normal: {
    iconBg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
    iconColor: '#2563EB',
    icon: Info,
    titleColor: '#111827',
    accentColor: '#2563EB',
    btnBg: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    btnShadow: '0 4px 12px rgba(37,99,235,0.35)',
    btnHoverShadow: '0 6px 16px rgba(37,99,235,0.45)',
    dividerColor: '#DBEAFE',
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
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(false) }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>

      <div style={{
        background: '#fff',
        borderRadius: 20,
        width: 420,
        boxShadow: '0 24px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        animation: 'slideUp 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Top accent bar */}
        <div style={{ height: 4, background: cfg.btnBg }} />

        {/* Body */}
        <div style={{ padding: '28px 28px 24px' }}>

          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: cfg.iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: `0 2px 8px ${cfg.iconColor}22`,
          }}>
            <Icon size={24} style={{ color: cfg.iconColor, strokeWidth: 2 }} />
          </div>

          {/* Title */}
          <div style={{ fontSize: 17, fontWeight: 700, color: cfg.titleColor, lineHeight: 1.3, marginBottom: state.message ? 8 : 0 }}>
            {state.title}
          </div>

          {/* Message */}
          {state.message && (
            <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
              {state.message}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#F3F4F6', margin: '0 28px' }} />

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 28px 20px' }}>
          <button
            onClick={() => onClose(false)}
            style={{
              height: 40, padding: '0 20px', borderRadius: 10,
              border: '1.5px solid #E5E7EB', background: '#fff',
              fontSize: 14, fontWeight: 500, color: '#374151',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#F9FAFB'
              e.currentTarget.style.borderColor = '#D1D5DB'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#fff'
              e.currentTarget.style.borderColor = '#E5E7EB'
            }}
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            onClick={() => onClose(true)}
            style={{
              height: 40, padding: '0 20px', borderRadius: 10,
              border: 'none', background: cfg.btnBg,
              fontSize: 14, fontWeight: 600, color: '#fff',
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: cfg.btnShadow,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = cfg.btnHoverShadow
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = cfg.btnShadow
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
