// Checks a plate's .txt report before anything is saved (2026-11-09). An upload with any problem is
// refused as a whole and every problem is listed (file · section · problem), so the user fixes the
// reports and uploads again. Found in the full re-upload of the legacy cutting plans:
// - a report that holds several plates (a batch exported into one file; the parser keeps one of them)
// - a remnant row with its plate number and no dimensions (58 legacy plates; the report lacks the data)
// - a plate row whose cells do not line up with the header (a report edited by hand)
// Whatever the parser still rejects comes back per file and is listed the same way (parserFileProblems).

export interface ReportProblem { section: string; problem: string }
export interface FileReportProblem extends ReportProblem { file: string }

const NC_FILE = /NC File\s*:\s*([^\t\r\n]+?)\.cld/g

export function reportProblems(text: string): ReportProblem[] {
  const problems: ReportProblem[] = []
  const lines = text.split(/\r?\n/)

  const ncFiles = [...new Set([...text.matchAll(NC_FILE)].map(m => m[1].trim()))]
  if (ncFiles.length > 1)
    problems.push({ section: 'Report', problem: `Holds ${ncFiles.length} plates (NC ${ncFiles.join(', ')}): export one report per plate` })

  // the plate row follows the header and the units row "m"; Count (2nd cell) is always a whole number
  const header = lines.findIndex(l => l.startsWith('Article Number') && l.includes('Charge'))
  if (header >= 0) {
    const cells = (l: string) => l.replace(/\t+$/, '').split('\t')
    const row = lines.slice(header + 1, header + 6).find(l => l.trim() !== 'm' && l.includes('\t'))
    const width = cells(lines[header]).length
    if (!row) problems.push({ section: 'Used Material', problem: 'No plate row' })
    else if (cells(row).length !== width) problems.push({ section: 'Used Material', problem: `The plate row has ${cells(row).length} cells, the header has ${width}` })
  }

  const start = lines.findIndex(l => l.trim() === 'Remnants')
  if (start >= 0) {
    const end = lines.findIndex((l, i) => i > start && l.startsWith('Machine times'))
    for (const l of lines.slice(start + 1, end < 0 ? undefined : end)) {
      const [first, ...rest] = l.split('\t')
      if (/^R\d+$/.test(first.trim()) && !rest.some(c => / X /.test(c)))
        problems.push({ section: 'Remnants', problem: `${first.trim()} has no dimensions` })
    }
  }
  return problems
}

// The parser's messages read "Text format in <section> is not complatible with criteria >>> <detail>"
export function parserFileProblems(errors: { file: string; message: string }[]): FileReportProblem[] {
  return errors.map(({ file, message }) => {
    const m = /^Text format in (.+?) (?:\(.*?\) )?is not compl\w*tible with criteria\.? >>> ?(.*)$/s.exec(message)
    return m ? { file, section: m[1], problem: m[2].trim() || message } : { file, section: 'Report', problem: message }
  })
}
