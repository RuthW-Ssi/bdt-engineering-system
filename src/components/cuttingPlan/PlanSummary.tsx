// Summary charts on the cutting-plan detail page (2026-11-07): where the plan's steel goes and how its
// plates split by thickness. Plain HTML bars (no chart library); every value is printed next to its
// mark, so colour is never the only way to read it.
import { useState } from 'react'
import type { PlanSummary } from '../../lib/cuttingPlan/planSummary'

export const BLUE = '#2a78d6' // parts, and the single thickness series
const AQUA = '#1baf7a' // remnants
export const GRAY = '#C9C8C3' // scrap
export const INK = '#1F1F1F', MUTED = '#8E8E8E'

const tons = (kg: number) => (kg / 1000).toLocaleString('en', { maximumFractionDigits: 1 })
export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
export const pctText = (p: number) => `${p.toLocaleString('en', { maximumFractionDigits: 1 })}%`
const mm = (v: number) => v.toLocaleString('en')
const plates = (count: number) => `${count.toLocaleString('en')} ${count === 1 ? 'plate' : 'plates'}`
const hours = (min: number) => (min / 60).toLocaleString('en', { maximumFractionDigits: 1 })

// fill = a card in a SideColumn: grows to take its share of the column's height
export function Card({ title, children, style, fill }: { title: string; children: React.ReactNode; style?: React.CSSProperties; fill?: boolean }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px', ...(fill && { flex: '1 1 auto' }), ...style }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

// The column beside a chart (Tao 2026-11-11): the grid row stretches both sides to the taller one, so the chart
// and this column are always the same height; each side folds and unfolds with its own "Show all".
export function SideColumn({ testId, children }: { testId: string; children: React.ReactNode }) {
  return <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
}

// Long charts show the first rows, then a "Show all" link (2026-11-11: 12 thicknesses stretched the cards beside them)
export const ROW_CAP = 10
export const BAR_SPAN = 0.6 // the longest bar takes 60% of the row, so its number always fits right after it
export function ShowAll({ total, noun, open, onToggle }: { total: number; noun: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      style={{ marginTop: 6, color: '#0C447C', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>
      {open ? 'Show fewer' : `Show all ${total} ${noun}`}
    </button>
  )
}

// scope = '' for the whole plan, or the picked thickness ('6 mm')
function SteelBar({ s, scope }: { s: PlanSummary; scope: string }) {
  const segs = [
    { label: 'Parts', kg: s.partsKg, color: BLUE, note: 'plate weight × nesting %' },
    { label: 'Remnants (reusable)', kg: s.remnantKg, color: AQUA, note: 'rest of the sheet, from the Remnants tab' },
    { label: 'Scrap', kg: s.scrapKg, color: GRAY, note: 'gross − net of the nested area' },
  ].filter(x => x.kg > 0)
  return (
    <Card title={`${scope ? `Steel · ${scope}` : 'Total steel'} · ${tons(s.steelKg)} t · ${plates(s.plates)}`}>
      <div role="img" aria-label={`Steel breakdown${scope ? ` · ${scope}` : ""}`} style={{ display: 'flex', gap: 2, height: 14 }}>
        {segs.map((x, i) => (
          <div key={x.label} title={`${x.label}: ${tons(x.kg)} t (${pctText(pct(x.kg, s.steelKg))}) · ${x.note}`}
            style={{
              width: `${pct(x.kg, s.steelKg)}%`, minWidth: 3, background: x.color,
              borderRadius: `${i === 0 ? 4 : 0}px ${i === segs.length - 1 ? 4 : 0}px ${i === segs.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
            }} />
        ))}
      </div>
      <div className="flex flex-wrap" style={{ gap: '6px 24px', marginTop: 10, fontSize: 12 }}>
        {segs.map(x => (
          <span key={x.label} className="inline-flex items-center" style={{ gap: 6, color: MUTED }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: x.color }} />
            {x.label}
            <b style={{ color: INK }}>{tons(x.kg)} t</b>
            <span>({pctText(pct(x.kg, s.steelKg))})</span>
          </span>
        ))}
      </div>
    </Card>
  )
}

function ThicknessBars({ s, selected, onSelect }: { s: PlanSummary; selected: number | null; onSelect: (t: number | null) => void }) {
  const max = Math.max(1, ...s.byThickness.map(g => g.plates))
  const [all, setAll] = useState(false)
  const capped = !all && s.byThickness.length > ROW_CAP
  // a picked thickness past the cap stays on screen
  const rows = capped ? s.byThickness.filter((g, i) => i < ROW_CAP || g.thick === selected) : s.byThickness
  return (
    <Card title="Plates by thickness">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(g => {
          const on = selected === g.thick
          const dim = selected != null && !on
          return (
            <button key={g.thick} type="button" onClick={() => onSelect(on ? null : g.thick)}
              aria-pressed={on} title={`${g.thick} mm: ${plates(g.plates)} (${pctText(pct(g.plates, s.plates))}) · ${tons(g.kg)} t · machine ${hours(g.minutes)} h — click to filter`}
              className="hover:bg-chrome-50"
              style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', alignItems: 'center', gap: 12, padding: '2px 6px', margin: '0 -6px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: on ? 700 : 600, color: dim ? MUTED : INK, textAlign: 'right', padding: '3px 0' }}>{g.thick} mm</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', minWidth: 0 }}>
                <span style={{ width: `${pct(g.plates, max) * BAR_SPAN}%`, minWidth: 3, height: 14, flexShrink: 0, borderRadius: '0 4px 4px 0', background: BLUE, opacity: dim ? 0.3 : 1 }} />
              <span style={{ fontSize: 12, color: dim ? MUTED : INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <b>{g.plates}</b> {g.plates === 1 ? 'plate' : 'plates'} <span style={{ color: MUTED }}>({pctText(pct(g.plates, s.plates))}) · {tons(g.kg)} t · {hours(g.minutes)} h</span>
              </span>
              </span>
            </button>
          )
        })}
      </div>
      {s.byThickness.length > ROW_CAP && <ShowAll total={s.byThickness.length} noun="thicknesses" open={all} onToggle={() => setAll(v => !v)} />}
      {/* machine time doesn't follow weight: thin plates carry more cut length and pierces per tonne */}
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8, textAlign: 'right' }}>
        Total machine time (planned) <b style={{ color: INK }}>{hours(s.machineMin)} h</b>
      </div>
      {selected != null && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          Filtering all tabs: {selected} mm · <button type="button" onClick={() => onSelect(null)} style={{ color: '#0C447C', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>Show all</button>
        </div>
      )}
    </Card>
  )
}

// Top sizes as a plain list (people read exact sizes off it); "Show all" under it lists the rest
// (Tao 2026-11-11: no "Other (n sizes)" row).
interface SizeRow { key: string; label: string; value: number }
function SizeList({ rows, unit }: { rows: SizeRow[]; unit: (n: number) => string }) {
  const line: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10, fontSize: 12, padding: '2px 0' }
  return (
    <>
      {rows.map(r => (
        <div key={r.key} style={{ ...line, color: INK }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
          <span style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 64 }}>{unit(r.value)}</span>
        </div>
      ))}
    </>
  )
}

function RemnantCard({ s, scope }: { s: PlanSummary; scope: string }) {
  const [all, setAll] = useState(false)
  const top = all ? s.remnantSizes : s.remnantSizes.slice(0, 4)
  return (
    <Card fill title={scope ? `Remnants · ${scope}` : 'Remnants'}>
      {s.remnantPieces === 0
        ? <div style={{ fontSize: 12, color: MUTED }}>{scope ? `No remnants from ${scope} plates` : 'No remnants in this plan'}</div>
        : <>
          <div className="flex flex-wrap items-baseline" style={{ gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1 }}>{s.remnantPieces.toLocaleString('en')}</span>
            <span style={{ fontSize: 12, color: MUTED }}>
              pcs · <b style={{ color: INK }}>{tons(s.remnantKg)} t</b> · {s.remnantM2.toLocaleString('en', { maximumFractionDigits: 1 })} m² · {pctText(pct(s.remnantKg, s.steelKg))} {scope ? `of ${scope} steel` : 'of total steel'}
            </span>
          </div>
          <div style={{ height: 14 }} />
          <SizeList unit={v => `${v} pcs`}
            rows={top.map(x => ({ key: `${x.thick}x${x.width}x${x.length}`, label: `${scope ? '' : `${x.thick} × `}${mm(x.width)} × ${mm(x.length)}`, value: x.pieces }))} />
          {s.remnantSizes.length > 4 && <ShowAll total={s.remnantSizes.length} noun="sizes" open={all} onToggle={() => setAll(v => !v)} />}
        </>}
    </Card>
  )
}

// Stock plates to pick from the store. With no thickness picked the list spans every thickness, so the
// size carries it (16 × 1,480 × 7,800); once a thickness is picked it is just width × length.
function PlateSizeCard({ s, scope }: { s: PlanSummary; scope: string }) {
  const [all, setAll] = useState(false)
  const top = all ? s.plateSizes : s.plateSizes.slice(0, 5)
  return (
    <Card fill title={scope ? `Stock plates · ${scope}` : 'Stock plates'}>
      <div className="flex items-baseline" style={{ gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1 }}>{s.plateSizes.length}</span>
        <span style={{ fontSize: 12, color: MUTED }}>{s.plateSizes.length === 1 ? 'size' : 'sizes'} · {plates(s.plates)}</span>
      </div>
      <div style={{ height: 14 }} />
      <SizeList unit={plates}
        rows={top.map(x => ({ key: `${x.thick}x${x.width}x${x.length}`, label: `${scope ? '' : `${x.thick} × `}${mm(x.width)} × ${mm(x.length)}`, value: x.plates }))} />
      {s.plateSizes.length > 5 && <ShowAll total={s.plateSizes.length} noun="sizes" open={all} onToggle={() => setAll(v => !v)} />}
    </Card>
  )
}

// summary = whole plan (the thickness chart always shows every thickness so you can switch);
// focus = the picked thickness only, or the whole plan when none is picked.
export function PlanSummaryCharts({ summary, focus, thickness, onThickness }: {
  summary: PlanSummary
  focus: PlanSummary
  thickness: number | null
  onThickness: (t: number | null) => void
}) {
  const scope = thickness == null ? '' : `${thickness} mm`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
      <SteelBar s={focus} scope={scope} />
      {/* the two lists stack beside the chart and share its height */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 12 }}>
        <ThicknessBars s={summary} selected={thickness} onSelect={onThickness} />
        <SideColumn testId="summary-side">
          <PlateSizeCard s={focus} scope={scope} />
          <RemnantCard s={focus} scope={scope} />
        </SideColumn>
      </div>
    </div>
  )
}
