// ── Statuses ──────────────────────────────────────────────────
export type ProductStatus = 'Draft' | 'PendingReview' | 'Active' | 'Rejected' | 'Blocked'

// ── Meta interfaces ───────────────────────────────────────────
export interface StatusMeta { label: string; bg: string; text: string; border: string; icon: string }
