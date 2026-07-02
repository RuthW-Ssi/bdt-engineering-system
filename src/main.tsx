// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { toast } from 'sonner'
import './index.css'
import App from './App.tsx'
import { getErrorMessage } from './lib/getErrorMessage'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { skipGlobalErrorToast?: boolean }
    mutationMeta: { skipGlobalErrorToast?: boolean }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.skipGlobalErrorToast) return
      toast.error(getErrorMessage(error, 'Failed to load data. Please try again.'))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (mutation.meta?.skipGlobalErrorToast) return
      toast.error(getErrorMessage(error, 'Action failed. Please try again.'))
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
