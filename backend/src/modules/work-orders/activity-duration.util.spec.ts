import { computeActivityDuration } from './activity-duration.util'

function makeBom(overrides: Record<string, any> = {}) {
  return { length_mm: 1000, surface_area_m2: 2, width_mm: 500, ...overrides }
}

describe('computeActivityDuration', () => {
  it('sums a weld_length_mm activity as length / per_minute into run_min', () => {
    const acts = [{ name: 'Weld seam', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: 'weld_length_mm', per_minute: 100, duration_min: 5, kind: 'run' }]])

    const result = computeActivityDuration(acts, makeBom({ length_mm: 1000 }), activityMap)

    expect(result.run_min).toBe(10) // 1000 / 100
    expect(result.setup_min).toBe(0)
    expect(result.breakdown).toEqual([{ name: 'Weld seam', kind: 'run', minutes: 10, unresolved: false }])
  })

  it('computes product_area as area / per_minute', () => {
    const acts = [{ name: 'Blast', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: 'product_area', per_minute: 0.5, duration_min: 0, kind: 'run' }]])

    const result = computeActivityDuration(acts, makeBom({ surface_area_m2: 4 }), activityMap)

    expect(result.run_min).toBe(8) // 4 / 0.5
  })

  it('computes product_perimeter as (2*length + 2*width)/1000 / per_minute', () => {
    const acts = [{ name: 'Edge prep', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: 'product_perimeter', per_minute: 2, duration_min: 0, kind: 'run' }]])

    const result = computeActivityDuration(acts, makeBom({ length_mm: 1000, width_mm: 500 }), activityMap)

    // (2*1000 + 2*500)/1000 = 3, / 2 per_minute = 1.5 → rounds to 2
    expect(result.run_min).toBe(2)
  })

  it('uses the fixed duration_min for count-based formula codes, ignoring per_minute', () => {
    const acts = [{ name: 'Punch holes', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: 'hole_count', per_minute: 999, duration_min: 7, kind: 'run' }]])

    const result = computeActivityDuration(acts, makeBom(), activityMap)

    expect(result.run_min).toBe(7)
  })

  it('falls back to fixed duration_min for an unrecognized formula_code', () => {
    const acts = [{ name: 'Mystery step', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: 'something_unheard_of', per_minute: 999, duration_min: 4, kind: 'run' }]])

    const result = computeActivityDuration(acts, makeBom(), activityMap)

    expect(result.run_min).toBe(4)
  })

  it('falls back to fixed duration_min when per_minute is 0 (avoids divide-by-zero)', () => {
    const acts = [{ name: 'Weld seam', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: 'weld_length_mm', per_minute: 0, duration_min: 6, kind: 'run' }]])

    const result = computeActivityDuration(acts, makeBom(), activityMap)

    expect(result.run_min).toBe(6)
  })

  it('routes a setup-kind activity into setup_min, not run_min, always using the fixed duration', () => {
    const acts = [{ name: 'Setup — Beam @ WC-HBEAM', source_activity_id: 1 }]
    const activityMap = new Map([[1, { formula_code: null, per_minute: 999, duration_min: 15, kind: 'setup' }]])

    const result = computeActivityDuration(acts, makeBom(), activityMap)

    expect(result.setup_min).toBe(15)
    expect(result.run_min).toBe(1) // clamped to min 1 — no run activities matched
    expect(result.breakdown).toEqual([{ name: 'Setup — Beam @ WC-HBEAM', kind: 'setup', minutes: 15, unresolved: false }])
  })

  // Regression: this is exactly the completeness-check signal the print
  // packet's Activities section exists for — an activity present on the WO
  // but contributing 0 minutes to the plan (missing link or missing lookup
  // row) must be visible, not silently dropped like the original
  // WorkOrderAutoCreateService.computeDuration() did (`continue` with no trace).
  it('records an activity with no source_activity_id as unresolved, contributing 0 minutes', () => {
    const acts = [{ name: 'Undocumented step', source_activity_id: null }]

    const result = computeActivityDuration(acts, makeBom(), new Map())

    expect(result.breakdown).toEqual([{ name: 'Undocumented step', kind: 'run', minutes: 0, unresolved: true }])
    expect(result.run_min).toBe(1) // still clamped — the aggregate behavior is unchanged
  })

  it('records an activity whose source_activity_id has no matching row in activityMap as unresolved', () => {
    const acts = [{ name: 'Orphaned activity', source_activity_id: 999 }]

    const result = computeActivityDuration(acts, makeBom(), new Map())

    expect(result.breakdown).toEqual([{ name: 'Orphaned activity', kind: 'run', minutes: 0, unresolved: true }])
  })

  it('clamps run_min to a minimum of 1 and setup_min to a minimum of 0, matching the original aggregate behavior', () => {
    const result = computeActivityDuration([], makeBom(), new Map())

    expect(result.run_min).toBe(1)
    expect(result.setup_min).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('sums multiple run activities into one run_min total, each tracked separately in breakdown', () => {
    const acts = [
      { name: 'Cut', source_activity_id: 1 },
      { name: 'Weld', source_activity_id: 2 },
    ]
    const activityMap = new Map([
      [1, { formula_code: 'cut_length_mm', per_minute: 500, duration_min: 0, kind: 'run' }],
      [2, { formula_code: 'weld_length_mm', per_minute: 250, duration_min: 0, kind: 'run' }],
    ])

    const result = computeActivityDuration(acts, makeBom({ length_mm: 1000 }), activityMap)

    expect(result.run_min).toBe(6) // (1000/500=2) + (1000/250=4) = 6
    expect(result.breakdown).toEqual([
      { name: 'Cut', kind: 'run', minutes: 2, unresolved: false },
      { name: 'Weld', kind: 'run', minutes: 4, unresolved: false },
    ])
  })
})
