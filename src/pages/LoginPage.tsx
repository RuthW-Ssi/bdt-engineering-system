import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../lib/getErrorMessage'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const authUser = await login(loginId, password)
      toast.success(`Welcome, ${authUser.name}!`)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Login failed. Please check your username/password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-ssi-50 font-sans p-6">
      <div className="absolute -top-[64rem] left-[98%] -translate-x-1/2 w-[124rem] h-[124rem] rounded-full bg-ssi-100" />
      <div className="absolute -top-[23rem] left-[70%] -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-ssi-400" />
      <div className="absolute -top-[47rem] left-[98%] -translate-x-1/2 w-[90rem] h-[90rem] rounded-full bg-ssi-200" />
      <div className="absolute -top-[24rem] left-[98%] -translate-x-1/2 w-[44rem] h-[44rem] rounded-full bg-ssi-400" />

      <div className="absolute -top-12 -left-24 w-64 h-64 rounded-full bg-ssi-200" />
      <div className="absolute bottom-40 left-8 w-32 h-32 rounded-full bg-ssi-100" />
      <div className="absolute -bottom-6 left-0 w-20 h-20 rounded-full bg-ssi-400" />
      <div className="absolute top-[15%] left-[32%] w-14 h-14 rounded-full bg-ssi-200" />
      <div className="absolute top-[38%] left-[18%] w-10 h-10 rounded-full bg-ssi-400" />
      <div className="absolute top-[55%] left-[30%] w-20 h-20 rounded-full bg-ssi-100" />
      <div className="absolute top-[70%] left-[22%] w-8 h-8 rounded-full bg-ssi-400" />
      <div className="absolute top-[10%] left-[18%] w-8 h-8 rounded-full bg-ssi-400" />
      <div className="absolute top-[27%] left-[8%] w-6 h-6 rounded-full bg-ssi-400" />
      <div className="absolute top-[46%] left-[36%] w-12 h-12 rounded-full bg-ssi-400" />
      <div className="absolute top-[63%] left-[10%] w-16 h-16 rounded-full bg-ssi-200" />
      <div className="absolute top-[82%] left-[28%] w-10 h-10 rounded-full bg-ssi-400" />

      <div className="relative w-full max-w-md bg-white rounded-lg border border-ssi-400 shadow-[0_8px_24px_rgba(200,32,42,0.25)] p-8">
        <div className="flex flex-col items-center text-center mb-6 pt-4">
          <img src="/assets/logo/bdt-logo.png" alt="" className="w-48 h-24 object-contain" />
          <p className="text-lg font-semibold text-chrome-800 mt-6">BDT Engineering System</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="loginId" className="block text-sm font-medium text-chrome-800 mb-1">
              Username
            </label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-ssi-400 px-3 py-2 text-chrome-800 focus:outline-none focus:border-[1.5px] focus:border-ssi-600"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-chrome-800 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-ssi-400 px-3 py-2 pr-10 text-chrome-800 focus:outline-none focus:border-[1.5px] focus:border-ssi-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-0 p-0 leading-none text-chrome-800/60 hover:text-ssi-600 focus:outline-none"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-ssi-600 text-white font-sans font-semibold hover:bg-ssi-800 transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-chrome-200" />
            <span className="text-xs text-chrome-400">or</span>
            <div className="flex-1 h-px bg-chrome-200" />
          </div>

          <button
            type="button"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-ssi-600 bg-white text-ssi-600 font-sans font-semibold hover:bg-ssi-600 hover:text-white transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className="w-5 h-5 flex-shrink-0" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Microsoft
          </button>
        </form>
      </div>
    </div>
  )
}
