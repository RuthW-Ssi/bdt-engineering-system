import { BadRequestException } from '@nestjs/common'
import type { RevEdit } from './mark-rev'

/** `revs` multipart field: the review table's confirmed revs as JSON text. */
export function parseRevsField(raw: unknown): RevEdit[] {
  if (raw == null || raw === '') return []
  let v: unknown
  try { v = JSON.parse(String(raw)) } catch { throw new BadRequestException('revs: อ่านค่าไม่ได้') }
  const ok = Array.isArray(v) && v.every(x => x != null && typeof x === 'object' && typeof (x as RevEdit).mark === 'string' && typeof (x as RevEdit).rev === 'number')
  if (!ok) throw new BadRequestException('revs: ค่าที่ส่งมาไม่ถูกต้อง')
  return (v as RevEdit[]).map(x => ({ mark: x.mark, rev: x.rev }))
}

/** `base_dispatch_id`: what preview compared against. undefined = caller sent nothing (no stale check). */
export function parseBaseField(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined
  if (raw === '' || raw === 'null') return null
  const n = Number(raw)
  if (!Number.isInteger(n)) throw new BadRequestException('base_dispatch_id: ต้องเป็นตัวเลข')
  return n
}
