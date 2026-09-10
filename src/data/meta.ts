import type { ProductStatus, StatusMeta } from '../types'

export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  Draft:         { label: 'Draft',          bg: '#F5F5F5', text: '#555555', border: '#E0E0E0', icon: 'Pencil' },
  PendingReview: { label: 'Pending Review', bg: '#FAEEDA', text: '#854F0B', border: 'transparent', icon: 'Clock' },
  Active:        { label: 'Approved',       bg: '#EAF3DE', text: '#27500A', border: 'transparent', icon: 'CheckCircle' },
  Rejected:      { label: 'Rejected',       bg: '#FCEBEB', text: '#8A1520', border: 'transparent', icon: 'XCircle' },
  Blocked:       { label: 'Blocked',        bg: '#FCEBEB', text: '#5C0D15', border: '#EE9B9B', icon: 'Ban' },
}
