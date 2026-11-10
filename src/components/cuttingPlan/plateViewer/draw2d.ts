import type { PlateView } from '../../../api/cutting-plan'
import { stepUpTo, type MachinePath } from '../../../lib/cuttingPlan/machinePath'
import { COLORS, markColor } from './colors'
import type { SceneState } from './plateScene3d'

export interface Fit { k: number; ox: number; oy: number }

// Top-down nest layout on a 2D canvas: sheet, parts (holes cut out), the path so far, the head.
export function drawPlate2d(canvas: HTMLCanvasElement, view: PlateView, mp: MachinePath, st: SceneState & { mm: number }): Fit {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio, 2)
  canvas.width = r.width * dpr; canvas.height = r.height * dpr
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, r.width, r.height)
  const W = view.sheet?.length_mm ?? 6000, H = view.sheet?.width_mm ?? 1524
  const k = Math.min((r.width - 40) / W, (r.height - 60) / H), ox = (r.width - W * k) / 2, oy = (r.height + H * k) / 2
  const X = (x: number) => ox + x * k, Y = (y: number) => oy - y * k
  const marks = [...new Set(view.parts.map(p => p.mark))]
  const pathOn = st.showRapid || st.showCut || st.playing

  ctx.fillStyle = COLORS.sheet
  ctx.fillRect(X(0), Y(H), W * k, H * k)
  view.parts.forEach((p, i) => {
    const on = !st.selected || p.mark === st.selected, cut = !st.playing || st.partCut(i)
    ctx.beginPath()
    for (const loop of [p.outer, ...p.holes]) { loop.forEach(([x, y], j) => (j ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath() }
    ctx.globalAlpha = on ? (pathOn ? 0.6 : 1) : 0.2
    ctx.fillStyle = !cut ? COLORS.sheet : st.selected && on ? COLORS.accent : markColor(marks, p.mark)
    ctx.fill('evenodd')
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.6; ctx.stroke()
    ctx.globalAlpha = 1
  })

  const last = st.playing ? st.step : mp.steps.length - 1
  const upTo = (j: number) => (st.playing && j === last ? stepUpTo(mp.steps[j], st.mm) : mp.steps[j].pts)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const [cutLayer, col, w] of [[true, COLORS.cut, 2.2], [false, COLORS.rapid, 1.8]] as const) {
    if (cutLayer ? !(st.showCut || st.playing) : !(st.showRapid || st.playing)) continue
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath()
    for (let j = 0; j <= last; j++) { if (mp.steps[j].cut !== cutLayer) continue; upTo(j).forEach(([x, y], q) => (q ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))) }
    ctx.stroke()
  }
  if (st.showRapid || st.playing) {
    ctx.fillStyle = COLORS.rapid
    for (let j = 0; j <= last; j++) { // arrow at the middle of each move, pointing the way the head travels
      const s = mp.steps[j]; if (s.cut || (st.playing && j === last)) continue
      const [x1, y1] = s.pts[0], [x2, y2] = s.pts[s.pts.length - 1]
      const ax = X(x1), ay = Y(y1), bx = X(x2), by = Y(y2), L = Math.hypot(bx - ax, by - ay)
      if (L < 18) continue
      const ux = (bx - ax) / L, uy = (by - ay) / L, mx = (ax + bx) / 2 + ux * 3.5, my = (ay + by) / 2 + uy * 3.5
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - ux * 7 - uy * 4, my - uy * 7 + ux * 4); ctx.lineTo(mx - ux * 7 + uy * 4, my - uy * 7 - ux * 4); ctx.fill()
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1
    for (let j = 0; j <= last; j++) { // pierce points
      const s = mp.steps[j]; if (s.cut || (st.playing && j === last)) continue
      const [x, y] = s.pts[s.pts.length - 1]
      ctx.beginPath(); ctx.arc(X(x), Y(y), 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }
  if (st.playing && st.headState !== 'done') {
    const [hx, hy] = st.head
    if (st.headState !== 'rapid') {
      const g = ctx.createRadialGradient(X(hx), Y(hy), 0, X(hx), Y(hy), 16 + Math.random() * 4)
      g.addColorStop(0, 'rgba(255,240,200,.95)'); g.addColorStop(0.35, 'rgba(255,150,40,.6)'); g.addColorStop(1, 'rgba(255,120,0,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(hx), Y(hy), 20, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = COLORS.accent; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(X(hx), Y(hy), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = COLORS.muted; ctx.font = '12px sans-serif'
  ctx.fillText(`${W.toLocaleString()} mm`, X(W / 2) - 24, Y(0) + 18)
  ctx.fillText(`${H.toLocaleString()} mm`, X(0), Y(H) - 8)
  return { k, ox, oy }
}

function inPoly(x: number, y: number, poly: [number, number][]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

export function pick2d(view: PlateView, fit: Fit, px: number, py: number): string | null {
  const x = (px - fit.ox) / fit.k, y = (fit.oy - py) / fit.k
  return view.parts.find(p => inPoly(x, y, p.outer) && !p.holes.some(h => inPoly(x, y, h)))?.mark ?? null
}
