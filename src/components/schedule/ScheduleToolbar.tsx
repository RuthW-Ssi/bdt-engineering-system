import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { BoardVersion } from '../../api/schedule'
import { FAMILY_COLOR, LATE_COLOR, LATE_LABEL, LEGEND, SCHEDULE_TEXT, ZOOM, versionLabel } from '../../lib/schedule'
import { BTN, CTL_LABEL } from './styles'

/** Version switcher (★ active) · late-only · zoom · reload · version actions · full op-family legend. */
export function ScheduleToolbar({
  versions,
  currentId,
  onSelectVersion,
  lateOnly,
  onLateOnly,
  pxh,
  onZoom,
  onReload,
  reloading,
  actions,
}: {
  versions: BoardVersion[]
  currentId: number | null
  onSelectVersion: (id: number) => void
  lateOnly: boolean
  onLateOnly: (v: boolean) => void
  pxh: number
  onZoom: (dir: 'in' | 'out') => void
  onReload: () => void
  reloading: boolean
  actions?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap bg-white border border-[#d8dde3] rounded-[10px] px-3 py-2.5">
      <span className={CTL_LABEL}>Version</span>
      <div role="group" aria-label="Version" className="inline-flex flex-wrap border border-[#d8dde3] rounded-lg overflow-hidden">
        {versions.length ? (
          versions.map((v) => {
            const on = v.id === currentId
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                title={v.description ?? ''}
                onClick={() => onSelectVersion(v.id)}
                className={`border-0 px-3 py-[7px] text-xs cursor-pointer ${on ? 'bg-[#e8590c] text-white' : 'bg-white text-[#1f2733] hover:bg-[#f8fafc]'}`}
              >
                {versionLabel(v)}
              </button>
            )
          })
        ) : (
          <button type="button" disabled className="border-0 bg-white px-3 py-[7px] text-xs opacity-40 cursor-not-allowed">
            {SCHEDULE_TEXT.noVersion}
          </button>
        )}
      </div>
      {actions}

      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[13px]">
        <input type="checkbox" checked={lateOnly} onChange={(e) => onLateOnly(e.target.checked)} />
        <span>เน้นงานสาย</span>
      </label>

      <span className={`${CTL_LABEL} ml-1.5`}>Zoom</span>
      <span className="inline-flex gap-1">
        {(['out', 'in'] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            aria-label={dir === 'in' ? 'Zoom in' : 'Zoom out'}
            disabled={dir === 'in' ? pxh >= ZOOM.max : pxh <= ZOOM.min}
            onClick={() => onZoom(dir)}
            className="w-7 h-7 border border-[#d8dde3] bg-white rounded-[7px] cursor-pointer font-bold text-[#1f2733] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {dir === 'in' ? '+' : '−'}
          </button>
        ))}
      </span>

      <button type="button" onClick={onReload} disabled={reloading} className={`${BTN} ml-1.5`}>
        <RefreshCw size={12} className={reloading ? 'animate-spin' : ''} />
        Reload
      </button>

      <div className="flex gap-3 flex-wrap ml-auto" aria-label="Legend">
        {LEGEND.map((l) => (
          <span key={l.family} className="inline-flex items-center gap-[5px] text-[11px] text-[#6b7682]">
            <span className="w-[13px] h-[13px] rounded-[3px] inline-block" style={{ background: FAMILY_COLOR[l.family] }} />
            {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-[5px] text-[11px] text-[#6b7682]">
          <span
            className="w-[13px] h-[13px] rounded-[3px] inline-block"
            style={{ background: LATE_COLOR.fill, outline: `2px solid ${LATE_COLOR.border}`, outlineOffset: -2 }}
          />
          {LATE_LABEL}
        </span>
      </div>
    </div>
  )
}
