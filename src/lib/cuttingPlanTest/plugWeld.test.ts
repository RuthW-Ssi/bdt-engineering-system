import { jointSpec, plugAtMarks, plugNotes, plugWeldProblem, suggestPlugWeld } from './plugWeld'
import type { SleeveJoint } from '../../api/cutting-plan-test'

// Tao 2026-11-26: plug-weld holes at a sleeve joint as parameters, with a suggestion to start from
describe('suggestPlugWeld', () => {
  it('hole = wall + 8 mm rounded up; 4 holes for a pipe over 115 mm, else 2; half way along the sleeve', () => {
    expect(suggestPlugWeld(139.8, 5, 197.5)).toEqual({ holeDiaMm: 13, holesPerSide: 4, fromEndMm: 99, startAngleDeg: 0 })
    expect(suggestPlugWeld(113.5, 2.4, 197.5)).toEqual({ holeDiaMm: 11, holesPerSide: 2, fromEndMm: 99, startAngleDeg: 0 })
    expect(suggestPlugWeld(216.3, 4.5, 295)).toEqual({ holeDiaMm: 13, holesPerSide: 4, fromEndMm: 148, startAngleDeg: 0 })
  })
  it('no wall thickness known: 14 mm to start from', () => expect(suggestPlugWeld(100, null, 200).holeDiaMm).toBe(14))
})

describe('plugWeldProblem', () => {
  const ok = { holeDiaMm: 13, holesPerSide: 4, fromEndMm: 99, startAngleDeg: 0 }
  it('fine when the holes sit over the sleeve and are at least 4 diameters apart round the pipe', () => expect(plugWeldProblem(ok, 139.8, 197.5)).toBeNull())
  it('a hole past the sleeve, or off the pipe end', () => {
    expect(plugWeldProblem({ ...ok, fromEndMm: 195 }, 139.8, 197.5)).toBe('Holes must sit over the sleeve: 7 to 191 mm from the pipe end')
    expect(plugWeldProblem({ ...ok, fromEndMm: 3 }, 139.8, 197.5)).toBe('Holes must sit over the sleeve: 7 to 191 mm from the pipe end')
  })
  it('too many holes round the pipe', () => expect(plugWeldProblem({ ...ok, holesPerSide: 12 }, 139.8, 197.5)).toBe('Holes closer than 4 × Ø13 round the pipe: 8 at most'))
  it('numbers that are not sizes', () => expect(plugWeldProblem({ ...ok, holeDiaMm: 0 }, 139.8, 197.5)).toBe('Enter the hole size and how many'))
})

describe('plugNotes', () => {
  const joints: SleeveJoint[] = [{
    sleeve: { marks: ['TC-m7'], profile: 'PIPE 139.8X5 SL', odMm: 129.8, wallMm: 5, lengthMm: 400 }, count: 12, assemblies: ['TC-PS1'], sleeveDrawnAtPipeSize: false,
    pipes: [{ marks: ['TC-m1'], profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 8000, insertMm: 197.5 }, { marks: ['TC-m6'], profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 3579, insertMm: 197.5 }],
  }]
  const set = { 'PIPE 139.8X5': { params: { holeDiaMm: 14, holesPerSide: 4, fromEndMm: 100, startAngleDeg: 0 }, confirmed: true } }
  it('one line per pipe end of a joint, said by the pipe it is joined to; only confirmed sizes', () => {
    expect(plugNotes(joints, set, ['TC-m1', 'TC-m6', 'TC-m7'])).toEqual([
      { mark: 'TC-m1', text: 'End joined to TC-m6 (sleeve TC-m7 goes in 197.5 mm): 4 holes Ø14, 100 mm from the end, at 0° 90° 180° 270°' },
      { mark: 'TC-m6', text: 'End joined to TC-m1 (sleeve TC-m7 goes in 197.5 mm): 4 holes Ø14, 100 mm from the end, at 0° 90° 180° 270°' },
    ])
    expect(plugNotes(joints, { 'PIPE 139.8X5': { ...set['PIPE 139.8X5'], confirmed: false } }, ['TC-m1'])).toEqual([])
    expect(plugNotes(joints, set, ['OTHER'])).toEqual([])
  })
})

// 2026-11-26: the holes and the sleeve in 3D — on the bar (one pipe piece) and as the joint put together
describe('plugAtMarks / jointSpec', () => {
  const joint: SleeveJoint = {
    sleeve: { marks: ['TC-m7'], profile: 'PIPE 139.8X5 SL', odMm: 129.8, wallMm: 5, lengthMm: 400 }, count: 12, assemblies: ['TC-PS1'], sleeveDrawnAtPipeSize: false,
    pipes: [{ marks: ['TC-m1'], profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 8000, insertMm: 197.5 }, { marks: ['TC-m6'], profile: 'PIPE 139.8X5', odMm: 139.8, wallMm: 5, lengthMm: 3579, insertMm: 197.5 }],
  }
  const set = { 'PIPE 139.8X5': { params: { holeDiaMm: 14, holesPerSide: 4, fromEndMm: 100, startAngleDeg: 0 }, confirmed: false } }
  it('each pipe mark of a joint: its holes, the pipe it is joined to and its sleeve; suggested or confirmed', () => {
    const at = plugAtMarks([joint], set)
    expect(Object.keys(at)).toEqual(['TC-m1', 'TC-m6'])
    expect(at['TC-m1']).toEqual({ params: set['PIPE 139.8X5'].params, confirmed: false, joinedTo: 'TC-m6', sleeve: 'TC-m7', insertMm: 197.5 })
  })
  it('the joint put together: x = 0 at the joint, pipes either side, the sleeve across, holes over the sleeve', () => {
    const j = jointSpec(joint, set)
    expect(j.sleeve).toEqual({ odMm: 129.8, wallMm: 5, fromMm: -200, toMm: 200 })
    expect(j.pipes.map(p => [p.odMm, p.wallMm, p.side])).toEqual([[139.8, 5, -1], [139.8, 5, 1]])
    expect(j.pipes[0].holes).toEqual([0, 90, 180, 270].map(angleDeg => ({ xMm: -100, angleDeg, diaMm: 14 })))
    expect(j.pipes[1].holes.every(h => h.xMm === 100)).toBe(true)
    expect(j.pipes[0].shownMm).toBeGreaterThan(197.5) // the pipe is drawn past the sleeve end, not its whole 8 m
  })
  it('a sleeve the model draws at its pipe size is shown as the tube that fits inside', () => {
    const same = { ...joint, sleeveDrawnAtPipeSize: true, sleeve: { ...joint.sleeve, odMm: 139.8 } }
    expect(jointSpec(same, set).sleeve.odMm).toBeCloseTo(129.8)
  })
})
