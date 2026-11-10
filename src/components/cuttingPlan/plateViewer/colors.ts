// Plate viewer palette: app accent for the selection, blue rapids, orange cuts (approved mockup 2026-11-06).
export const COLORS = {
  accent: '#C8202A',
  sheet: '#C9D1DA',
  canvas: '#EEF1F4',
  rapid: '#1F5FD6',
  cut: '#F07A12',
  muted: '#6B6F76',
}

// One stable colour per mark (golden-angle hue steps). Comma form: three.js parses only that.
export function markColor(marks: string[], mark: string) {
  return `hsl(${Math.round((marks.indexOf(mark) * 137.5) % 360)}, 55%, 58%)`
}
