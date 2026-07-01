export type DocType =
  | 'ASSEMBLY_LIST'
  | 'ASSEMBLY_PART_LIST'
  | 'PART_LIST'
  | 'MAIN_ASSEMBLY_LIST'
  | 'MAIN_ASSEMBLY_PART_LIST'
  | 'MAIN_PART_LIST'
  | 'ACC_ASSEMBLY_LIST'
  | 'ACC_ASSEMBLY_PART_LIST'
  | 'ACC_PART_LIST'

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  ASSEMBLY_LIST: 'Assembly List',
  ASSEMBLY_PART_LIST: 'Assembly Part List',
  PART_LIST: 'Part List',
  MAIN_ASSEMBLY_LIST: 'MAIN Assembly List',
  MAIN_ASSEMBLY_PART_LIST: 'MAIN Assembly Part List',
  MAIN_PART_LIST: 'MAIN Part List',
  ACC_ASSEMBLY_LIST: 'ACC Assembly List',
  ACC_ASSEMBLY_PART_LIST: 'ACC Assembly Part List',
  ACC_PART_LIST: 'ACC Part List',
}

export const SEPARATE_DOC_TYPES: DocType[] = [
  'MAIN_ASSEMBLY_LIST', 'MAIN_ASSEMBLY_PART_LIST', 'MAIN_PART_LIST',
  'ACC_ASSEMBLY_LIST', 'ACC_ASSEMBLY_PART_LIST', 'ACC_PART_LIST',
]

export const REQUIRED_MAIN_TYPES: DocType[] = ['MAIN_ASSEMBLY_LIST', 'MAIN_ASSEMBLY_PART_LIST', 'MAIN_PART_LIST']
export const REQUIRED_ACC_TYPES: DocType[] = ['ACC_ASSEMBLY_LIST', 'ACC_ASSEMBLY_PART_LIST', 'ACC_PART_LIST']

export function classifyFilename(filename: string): DocType | null {
  const lower = filename.toLowerCase()
  const isMain = lower.startsWith('main')
  const isAcc = lower.startsWith('acc')

  if (/assembly[\s_-]?part[\s_-]?list/.test(lower)) {
    if (isMain) return 'MAIN_ASSEMBLY_PART_LIST'
    if (isAcc) return 'ACC_ASSEMBLY_PART_LIST'
    return 'ASSEMBLY_PART_LIST'
  }
  if (/assembly[\s_-]?list/.test(lower)) {
    if (isMain) return 'MAIN_ASSEMBLY_LIST'
    if (isAcc) return 'ACC_ASSEMBLY_LIST'
    return 'ASSEMBLY_LIST'
  }
  if (/part[\s_-]?list/.test(lower)) {
    if (isMain) return 'MAIN_PART_LIST'
    if (isAcc) return 'ACC_PART_LIST'
    return 'PART_LIST'
  }
  return null
}
