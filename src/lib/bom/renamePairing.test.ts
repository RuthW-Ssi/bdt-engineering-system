import { buildRenamePayload, dataSetChips, keyOf, needsKeep, takenBy } from './renamePairing'
import type { RenameCandidatesDto } from '../../api/dispatches'

const data = { progress: [{ field: 'cut', value: 50 }], paint: [{ paint_type: 'primer', material: 'Zinc', layers: 2 }] }
const c: RenameCandidatesDto = {
  dispatch_id: 9, latest: true,
  assemblies: [
    { mark: 'BUH1B-18', ref_id: 1, data, suggestions: [{ mark: '3BUH1B-18', ref_id: 11, score: 100, data: null }] },
    { mark: 'K1', ref_id: 2, data, suggestions: [] },
  ],
  parts: [{ mark: 'C-x', ref_id: 3, data: null, suggestions: [] }],
  new_assemblies: [{ mark: '3BUH1B-18', ref_id: 11, score: null, data: null }, { mark: 'N', ref_id: 12, score: null, data }],
  new_parts: [{ mark: '3C-x', ref_id: 13, score: null, data: null }],
}

describe('renamePairing', () => {
  it('skipped rows send nothing; a picked pair is sent; parts never carry keep', () => {
    const sel = { [keyOf('ASSEMBLY', 'BUH1B-18')]: { to: '3BUH1B-18', keep: null }, [keyOf('PART', 'C-x')]: { to: '3C-x', keep: 'old' as const } }
    expect(buildRenamePayload(c, sel)).toEqual({ missingKeep: [], renames: [
      { kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' },
      { kind: 'PART', from_mark: 'C-x', to_mark: '3C-x' },
    ] })
  })

  it('b2: both names have data → must choose a set first', () => {
    expect(needsKeep(c.assemblies[1], c.new_assemblies[1])).toBe(true)
    expect(buildRenamePayload(c, { [keyOf('ASSEMBLY', 'K1')]: { to: 'N', keep: null } })).toEqual({ renames: [], missingKeep: ['K1'] })
    expect(buildRenamePayload(c, { [keyOf('ASSEMBLY', 'K1')]: { to: 'N', keep: 'new' } }).renames).toEqual([{ kind: 'ASSEMBLY', from_mark: 'K1', to_mark: 'N', keep: 'new' }])
  })

  it('takenBy: a new name picked by one row is unavailable to the others', () => {
    const sel = { [keyOf('ASSEMBLY', 'BUH1B-18')]: { to: 'N', keep: null } }
    expect([...takenBy(sel, 'ASSEMBLY', keyOf('ASSEMBLY', 'K1'))]).toEqual(['N'])
    expect([...takenBy(sel, 'ASSEMBLY', keyOf('ASSEMBLY', 'BUH1B-18'))]).toEqual([])
  })

  it('dataSetChips speaks plain labels', () => {
    expect(dataSetChips(data)).toEqual(['Cut 50', 'สี primer Zinc ×2'])
    expect(dataSetChips(null)).toEqual([])
  })
})
