import { useNavigate, useParams } from 'react-router-dom'
import { useProgressZoneRows } from '../../hooks/useProjectProgress'
import { MobileHeader } from '../../components/mobile/MobileHeader'
import { MobileProgressFormFields } from '../../components/mobile/MobileProgressFormFields'

export function MobileProgressForm() {
  const { code, zoneId, assemblyId } = useParams<{ code: string; zoneId: string; assemblyId: string }>()
  const navigate = useNavigate()
  const { data: rows, isLoading } = useProgressZoneRows(code, zoneId ? Number(zoneId) : null)
  const row = rows?.find(r => r.assembly_id === Number(assemblyId)) ?? null

  if (isLoading || !row) {
    return (
      <div className="min-h-screen bg-chrome-50 flex flex-col">
        <MobileHeader title="Loading…" onBack={() => navigate(-1)} />
        <div className="text-center text-chrome-400 text-sm py-10">Loading…</div>
      </div>
    )
  }

  return (
    // Bottom padding must clear the fixed Save bar's real height, which
    // varies with env(safe-area-inset-bottom) (the home-indicator area on
    // notched phones) — a flat px value undershot that on real devices and
    // left Claimed/Delivered + Erection fields hidden behind the button.
    // overflow-x-hidden (not overflow-hidden — the page still needs to
    // scroll vertically) is a backstop against native <input type="date">
    // rendering wider than its box on some devices/WebViews — if a widget
    // still won't shrink to maxWidth:100%, this clips the excess instead of
    // letting it drag the rest of the page out of alignment horizontally.
    <div
      className="min-h-screen bg-chrome-50 flex flex-col overflow-x-hidden"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      <MobileHeader title={row.mark} subtitle={`Qty ${row.qty ?? 1}`} onBack={() => navigate(-1)} />
      <MobileProgressFormFields code={code!} row={row} variant="page" onSaved={() => navigate(-1)} />
    </div>
  )
}
