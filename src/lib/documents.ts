import type { DocumentItem } from '../api/documents'

export const CATEGORY_LABELS: Record<string, string> = {
  'user-manual': 'User Manuals · คู่มือการใช้งาน',
}

export const AUDIENCE_LABELS: Record<DocumentItem['audience'], string> = {
  employee: 'Staff',
  customer: 'Customers',
  all: 'Everyone',
}

export function groupByCategory(docs: DocumentItem[]): [string, DocumentItem[]][] {
  const groups = new Map<string, DocumentItem[]>()
  for (const d of docs) groups.set(d.category, [...(groups.get(d.category) ?? []), d])
  return [...groups.entries()]
}
