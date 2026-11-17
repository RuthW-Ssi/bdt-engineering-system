import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import type { ShapeTestResult } from '../../api/cutting-plan-test'
import { barPieces, pieceColors, sharedPrefix, splitByMarkSet } from '../../lib/cuttingPlanTest/shapeTest'

// CP-Shape-Test, POC 2026-11-16: the cutting report for the shop floor, A4, one size per sheet. It replaces what the
// line reads today (the CutLogic PDF): the stock to prepare, each layout as a bar to scale, the marks in the order
// they are cut (the name the operator picks the NC file by). Tao 2026-11-16: no tick boxes, the table takes the full width. Printed from the browser;
// nothing is saved. Tao 2026-11-16: the words follow the CutLogic report the floor already reads (Layout n of m, Stocks,
// Rest, Length, Repeat 7x, # / Description / Length / Count), so nobody has to relearn them. Tao picked the format on a mock-up (title, logo lockup as the MO packet, colour or black and white).
export interface CutReportSize { profile: string; grade: string | null; zone?: string; kerfMm: number; result: ShapeTestResult }

const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

const CSS = `
.cr-root{position:fixed;inset:0;z-index:60;background:#E9E9E9;overflow:auto;font-family:"Noto Sans Thai",system-ui,sans-serif;color:#111}
.cr-tools{position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid #E0E0E0;padding:10px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cr-tools b{font-size:14px;font-weight:600;margin-right:auto}
.cr-seg{display:inline-flex;border:1px solid #E0E0E0;border-radius:6px;overflow:hidden}
.cr-seg button{height:32px;padding:0 12px;font-size:12px;font-weight:600;border:0;cursor:pointer;background:#fff;color:#555}
.cr-seg button[aria-pressed="true"]{background:#1F2937;color:#fff}
.cr-btn{height:32px;padding:0 14px;font-size:13px;font-weight:600;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid #C2C2C2;background:#fff;color:#1F1F1F}
.cr-btn.primary{background:#C8202A;border-color:#C8202A;color:#fff}
.cr-sheets{padding:24px;display:flex;flex-direction:column;align-items:center;gap:24px}
.cr-sheet{background:#fff;width:297mm;min-height:210mm;padding:10mm;display:flex;flex-direction:column;gap:3.5mm;font-size:9pt;line-height:1.35;box-shadow:0 1px 6px rgba(0,0,0,.25);flex-shrink:0}
.cr-portrait .cr-sheet{width:210mm;min-height:297mm}
.cr-top{display:flex;justify-content:space-between;align-items:center;gap:6mm;border-bottom:.6mm solid #111;padding-bottom:2mm}
.cr-brand{display:flex;align-items:center;gap:3mm}
.cr-brand img{height:11mm;width:auto}
.cr-brand b{display:block;font-size:10pt;font-weight:700;letter-spacing:.03em;line-height:1.2}
.cr-brand span{display:block;font-size:7.5pt;color:#555;letter-spacing:.08em}
.cr-top h2{margin:0;font-size:15pt;font-weight:700;letter-spacing:.02em;text-align:center}
.cr-size{font:600 15pt "IBM Plex Mono",ui-monospace,monospace;text-align:right}
.cr-size small{display:block;font:500 8pt "Noto Sans Thai",system-ui,sans-serif;color:#555}
.cr-meta{display:flex;gap:1mm 8mm;flex-wrap:wrap;justify-content:space-between}
.cr-meta div{display:flex;flex-direction:column}
.cr-lbl,.cr-meta span{font-size:7pt;color:#555;text-transform:uppercase;letter-spacing:.05em}
.cr-meta b{font-weight:600}
.cr-prep{border:.4mm solid #1F2937;display:flex;align-items:stretch}
.cr-prep .cr-lbl{background:#1F2937;color:#fff;padding:2mm 3mm;display:flex;align-items:center;font-size:8pt;font-weight:600}
.cr-prep ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;font:600 12pt "IBM Plex Mono",ui-monospace,monospace}
.cr-prep li{padding:2mm 6mm;border-right:.4mm solid #1F2937}
.cr-prep small{font:500 8pt "Noto Sans Thai",system-ui,sans-serif;color:#555}
.cr-lay{border:.3mm solid #111;padding:2.5mm 3mm 3mm;display:flex;flex-direction:column;gap:2mm;break-inside:avoid}
.cr-layhead{display:flex;align-items:baseline;gap:5mm;flex-wrap:wrap}
.cr-layhead .cr-no{font:700 12pt "IBM Plex Mono",ui-monospace,monospace;border:.4mm solid #C8202A;background:#C8202A;color:#fff;padding:0 2mm;display:inline-block;box-sizing:content-box;min-width:calc(var(--cr-digits,2)*1ch);text-align:center}
.cr-layhead b{font:600 12pt "IBM Plex Mono",ui-monospace,monospace}
.cr-layhead span{color:#555;font-size:8pt}
.cr-layhead .cr-scrap{margin-left:auto;color:#B45309;font-weight:600}
.cr-bar{position:relative;height:8mm;border:.4mm solid #111;overflow:hidden}
.cr-bar div{position:absolute;top:0;bottom:0;overflow:hidden;white-space:nowrap;display:flex;align-items:center;justify-content:center;font:600 9pt "IBM Plex Mono",ui-monospace,monospace}
.cr-pc{background:var(--pc);color:#fff;box-shadow:inset .3mm 0 0 #fff}
.cr-kerf{background:#111}
.cr-rest{background:repeating-linear-gradient(45deg,#fff 0 1mm,#F0B36A 1mm 1.4mm)}
.cr-dims{position:relative;height:5mm}
.cr-dims span{position:absolute;top:0;border-left:.2mm solid #555;border-right:.2mm solid #555;height:2mm}
.cr-dims span::before{content:"";position:absolute;left:0;right:0;top:1mm;border-top:.2mm solid #555}
.cr-dims i{position:absolute;top:1.6mm;transform:translateX(-50%);font:500 7.5pt "IBM Plex Mono",ui-monospace,monospace;font-style:normal;white-space:nowrap}
.cr-sheet table{border-collapse:collapse;width:100%;font-size:9pt}
.cr-sheet th{font-size:7pt;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:.3mm solid #111;padding:.6mm 2mm}
.cr-sheet td{padding:.9mm 2mm;border-bottom:.2mm solid #BDBDBD}
.cr-sheet td.cr-m{font:600 10pt "IBM Plex Mono",ui-monospace,monospace}
.cr-sheet .cr-n{text-align:right;font-variant-numeric:tabular-nums}
.cr-sheet td.cr-n{font-family:"IBM Plex Mono",ui-monospace,monospace}
.cr-sw{display:inline-block;width:2.6mm;height:2.6mm;background:var(--pc);margin-right:1.6mm;vertical-align:-.2mm}
.cr-sign{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;padding-top:6mm;break-inside:avoid}
.cr-sign div{border-top:.3mm solid #111;padding-top:1mm;font-size:7.5pt;color:#555;display:flex;justify-content:space-between}
.cr-foot{display:flex;justify-content:space-between;font-size:7pt;color:#555}
.cr-bw .cr-layhead .cr-no{background:#fff;border-color:#111;color:#111}
.cr-bw .cr-pc{background:#fff;color:#111;box-shadow:inset .3mm 0 0 #111}
.cr-bw .cr-pc.cr-alt{background:#E6E6E6}
.cr-bw .cr-rest{background:repeating-linear-gradient(45deg,#fff 0 1mm,#BDBDBD 1mm 1.4mm)}
.cr-bw .cr-layhead .cr-scrap{color:#111}
.cr-bw .cr-sw{display:none}
.cr-bw .cr-prep,.cr-bw .cr-prep .cr-lbl,.cr-bw .cr-prep li{border-color:#111}
.cr-bw .cr-prep .cr-lbl{background:#111}
@media print{
  body>*:not(.cr-root){display:none!important}
  .cr-root{position:static;overflow:visible;background:#fff}
  .cr-tools{display:none}
  .cr-sheets{padding:0;gap:0;display:block}
  .cr-sheet,.cr-portrait .cr-sheet{width:auto;min-height:0;padding:0;box-shadow:none;break-after:page}
  .cr-sheet:last-child{break-after:auto}
  .cr-root *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`

