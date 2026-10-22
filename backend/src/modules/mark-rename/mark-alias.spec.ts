import { aliasesOf, aliasMatches, aliasWhere, currentNameOf, followRenames, formerNames, scopeKey, type RenameRow } from './mark-alias'

const R = (id: number, from: string, to: string, d: number, kind = 'ASSEMBLY'): RenameRow => ({ id, kind, from_mark: from, to_mark: to, dispatch_id: d })

describe('mark-alias', () => {
  it('no renames: a mark is only itself', () => {
    expect(aliasesOf([], 'ASSEMBLY', 'A', 5)).toEqual([{ mark: 'A', fromDispatchId: null, beforeDispatchId: null }])
    expect(currentNameOf([], 'ASSEMBLY', 'A', 1)).toBe('A')
  })

  it('A → B in dispatch 2: B knows A (rows before 2), A follows to B', () => {
    const r = [R(1, 'A', 'B', 2)]
    expect(aliasesOf(r, 'ASSEMBLY', 'B', 2)).toEqual([
      { mark: 'B', fromDispatchId: null, beforeDispatchId: null },
      { mark: 'A', fromDispatchId: null, beforeDispatchId: 2 },
    ])
    expect(followRenames(r, 'ASSEMBLY', 'A', 1)).toEqual({ name: 'B', ids: [1] })
    // an A row from dispatch 2 or later is a different piece — it doesn't follow
    expect(currentNameOf(r, 'ASSEMBLY', 'A', 2)).toBe('A')
  })

  it('chain A → B (2) → C (3)', () => {
    const r = [R(1, 'A', 'B', 2), R(2, 'B', 'C', 3)]
    expect(aliasesOf(r, 'ASSEMBLY', 'C', 3).map(a => [a.mark, a.beforeDispatchId])).toEqual([['C', null], ['B', 3], ['A', 2]])
    expect(followRenames(r, 'ASSEMBLY', 'A', 1)).toEqual({ name: 'C', ids: [1, 2] })
    expect(formerNames(r, 'ASSEMBLY', 'C', 3)).toEqual(['B', 'A'])
  })

  it('name reuse: A → B in 2, a new unrelated A in 3 — the new A does not own the old A rows', () => {
    const r = [R(1, 'A', 'B', 2)]
    expect(aliasesOf(r, 'ASSEMBLY', 'A', 3)).toEqual([{ mark: 'A', fromDispatchId: 2, beforeDispatchId: null }])
    expect(aliasMatches({ mark: 'A', fromDispatchId: 2, beforeDispatchId: null }, 1)).toBe(false)
    expect(aliasMatches({ mark: 'A', fromDispatchId: 2, beforeDispatchId: null }, 3)).toBe(true)
  })

  it('renamed back A → B (2) → A (3): rows of A before 2 still belong to the piece', () => {
    const r = [R(1, 'A', 'B', 2), R(2, 'B', 'A', 3)]
    expect(aliasesOf(r, 'ASSEMBLY', 'A', 3).map(a => [a.mark, a.fromDispatchId, a.beforeDispatchId])).toEqual([
      ['A', 2, null], ['B', null, 3], ['A', null, 2],
    ])
    expect(followRenames(r, 'ASSEMBLY', 'A', 1)).toEqual({ name: 'A', ids: [1, 2] })
  })

  it('multi-hop reuse: Z→W (1), W→M (2, old W vacates), W→A (4, a later unrelated W) — A\'s chain stops at W, never reaches Z', () => {
    const r = [R(1, 'Z', 'W', 1), R(2, 'W', 'M', 2), R(3, 'W', 'A', 4)]
    expect(aliasesOf(r, 'ASSEMBLY', 'A', 5)).toEqual([
      { mark: 'A', fromDispatchId: null, beforeDispatchId: null },
      { mark: 'W', fromDispatchId: null, beforeDispatchId: 4 },
    ])
    expect(formerNames(r, 'ASSEMBLY', 'A', 5)).toEqual(['W'])
  })

  it('followRenames forward through a reused name picks the earlier (correct) departure, not a later reuse\'s', () => {
    // X→B (2), entity1's B→C (3); separately entity2 later reuses name B and
    // departs it too (B→D, 6) — must not confuse the two.
    const r = [R(1, 'X', 'B', 2), R(2, 'B', 'C', 3), R(3, 'B', 'D', 6)]
    expect(followRenames(r, 'ASSEMBLY', 'X', 1)).toEqual({ name: 'C', ids: [1, 2] })
  })

  it('kinds never mix', () => {
    const r = [R(1, 'C-f1', '3C-f1', 2, 'PART')]
    expect(currentNameOf(r, 'ASSEMBLY', 'C-f1', 1)).toBe('C-f1')
    expect(currentNameOf(r, 'PART', 'C-f1', 1)).toBe('3C-f1')
  })

  it('aliasWhere: one unbounded name stays the plain equality the old queries used', () => {
    expect(aliasWhere([{ mark: 'A', fromDispatchId: null, beforeDispatchId: null }], 'assembly_mark')).toEqual({ assembly_mark: 'A' })
    expect(aliasWhere([
      { mark: 'B', fromDispatchId: null, beforeDispatchId: null },
      { mark: 'A', fromDispatchId: null, beforeDispatchId: 2 },
    ], 'assembly_mark')).toEqual({ OR: [{ assembly_mark: 'B' }, { assembly_mark: 'A', dispatch_id: { lt: 2 } }] })
  })

  it('scopeKey', () => {
    expect(scopeKey({ project_id: 3, zone_id: 6, sub_zone_id: null })).toBe('3:6:')
  })
})
