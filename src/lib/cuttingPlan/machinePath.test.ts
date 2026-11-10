import { describe, expect, it } from 'vitest'
import { buildMachinePath, headAt, partFinishTimes, stateAt, stepUpTo, plateTimeLabel } from './machinePath'
import type { PlatePathElement, PlateViewPart } from '../../api/cutting-plan'

// rapid 1000 mm → cut 220 mm (a 2200 mm/min feed = 0.1 min) → rapid 1000 mm
const PATH: PlatePathElement[] = [[0, [0, 0, 1000, 0]], [1, [1000, 0, 1220, 0]], [0, [1220, 0, 2220, 0]]]
const M = { cutFeed: 2200, rapidFeed: 10000, pierceMin: 0.1 }

describe('machinePath', () => {
  it('times rapids, the pierce before a cut and the cut itself from the feeds', () => {
    const mp = buildMachinePath(PATH, M)
    expect(mp.steps.map(s => s.dur)).toEqual([0.1, 0.2, 0.1]) // 1000/10000 · 0.1 pierce + 220/2200 · 1000/10000
    expect(mp.totalMin).toBeCloseTo(0.4)
    expect(mp.cutM).toBeCloseTo(0.22)
    expect(mp.pierces).toBe(2)
  })

  it('reports what the head does over time', () => {
    const mp = buildMachinePath(PATH, M)
    expect(stateAt(mp, 0.05)).toEqual({ mm: 500, state: 'rapid' })
    expect(stateAt(mp, 0.15)).toEqual({ mm: 1000, state: 'pierce' })
    expect(stateAt(mp, 0.25).state).toBe('cut')
    expect(stateAt(mp, 0.25).mm).toBeCloseTo(1110)
    expect(stateAt(mp, 9)).toEqual({ mm: mp.totalMm, state: 'done' })
  })

  it('finds the head point, pierces done and metres cut', () => {
    const mp = buildMachinePath(PATH, M)
    const h = headAt(mp, 1110)
    expect(h.step).toBe(1)
    expect(h.pt[0]).toBeCloseTo(1110)
    expect(h.pierces).toBe(1)
    expect(h.cutM).toBeCloseTo(0.11)
    expect(stepUpTo(mp.steps[1], 1110).at(-1)![0]).toBeCloseTo(1110)
  })

  it('a part is finished when the last cut inside its box ends', () => {
    const parts: PlateViewPart[] = [{ mark: 'A', n: 1, outer: [[995, -5], [1225, -5], [1225, 5], [995, 5]], holes: [] }]
    const mp = buildMachinePath(PATH, M)
    expect(partFinishTimes(parts, mp)[0]).toBeCloseTo(0.3)
  })
})

// 2026-11-10: the simulation covers cutting and rapid moves only, so on 309 of 3,719 legacy plates with
// marking it ran short of the report (median 85 %, worst 13 %). The plate's machine time is the report's.
describe('plateTimeLabel', () => {
  it('shows the report time as the machine time, and the simulation only when it differs', () => {
    expect(plateTimeLabel(121.8, 108.7)).toBe('121.8 min (report) · simulation 108.7 min, cutting and rapid only')
    expect(plateTimeLabel(150.4, 148.9)).toBe('150.4 min')
  })

  it('falls back to the simulation when the report has no Machine times table', () => {
    expect(plateTimeLabel(null, 108.7)).toBe('108.7 min (simulated)')
  })
})
