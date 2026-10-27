import { BadRequestException } from '@nestjs/common'
import { decideRevs, finalizeRevs, isUnchanged, markDiff, partLine, reviewRows, round, snapshot, snapshotsFromUpload, type DnRev, type MarkSnapshot, type PrevMark } from './mark-rev'

const P = (m: string, over: object = {}) => partLine({ part_mark: m, profile: 'L50x50', grade: 'SS400', length_mm: 650, weight_kg: 5.8, ...over }, 1)
const S = (mark: string, over: Partial<MarkSnapshot> = {}): MarkSnapshot => ({ ...snapshot({ assembly_mark: mark, name: 'BRACE', qty: 18, weight_kg: 104.44, length_mm: 650 }, [P('p1')]), ...over })
const PREV = (mark: string, rev: number, over: Partial<PrevMark> = {}): PrevMark => ({ ...S(mark), rev, slot: null, ...over })
const DN = (mark: string, rev: number | null, status: string | null = null): DnRev => ({ mark, rev, status })
const SDN = (mark: string, rev: number | null, slot: 'MAIN' | 'ACC'): DnRev => ({ mark, rev, status: null, slot })
const SS = (mark: string, slot: 'MAIN' | 'ACC') => ({ ...S(mark), slot })
const all = () => true

describe('round / snapshots', () => {
  it('rounds to the DB column scale so a file value equals what Postgres stored', () => {
    expect(round(104.4449, 3)).toBe(104.445)
    expect(round('104.445', 3)).toBe(104.445)
    expect(round('', 3)).toBeNull()
    expect(round(null, 2)).toBeNull()
    const file = snapshot({ assembly_mark: 'B1', name: ' BRACE ', qty: 18, weight_kg: 104.4449, surface_area_m2: 3.27612, length_mm: 650.004 }, [])
    const db = snapshot({ assembly_mark: 'B1', name: 'BRACE', qty: '18.000', weight_kg: '104.445', surface_area_m2: '3.2761', length_mm: '650.00' }, [])
    expect(isUnchanged(markDiff(db, file))).toBe(true)
  })

  it('snapshotsFromUpload joins junctions to NC-merged parts, first (assembly, part) pair wins, missing parts skipped', () => {
    const snaps = snapshotsFromUpload(
      [{ assembly_mark: 'B1', qty: 2 }, { assembly_mark: 'B2' }],
      [{ assembly_mark: 'B1', part_mark: 'p1', qty: 2 }, { assembly_mark: 'B1', part_mark: 'p1', qty: 9 }, { assembly_mark: 'B1', part_mark: 'ghost', qty: 1 }],
      [{ part_mark: 'p1', profile: 'PL10', grade: 'SS400', length_mm: 100, weight_kg: 1.2, qty: 40 }],
    )
    expect(snaps[0].parts).toEqual([{ part_mark: 'p1', qty: 2, description: null, profile: 'PL10', grade: 'SS400', length_mm: 100, weight_kg: 1.2 }])
    expect(snaps[1].parts).toEqual([])
  })
})

describe('markDiff', () => {
  it('lists assembly fields old → new and parts added / removed / changed; ignores nothing else', () => {
    const d = markDiff(S('B1'), S('B1', { length_mm: 700, parts: [P('p1', { profile: 'L60x60' }), P('p2')] }))
    expect(d.fields).toEqual([{ field: 'length_mm', old: 650, new: 700 }])
    expect(d.parts_added.map(p => p.part_mark)).toEqual(['p2'])
    expect(d.parts_removed).toEqual([])
    expect(d.parts_changed).toEqual([{ part_mark: 'p1', changes: [{ field: 'profile', old: 'L50x50', new: 'L60x60' }] }])
  })

  it('a junction qty (per set) change is a part change', () => {
    const d = markDiff(S('B1'), S('B1', { parts: [partLine({ part_mark: 'p1', profile: 'L50x50', grade: 'SS400', length_mm: 650, weight_kg: 5.8 }, 2)] }))
    expect(d.parts_changed).toEqual([{ part_mark: 'p1', changes: [{ field: 'qty', old: 1, new: 2 }] }])
  })
})

