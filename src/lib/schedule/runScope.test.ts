import { describe, expect, it } from 'vitest'
import type { BoardMo, BoardWorkOrder } from '../../api/schedule'
import { moPickState, runCandidates, toggleMoPick, toggleWoPick, waitsFor } from './runScope'

const mo = (id: number, code: string): BoardMo => ({ id, mo_code: code, primary_mark_prefix_code: null, plan_start: null, plan_finish: null })
const wo = (id: number, moId: number, seq: number, status = 'NOT_STARTED'): BoardWorkOrder => ({
  id, wo_code: `WO-${id}`, mo_id: moId, sequence: seq, status, expected_duration_min: 60, setup_time_min: 0,
  plan_start: null, plan_finish: null, op_label: `op${seq}`, team_id: null, team_headcount: null, marks: [], weight_kg: null, work_center_id: 1, pause: null,
})

const MOS = [mo(2, 'MO-B'), mo(1, 'MO-A'), mo(3, 'MO-C')]
const WOS = [wo(11, 1, 10), wo(12, 1, 20, 'RELEASED'), wo(13, 1, 30, 'IN_PROGRESS'), wo(21, 2, 10), wo(31, 3, 10, 'ON_HOLD')]

describe('runCandidates', () => {
  it('lists MOs (by code) with only their schedulable WOs (NOT_STARTED / RELEASED), dropping MOs with none', () => {
    const c = runCandidates(MOS, WOS)
    expect(c.map((g) => g.mo.mo_code)).toEqual(['MO-A', 'MO-B'])
    expect(c[0].wos.map((w) => w.id)).toEqual([11, 12])
  })
})

describe('picking', () => {
  const [a] = runCandidates(MOS, WOS)
  it('ticks a whole MO, then unticks it', () => {
    const on = toggleMoPick(new Set(), a)
    expect([...on].sort()).toEqual([11, 12])
    expect(moPickState(on, a)).toBe('all')
    expect(toggleMoPick(on, a).size).toBe(0)
  })
  it('a partly picked MO ticks fully', () => {
    expect(moPickState(new Set([11]), a)).toBe('some')
    expect([...toggleMoPick(new Set([11]), a)].sort()).toEqual([11, 12])
  })
  it('toggles single WOs', () => {
    expect(toggleWoPick(new Set([11]), 12)).toEqual(new Set([11, 12]))
    expect(toggleWoPick(new Set([11, 12]), 11)).toEqual(new Set([12]))
  })
})

describe('waitsFor', () => {
  it('flags a picked WO whose earlier op in the same MO is unpicked and unfinished', () => {
    expect(waitsFor(new Set([12]), WOS)).toEqual(new Map([[12, 'WO-11']]))
  })
  it('no warning when the earlier op is picked too, or for the first op', () => {
    expect(waitsFor(new Set([11, 12]), WOS).size).toBe(0)
    expect(waitsFor(new Set([21]), WOS).size).toBe(0)
  })
  it('names the nearest unfinished earlier op', () => {
    const wos = [wo(1, 9, 10), wo(2, 9, 20), wo(3, 9, 30)]
    expect(waitsFor(new Set([3]), wos).get(3)).toBe('WO-2')
  })
  it('a DONE or CANCELLED earlier op never holds back', () => {
    const wos = [wo(1, 9, 10, 'DONE'), wo(2, 9, 20, 'CANCELLED'), wo(3, 9, 30)]
    expect(waitsFor(new Set([3]), wos).size).toBe(0)
  })
})
