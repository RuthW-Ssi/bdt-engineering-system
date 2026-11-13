// Cutting Plan Shape (2026-11-10): from a dropped CutLogic folder only CP-*.pdf (cutting layouts) is uploaded.
// PS-*.pdf (plan stocks) and Part Lists are left out without complaint; anything else is refused.
// The size label mirrors the backend's profileFromFileName / normaliseProfile (cutlogic-parser.ts); the server
// reads the real size from the report itself.
const isCp = (n: string) => /^CP-.*\.pdf$/i.test(n)
const isNotUsed = (n: string) => /^PS-.*\.pdf$/i.test(n) || /\.xlsx?$/i.test(n)

export function shapeSizeFromFileName(name: string): string | null {
  const m = /([A-Z]+\s*Ø?\s*[A-Z]*\d[\d.]*(?:\s*[xX]\s*[\d.]+)*)\s*-\s*[A-Z]*\d+[A-Z]*\s*$/i.exec(name.replace(/\.pdf$/i, ''))
  if (!m) return null
  const t = m[1].toUpperCase().replace(/Ø/g, ' ').replace(/\s+/g, ' ').trim()
  const p = /^([A-Z]+)\s*([A-Z]*\d[\d.]*(?:\s*X\s*[\d.]+)*)/.exec(t)
  return p ? `${p[1]} ${p[2].replace(/\s+/g, '')}` : t
}

export function classifyShapeFiles(names: string[]) {
  return {
    cp: names.filter(isCp).map(name => ({ name, size: shapeSizeFromFileName(name) })),
    notUsed: names.filter(n => !isCp(n) && isNotUsed(n)),
    rejected: names.filter(n => !isCp(n) && !isNotUsed(n)),
  }
}
