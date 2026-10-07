import { diffMoPart } from './mo-part-diff'

const base = {
  header: { primary_mark_prefix_code: 'OTH', routing_template_id: 3, plan_start: null, plan_finish: null },
  marks: [{ mark: 'BUH1-3', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 7122.3, tw_mm: null, tf_mm: null }],
  lines: [
    { mark: 'BUH1-3', profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 4, unit_weight_kg: 828.17 },
    { mark: null, profile: 'PL20x115', grade: 'SM520', length_mm: 550, qty: 16, unit_weight_kg: 9.93 },
  ],
}

describe('diffMoPart', () => {
  it('returns [] when nothing changed (numbers vs numeric strings are equal)', () => {
    const after = { ...base, lines: base.lines.map(l => ({ ...l, qty: String(l.qty) as unknown as number })) }
    expect(diffMoPart(base, after)).toEqual([])
  })
  it('lists header, mark and line field changes plus added and removed lines', () => {
    const after = {
      header: { ...base.header, routing_template_id: 18 },
      marks: [{ ...base.marks[0], tf_mm: 25 }],
      lines: [
        { ...base.lines[0], qty: 6 },
        { mark: 'BUH1-3', profile: 'PL20x1150', grade: 'SM520', length_mm: 10550, qty: 2, unit_weight_kg: 1904.8 },
      ],
    }
    expect(diffMoPart(base, after)).toEqual([
      { entity: 'header', key: 'header', field: 'routing_template_id', old: 3, new: 18 },
      { entity: 'mark', key: 'BUH1-3', field: 'tf_mm', old: null, new: 25 },
      { entity: 'line', key: 'BUH1-3|-|PL25X400|SM520|10550', field: 'qty', old: 4, new: 6 },
      { entity: 'line', key: 'BUH1-3|-|PL20X1150|SM520|10550', field: '*', old: null, new: 'added' },
      { entity: 'line', key: '-|-|PL20X115|SM520|550', field: '*', old: 'removed', new: null },
    ])
  })
})
