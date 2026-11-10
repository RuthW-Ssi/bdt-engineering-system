// Summary charts on the cutting-plan detail page (2026-11-07): where the plan's steel goes and how its
// plates split by thickness. Plain HTML bars (no chart library); every value is printed next to its
// mark, so colour is never the only way to read it.
import type { PlanSummary } from '../../lib/cuttingPlan/planSummary'

const BLUE = '#2a78d6' // parts, and the single thickness series
const AQUA = '#1baf7a' // remnants
const GRAY = '#C9C8C3' // scrap
const INK = '#1F1F1F', MUTED = '#8E8E8E'

const tons = (kg: number) => (kg / 1000).toLocaleString('en', { maximumFractionDigits: 1 })
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
const pctText = (p: number) => `${p.toLocaleString('en', { maximumFractionDigits: 1 })}%`
const mm = (v: number) => v.toLocaleString('en')
const plates = (count: number) => `${count.toLocaleString('en')} ${count === 1 ? 'plate' : 'plates'}`
const hours = (min: number) => (min / 60).toLocaleString('en', { maximumFractionDigits: 1 })

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px', ...style }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
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
  return (
    <Card title="Plates by thickness">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {s.byThickness.map(g => {
          const on = selected === g.thick
          const dim = selected != null && !on
          return (
            <button key={g.thick} type="button" onClick={() => onSelect(on ? null : g.thick)}
              aria-pressed={on} title={`${g.thick} mm: ${plates(g.plates)} (${pctText(pct(g.plates, s.plates))}) · ${tons(g.kg)} t · machine ${hours(g.minutes)} h — click to filter`}
              className="hover:bg-chrome-50"
              style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', alignItems: 'center', gap: 12, padding: '2px 6px', margin: '0 -6px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: on ? 700 : 600, color: dim ? MUTED : INK, textAlign: 'right', padding: '3px 0' }}>{g.thick} mm</span>
              <span style={{ height: 14, display: 'flex', alignItems: 'center', padding: '3px 0' }}>
                <span style={{ width: `${pct(g.plates, max)}%`, minWidth: 3, height: 14, borderRadius: '0 4px 4px 0', background: BLUE, opacity: dim ? 0.3 : 1 }} />
              </span>
              <span style={{ fontSize: 12, color: dim ? MUTED : INK, whiteSpace: 'nowrap' }}>
                <b>{g.plates}</b> {g.plates === 1 ? 'plate' : 'plates'} <span style={{ color: MUTED }}>({pctText(pct(g.plates, s.plates))}) · {tons(g.kg)} t · {hours(g.minutes)} h</span>
              </span>
            </button>
          )
        })}
      </div>
      {/* machine time doesn't follow weight: thin plates carry more cut length and pierces per tonne */}
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8, textAlign: 'right' }}>
        Total machine time (planned) <b style={{ color: INK }}>{hours(s.machineMin)} h</b>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
        {selected != null
          ? <>Filtering all tabs: {selected} mm · <button type="button" onClick={() => onSelect(null)} style={{ color: '#0C447C', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>Show all</button></>
          : 'Click a bar to filter the tabs below by thickness'}
      </div>
    </Card>
  )
}

// Top sizes as a plain list (people read exact sizes off it); the rest folds into one "Other" row
// that says how many sizes it holds.
interface SizeRow { key: string; label: string; value: number }
function SizeList({ rows, total, otherSizes, unit }: { rows: SizeRow[]; total: number; otherSizes: number; unit: (n: number) => string }) {
  const rest = total - rows.reduce((a, r) => a + r.value, 0)
  const line: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10, fontSize: 12, padding: '2px 0' }
  return (
    <>
      {rows.map(r => (
        <div key={r.key} style={{ ...line, color: INK }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
          <span style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 64 }}>{unit(r.value)}</span>
        </div>
      ))}
      {rest > 0 && (
        <div style={{ ...line, color: MUTED }}>
          <span>Other ({otherSizes} {otherSizes === 1 ? 'size' : 'sizes'})</span><span style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 64 }}>{unit(rest)}</span>
        </div>
      )}
    </>
  )
}

function RemnantCard({ s, scope }: { s: PlanSummary; scope: string }) {
  const top = s.remnantSizes.slice(0, 4)
  return (
    <Card title={scope ? `Remnants · ${scope}` : 'Remnants'}>
      {s.remnantPieces === 0
        ? <div style={{ fontSize: 12, color: MUTED }}>{scope ? `No remnants from ${scope} plates` : 'No remnants in this plan'}</div>
        : <>
          <div className="flex items-baseline" style={{ gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1 }}>{s.remnantPieces.toLocaleString('en')}</span>
            <span style={{ fontSize: 12, color: MUTED }}>pcs</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
            <b style={{ color: INK }}>{tons(s.remnantKg)} t</b> · {s.remnantM2.toLocaleString('en', { maximumFractionDigits: 1 })} m² · {pctText(pct(s.remnantKg, s.steelKg))} {scope ? `of ${scope} steel` : 'of total steel'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', margin: '14px 0 6px' }}>Most common ({scope ? 'W × L' : 'T × W × L'} mm)</div>
          <SizeList unit={v => `${v} pcs`} total={s.remnantPieces} otherSizes={s.remnantSizes.length - top.length}
            rows={top.map(x => ({ key: `${x.thick}x${x.width}x${x.length}`, label: `${scope ? '' : `${x.thick} × `}${mm(x.width)} × ${mm(x.length)}`, value: x.pieces }))} />
        </>}
    </Card>
  )
}

// Stock plates to pick from the store. With no thickness picked the list spans every thickness, so the
// size carries it (16 × 1,480 × 7,800); once a thickness is picked it is just width × length.
function PlateSizeCard({ s, scope }: { s: PlanSummary; scope: string }) {
  const top = s.plateSizes.slice(0, 5)
  const covered = top.reduce((a, x) => a + x.plates, 0)
  return (
    <Card title={scope ? `Stock plates · ${scope}` : 'Stock plates'}>
      <div className="flex items-baseline" style={{ gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1 }}>{s.plateSizes.length}</span>
        <span style={{ fontSize: 12, color: MUTED }}>{s.plateSizes.length === 1 ? 'size' : 'sizes'} · {plates(s.plates)}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', margin: '14px 0 6px' }}>
        Most used ({scope ? 'W × L' : 'T × W × L'} mm)
      </div>
      <SizeList unit={plates} total={s.plates} otherSizes={s.plateSizes.length - top.length}
        rows={top.map(x => ({ key: `${x.thick}x${x.width}x${x.length}`, label: `${scope ? '' : `${x.thick} × `}${mm(x.width)} × ${mm(x.length)}`, value: x.plates }))} />
      {!scope && covered < s.plates && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Pick a thickness on the left to see every size</div>
      )}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <ThicknessBars s={summary} selected={thickness} onSelect={onThickness} />
        <PlateSizeCard s={focus} scope={scope} />
        <RemnantCard s={focus} scope={scope} />
      </div>
    </div>
  )
}
