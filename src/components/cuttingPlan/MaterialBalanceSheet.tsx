import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'

// User test report 2026-11-26: the Material Balance report of a stored cutting plan (Plate and Shape tabs — the
// production side; CP-Shape-Test prints its own). One A4 sheet, printed from the browser: what was issued, and
// where it went (parts + remnants + scrap + loss), in kg and baht. Signed by the store and production.
export interface BalanceColumn { key: string; label: string; align?: 'right' }
export interface BalanceSheetProps {
  title: string // e.g. "MATERIAL BALANCE · PLATE"
  planLabel: string
  meta: { label: string; value: string }[]
  columns: BalanceColumn[]
  rows: Record<string, string>[]
  total: Record<string, string>
  notes?: string[]
  onClose: () => void
}

const CSS = `
.mb-root{position:fixed;inset:0;z-index:60;background:#E9E9E9;overflow:auto;font-family:"Noto Sans Thai",system-ui,sans-serif;color:#111}
.mb-tools{position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid #E0E0E0;padding:10px 24px;display:flex;align-items:center;gap:12px}
.mb-tools b{font-size:14px;font-weight:600;margin-right:auto}
.mb-seg{display:inline-flex;border:1px solid #E0E0E0;border-radius:6px;overflow:hidden}
.mb-seg button{height:32px;padding:0 12px;font-size:12px;font-weight:600;border:0;cursor:pointer;background:#fff;color:#555}
.mb-seg button[aria-pressed="true"]{background:#1F2937;color:#fff}
.mb-btn{height:32px;padding:0 14px;font-size:13px;font-weight:600;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid #C2C2C2;background:#fff;color:#1F1F1F}
.mb-btn.primary{background:#C8202A;border-color:#C8202A;color:#fff}
.mb-sheets{padding:24px;display:flex;justify-content:center}
.mb-sheet{background:#fff;width:297mm;min-height:210mm;padding:10mm;display:flex;flex-direction:column;gap:4mm;font-size:9pt;line-height:1.35;box-shadow:0 1px 6px rgba(0,0,0,.25)}
.mb-portrait .mb-sheet{width:210mm;min-height:297mm}
.mb-top{display:flex;justify-content:space-between;align-items:center;gap:6mm;border-bottom:.6mm solid #111;padding-bottom:2mm}
.mb-brand{display:flex;align-items:center;gap:3mm}
.mb-brand img{height:11mm;width:auto}
.mb-brand b{display:block;font-size:10pt;font-weight:700;letter-spacing:.03em}
.mb-brand span{display:block;font-size:7.5pt;color:#555;letter-spacing:.08em}
.mb-top h2{margin:0;font-size:15pt;font-weight:700;letter-spacing:.02em;text-align:center}
.mb-plan{font-size:9pt;text-align:right;max-width:70mm}
.mb-meta{display:flex;gap:2mm 8mm;flex-wrap:wrap}
.mb-meta div{display:flex;flex-direction:column}
.mb-meta span{font-size:7pt;color:#555;text-transform:uppercase;letter-spacing:.05em}
.mb-meta b{font-weight:600}
.mb-sheet table{border-collapse:collapse;width:100%;font-size:8.5pt}
.mb-sheet th{font-size:7pt;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.04em;text-align:left;border-bottom:.3mm solid #111;padding:.6mm 1.6mm}
.mb-sheet td{padding:.9mm 1.6mm;border-bottom:.2mm solid #BDBDBD;font-variant-numeric:tabular-nums}
.mb-sheet .r{text-align:right}
.mb-sheet tr.t td{font-weight:700;border-top:.3mm solid #111}
.mb-notes{font-size:7.5pt;color:#555}
.mb-sign{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;padding-top:6mm}
.mb-sign div{border-top:.3mm solid #111;padding-top:1mm;font-size:7.5pt;color:#555;display:flex;justify-content:space-between}
.mb-foot{display:flex;justify-content:space-between;font-size:7pt;color:#555}
@media print{body>*:not(.mb-root){display:none!important}.mb-root{position:static;background:#fff;overflow:visible}.mb-tools{display:none}.mb-sheets{padding:0}.mb-sheet{box-shadow:none;width:auto;min-height:auto;padding:0}}
`

export function MaterialBalanceSheet({ title, planLabel, meta, columns, rows, total, notes, onClose }: BalanceSheetProps) {
  const [portrait, setPortrait] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const printed = new Date().toLocaleDateString('en-GB')
  return createPortal(
    <div className={`mb-root${portrait ? ' mb-portrait' : ''}`} role="dialog" aria-label="Material balance">
      <style>{`${CSS}@page{size:A4 ${portrait ? 'portrait' : 'landscape'};margin:10mm}`}</style>
      <div className="mb-tools">
        <b>Material balance</b>
        <div className="mb-seg">
          <button aria-pressed={!portrait} onClick={() => setPortrait(false)}>A4 landscape</button>
          <button aria-pressed={portrait} onClick={() => setPortrait(true)}>A4 portrait</button>
        </div>
        <button className="mb-btn primary" onClick={() => window.print()}><Printer size={14} />Print</button>
        <button className="mb-btn" onClick={onClose} aria-label="Close material balance"><X size={14} />Close</button>
      </div>
      <div className="mb-sheets">
        <article className="mb-sheet">
          <div className="mb-top">
            <div className="mb-brand">
              <img src="/assets/logo/powerkeychain-logo.png" alt="Power Keychain logo" />
              <div><b>SSI BUILDING TECH</b><span>POWER KEYCHAIN</span></div>
            </div>
            <h2>{title}</h2>
            <div className="mb-plan">{planLabel}</div>
          </div>
          <div className="mb-meta">{meta.map(m => <div key={m.label}><span>{m.label}</span><b>{m.value}</b></div>)}</div>
          <table>
            <thead><tr>{columns.map(c => <th key={c.key} className={c.align === 'right' ? 'r' : undefined}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c.key} className={c.align === 'right' ? 'r' : undefined}>{r[c.key] ?? ''}</td>)}</tr>)}
              <tr className="t">{columns.map(c => <td key={c.key} className={c.align === 'right' ? 'r' : undefined}>{total[c.key] ?? ''}</td>)}</tr>
            </tbody>
          </table>
          {notes?.length ? <div className="mb-notes">{notes.map(n => <div key={n}>{n}</div>)}</div> : null}
          <div className="mb-sign">{['Issued by (store)', 'Returned by (production)', 'Checked by'].map(w => <div key={w}><span>{w}</span><span>Date</span></div>)}</div>
          <div className="mb-foot"><span>BDT · Cutting plan</span><span>{`Printed ${printed}`}</span></div>
        </article>
      </div>
    </div>,
    document.body,
  )
}
