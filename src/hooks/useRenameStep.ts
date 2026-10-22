import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { dispatchesApi } from '../api/dispatches'
import { usePermission } from './usePermission'

/** After a BOM upload (2026-10-21, spec open item 1 → a step right after save):
 *  if any mark/part disappeared, open the pairing dialog; otherwise carry on.
 *  Never blocks — pairing can still be done later on the BOM version page. */
export function useRenameStep() {
  const qc = useQueryClient()
  const [dispatchId, setDispatchId] = useState<number | null>(null)
  // pairing overwrites progress/paint → needs boms:update, not just the upload's boms:create
  const canPair = usePermission('boms', 'update')
  async function afterUpload(id: number): Promise<boolean> {
    if (!canPair) return false
    try {
      const c = await dispatchesApi.getRenameCandidates(id)
      // the dialog reads this same query — seed it so it doesn't GET it again
      qc.setQueryData(['rename-candidates', id], c)
      if (c.latest && c.assemblies.length + c.parts.length > 0) { setDispatchId(id); return true }
    } catch {
      toast.info('ตรวจชื่อที่หายไปไม่สำเร็จ — จับคู่ชื่อทีหลังได้ที่หน้า BOM version')
    }
    return false
  }
  return { dispatchId, afterUpload, close: () => setDispatchId(null) }
}
