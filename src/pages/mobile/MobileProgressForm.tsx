import { Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProgressZoneRows, useDeletePlaceholderAssembly } from '../../hooks/useProjectProgress'
import { MobileHeader } from '../../components/mobile/MobileHeader'
import { MobileProgressFormFields } from '../../components/mobile/MobileProgressFormFields'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { usePermission } from '../../hooks/usePermission'

export function MobileProgressForm() {
  const { code, zoneId, assemblyId } = useParams<{ code: string; zoneId: string; assemblyId: string }>()
  const navigate = useNavigate()
  const { data: rows, isLoading } = useProgressZoneRows(code, zoneId ? Number(zoneId) : null)
  const row = rows?.find(r => r.assembly_id === Number(assemblyId)) ?? null
  const canUpdate = usePermission('project-tracking', 'update')
  const confirm = useConfirm()
  const deleteMutation = useDeletePlaceholderAssembly(code)

  const handleDelete = async () => {
    if (!row) return
    const ok = await confirm({
      title: `Delete ${row.mark}?`,
      message: 'Removes this assembly from Pending BOM. Any progress entered for it is discarded and cannot be recovered.',
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    deleteMutation.mutate(row.assembly_id, { onSuccess: () => navigate(-1) })
  }

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
      <MobileHeader
        title={row.mark}
        subtitle={row.is_placeholder ? 'Pending BOM' : `Qty ${row.qty ?? 1}`}
        onBack={() => navigate(-1)}
      />
      {/* Delete only ever applies to placeholder (Pending BOM) assemblies —
          a real BOM assembly is managed by BOM upload/re-upload, never
          manually removable here. Same soft-delete + confirm-every-time
          behavior as the desktop table's row-level delete button. */}
      {row.is_placeholder && canUpdate && (
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="flex items-center gap-1.5 mx-4 mt-3 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-medium active:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={14} />
          {deleteMutation.isPending ? 'Deleting…' : 'Delete this assembly'}
        </button>
      )}
      <MobileProgressFormFields code={code!} row={row} variant="page" onSaved={() => navigate(-1)} />
    </div>
  )
}
