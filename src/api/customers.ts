import { apiClient } from './client'

export interface Customer {
  id: number
  ref: string | null
  name: string
  vat: string | null
  email: string | null
  phone: string | null
  street: string | null
  city: string | null
  active: boolean
  _count?: { projects: number }
}

export interface CustomerListResult {
  total: number
  page: number
  limit: number
  items: Customer[]
}

export interface CreateCustomerPayload {
  ref?: string
  name: string
  vat?: string
  email?: string
  phone?: string
  street?: string
  city?: string
}

export async function getCustomers(params?: {
  search?: string
  active?: string
  page?: number
  limit?: number
}): Promise<CustomerListResult> {
  const res = await apiClient.get('/customers', { params })
  return res.data
}

export async function getCustomer(id: number): Promise<Customer> {
  const res = await apiClient.get(`/customers/${id}`)
  return res.data
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
  const res = await apiClient.post('/customers', payload)
  return res.data
}

export async function updateCustomer(id: number, payload: Partial<CreateCustomerPayload>): Promise<Customer> {
  const res = await apiClient.patch(`/customers/${id}`, payload)
  return res.data
}

export async function deleteCustomer(id: number): Promise<void> {
  await apiClient.delete(`/customers/${id}`)
}