describe('decideRevs — spec decision 3', () => {
  it('new mark: DN rev when listed (also on the first upload of a zone), else 0', () => {
    const d = decideRevs({ current: [S('A'), S('B')], previous: [], removable: all, dn: [DN('A', 3)] })
    expect(d.rows.map(r => [r.mark, r.kind, r.suggested_rev, r.suggested_source, r.editable])).toEqual([
      ['A', 'added', 3, 'DISPATCH_NOTE', false], ['B', 'added', 0, 'NEW', false],
    ])
  })

  it('unchanged, not in DN → carried, and not a review row', () => {
    const d = decideRevs({ current: [S('A')], previous: [PREV('A', 2)], removable: all, dn: null })
    expect(d.rows[0]).toMatchObject({ kind: 'unchanged', suggested_rev: 2, suggested_source: 'CARRIED', warning: null, editable: false })
    expect(reviewRows(d)).toEqual([])
  })

  it('changed + DN rev went up → DN rev, editable, no warning', () => {
    const d = decideRevs({ current: [S('A', { qty: 20 })], previous: [PREV('A', 1)], removable: all, dn: [DN('A', 2, 'changed')] })
    expect(d.rows[0]).toMatchObject({ kind: 'changed', prev_rev: 1, suggested_rev: 2, suggested_source: 'DISPATCH_NOTE', warning: null, editable: true, dn_status: 'changed' })
  })

  it('changed but not in DN, or DN rev not up → ⚠ CHANGED_NO_REV_UP, suggests previous + 1', () => {
    for (const dn of [null, [DN('A', 1)]]) {
      const d = decideRevs({ current: [S('A', { qty: 20 })], previous: [PREV('A', 1)], removable: all, dn })
      expect(d.rows[0]).toMatchObject({ suggested_rev: 2, suggested_source: 'MANUAL', warning: 'CHANGED_NO_REV_UP', editable: true })
    }
  })

  it('DN rev went up but the lists show no change → ⚠ REV_UP_NO_CHANGE, suggests keeping the rev', () => {
    const d = decideRevs({ current: [S('A')], previous: [PREV('A', 1)], removable: all, dn: [DN('A', 3)] })
    expect(d.rows[0]).toMatchObject({ kind: 'unchanged', suggested_rev: 1, suggested_source: 'CARRIED', warning: 'REV_UP_NO_CHANGE', editable: true, dn_rev: 3 })
  })

  it('DN rev lower than the current rev, unchanged → ⚠ DN_REV_LOWER, keeps the rev', () => {
    const d = decideRevs({ current: [S('A')], previous: [PREV('A', 3)], removable: all, dn: [DN('A', 1)] })
    expect(d.rows[0]).toMatchObject({ suggested_rev: 3, warning: 'DN_REV_LOWER', editable: true })
  })

  it('listed in DN at the same rev, unchanged → a review row (info), DN source, not editable', () => {
    const d = decideRevs({ current: [S('A')], previous: [PREV('A', 2)], removable: all, dn: [DN('A', 2)] })
    expect(reviewRows(d)).toHaveLength(1)
    expect(d.rows[0]).toMatchObject({ suggested_source: 'DISPATCH_NOTE', editable: false, warning: null })
  })

  it('removed = previous marks the upload deactivates; DN-only marks reported (partial DN, Review Focus 4)', () => {
    const d = decideRevs({
      current: [S('A'), S('B')],
      previous: [PREV('A', 1), PREV('B', 2), PREV('GONE', 4), PREV('MAIN1', 0, { slot: 'MAIN' })],
      removable: p => p.slot !== 'MAIN',
      dn: [DN('A', 1), DN('X9', 2)],
    })
    expect(d.rows.find(r => r.mark === 'B')).toMatchObject({ suggested_rev: 2, suggested_source: 'CARRIED' })
    expect(d.rows.filter(r => r.kind === 'removed').map(r => [r.mark, r.prev_rev])).toEqual([['GONE', 4]])
    expect(d.dn_only_marks).toEqual(['X9'])
    expect(d.has_dn).toBe(true)
  })

  it('a removed mark still listed in the DN appears once — as the removed row, not again in dn_only_marks', () => {
    const d = decideRevs({ current: [S('A')], previous: [PREV('A', 1), PREV('GONE', 4), PREV('MAIN1', 0, { slot: 'MAIN' })], removable: p => p.slot !== 'MAIN', dn: [DN('GONE', 4), DN('MAIN1', 0)] })
    expect(d.rows.filter(r => r.kind === 'removed').map(r => [r.mark, r.in_dn])).toEqual([['GONE', true]])
    expect(d.dn_only_marks).toEqual([]) // MAIN1 is kept (slot not uploaded) — not "missing from the files"
  })

  it('a DN row with STATUS cancelled for a mark the zone never had is a deliberate removal — not in dn_only_marks', () => {
    const d = decideRevs({ current: [S('A')], previous: [], removable: all, dn: [DN('A', 0), DN('OLD1', 1, 'cancelled'), DN('OLD2', 0, ' Canceled '), DN('OLD3', 2, 'CANCEL'), DN('X9', 1, 'added')] })
    expect(d.dn_only_marks).toEqual(['X9'])
  })

  it('a removed mark with STATUS cancelled is the plain removed row (no extra ⚠)', () => {
    const d = decideRevs({ current: [S('A')], previous: [PREV('A', 1), PREV('GONE', 3)], removable: all, dn: [DN('GONE', 3, 'cancelled')] })
    expect(d.rows.find(r => r.mark === 'GONE')).toMatchObject({ kind: 'removed', dn_status: 'cancelled', dn_cancelled_in_files: false })
  })

  it('STATUS cancelled but the mark is still in the Tekla lists → dn_cancelled_in_files ⚠; the lists still decide the rev', () => {
    const d = decideRevs({ current: [S('A'), S('B', { qty: 20 }), S('NEW')], previous: [PREV('A', 1), PREV('B', 1)], removable: all, dn: [DN('A', 1, 'cancelled'), DN('B', 1, 'Cancelled'), DN('NEW', 0, 'cancelled')] })
    const by = (m: string) => d.rows.find(r => r.mark === m)!
    expect(by('A')).toMatchObject({ kind: 'unchanged', suggested_rev: 1, dn_cancelled_in_files: true })
    expect(by('B')).toMatchObject({ kind: 'changed', warning: 'CHANGED_NO_REV_UP', suggested_rev: 2, dn_cancelled_in_files: true })
    expect(by('NEW')).toMatchObject({ kind: 'added', suggested_rev: 0, dn_cancelled_in_files: true })
    expect(reviewRows(d).map(r => r.mark)).toEqual(['A', 'B', 'NEW'])
  })

  it('other STATUS values never raise dn_cancelled_in_files', () => {
    const d = decideRevs({ current: [S('A'), S('B')], previous: [PREV('A', 1)], removable: all, dn: [DN('A', 1, 'changed'), DN('B', 0, null)] })
    expect(d.rows.every(r => r.dn_cancelled_in_files === false)).toBe(true)
  })

  it('ACC-only separate upload + whole-zone DN: the kept MAIN marks raise no ⚠ (only truly unknown marks do)', () => {
    const d = decideRevs({
      current: [S('ACC1')],
      previous: [PREV('ACC1', 1, { slot: 'ACC' }), PREV('ACC-OLD', 1, { slot: 'ACC' }), PREV('MAIN1', 2, { slot: 'MAIN' }), PREV('MAIN2', 0, { slot: 'MAIN' })],
      removable: p => p.slot === 'ACC',
      dn: [DN('ACC1', 1), DN('MAIN1', 2), DN('MAIN2', 0), DN('X9', 1)],
    })
    expect(d.rows.filter(r => r.kind === 'removed').map(r => r.mark)).toEqual(['ACC-OLD'])
    expect(d.dn_only_marks).toEqual(['X9'])
  })
})

