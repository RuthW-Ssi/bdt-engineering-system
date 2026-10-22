import { staleDrawings, type DrawingRevLogEntry, type CurrentDrawingRevItem } from './drawing-rev-status'

function log(overrides: Partial<DrawingRevLogEntry> = {}): DrawingRevLogEntry {
  return {
    printed_at: '2026-10-01T00:00:00Z',
    drawing_revs: { '1398': { 'DBN-A1-CTR1': 1 } },
    ...overrides,
  }
}

function current(overrides: Partial<CurrentDrawingRevItem> = {}): CurrentDrawingRevItem {
  return {
    wo_id: 1398,
    wo_code: 'WO-00000739',
    mark: 'DBN-A1-CTR1',
    current_rev: 1,
    ...overrides,
  }
}

describe('staleDrawings', () => {
  // Review Focus 2: same rev re-uploaded (replace) after printing → no
  // notice. The notice compares revs, not dates — a log at rev 1 and a
  // current mark still at rev 1 is not stale even though it was re-uploaded.
  it('is not stale when the printed rev equals the current rev', () => {
    const logs = [log({ drawing_revs: { '1398': { 'DBN-A1-CTR1': 1 } } })]
    const items = [current({ current_rev: 1 })]
    expect(staleDrawings(logs, items)).toEqual([])
  })

  // Review Focus 3: a legacy log (drawing_revs null) never produces a
  // notice — it is ignored entirely, not treated as "printed rev 0".
  it('ignores a legacy log with drawing_revs null', () => {
    const logs = [log({ drawing_revs: null })]
    const items = [current({ current_rev: 2 })]
    expect(staleDrawings(logs, items)).toEqual([])
  })

  // A later print that DOES carry drawing_revs works from then on, even
  // with an older legacy log also present in the history.
  it('works once a later log carries drawing_revs, despite an older legacy log', () => {
    const logs = [
      log({ printed_at: '2026-10-05T00:00:00Z', drawing_revs: { '1398': { 'DBN-A1-CTR1': 1 } } }),
      log({ printed_at: '2026-10-01T00:00:00Z', drawing_revs: null }),
    ]
    const items = [current({ current_rev: 2 })]
    expect(staleDrawings(logs, items)).toEqual([
      { wo_id: 1398, wo_code: 'WO-00000739', mark: 'DBN-A1-CTR1', printed_rev: 1, current_rev: 2 },
    ])
  })

  // Review Focus 4: two prints of the same WO — the latest log for that
  // (WO, mark) pair wins, even when a later partial print didn't include
  // that WO at all (the earlier log still counts for it).
  it('uses the latest log that actually contains the pair, skipping a later partial reprint that omitted it', () => {
    const logs = [
      // Newest: a partial reprint of a DIFFERENT wo only.
      log({ printed_at: '2026-10-10T00:00:00Z', drawing_revs: { '9999': { 'DBN-B2-CTR2': 1 } } }),
      // Older: the one that actually printed wo 1398 / mark DBN-A1-CTR1, at rev 2.
      log({ printed_at: '2026-10-05T00:00:00Z', drawing_revs: { '1398': { 'DBN-A1-CTR1': 2 } } }),
      // Oldest: an even earlier print of the same pair at rev 1 — must be shadowed.
      log({ printed_at: '2026-10-01T00:00:00Z', drawing_revs: { '1398': { 'DBN-A1-CTR1': 1 } } }),
    ]
    const items = [current({ current_rev: 3 })]
    expect(staleDrawings(logs, items)).toEqual([
      { wo_id: 1398, wo_code: 'WO-00000739', mark: 'DBN-A1-CTR1', printed_rev: 2, current_rev: 3 },
    ])
  })

  // Review Focus 5: a WO/mark with no current drawing at all simply never
  // appears in `current` — staleDrawings must not crash or fabricate a row.
  it('returns nothing for a pair absent from `current` (no drawing at all)', () => {
    const logs = [log()]
    expect(staleDrawings(logs, [])).toEqual([])
  })

  // No log at all contains this (wo_id, mark) pair → not stale, regardless
  // of how high current_rev is.
  it('is not stale when no log contains the pair at all', () => {
    const logs = [log({ drawing_revs: { '1398': { 'DBN-B2-CTR2': 1 } } })]
    const items = [current({ mark: 'DBN-A1-CTR1', current_rev: 5 })]
    expect(staleDrawings(logs, items)).toEqual([])
  })

  // A rev bump → stale.
  it('is stale when the current rev is higher than the newest printed rev', () => {
    const logs = [log({ drawing_revs: { '1398': { 'DBN-A1-CTR1': 1 } } })]
    const items = [current({ current_rev: 2 })]
    expect(staleDrawings(logs, items)).toEqual([
      { wo_id: 1398, wo_code: 'WO-00000739', mark: 'DBN-A1-CTR1', printed_rev: 1, current_rev: 2 },
    ])
  })

  // Mark comparison is case-insensitive (trim + lowercase), consistent with
  // currentRevSheetsForMark — the log's key may differ in case/whitespace
  // from the WO's current mark. The output still reports the mark exactly
  // as displayed on the WO (current side), not the log's casing.
  it('matches marks case-insensitively, and reports the mark as displayed on the WO', () => {
    const logs = [log({ drawing_revs: { '1398': { ' dbn-a1-ctr1 ': 1 } } })]
    const items = [current({ mark: 'DBN-A1-CTR1', current_rev: 2 })]
    expect(staleDrawings(logs, items)).toEqual([
      { wo_id: 1398, wo_code: 'WO-00000739', mark: 'DBN-A1-CTR1', printed_rev: 1, current_rev: 2 },
    ])
  })

  // A log entry whose drawing_revs isn't a plain object (malformed/legacy
  // edge shapes) is ignored the same way null is.
  it('ignores a log whose drawing_revs is not a plain object', () => {
    const logs = [
      log({ printed_at: '2026-10-05T00:00:00Z', drawing_revs: 'not-an-object' as any }),
      log({ printed_at: '2026-10-01T00:00:00Z', drawing_revs: [1, 2, 3] as any }),
    ]
    const items = [current({ current_rev: 2 })]
    expect(staleDrawings(logs, items)).toEqual([])
  })

  // Several independent (wo_id, mark) pairs are each resolved on their own —
  // one being stale never affects another.
  it('resolves multiple current items independently', () => {
    const logs = [log({ drawing_revs: {
      '1398': { 'DBN-A1-CTR1': 2 },
      '1399': { 'DBN-A1-CTR2': 1 },
    } })]
    const items = [
      current({ wo_id: 1398, wo_code: 'WO-00000739', mark: 'DBN-A1-CTR1', current_rev: 2 }), // not stale
      current({ wo_id: 1399, wo_code: 'WO-00000740', mark: 'DBN-A1-CTR2', current_rev: 3 }), // stale
    ]
    expect(staleDrawings(logs, items)).toEqual([
      { wo_id: 1399, wo_code: 'WO-00000740', mark: 'DBN-A1-CTR2', printed_rev: 1, current_rev: 3 },
    ])
  })
})

describe('staleDrawings through former names', () => {
  it('a log written under the old name still counts for the new name', () => {
    const logs = [{ printed_at: '2026-10-01T00:00:00Z', drawing_revs: { '1398': { 'BUH1B-18': 1 } } }]
    const item = { wo_id: 1398, wo_code: 'WO-1', mark: '3BUH1B-18', current_rev: 2 }
    expect(staleDrawings(logs, [item])).toEqual([])
    expect(staleDrawings(logs, [{ ...item, aliases: ['BUH1B-18'] }])).toEqual([{ wo_id: 1398, wo_code: 'WO-1', mark: '3BUH1B-18', printed_rev: 1, current_rev: 2 }])
  })
  it('the own name in the same log wins over an old name', () => {
    const logs = [{ printed_at: '2026-10-01T00:00:00Z', drawing_revs: { '1': { 'B': 2, 'A': 1 } } }]
    expect(staleDrawings(logs, [{ wo_id: 1, wo_code: 'W', mark: 'B', current_rev: 2, aliases: ['A'] }])).toEqual([])
  })
})
