import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { sectionExtent } from '../../lib/cuttingPlanTest/shapeTest'
import type { Section } from '../../lib/cuttingPlanTest/shapeTest'

// CP-Shape-Test 3D (2026-11-12, step 1): one stock bar laid along X, each piece a tube (rod: solid) in its mark's
// colour with the kerf gaps between, the end leftover in grey and an orange ring at every cut. Step 2: a piece with
// end-cut grids (from the IFC model) is drawn with its real saddle / slot ends, the cut line following them — the mesh
// is BdtPipeCut's (partMesh / weldPoints): per degree round the pipe, outer and inner wall from left cut to right cut.
// 2026-11-26: BOX and L pieces are their real section (hollow box, angle) drawn along the bar, cut square, with an
// orange frame round the section at every cut. C and H (2026-11-26) the same, the frame round their box.
export interface EndGrids { LW: number[]; LN: number[]; RW: number[]; RN: number[] }
export interface BarPiece { fromMm: number; toMm: number; color: string; grids?: EndGrids; turnDeg?: number } // turnDeg: round the axis, to nest
export interface BarSpec { stockMm: number; section: Section; pieces: BarPiece[]; leftFromMm: number }

const CUT = 0xf97316
const LEFT = 0xc7cbd1

// BOX / L outline in the section plane, centred on the bar's axis (angle: corner at the bounding box's corner). A box
// has its inside as a hole; scale > 1 gives the outline only (for the cut frame round it).
export function sectionShape(s: Section, scale = 1): THREE.Shape {
  const shape = new THREE.Shape()
  if (s.kind === 'box') {
    const w = (s.widthMm / 2) * scale, h = (s.heightMm / 2) * scale
    shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h); shape.lineTo(-w, h); shape.closePath()
    if (scale === 1) {
      const wi = w - s.wallMm, hi = h - s.wallMm
      const hole = new THREE.Path()
      hole.moveTo(-wi, -hi); hole.lineTo(-wi, hi); hole.lineTo(wi, hi); hole.lineTo(wi, -hi); hole.closePath()
      shape.holes.push(hole)
    }
  } else if (s.kind === 'angle') {
    const a = s.legAMm, b = s.legBMm, t = s.thickMm
    // scaled about the inside of the corner (t/2, t/2): the L is star-shaped from there, so the bigger outline holds it
    const P = (x: number, y: number) => [t / 2 + (x - t / 2) * scale - a / 2, t / 2 + (y - t / 2) * scale - b / 2] as const
    shape.moveTo(...P(0, 0)); shape.lineTo(...P(a, 0)); shape.lineTo(...P(a, t)); shape.lineTo(...P(t, t)); shape.lineTo(...P(t, b)); shape.lineTo(...P(0, b)); shape.closePath()
  } else if (s.kind === 'h' || s.kind === 'channel') {
    // H: web in the middle; channel: web on the left (−x), flanges reaching right. Box centred on the axis.
    const w = s.widthMm / 2, h = s.heightMm / 2, tw = s.webMm, tf = s.flangeMm
    const [wl, wr] = s.kind === 'h' ? [-tw / 2, tw / 2] : [-w, -w + tw]
    const pts: [number, number][] = [[-w, -h], [w, -h], [w, -h + tf], [wr, -h + tf], [wr, h - tf], [w, h - tf], [w, h], [-w, h]]
    if (s.kind === 'h') pts.push([-w, h - tf], [wl, h - tf], [wl, -h + tf], [-w, -h + tf])
    shape.moveTo(...pts[0]); pts.slice(1).forEach(p => shape.lineTo(...p)); shape.closePath()
  }
  return shape
}

// The orange frame drawn at a cut, round a box or angle (its own outline grown) or round the box of an H-beam / channel
// (their outline is not star-shaped from a point inside, so a grown copy would cross the steel)
export function cutFrame(s: Section): THREE.Shape {
  if (s.kind === 'h' || s.kind === 'channel') {
    const rect = (k: number) => { const w = (s.widthMm / 2) * k, h = (s.heightMm / 2) * k; return [new THREE.Vector2(-w, -h), new THREE.Vector2(w, -h), new THREE.Vector2(w, h), new THREE.Vector2(-w, h)] }
    const frame = new THREE.Shape(rect(1.12))
    frame.holes.push(new THREE.Path(rect(1.04).reverse()))
    return frame
  }
  const frame = sectionShape(s, 1.12)
  frame.holes.push(new THREE.Path(sectionShape(s, 1.02).getPoints()))
  return frame
}

