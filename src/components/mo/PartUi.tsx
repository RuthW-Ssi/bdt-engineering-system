// MO Part UI kit — Tailwind classes on the design tokens in src/index.css
// (ssi / chrome / molten / steel / green, shadow-card). Mirrors the existing
// MO pages: 56px white header, numbered step headings, sticky save bar.
// Keep every colour here on a token; no raw hex in MO Part components.

export const ui = {
  page: 'flex flex-col h-[calc(100vh-56px)] overflow-hidden',
  header: 'bg-white flex items-center gap-3 border-b border-chrome-100 px-6 h-14 shrink-0',
  backBtn: 'flex items-center text-chrome-600 hover:text-chrome-900',
  title: 'text-lg font-semibold text-chrome-900',
  body: 'flex-1 min-h-0 overflow-y-auto bg-chrome-50 px-5 py-4 scroll-thin',
  panel: 'bg-white border border-chrome-100 rounded-xl p-4 shadow-card mb-3',
  card: 'bg-white border border-chrome-100 rounded-lg p-3 text-xs text-chrome-800',
  label: 'text-[11px] font-bold uppercase tracking-wide text-chrome-400',
  muted: 'text-xs text-chrome-400',
  input: 'w-full border border-chrome-200 rounded-md bg-white px-2 py-1 text-xs text-chrome-900 focus:outline-none focus:border-steel-600',
  inputBad: 'w-full border border-ssi-600 rounded-md bg-ssi-50 px-2 py-1 text-xs text-chrome-900 focus:outline-none',
  select: 'w-full border border-chrome-200 rounded-md bg-white px-2 py-1.5 text-[13px] text-chrome-900 focus:outline-none focus:border-steel-600 disabled:bg-chrome-50',
  file: 'text-xs text-chrome-600 file:mr-2 file:rounded-md file:border file:border-chrome-200 file:bg-white file:px-3 file:py-1 file:text-xs file:text-chrome-800 hover:file:bg-chrome-50 disabled:opacity-50',
  table: 'w-full border-collapse',
  th: 'px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-chrome-400 bg-chrome-50 border-b border-chrome-100 whitespace-nowrap',
  thRight: 'px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-chrome-400 bg-chrome-50 border-b border-chrome-100 whitespace-nowrap',
  td: 'px-2 py-1 border-b border-chrome-50 text-xs text-chrome-800',
  tdRight: 'px-2 py-1 border-b border-chrome-50 text-xs text-chrome-800 text-right font-mono',
  tdMuted: 'px-2 py-1 border-b border-chrome-50 text-xs text-chrome-400',
  btnPrimary: 'inline-flex items-center gap-1.5 rounded-md bg-ssi-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ssi-800 disabled:bg-chrome-200 disabled:cursor-not-allowed',
  btnPrimarySm: 'inline-flex items-center gap-1.5 rounded-md bg-ssi-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ssi-800 disabled:bg-chrome-200 disabled:cursor-not-allowed',
  btnSecondary: 'inline-flex items-center gap-1.5 rounded-md border border-steel-800 bg-white px-4 py-2 text-[13px] font-semibold text-steel-800 hover:bg-steel-50 disabled:opacity-50 disabled:cursor-not-allowed',
  btnNeutral: 'inline-flex items-center gap-1.5 rounded-md border border-chrome-200 bg-white px-4 py-2 text-[13px] text-chrome-800 hover:bg-chrome-50 disabled:opacity-50',
  btnOutlineRed: 'inline-flex items-center gap-1.5 rounded-md border border-ssi-600 bg-white px-3 py-1.5 text-[13px] font-semibold text-ssi-600 hover:bg-ssi-50',
  btnAdd: 'inline-flex items-center gap-1 rounded-md border border-dashed border-chrome-200 bg-white px-2.5 py-1 text-xs text-chrome-600 hover:bg-chrome-50',
  iconBtn: 'flex text-chrome-400 hover:text-ssi-600',
  warn: 'rounded-lg border border-molten-100 bg-molten-50 px-3 py-2 text-xs text-molten-600',
  error: 'rounded-lg border border-ssi-100 bg-ssi-50 px-3 py-2 text-xs text-ssi-800',
  ok: 'text-xs font-semibold text-green-600',
  partBadge: 'text-xs bg-ssi-50 text-ssi-600 border border-ssi-100 px-2 py-0.5 rounded-full font-medium',
  prefixChip: 'font-mono text-xs font-bold text-ssi-600 bg-ssi-50 rounded px-1.5 py-px',
  saveBar: 'flex items-center justify-between border-t border-chrome-100 bg-white px-6 h-[60px] shrink-0 shadow-dropdown',
}

// Same look as MoNew's ColHead: red numbered circle + title + optional hint.
export function StepHead({ n, title, hint, right }: { n: number; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ssi-600 text-[11px] font-bold text-white">{n}</span>
      <span className="text-sm font-bold text-chrome-900">{title}</span>
      {hint && <span className="text-[11px] text-chrome-400">{hint}</span>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  )
}