describe('decideRevs — rename hint (2026-10-27)', () => {
  const BR = (mark: string, p: string, L: number, kg: number) => S(mark, { length_mm: L, weight_kg: kg, parts: [P(p, { length_mm: L - 40 })] })
  const hint = (d: ReturnType<typeof decideRevs>, m: string) => d.rows.find(r => r.mark === m)!.rename_hint

  it('a new mark and a removed mark that look like the same piece point at each other (same scorer as the pairing dialog)', () => {
    const d = decideRevs({ current: [BR('3BR10', 'm59', 1888, 20.39)], previous: [{ ...BR('BR10', 'm59', 1888, 20.39), rev: 1, slot: null }], removable: all, dn: null })
    expect(hint(d, '3BR10')).toBe('BR10')
    expect(hint(d, 'BR10')).toBe('3BR10')
  })

  it('one-to-one, best score first; below the suggestion minimum → no hint; kept marks never get one', () => {
    const d = decideRevs({
      current: [BR('A', 'p1', 650, 104), BR('3BR10', 'm59', 1888, 20.39), BR('BR30', 'm41', 1988, 21.05)],
      previous: [{ ...BR('A', 'p1', 650, 104), rev: 1, slot: null }, { ...BR('BR10', 'm59', 1888, 20.39), rev: 1, slot: null }, { ...BR('BR24', 'm138', 2100, 23), rev: 3, slot: null }],
      removable: all, dn: null,
    })
    expect(hint(d, '3BR10')).toBe('BR10')
    expect(hint(d, 'BR30')).toBeNull()
    expect(hint(d, 'BR24')).toBeNull()
    expect(hint(d, 'A')).toBeNull()
  })

  it('separate mode: never across slots', () => {
    const d = decideRevs({ current: [{ ...BR('3BR10', 'm59', 1888, 20.39), slot: 'ACC' as const }], previous: [{ ...BR('BR10', 'm59', 1888, 20.39), rev: 1, slot: 'MAIN' }], removable: all, dn: null })
    expect(hint(d, '3BR10')).toBeNull()
  })
})

