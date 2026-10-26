import { BadRequestException } from '@nestjs/common'
import { parseBaseField, parseRevsField } from './upload-body'

describe('upload body fields', () => {
  it('revs: absent/empty → [], JSON list → edits, anything else → 400 in Thai', () => {
    expect(parseRevsField(undefined)).toEqual([])
    expect(parseRevsField('')).toEqual([])
    expect(parseRevsField('[{"mark":"B1","rev":2}]')).toEqual([{ mark: 'B1', rev: 2 }])
    expect(() => parseRevsField('{oops')).toThrow(new BadRequestException('revs: อ่านค่าไม่ได้'))
    expect(() => parseRevsField('[{"mark":"B1","rev":"2"}]')).toThrow(new BadRequestException('revs: ค่าที่ส่งมาไม่ถูกต้อง'))
  })
  it('base_dispatch_id: absent → undefined (no stale check), "null"/"" → null, number text → number', () => {
    expect(parseBaseField(undefined)).toBeUndefined()
    expect(parseBaseField('null')).toBeNull()
    expect(parseBaseField('')).toBeNull()
    expect(parseBaseField('42')).toBe(42)
    expect(() => parseBaseField('x')).toThrow(new BadRequestException('base_dispatch_id: ต้องเป็นตัวเลข'))
  })
})
