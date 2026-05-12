export type DocType = 'ASSEMBLY_LIST' | 'ASSEMBLY_PART_LIST' | 'PART_LIST'

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  ASSEMBLY_LIST: 'Assembly List',
  ASSEMBLY_PART_LIST: 'Assembly Part List',
  PART_LIST: 'Part List',
}

// Priority: most specific first (assembly_part_list before assembly_list)
export function classifyFilename(filename: string): DocType | null {
  const lower = filename.toLowerCase()
  if (/assembly[\s_-]?part[\s_-]?list/.test(lower)) return 'ASSEMBLY_PART_LIST'
  if (/assembly[\s_-]?list/.test(lower)) return 'ASSEMBLY_LIST'
  if (/part[\s_-]?list/.test(lower)) return 'PART_LIST'
  return null
}
