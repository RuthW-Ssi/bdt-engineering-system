import { SetMetadata } from '@nestjs/common'

export const CUSTOMER_ACCESS_KEY = 'customer_access'

export interface CustomerAccessOptions {
  // What a bare `:id` route param refers to (other param names resolve by themselves)
  idParam?: 'bim_model'
  // The `key` query param is a storage key that must belong to one of the customer's drawings
  drawingFileKey?: boolean
  // GET /projects — the list is narrowed to the customer's company instead of requiring a project param
  projectList?: boolean
  // No project scope and any HTTP method (auth endpoints: me, change-password, logout)
  selfService?: boolean
}

// Allowlists a route for customer users (default-deny otherwise, see CustomerScopeInterceptor).
// Only GET routes are reachable unless `selfService` is set.
export const CustomerAccessible = (opts: CustomerAccessOptions = {}) => SetMetadata(CUSTOMER_ACCESS_KEY, opts)
