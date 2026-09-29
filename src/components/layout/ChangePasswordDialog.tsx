import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'
import { getErrorMessage } from '../../lib/getErrorMessage'
import { passwordFormError, type PasswordForm } from '../../lib/passwordRules'

// Self-service password change, opened from the Topbar user menu
// (2026-09-29). POST /auth/change-password re-checks everything server-side.
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<PasswordForm>({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const clientError = passwordFormError(form)
  const canSave = clientError === null && !saving

  const set = (k: keyof PasswordForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setServerError(null)
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      await apiClient.post('/auth/change-password', { current_password: form.current, new_password: form.next })
      toast.success('Password changed')
      onClose()
    } catch (err) {
      setServerError(getErrorMessage(err, 'Failed to change password. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, k: keyof PasswordForm, autoComplete: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{label}</span>
      <input
        type="password" value={form[k]} onChange={set(k)} autoComplete={autoComplete}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        style={{ padding: '8px 10px', fontSize: 14, border: '1px solid #D6D6D6', borderRadius: 6, outline: 'none' }}
      />
    </label>
  )

  const message = serverError ?? (clientError || null)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', width: 380 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Change password</h2>
        {field('Current password', 'current', 'current-password')}
        {field('New password', 'next', 'new-password')}
        {field('Confirm new password', 'confirm', 'new-password')}
        {message && <div style={{ color: '#C8202A', fontSize: 12, marginTop: -4 }}>{message}</div>}
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={save} disabled={!canSave} className="flex items-center gap-1.5"
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none', background: '#C8202A', color: '#fff', cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.6 }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
