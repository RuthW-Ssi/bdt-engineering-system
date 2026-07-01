export type BomDocType =
  | 'ASSEMBLY_LIST'
  | 'ASSEMBLY_PART_LIST'
  | 'PART_LIST'
  | 'MAIN_ASSEMBLY_LIST'
  | 'MAIN_ASSEMBLY_PART_LIST'
  | 'MAIN_PART_LIST'
  | 'ACC_ASSEMBLY_LIST'
  | 'ACC_ASSEMBLY_PART_LIST'
  | 'ACC_PART_LIST'

export function classifyFilename(filename: string): BomDocType | null {
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

export const SEPARATE_DOC_TYPES: BomDocType[] = [
  'MAIN_ASSEMBLY_LIST', 'MAIN_ASSEMBLY_PART_LIST', 'MAIN_PART_LIST',
  'ACC_ASSEMBLY_LIST', 'ACC_ASSEMBLY_PART_LIST', 'ACC_PART_LIST',
]
