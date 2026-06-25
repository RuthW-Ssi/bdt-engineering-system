import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('bdt_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

let _redirecting = false

apiClient.interceptors.response.use(
  res => res,
  err => {
    if (
      err.response?.status === 401 &&
      !_redirecting &&
      window.location.pathname !== '/login'
    ) {
      _redirecting = true
      localStorage.removeItem('bdt_token')
      localStorage.removeItem('bdt_user')
      window.location.replace('/login')
    }
    return Promise.reject(err)
  },
)
