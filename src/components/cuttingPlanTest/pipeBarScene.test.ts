import * as THREE from 'three'
import { cutFrame, sectionShape } from './pipeBarScene'
import { section } from '../../lib/cuttingPlanTest/shapeTest'

// 2026-11-26: BOX and L pieces are drawn from their real section; check the outline, not the WebGL picture
const box2 = (pts: THREE.Vector2[]) => new THREE.Box2().setFromPoints(pts)
const inside = (p: THREE.Vector2, poly: THREE.Vector2[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

describe('sectionShape', () => {
  it('a box is hollow: outer h × b, the inside a wall in from every side, centred on the axis', () => {
    const s = sectionShape(section('BOX 100X50X2.3'))
    const outer = box2(s.getPoints())
    expect(outer.min.toArray()).toEqual([-25, -50])
    expect(outer.max.toArray()).toEqual([25, 50])
    expect(s.holes).toHaveLength(1)
    const hole = box2(s.holes[0].getPoints())
    expect(hole.min.x).toBeCloseTo(-22.7); expect(hole.max.y).toBeCloseTo(47.7)
  })

  it('an angle is the L outline, legs a and b, thickness t, its box centred on the axis', () => {
    const pts = sectionShape(section('L 100X75X7')).getPoints()
    const b = box2(pts)
    expect(b.min.toArray()).toEqual([-50, -37.5])
    expect(b.max.toArray()).toEqual([50, 37.5])
    expect(inside(new THREE.Vector2(-50 + 3.5, 0), pts)).toBe(true) // in the upright leg
    expect(inside(new THREE.Vector2(0, -37.5 + 3.5), pts)).toBe(true) // in the flat leg
    expect(inside(new THREE.Vector2(0, 0), pts)).toBe(false) // the open side of the L
  })

  it('the cut frame is bigger than the section and holds it (box and angle)', () => {
    for (const p of ['BOX 150X150X4.5', 'L 50X50X5', 'L 100X75X7']) {
      const sec = section(p)
      const small = sectionShape(sec, 1.02).getPoints(), big = sectionShape(sec, 1.12).getPoints()
      expect(box2(big).getSize(new THREE.Vector2()).x).toBeGreaterThan(box2(small).getSize(new THREE.Vector2()).x)
      for (const q of sectionShape(sec).getPoints()) expect(inside(q.clone().multiplyScalar(0.999), big)).toBe(true)
    }
  })

  it('extrudes into a solid along the bar length', () => {
    const g = new THREE.ExtrudeGeometry(sectionShape(section('BOX 150X150X4.5')), { depth: 5819, bevelEnabled: false })
    g.computeBoundingBox()
    expect(g.boundingBox!.max.z).toBeCloseTo(5819)
    expect(g.boundingBox!.max.x).toBeCloseTo(75)
  })

  it('an H-beam: flanges top and bottom, web in the middle, its box centred', () => {
    const pts = sectionShape(section('H 200X100X5.5X8')).getPoints()
    const b = box2(pts)
    expect(b.min.toArray()).toEqual([-50, -100]); expect(b.max.toArray()).toEqual([50, 100])
    expect(inside(new THREE.Vector2(0, 0), pts)).toBe(true) // web
    expect(inside(new THREE.Vector2(40, 96), pts)).toBe(true) // top flange
    expect(inside(new THREE.Vector2(40, 0), pts)).toBe(false) // beside the web
  })

  it('a channel: web on one side, flanges reaching out the other', () => {
    const pts = sectionShape(section('C 150X75X6.5X10')).getPoints()
    const b = box2(pts)
    expect(b.min.toArray()).toEqual([-37.5, -75]); expect(b.max.toArray()).toEqual([37.5, 75])
    expect(inside(new THREE.Vector2(-35, 0), pts)).toBe(true) // web
    expect(inside(new THREE.Vector2(30, 70), pts)).toBe(true) // flange
    expect(inside(new THREE.Vector2(0, 0), pts)).toBe(false) // the open side
  })

  it('the cut frame of an H-beam or channel is a ring round its box, clear of the steel', () => {
    for (const p of ['H 200X100X5.5X8', 'C 150X75X6.5X10']) {
      const sec = section(p), frame = cutFrame(sec)
      const steel = box2(sectionShape(sec).getPoints()), outer = box2(frame.getPoints()), hole = box2(frame.holes[0].getPoints())
      expect(hole.containsBox(steel)).toBe(true)
      expect(outer.containsBox(hole)).toBe(true)
    }
  })
})
