import * as THREE from 'three'
import type { PlateView } from '../../../api/cutting-plan'
import type { HeadState, MachinePath } from '../../../lib/cuttingPlan/machinePath'
import { COLORS, markColor } from './colors'

// 3D plate scene (2026-11-06, ported from the approved mockup): parts extruded by the sheet
// thickness, cut / rapid ribbons laid down in machine order (a draw range = "cut so far"),
// a plasma torch with glow and sparks, and a generic gantry (not the factory's machine).
export interface SceneState {
  selected: string | null
  explode: boolean
  showRapid: boolean
  showCut: boolean
  showMachine: boolean
  playing: boolean // a time position is set (scrubbed or playing)
  step: number // head step (for the draw range)
  head: [number, number]
  headState: HeadState
  partCut: (i: number) => boolean
}

export class PlateScene3d {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 10, 60000)
  private root = new THREE.Group()
  private meshes: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>[] = []
  private sheet: THREE.Mesh
  private cutMesh: THREE.Mesh
  private rapidMesh: THREE.Mesh
  private cutIdx: number[] = []
  private rapidIdx: number[] = []
  private torch = new THREE.Group()
  private glow: THREE.Mesh
  private sparks: THREE.Points
  private machine = new THREE.Group()
  private bridge = new THREE.Group()
  private carriage: THREE.Mesh
  private orbit = { theta: -0.6, phi: 0.85, dist: 8200, tx: 0, ty: 0 }
  private homeDist = 8200
  private W: number
  private H: number
  private T: number
  private disposers: (() => void)[] = []
  onPick: (mark: string | null) => void = () => {}

  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, view: PlateView, mp: MachinePath) {
    this.canvas = canvas
    this.W = view.sheet?.length_mm ?? 6000
    this.H = view.sheet?.width_mm ?? 1524
    this.T = view.sheet?.thick_mm ?? 10
    const { W, H, T } = this
    // frame the whole sheet: 8,200 mm suits a 6 m sheet; a 12.1 m one needs twice that
    this.homeDist = this.orbit.dist = Math.max(W, H * 3) * 1.37
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(COLORS.canvas)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.85 * Math.PI))
    const sun = new THREE.DirectionalLight(0xffffff, 0.65 * Math.PI)
    sun.position.set(-2000, -3000, 6000)
    this.scene.add(sun)
    this.root.position.set(-W / 2, -H / 2, 0)
    this.scene.add(this.root)

    this.sheet = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), new THREE.MeshStandardMaterial({ color: COLORS.sheet, transparent: true, opacity: 0.55 }))
    this.sheet.position.set(W / 2, H / 2, -T / 2)
    this.root.add(this.sheet)

    const marks = [...new Set(view.parts.map(p => p.mark))]
    for (const p of view.parts) {
      const shape = new THREE.Shape(p.outer.map(([x, y]) => new THREE.Vector2(x, y)))
      for (const h of p.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
      const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 6 }),
        new THREE.MeshStandardMaterial({ color: markColor(marks, p.mark), roughness: 0.55, metalness: 0.25 }),
      )
      mesh.userData.mark = p.mark
      mesh.userData.color = markColor(marks, p.mark)
      this.root.add(mesh)
      this.meshes.push(mesh)
    }

    // ribbons: WebGL lines are always 1 px wide, so cut / rapid moves are flat triangles
    const ribbon = (tri: number[], a: number[], b: number[], w: number) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) return
      const nx = (-(b[1] - a[1]) / L) * w / 2, ny = ((b[0] - a[0]) / L) * w / 2
      tri.push(a[0] + nx, a[1] + ny, 0, b[0] + nx, b[1] + ny, 0, b[0] - nx, b[1] - ny, 0, a[0] + nx, a[1] + ny, 0, b[0] - nx, b[1] - ny, 0, a[0] - nx, a[1] - ny, 0)
    }
    const ct: number[] = [], rt: number[] = [], AR = 34, DOT = 15
    mp.steps.forEach((s, j) => {
      if (s.cut) for (let k = 1; k < s.pts.length; k++) ribbon(ct, s.pts[k - 1], s.pts[k], 8)
      else {
        const a = s.pts[0], b = s.pts[s.pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1])
        ribbon(rt, a, b, 12)
        if (L > AR * 2.5) {
          const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, mx = (a[0] + b[0]) / 2 + (ux * AR) / 2, my = (a[1] + b[1]) / 2 + (uy * AR) / 2
          rt.push(mx, my, 0, mx - ux * AR - uy * AR * 0.55, my - uy * AR + ux * AR * 0.55, 0, mx - ux * AR + uy * AR * 0.55, my - uy * AR - ux * AR * 0.55, 0)
        }
        for (let k = 0; k < 10; k++) { // pierce point = where the rapid ends
          const t0 = (k / 10) * Math.PI * 2, t1 = ((k + 1) / 10) * Math.PI * 2
          rt.push(b[0], b[1], 0, b[0] + DOT * Math.cos(t0), b[1] + DOT * Math.sin(t0), 0, b[0] + DOT * Math.cos(t1), b[1] + DOT * Math.sin(t1), 0)
        }
      }
      this.cutIdx[j] = ct.length / 3
      this.rapidIdx[j] = rt.length / 3
    })
    const ribbonMesh = (tri: number[], color: string, order: number) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
      // transparent pass + renderOrder: drawn after the see-through parts, never hidden by them
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide, transparent: true, opacity: 1 }))
      m.renderOrder = order
      this.root.add(m)
      return m
    }
    this.cutMesh = ribbonMesh(ct, COLORS.cut, 10)
    this.rapidMesh = ribbonMesh(rt, COLORS.rapid, 11)

    // torch
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 })
    const cyl = (r0: number, r1: number, h: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 24), mat); m.rotation.x = Math.PI / 2; m.position.z = z; return m
    }
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.sparks = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3)),
      new THREE.PointsMaterial({ color: 0xffd27a, size: 9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.torch.add(cyl(30, 30, 220, 170, steel), cyl(30, 10, 50, 35, new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.3 })),
      cyl(33, 33, 24, 230, new THREE.MeshStandardMaterial({ color: COLORS.accent })), this.glow, this.sparks)
    this.root.add(this.torch)

    // generic gantry: slat table, side walls + rails, a bridge on X, a carriage on Y
    const paint = (c: number) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.35, roughness: 0.6 })
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D = this.machine) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o
    }
    const frame = paint(0x4a5059), yellow = paint(0xf2b705), dark = paint(0x2b2f35)
    const TW = W + 700, YM = 260
    box(TW, H + 2 * YM, 40, W / 2, H / 2, -T - 260, frame)
    for (let x = 0; x <= W; x += 120) box(6, H + 120, 160, x, H / 2, -T - 90, dark)
    for (const y of [-YM, H + YM]) { box(TW, 90, 260, W / 2, y, -T - 130, frame); box(TW, 40, 30, W / 2, y, 15, dark) }
    this.machine.add(this.bridge)
    box(160, H + 2 * YM + 140, 180, 0, H / 2, 470, yellow, this.bridge)
    for (const y of [-YM, H + YM]) box(220, 120, 480, 0, y, 250, yellow, this.bridge)
    this.carriage = box(200, 160, 300, -180, 0, 420, dark, this.bridge)
    box(60, H + 2 * YM, 20, 110, H / 2, 575, dark, this.bridge)
    this.root.add(this.machine)

    this.wireOrbit()
  }

  update(st: SceneState) {
    const { T } = this
    const lift = st.explode ? 60 : 0
    const pathOn = st.showRapid || st.showCut || st.playing
    this.meshes.forEach((m, i) => {
      const on = !st.selected || m.userData.mark === st.selected, cut = !st.playing || st.partCut(i)
      m.material.color.set(!cut ? COLORS.sheet : st.selected && on ? COLORS.accent : (m.userData.color as string))
      const op = on ? (pathOn ? 0.6 : 1) : 0.18 // parts step back 40% while the path is shown
      m.material.transparent = op < 1
      m.material.opacity = op
      m.position.z = cut ? lift + (st.selected && on ? 40 : 0) : 0
    })
    const last = st.playing ? st.step - 1 : this.cutIdx.length - 1
    this.cutMesh.visible = st.showCut || st.playing
    this.rapidMesh.visible = st.showRapid || st.playing
    this.cutMesh.geometry.setDrawRange(0, last < 0 ? 0 : this.cutIdx[last])
    this.rapidMesh.geometry.setDrawRange(0, last < 0 ? 0 : this.rapidIdx[last])
    this.cutMesh.position.z = this.rapidMesh.position.z = lift + T + 2

    const running = st.playing && st.headState !== 'done'
    const [hx, hy] = running ? st.head : [-200, -150] // parked at the home corner when idle
    this.machine.visible = st.showMachine
    this.torch.visible = running || st.showMachine
    this.torch.position.set(hx, hy, T + 6)
    this.bridge.position.x = hx + 180
    this.carriage.position.set(-180, hy, 420) // on the beam's front face, right above the torch
    const hot = running && st.headState !== 'rapid'
    this.glow.visible = this.sparks.visible = hot
    if (hot) {
      this.glow.scale.setScalar(0.8 + Math.random() * 0.5)
      const a = this.sparks.geometry.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < a.count; k++) { const r = Math.random() * 90, th = Math.random() * Math.PI * 2; a.setXYZ(k, r * Math.cos(th), r * Math.sin(th), -Math.random() * 25 + 4) }
      a.needsUpdate = true
    }
    this.render()
  }

  resetView() { Object.assign(this.orbit, { theta: -0.6, phi: 0.85, dist: this.homeDist, tx: 0, ty: 0 }); this.render() }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
    this.render()
  }

  render() {
    const { theta, phi, dist, tx, ty } = this.orbit
    this.camera.position.set(tx + dist * Math.sin(phi) * Math.sin(theta), ty - dist * Math.sin(phi) * Math.cos(theta), dist * Math.cos(phi))
    this.camera.up.set(0, 0, 1)
    this.camera.lookAt(tx, ty, 0)
    this.renderer.render(this.scene, this.camera)
  }

  private wireOrbit() {
    const c = this.canvas
    let drag: { x: number; y: number; pan: boolean; moved: number } | null = null
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts); this.disposers.push(() => c.removeEventListener(type, fn as EventListener))
    }
    on('contextmenu', e => e.preventDefault())
    on('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, moved: 0 }; c.setPointerCapture(e.pointerId) })
    on('pointermove', e => {
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy)
      const o = this.orbit
      if (drag.pan) { const k = o.dist / 900; o.tx -= (dx * Math.cos(o.theta) + dy * Math.sin(o.theta)) * k; o.ty += (dy * Math.cos(o.theta) - dx * Math.sin(o.theta)) * k }
      else { o.theta -= dx * 0.006; o.phi = Math.min(1.45, Math.max(0.05, o.phi - dy * 0.006)) }
      this.render()
    })
    on('pointerup', e => {
      if (drag && drag.moved < 4) { // a click, not a drag: pick the part under the pointer
        const r = c.getBoundingClientRect(), ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera)
        const hit = ray.intersectObjects(this.meshes)[0]
        this.onPick(hit ? (hit.object.userData.mark as string) : null)
      }
      drag = null
    })
    on('wheel', e => { e.preventDefault(); this.orbit.dist = Math.min(this.homeDist * 4, Math.max(300, this.orbit.dist * Math.exp(e.deltaY * 0.001))); this.render() }, { passive: false })
  }

  dispose() {
    this.disposers.forEach(d => d())
    this.scene.traverse(o => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      ;(Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose())
    })
    this.renderer.dispose()
  }
}
