import { PDFPage, rgb, type RGB } from 'pdf-lib'
// Namespace import, not default — this repo's tsconfig has no
// esModuleInterop (same gotcha documented in mo-print-pdf-builder.ts's own
// fontkit import), so a default import here would compile to
// `fab_icons_data_json_1.default`, which is undefined for a plain JSON
// require() (confirmed the hard way: this exact bug 500'd the print-packet
// endpoint before this fix).
import * as fabIconsData from './fab-icons-data.json'

// Curated icons for the operation-icon picker (src/lib/fabIcons.tsx on the
// frontend) — mostly lucide-react's own __iconNode arrays ([tag, attrs][]
// in lucide's 0-24, Y-down viewBox), extracted once via a small script
// against the installed lucide-react package (2026-09-29), not hand-typed.
// One (`crane`) is hand-added from Phosphor Icons (MIT license) instead,
// which uses its own 0-256 viewBox and native stroke-width of 16 rather
// than lucide's 24/2 — `viewBox`/`strokeWidth` are stored per icon rather
// than assumed, specifically so a differently-scaled icon like this one
// still renders at the correct relative line weight (2026-09-29: "ตอน
// print mo wo ถูกนำมาใช้หรือยัง" — this and 7 other lucide icons the
// frontend had gained were still missing from this backend data file
// entirely until this fix).
interface IconEntry {
  viewBox: number
  strokeWidth: number
  nodes: [string, Record<string, string>][]
}
const FAB_ICONS: Record<string, IconEntry> = fabIconsData as unknown as Record<string, IconEntry>

/**
 * Draws one curated icon centered at (cx, cy) in page coordinates, `size`
 * points square. Returns false (and draws nothing) if `key` isn't in the
 * curated set — callers fall back to their own default mark.
 *
 * Coordinate math: each icon's SVG path/circle/rect/line data lives in its
 * own 0-viewBox, Y-down box. pdf-lib's own drawSvgPath() already flips Y
 * internally for path data (confirmed by reading pdf-lib's operations.js —
 * it does translate(x,y) then scale(1,-1) before drawing the raw path
 * commands), so a path element just needs the same (anchorX, anchorY,
 * scale) as every other element of the icon. circle/rect/line have no such
 * built-in helper, so their icon-space points are converted by hand with
 * the identical transform (anchorX + ix*scale, anchorY - iy*scale) so every
 * element of the icon lines up regardless of which pdf-lib primitive draws
 * it.
 */
export function drawFabIcon(page: PDFPage, key: string | null | undefined, opts: { cx: number; cy: number; size: number; color: RGB; opacity: number }): boolean {
  if (!key) return false
  const entry = FAB_ICONS[key]
  if (!entry) return false
  const { viewBox, strokeWidth: nativeStrokeWidth, nodes } = entry

  const { cx, cy, size, color, opacity } = opts
  const scale = size / viewBox
  // Only for circle/rect/line below, which we place by hand in absolute
  // page units. drawSvgPath (the `path` branch) is different: it takes its
  // own `scale` option and applies it as a `cm` transform *before* the
  // `w` (line width) operator (confirmed by reading pdf-lib's
  // operations.js), so a borderWidth we already pre-scaled gets scaled a
  // second time by that transform — negligible at small icon sizes but
  // quadratic blow-up at the watermark's larger size, rendering as a
  // solid blob instead of an outline (2026-09-28: "ลายน้ำที่เป็น icon ดู
  // ไม่รู้เรื่องเลย"). Pass the native strokeWidth there and let
  // drawSvgPath's own transform scale it once.
  const strokeWidth = nativeStrokeWidth * scale
  // Anchor = the icon's own (0,0) — top-left of its viewBox — placed so
  // the whole icon ends up centered at (cx, cy).
  const anchorX = cx - size / 2
  const anchorY = cy + size / 2

  for (const [tag, attrs] of nodes) {
    const filled = attrs.fill === 'currentColor'

    if (tag === 'path') {
      page.drawSvgPath(attrs.d, {
        x: anchorX,
        y: anchorY,
        scale,
        borderColor: color,
        borderWidth: nativeStrokeWidth,
        ...(filled ? { color } : {}),
        opacity,
        borderOpacity: opacity,
      })
    } else if (tag === 'circle') {
      const iconCx = Number(attrs.cx)
      const iconCy = Number(attrs.cy)
      const r = Number(attrs.r)
      page.drawCircle({
        x: anchorX + iconCx * scale,
        y: anchorY - iconCy * scale,
        size: r * scale,
        borderColor: color,
        borderWidth: strokeWidth,
        ...(filled ? { color } : {}),
        opacity,
        borderOpacity: opacity,
      })
    } else if (tag === 'rect') {
      const x = Number(attrs.x ?? 0)
      const y = Number(attrs.y ?? 0)
      const w = Number(attrs.width)
      const h = Number(attrs.height)
      page.drawRectangle({
        x: anchorX + x * scale,
        y: anchorY - (y + h) * scale,
        width: w * scale,
        height: h * scale,
        borderColor: color,
        borderWidth: strokeWidth,
        ...(filled ? { color } : {}),
        opacity,
        borderOpacity: opacity,
      })
    } else if (tag === 'line') {
      const x1 = Number(attrs.x1)
      const y1 = Number(attrs.y1)
      const x2 = Number(attrs.x2)
      const y2 = Number(attrs.y2)
      page.drawLine({
        start: { x: anchorX + x1 * scale, y: anchorY - y1 * scale },
        end:   { x: anchorX + x2 * scale, y: anchorY - y2 * scale },
        thickness: strokeWidth,
        color,
        opacity,
      })
    }
  }
  return true
}

// Re-exported so callers don't need their own `rgb(0,0,0)` literal just to
// pass a color in.
export const FAB_ICON_BLACK = rgb(0, 0, 0)
