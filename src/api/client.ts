import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Mock auth: Sprint 1 uses x-user-id header
apiClient.interceptors.request.use((config) => {
  config.headers['x-user-id'] = '1'
  return config
})
