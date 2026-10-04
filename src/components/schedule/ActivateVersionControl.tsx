import { useEffect, useRef, useState } from 'react'
import { Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import type { BoardVersion } from '../../api/schedule'
import { useActivateVersion } from '../../hooks/useSchedule'
import { describeScheduleError, versionLabel } from '../../lib/schedule'
import { BTN, BTN_GO, ERROR_BOX } from './styles'

/**
 * ★ Activate for the shown, non-active version: in-page confirm (no
 * window.confirm) → POST /schedule/versions/:id/activate. Render only for
 * users with orders:update.
 */
export function ActivateVersionControl({ version }: { version: BoardVersion }) {
  const activate = useActivateVersion()
  const [confirming, setConfirming] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const err = activate.error ? describeScheduleError(activate.error, 'Activate failed') : null

  // Closing the confirm group hands focus back to the Activate button.
  useEffect(() => {
    if (confirming || !refocus.current) return
    refocus.current = false
    btnRef.current?.focus()
  }, [confirming])

  // Not while pending: reset() would detach the observer and drop the result.
  const close = () => {
    if (activate.isPending) return
    activate.reset()
    refocus.current = true
    setConfirming(false)
  }

  const confirm = () => {
    activate.mutate(version.id, {
      onSuccess: (v) => {
        toast.success(`${v.version_code} เป็น version ที่ใช้งานแล้ว`)
        refocus.current = true
        setConfirming(false)
      },
    })
  }

  if (!confirming) {
    return (
      <button ref={btnRef} type="button" onClick={() => setConfirming(true)} className={BTN}>
        <Star size={12} />
        Activate
      </button>
    )
  }

  return (
    <div role="group" aria-label="Confirm activate" className="inline-flex items-center gap-2 flex-wrap rounded-lg border border-[#f4c9ad] bg-[#fff3ec] px-2.5 py-1.5 text-xs">
      <span>
        ตั้ง <b>{versionLabel(version)}</b> เป็น version ที่ใช้งาน?
      </span>
      <button type="button" onClick={confirm} disabled={activate.isPending} className={BTN_GO}>
        {activate.isPending && <Loader2 size={12} className="animate-spin" />}
        ยืนยัน
      </button>
      {/* focus lands on the safe choice when the group opens */}
      <button type="button" onClick={close} disabled={activate.isPending} autoFocus className={BTN}>ยกเลิก</button>
      {err && (
        <div role="alert" className={`${ERROR_BOX} basis-full`}>
          <div className="font-semibold">{err.message}</div>
          {err.reasons.length > 0 && (
            <ul className="mt-1 mb-0 pl-4 list-disc">
              {err.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
