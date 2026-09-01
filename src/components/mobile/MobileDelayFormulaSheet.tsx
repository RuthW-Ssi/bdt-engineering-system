import { MobileDelayInfoSheet } from './MobileDelayInfoSheet'
import { delayTooltipParts, DELAY_STATUS_COLOR, type DelayInfo } from '../progress/delayStatus'

interface Props {
  open: boolean
  onClose: () => void
  zoneLabel: string
  info: DelayInfo
}

// Per-zone equivalent of desktop's DelayDot hover tooltip — same
// delayTooltipParts() output (includes the exact elapsed/total formula), just
// rendered in a tap-opened sheet instead of on hover.
export function MobileDelayFormulaSheet({ open, onClose, zoneLabel, info }: Props) {
  const { label, rest } = delayTooltipParts(info)
  return (
    <MobileDelayInfoSheet open={open} onClose={onClose} title={zoneLabel}>
      <div className="text-[13.5px] leading-relaxed text-chrome-600">
        <b style={{ color: DELAY_STATUS_COLOR[info.status] }}>{label}</b> {rest}
      </div>
    </MobileDelayInfoSheet>
  )
}
