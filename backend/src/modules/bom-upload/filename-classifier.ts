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
  | 'DISPATCH_NOTE'
  | 'MAIN_DISPATCH_NOTE'
  | 'ACC_DISPATCH_NOTE'

export function classifyFilename(filename: string): BomDocType | null {
  const lower = filename.toLowerCase()
  const isMain = lower.startsWith('main')
  const isAcc = lower.startsWith('acc')

  if (/dispatch[\s_-]?note/.test(lower)) {
    if (isMain) return 'MAIN_DISPATCH_NOTE'
    if (isAcc) return 'ACC_DISPATCH_NOTE'
    return 'DISPATCH_NOTE'
  }
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

/** The optional Dispatch Note — one in combined mode, one per slot in separate mode (2026-10-26). Not a Tekla list. */
export const DN_DOC_TYPES: BomDocType[] = ['DISPATCH_NOTE', 'MAIN_DISPATCH_NOTE', 'ACC_DISPATCH_NOTE']
export const isDispatchNote = (t: BomDocType) => DN_DOC_TYPES.includes(t)
/** MAIN / ACC for a slotted Dispatch Note, null for the combined one. */
export const dnSlotOf = (t: BomDocType): 'MAIN' | 'ACC' | null => (t === 'MAIN_DISPATCH_NOTE' ? 'MAIN' : t === 'ACC_DISPATCH_NOTE' ? 'ACC' : null)
