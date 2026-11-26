import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { JointSpec } from '../../lib/cuttingPlanTest/plugWeld'

// CP-Shape-Test (Tao 2026-11-26): a sleeve joint put together. Two pipes meet at x = 0 (see-through, so the sleeve
// inside shows), the sleeve lies across the joint, and each pipe carries its plug-weld holes over the sleeve: a dark
// hole with an orange weld ring. Only the part of each pipe near the joint is drawn.
const PIPE = 0x5b7fa6, SLEEVE = 0x0f9d8a, HOLE = 0x111827, WELD = 0xf97316

// a disc on a round surface at radius r, angle deg round the X axis, facing out
export function onSurface(obj: THREE.Object3D, x: number, r: number, deg: number) {
  const t = (deg * Math.PI) / 180, n = new THREE.Vector3(0, Math.cos(t), Math.sin(t))
  obj.position.set(x, n.y * r, n.z * r)
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  return obj
}
export function holeMarks(x: number, r: number, deg: number, dia: number): THREE.Object3D[] {
  const side = THREE.DoubleSide
  return [
    onSurface(new THREE.Mesh(new THREE.CircleGeometry(dia / 2, 28), new THREE.MeshBasicMaterial({ color: HOLE, side })), x, r * 1.004, deg),
    onSurface(new THREE.Mesh(new THREE.RingGeometry(dia / 2, dia / 2 + Math.max(1.5, dia * 0.18), 28), new THREE.MeshBasicMaterial({ color: WELD, side })), x, r * 1.005, deg),
  ]
}

function tube(from: number, to: number, od: number, wall: number, mat: THREE.Material) {
  const g = new THREE.Group(), len = to - from, ro = od / 2, ri = Math.max(0.5, ro - wall)
  for (const r of [ro, ri]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 56, 1, true), mat); m.rotation.z = Math.PI / 2; g.add(m) }
  for (const x of [-len / 2, len / 2]) { const cap = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 56), mat); cap.rotation.y = Math.PI / 2; cap.position.x = x; g.add(cap) }
  g.position.x = from + len / 2
  return g
}

export class SleeveJointScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 100000)
  private controls: OrbitControls
  private frame = 0

  constructor(canvas: HTMLCanvasElement, spec: JointSpec) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0xeef0f3)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9 * Math.PI))
    const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI)
    sun.position.set(2000, 4000, 3000)
    this.scene.add(sun)

    const side = THREE.DoubleSide
    this.scene.add(tube(spec.sleeve.fromMm, spec.sleeve.toMm, spec.sleeve.odMm, spec.sleeve.wallMm, new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.5, metalness: 0.3, side })))
    for (const p of spec.pipes) {
      const a = p.side * 2.5, b = p.side * p.shownMm // 5 mm between the two pipes
      const outer = tube(Math.min(a, b), Math.max(a, b), p.odMm, p.wallMm, new THREE.MeshStandardMaterial({ color: PIPE, roughness: 0.5, metalness: 0.3, side, transparent: true, opacity: 0.38, depthWrite: false }))
      outer.renderOrder = 1
      this.scene.add(outer)
      for (const h of p.holes) for (const m of holeMarks(h.xMm, p.odMm / 2, h.angleDeg, h.diaMm)) { m.renderOrder = 2; this.scene.add(m) }
    }

    const span = Math.max(...spec.pipes.map(p => p.shownMm), spec.sleeve.toMm) * 2
    const d = Math.max(span * 1.25, Math.max(...spec.pipes.map(p => p.odMm)) * 6)
    this.camera.position.set(-d * 0.35, d * 0.4, d * 0.75)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.addEventListener('change', () => this.render())
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
      if (this.controls.update()) this.render()
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