describe('decideRevs — separate mode, one Dispatch Note per slot (2026-10-26)', () => {
  it('a mark takes the DN rev of its own slot only', () => {
    const d = decideRevs({ current: [SS('M1', 'MAIN'), SS('A1', 'ACC')], previous: [], removable: all, dn: [SDN('M1', 2, 'MAIN'), SDN('A1', 5, 'MAIN')] })
    expect(d.rows.map(r => [r.mark, r.suggested_rev, r.in_dn])).toEqual([['M1', 2, true], ['A1', 0, false]])
  })

  it('a mark in both DNs uses the row of its own slot', () => {
    const d = decideRevs({ current: [SS('X', 'ACC')], previous: [], removable: all, dn: [SDN('X', 1, 'MAIN'), SDN('X', 4, 'ACC')] })
    expect(d.rows[0]).toMatchObject({ suggested_rev: 4, dn_rev: 4 })
  })

  it('dn_only_marks is per slot: a MAIN DN mark only in the Acc lists is flagged; zone marks are not', () => {
    const d = decideRevs({
      current: [SS('M1', 'MAIN'), SS('A1', 'ACC')],
      previous: [PREV('OLD', 1, { slot: 'MAIN' })],
      removable: () => false,
      dn: [SDN('M1', 0, 'MAIN'), SDN('A1', 0, 'MAIN'), SDN('OLD', 1, 'MAIN'), SDN('A1', 0, 'ACC'), SDN('Q', 0, 'ACC'), SDN('Q', 0, 'MAIN')],
    })
    expect(d.dn_only_marks).toEqual(['A1', 'Q'])
    expect(d.has_dn).toBe(true)
  })

  it('a removed mark reads the DN of its own slot', () => {
    const d = decideRevs({ current: [], previous: [PREV('G', 2, { slot: 'ACC' })], removable: all, dn: [SDN('G', 3, 'MAIN')] })
    expect(d.rows[0]).toMatchObject({ kind: 'removed', in_dn: false, dn_rev: null })
  })
})

describe('finalizeRevs — server re-check (Review Focus 5)', () => {
  const decision = () => decideRevs({
    current: [S('CH', { qty: 20 }), S('SAME'), S('NEWM'), S('UP')],
    previous: [PREV('CH', 1), PREV('SAME', 2), PREV('UP', 1)],
    removable: all,
    dn: [DN('UP', 3)],
  })

  it('no edits → suggestions; ⚠ CHANGED row is recorded as MANUAL ("กำหนด rev เอง")', () => {
    const f = finalizeRevs(decision(), [])
    expect(f.get('CH')).toEqual({ rev: 2, rev_source: 'MANUAL', dn_status: null })
    expect(f.get('SAME')).toEqual({ rev: 2, rev_source: 'CARRIED', dn_status: null })
    expect(f.get('NEWM')).toEqual({ rev: 0, rev_source: 'NEW', dn_status: null })
    expect(f.get('UP')).toEqual({ rev: 1, rev_source: 'CARRIED', dn_status: null })
  })

  it('the user types the DN rev on a REV_UP_NO_CHANGE row → MANUAL', () => {
    expect(finalizeRevs(decision(), [{ mark: 'UP', rev: 3 }]).get('UP')).toEqual({ rev: 3, rev_source: 'MANUAL', dn_status: null })
  })

  it('refuses: below the current rev · a changed value on a non-editable row · not an integer · unknown mark', () => {
    expect(() => finalizeRevs(decision(), [{ mark: 'CH', rev: 0 }])).toThrow(new BadRequestException('CH: rev ต่ำกว่า rev ปัจจุบัน (1) ไม่ได้'))
    expect(() => finalizeRevs(decision(), [{ mark: 'SAME', rev: 5 }])).toThrow(new BadRequestException('SAME: แก้ rev ได้เฉพาะแถวที่มี ⚠ หรือข้อมูลเปลี่ยน'))
    expect(() => finalizeRevs(decision(), [{ mark: 'CH', rev: 2.5 }])).toThrow(new BadRequestException('CH: rev ต้องเป็นเลขจำนวนเต็ม 0 ถึง 999'))
    expect(() => finalizeRevs(decision(), [{ mark: 'NOPE', rev: 1 }])).toThrow(new BadRequestException('NOPE: ไม่มี mark นี้ในไฟล์ที่อัปโหลด'))
    // Tao 2026-10-26: changed data must raise the rev (WO alerts only on a rise). CH has prev_rev 1.
    expect(() => finalizeRevs(decision(), [{ mark: 'CH', rev: 1 }])).toThrow(new BadRequestException('CH: ข้อมูลของ mark นี้เปลี่ยน ต้องใส่ rev มากกว่า 1'))
  })

  it('sending the same value for a non-editable row is fine', () => {
    expect(finalizeRevs(decision(), [{ mark: 'SAME', rev: 2 }]).get('SAME')!.rev).toBe(2)
  })
})