function Layout({ n, of, layout, marks, kerfMm }: { n: number; of: number; layout: CutReportSize['result']['layouts'][number]; marks: string[]; kerfMm: number }) {
  const L = layout.stockLengthMm
  const pct = (v: number) => `${(v / L) * 100}%`
  const colorOf = pieceColors(layout)
  const prefix = sharedPrefix(marks)
  const pieces = barPieces(layout, marks, kerfMm)
  const lengths = [...new Set(pieces.map(p => p.lengthMm))]
  const nested = (layout.nestMm ?? []).some(v => v > 0)
  // pieces in a row that are the same mark and length are one line of the cut order ("1–2")
  const runs: { mark: string; lengthMm: number; from: number; to: number }[] = []
  pieces.forEach((p, k) => {
    const last = runs[runs.length - 1]
    if (last && last.mark === p.mark && last.lengthMm === p.lengthMm) last.to = k + 1
    else runs.push({ mark: p.mark, lengthMm: p.lengthMm, from: k + 1, to: k + 1 })
  })
  return (
    <section className="cr-lay" data-testid={`cr-layout-${n}`}>
      <div className="cr-layhead">
        <span className="cr-no">{n}</span>
        <span>{`Layout ${n} of ${of}`}</span>
        <b>{`Length ${mm(L)}`}</b>
        <b>{`Repeat ${layout.repeat}x`}</b>
        {nested && <span>nested saddles</span>}
        <span className="cr-scrap">{`Rest ${mm(layout.restMm)}`}</span>
      </div>
      <div>
        <div className="cr-bar" role="img" aria-label={`Layout ${n}, stock ${mm(L)} mm`}>
          {pieces.map((p, k) => {
            const kerfEnd = Math.min(L, p.toMm + kerfMm, pieces[k + 1]?.fromMm ?? Infinity)
            return [
              <div key={`p${k}`} className={`cr-pc${lengths.indexOf(p.lengthMm) % 2 ? ' cr-alt' : ''}`}
                style={{ left: pct(p.fromMm), width: pct(Math.min(L, p.toMm) - p.fromMm), ['--pc' as string]: colorOf(p.lengthMm) }}>{p.mark.slice(prefix.length)}</div>,
              kerfEnd > p.toMm && <div key={`k${k}`} className="cr-kerf" style={{ left: pct(p.toMm), width: pct(kerfEnd - p.toMm) }} />,
            ]
          })}
          {layout.restMm > 0 && <div className="cr-rest" style={{ left: pct(L - layout.restMm), width: pct(layout.restMm) }} />}
        </div>
        <div className="cr-dims">
          {pieces.map((p, k) => [
            <span key={`s${k}`} style={{ left: pct(p.fromMm), width: pct(Math.min(L, p.toMm) - p.fromMm) }} />,
            <i key={`i${k}`} style={{ left: pct((p.fromMm + Math.min(L, p.toMm)) / 2) }}>{mm(p.lengthMm)}</i>,
          ])}
        </div>
      </div>
      <table>
        <thead><tr><th className="cr-n">#</th><th>Description</th><th className="cr-n">Length</th><th className="cr-n">Count</th><th className="cr-n">Total</th></tr></thead>
        <tbody>
          {runs.map((r, row) => (
            <tr key={r.from}>
              <td className="cr-n">{row + 1}</td>
              <td className="cr-m"><i className="cr-sw" style={{ ['--pc' as string]: colorOf(r.lengthMm) }} />{r.mark}</td>
              <td className="cr-n">{mm(r.lengthMm)}</td>
              <td className="cr-n">{r.to - r.from + 1}</td>
              <td className="cr-n">{((r.to - r.from + 1) * layout.repeat).toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function CutReport({ source, sizes, onClose }: { source: string; sizes: CutReportSize[]; onClose: () => void }) {
  const [portrait, setPortrait] = useState(false)
  const [colour, setColour] = useState(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const printed = new Date().toLocaleDateString('en-GB')
  return createPortal(
    <div className={`cr-root${portrait ? ' cr-portrait' : ''}${colour ? '' : ' cr-bw'}`} role="dialog" aria-label="Cutting report">
      <style>{`${CSS}@page{size:A4 ${portrait ? 'portrait' : 'landscape'};margin:10mm}`}</style>
      <div className="cr-tools">
        <b>{`Cutting report · ${sizes.length} ${sizes.length === 1 ? 'size' : 'sizes'}`}</b>
        <div className="cr-seg">
          <button aria-pressed={!portrait} onClick={() => setPortrait(false)}>A4 landscape</button>
          <button aria-pressed={portrait} onClick={() => setPortrait(true)}>A4 portrait</button>
        </div>
        <div className="cr-seg">
          <button aria-pressed={colour} onClick={() => setColour(true)}>Colour</button>
          <button aria-pressed={!colour} onClick={() => setColour(false)}>Black and white</button>
        </div>
        <button className="cr-btn primary" onClick={() => window.print()}><Printer size={14} />Print</button>
        <button className="cr-btn" onClick={onClose} aria-label="Close report"><X size={14} />Close</button>
      </div>
      <div className="cr-sheets">
        {sizes.map(s => {
          const sets = splitByMarkSet(s.result.layouts)
          const pieces = s.result.layouts.reduce((n, l) => n + l.repeat * l.pieces.reduce((a, p) => a + p.count, 0), 0)
          return (
            <article key={`${s.zone ?? ''}|${s.profile}|${s.grade ?? ''}`} className="cr-sheet" data-testid={`cr-sheet-${s.profile}`}
              style={{ ['--cr-digits' as string]: Math.max(2, String(sets.length).length) }}>{/* every layout number box as wide as the longest number */}
              <div className="cr-top">
                <div className="cr-brand">
                  <img src="/assets/logo/powerkeychain-logo.png" alt="Power Keychain logo" />
                  <div><b>SSI BUILDING TECH</b><span>POWER KEYCHAIN</span></div>
                </div>
                <h2>CUTTING REPORT SHAPE</h2>
                <div className="cr-size">{s.profile}<small>{s.grade ?? '—'}</small></div>
              </div>
              <div className="cr-meta">
                <div><span>Parts from</span><b>{source}</b></div>
                {s.zone && <div><span>Zone</span><b>{s.zone}</b></div>}
                <div><span>Kerf</span><b>{`${mm(s.kerfMm)} mm`}</b></div>
                <div><span>Parts</span><b>{pieces.toLocaleString('en-US')}</b></div>
                <div><span>Yield</span><b>{`${s.result.yieldPct.toFixed(2)}%`}</b></div>
                <div><span>Layouts</span><b>{sets.length}</b></div>
              </div>
              <div className="cr-prep">
                <span className="cr-lbl">Stocks</span>
                <ul>{s.result.stockMix.filter(x => x.pieces).map(x => <li key={x.lengthMm}>{`${mm(x.lengthMm)} × ${x.pieces.toLocaleString('en-US')}`}</li>)}</ul>
              </div>
              {sets.map((set, i) => <Layout key={i} n={i + 1} of={sets.length} layout={set.layout} marks={set.marks} kerfMm={s.kerfMm} />)}
              <div className="cr-sign">
                {['Prepared by', 'Cut by', 'Checked by'].map(who => <div key={who}><span>{who}</span><span>Date</span></div>)}
              </div>
              <div className="cr-foot"><span>BDT · CP-Shape-Test</span><span>{`Printed ${printed}`}</span></div>
            </article>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
