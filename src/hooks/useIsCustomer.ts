import { useAuth } from '../context/AuthContext'
import { isCustomer } from '../lib/moduleAccess'

// Customer accounts are view-only and never see weights or dates — the backend
// already strips those fields (customer-scope.interceptor.ts); this hides the
// matching UI (forms, edit buttons, weight/date columns) so nothing renders empty.
export function useIsCustomer(): boolean {
  return isCustomer(useAuth().user)
}
