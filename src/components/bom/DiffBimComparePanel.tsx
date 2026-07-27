import { useState } from 'react'
import { Cuboid as CuboidIcon, Loader2 } from 'lucide-react'
import { BimViewport } from '../bim/BimViewport'
import { useBimModels, useBimViewerToken } from '../../hooks/useBim'
import { useDispatchDiffBimModels } from '../../hooks/useBomDispatches'
import type { DiffStatus } from '../../api/dispatches'
import { DIFF_STATUS_META } from './diffStatusMeta'
import { buildDiffColorMap, buildDiffFocusRequest } from '../../lib/bom/diffBimMatch'

interface Props {
  dispatchId: number
  projectId: number
  statusByMark: Map<string, DiffStatus>
  focusMark: string | null
}

const emptyState = (message: string) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB', gap: 8, textAlign: 'center', padding: 16 }}>
    <CuboidIcon size={28} />
    <span style={{ fontSize: 13 }}>{message}</span>
  </div>
)

const loadingState = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB' }}>
    <Loader2 size={20} className="animate-spin" />
  </div>
)

interface VersionOption {
  id: number
  version: string
}

function ModelPanel({
  modelId, version, matches, statusByMark, focusMark, label, versionOptions, onPickVersion,
}: {
  modelId: number
  version: string
  matches: Record<string, string[]>
  statusByMark: Map<string, DiffStatus>
  focusMark: string | null
  label: string
  // ≥2 versions → render a picker instead of the static version text
  versionOptions: VersionOption[] | null
  onPickVersion: (modelId: number) => void
}) {
  const { data: viewerToken } = useBimViewerToken(modelId)
  const colorMap = buildDiffColorMap(matches, statusByMark)
  const focusRequest = buildDiffFocusRequest(matches, focusMark)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 6 }}>
        <CuboidIcon size={11} />
        {versionOptions ? (
          <select
            value={modelId}
            onChange={e => onPickVersion(Number(e.target.value))}
            style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: '#1A1A1A', border: '1px solid #E0E0E0', borderRadius: 6, padding: '2px 6px', background: 'white', cursor: 'pointer' }}
          >
            {versionOptions.map(o => (
              <option key={o.id} value={o.id}>v{o.version}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }}>v{version}</span>
        )}
        {/* "older"/"newer" describes the DEFAULT pairing — once pickers are
            active the user can put any version in either slot, so the
            suffix would lie; the dropdown's version number is the truth. */}
        {!versionOptions && <span>· {label}</span>}
      </div>
      <div style={{ borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 0, minWidth: 0 }}>
        {viewerToken ? (
          <BimViewport
            key={modelId}
            urn={viewerToken.urn}
            accessToken={viewerToken.access_token}
            onSelect={() => {}}
            focusRequest={focusRequest}
            statusColorMap={colorMap}
            defaultColor={DIFF_STATUS_META.unchanged.color}
          />
        ) : loadingState}
      </div>
    </div>
  )
}

export function DiffBimComparePanel({ dispatchId, projectId, statusByMark, focusMark }: Props) {
  // Version-picker overrides — null = server default ("2 latest complete").
  const [oldModelId, setOldModelId] = useState<number | null>(null)
  const [newModelId, setNewModelId] = useState<number | null>(null)

  const { data: bimModels, isLoading } = useDispatchDiffBimModels(dispatchId, {
    oldModelId: oldModelId ?? undefined,
    newModelId: newModelId ?? undefined,
  })
  const { data: allModels } = useBimModels({ projectId })

  if (isLoading || bimModels === undefined) {
    return <div style={{ borderRadius: 12, overflow: 'hidden', height: '100%' }}>{loadingState}</div>
  }
  if (!bimModels || (!bimModels.old && !bimModels.new)) {
    return (
      <div style={{ borderRadius: 12, overflow: 'hidden', height: '100%' }}>
        {emptyState('No completed BIM model for this project yet')}
      </div>
    )
  }

  const completeModels: VersionOption[] = (allModels ?? [])
    .filter(m => m.translation_status === 'complete')
    .map(m => ({ id: m.id, version: `${m.major_version}.${m.minor_version}` }))
  // Only worth showing pickers when there's actually something to switch to.
  const versionOptions = completeModels.length >= 2 ? completeModels : null

  const { old, new: newer } = bimModels

  if (old && newer) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
        <ModelPanel
          modelId={old.model_id} version={old.version} matches={old.matches}
          statusByMark={statusByMark} focusMark={focusMark} label="older"
          versionOptions={versionOptions} onPickVersion={setOldModelId}
        />
        <ModelPanel
          modelId={newer.model_id} version={newer.version} matches={newer.matches}
          statusByMark={statusByMark} focusMark={focusMark} label="newer"
          versionOptions={versionOptions} onPickVersion={setNewModelId}
        />
      </div>
    )
  }

  // Exactly one complete model exists (today's common case) — single
  // full-height panel, still colored by diff status. Always "new" per the
  // backend contract (a lone model is never returned as "old").
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ModelPanel
        modelId={newer!.model_id} version={newer!.version} matches={newer!.matches}
        statusByMark={statusByMark} focusMark={focusMark} label="current"
        versionOptions={versionOptions} onPickVersion={setNewModelId}
      />
    </div>
  )
}
