import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(loginId, password)
      navigate('/', { replace: true })
    } catch {
      setError('Login failed. Check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F5',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #E0E0E0',
          borderRadius: 8,
          padding: '36px 40px',
          width: 360,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A' }}>BDT Engineering</div>
          <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 2 }}>Sign in to continue</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Login</label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoFocus
              style={{
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #C2C2C2',
                borderRadius: 4,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #C2C2C2',
                borderRadius: 4,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#C8202A', background: '#FFF0F0', padding: '6px 10px', borderRadius: 4 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: '9px',
              fontSize: 13,
              fontWeight: 600,
              background: loading ? '#B0B0B0' : '#1A1A1A',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
