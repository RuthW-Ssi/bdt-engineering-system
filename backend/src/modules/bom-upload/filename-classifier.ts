export type BomDocType = 'ASSEMBLY_LIST' | 'ASSEMBLY_PART_LIST' | 'PART_LIST'

export function classifyFilename(filename: string): BomDocType | null {
  const lower = filename.toLowerCase()
  if (/assembly[\s_-]?part[\s_-]?list/.test(lower)) return 'ASSEMBLY_PART_LIST'
  if (/assembly[\s_-]?list/.test(lower)) return 'ASSEMBLY_LIST'
  if (/part[\s_-]?list/.test(lower)) return 'PART_LIST'
  return null
}