export class PipeBarScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 100000)
  private controls: OrbitControls
  private spec: BarSpec
  private frame = 0

  constructor(canvas: HTMLCanvasElement, spec: BarSpec) {
    this.spec = spec
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0xeef0f3)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9 * Math.PI))
    const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI)
    sun.position.set(2000, 4000, 3000)
    this.scene.add(sun)

    const root = new THREE.Group()
    root.position.x = -spec.stockMm / 2
    this.scene.add(root)
    const sec = spec.section
    const realEnds = (p: BarPiece) => !!p.grids && sec.kind === 'round' && sec.wallMm != null
    for (const p of spec.pieces) root.add(realEnds(p) ? this.cutPiece(p, p.grids!) : this.segment(p.fromMm, p.toMm, p.color))
    if (spec.stockMm - spec.leftFromMm > 0.5) root.add(this.segment(spec.leftFromMm, spec.stockMm, LEFT))
    for (const p of spec.pieces) for (const x of realEnds(p) ? [] : [p.fromMm, p.toMm]) {
      if (x <= 0 || x >= spec.stockMm) continue
      const mark = this.cutMark()
      mark.position.x = x
      root.add(mark)
    }

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.addEventListener('change', () => this.render())
    this.focus(null)
  }

  // The orange mark at a cut: a ring round a round bar, a frame round a box or angle
  private cutMark(): THREE.Object3D {
    const s = this.spec.section, mat = new THREE.MeshBasicMaterial({ color: CUT, side: THREE.DoubleSide })
    if (s.kind === 'round') {
      const r = s.outerMm / 2
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, Math.max(0.6, r * 0.04), 8, 48), mat)
      ring.rotation.y = Math.PI / 2
      return ring
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(cutFrame(s)), mat)
    m.rotation.y = Math.PI / 2
    return m
  }

  private segment(from: number, to: number, color: string | number) {
    const len = to - from, sec = this.spec.section
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide })
    const g = new THREE.Group()
    g.position.x = from + len / 2
    if (sec.kind !== 'round') {
      // ExtrudeGeometry runs along +Z from 0; turned a quarter round Y, +Z lies along the bar (+X)
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sectionShape(sec), { depth: len, bevelEnabled: false }), mat)
      body.rotation.y = Math.PI / 2
      body.position.x = -len / 2
      g.add(body)
      return g
    }
    const r = sec.outerMm / 2
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 48, 1, sec.wallMm != null), mat)
    outer.rotation.z = Math.PI / 2
    g.add(outer)
    if (sec.wallMm != null) {
      const ri = Math.max(0.5, r - sec.wallMm)
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, len, 48, 1, true), mat)
      inner.rotation.z = Math.PI / 2
      g.add(inner)
      for (const x of [-len / 2, len / 2]) {
        const cap = new THREE.Mesh(new THREE.RingGeometry(ri, r, 48), mat)
        cap.rotation.y = Math.PI / 2
        cap.position.x = x
        g.add(cap)
      }
    }
    return g
  }

  // A piece with its real ends, its tip at fromMm; an orange line along each end cut on the outer wall
  private cutPiece(p: BarPiece, g: EndGrids) {
    const sec = this.spec.section as Extract<Section, { kind: 'round' }> // only pipes have end-cut grids
    const ro = sec.outerMm / 2, ri = Math.max(0.5, ro - (sec.wallMm ?? 0))
    const xL: number[] = [], xR: number[] = []
    for (let i = 0; i < 361; i++) { xL.push(Math.max(g.LW[i], g.LN[i])); xR.push(Math.min(g.RW[i], g.RN[i])) }
    const tip = Math.min(...xL)
    const P = (x: number, deg: number, r: number) => { const t = (deg * Math.PI) / 180; return new THREE.Vector3(x - tip, r * Math.cos(t), r * Math.sin(t)) }
    const pos: number[] = []
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
    for (let i = 0; i < 360; i++) {
      const j = i + 1
      const oLi = P(xL[i], i, ro), oRi = P(xR[i], i, ro), oLj = P(xL[j], j, ro), oRj = P(xR[j], j, ro)
      const iLi = P(xL[i], i, ri), iRi = P(xR[i], i, ri), iLj = P(xL[j], j, ri), iRj = P(xR[j], j, ri)
      quad(oLi, oRi, oRj, oLj); quad(iLi, iLj, iRj, iRi); quad(oLi, oLj, iLj, iLi); quad(oRi, iRi, iRj, oRj)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.computeVertexNormals()
    const g3 = new THREE.Group()
    g3.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide })))
    for (const xs of [xL, xR]) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < 360; i += 2) pts.push(P(xs[i], i, ro * 1.005))
      g3.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2), 180, Math.max(0.6, ro * 0.03), 6, true), new THREE.MeshBasicMaterial({ color: CUT })))
    }
    g3.position.x = p.fromMm
    g3.rotation.x = (-(p.turnDeg ?? 0) * Math.PI) / 180 // its angle (i + turn) lands on the previous piece's angle i
    return g3
  }

  /** null = the whole bar; else the piece's span, close up */
  focus(span: { fromMm: number; toMm: number } | null) {
    const { stockMm } = this.spec, outerMm = sectionExtent(this.spec.section)
    const from = span?.fromMm ?? 0, to = span?.toMm ?? stockMm
    const cx = (from + to) / 2 - stockMm / 2
    // the whole bar from the front so both ends stay in frame; a piece from an angle, close up
    const d = Math.max((to - from) * (span ? 1.1 : 0.8), outerMm * 8)
    this.controls.target.set(cx, 0, 0)
    if (span) this.camera.position.set(cx - d * 0.35, d * 0.45, d * 0.75)
    else this.camera.position.set(cx - d * 0.12, d * 0.3, d * 0.9)
    this.controls.update()
    this.render()
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
    this.render()
  }

  render() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      this.renderer.render(this.scene, this.camera)
      if (this.controls.update()) this.render() // damping still settling
    })
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.controls.dispose()
    this.scene.traverse(o => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material
      ;(Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose())
    })
    this.renderer.dispose()
  }
}
