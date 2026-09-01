import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useProgressHistory, useProgressHistoryBatch } from '../../hooks/useProjectProgress'
import type { ProgressHistoryBatch } from '../../api/projectProgress'
import { MobileHeader } from '../../components/mobile/MobileHeader'

const SOURCE_LABEL: Record<ProgressHistoryBatch['source'], string> = {
  manual_edit: 'Manual Edit', bulk_edit: 'Bulk Edit', import: 'Import', rollback: 'Rollback',
}

function sourceLabel(b: ProgressHistoryBatch): string {
  if (b.source === 'import') return `Import${b.fileName ? ` — ${b.fileName}` : ''}`
  if (b.source === 'rollback') return `Rollback of #${b.rolledBackBatchId ?? '?'}`
  return SOURCE_LABEL[b.source]
}

// Read-only mirror of desktop ProjectProgressHistory.tsx's batch list — no
// rollback action here (that's a conflict-resolution admin flow, deliberately
// out of scope for a phone screen). Tap a batch to expand its field-level
// diff via the same detail endpoint desktop uses.
function BatchCard({ code, batch }: { code: string; batch: ProgressHistoryBatch }) {
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useProgressHistoryBatch(code, expanded ? batch.id : null)

  return (
    // No overflow-hidden on this wrapper — it was only ever there to clip
    // the button's active-state background to the rounded corners (moved
    // onto the button itself below via rounded-t-xl), but on an
    // auto-height box it also silently clips any content taller than
    // whatever height the box actually resolves to, with zero visual
    // indication that anything is missing. Full-list visibility matters
    // more here than that one cosmetic corner case.
    <div className="bg-white border border-chrome-100 rounded-xl">
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center gap-3 p-3.5 text-left active:bg-chrome-50 ${expanded ? 'rounded-t-xl' : 'rounded-xl'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-chrome-900 text-[14px] truncate">{sourceLabel(batch)}</span>
            {batch.rolledBack && (
              <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-chrome-400 bg-chrome-50 border border-chrome-200 rounded px-1.5 py-0.5">
                Rolled back
              </span>
            )}
          </div>
          <div className="text-xs text-chrome-400 mt-0.5">
            {batch.createdBy} · {new Date(batch.createdAt).toLocaleString()} · {batch.affectedAssemblyCount} assemblies
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-chrome-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-chrome-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-chrome-100 p-3 pb-4 rounded-b-xl flex flex-col gap-2.5">
          {!detail ? (
            <div className="text-center py-4"><Loader2 size={16} className="animate-spin text-chrome-300 inline" /></div>
          ) : detail.changes.length === 0 ? (
            <div className="text-center text-xs text-chrome-400 py-2">No field changes in this batch</div>
          ) : (
            detail.changes.map((c, i) => (
              // break-words — a long raw field value (e.g. a full ISO
              // timestamp or a long import filename) has no natural break
              // point, which on some mobile WebViews has overflowed a
              // rounded/clipped box instead of wrapping (same class of
              // real-device-only rendering bug as the native <input
              // type=date> issue documented in MobileDateWheelPicker.tsx).
              <div key={i} className="text-xs leading-relaxed break-words flex-shrink-0">
                <span className="font-mono font-semibold text-chrome-900">{c.mark}</span>
                <span className="text-chrome-400"> · {c.field}: </span>
                <span className="text-chrome-400 line-through">{String(c.old ?? '—')}</span>
                <span className="text-chrome-300"> → </span>
                <span className="text-chrome-900 font-medium">{String(c.new ?? '—')}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function MobileProgressHistory() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { data: batches, isLoading } = useProgressHistory(code)

  return (
    <div className="h-dvh flex flex-col bg-chrome-50 overflow-hidden">
      <MobileHeader title="Progress History" onBack={() => navigate(-1)} />
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {isLoading && <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>}
        {!isLoading && !batches?.length && (
          <div className="text-center text-chrome-400 text-sm py-10">No progress changes recorded yet</div>
        )}
        {batches?.map(b => <BatchCard key={b.id} code={code!} batch={b} />)}
      </div>
    </div>
  )
}
