import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react'
import { useProject } from '../hooks/useProjects'
import { useProgressHistory, useProgressHistoryBatch, useRollbackProgressBatch } from '../hooks/useProjectProgress'
import { ProgressDiffTable } from '../components/progress/ProgressDiffTable'
import { usePermission } from '../hooks/usePermission'
import type { ProgressHistoryBatch, ProgressRollbackConflict } from '../api/projectProgress'

const SOURCE_LABEL: Record<ProgressHistoryBatch['source'], string> = {
  manual_edit: 'Manual Edit',
  bulk_edit: 'Bulk Edit',
  import: 'Import',
  rollback: 'Rollback',
}

function sourceLabel(b: ProgressHistoryBatch): string {
  if (b.source === 'import') return `Import${b.fileName ? ` — ${b.fileName}` : ''}`
  if (b.source === 'rollback') return `Rollback of #${b.rolledBackBatchId ?? '?'}`
  return SOURCE_LABEL[b.source]
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#ABABAB', padding: '9px 12px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #EDEFF2', verticalAlign: 'middle' }
const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

function ConflictDialog({ conflicts, onCancel, onForce, busy }: { conflicts: ProgressRollbackConflict[]; onCancel: () => void; onForce: () => void; busy: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>
          {conflicts.length} field{conflicts.length === 1 ? '' : 's'} changed again since this batch
        </div>
        <div style={{ fontSize: 12.5, color: '#8E8E8E' }}>
          Rolling back will overwrite these more recent changes too.
        </div>
        <div style={{ fontSize: 12, color: '#1F1F1F', ...mono, lineHeight: 1.8, maxHeight: 200, overflowY: 'auto', background: '#FAFAFA', borderRadius: 8, padding: '8px 12px' }}>
          {conflicts.map((c, i) => (
            <div key={i}>{c.mark} · {c.field} — changed by {c.changedBy}</div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 8 }}>
          <button onClick={onCancel} disabled={busy} style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>
            Cancel
          </button>
          <button
            onClick={onForce}
            disabled={busy}
            style={{ fontSize: 13, fontWeight: 600, color: 'white', padding: '6px 16px', borderRadius: 6, border: 'none', background: '#C8202A' }}
          >
            {busy ? 'Rolling back…' : 'Roll back anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchRow({ code, batch, canUpdate, onRollback }: {
  code: string
  batch: ProgressHistoryBatch
  canUpdate: boolean
  onRollback: (batchId: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useProgressHistoryBatch(code, expanded ? batch.id : null)

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', background: expanded ? '#FAFAFA' : undefined }}>
        <td style={{ ...td, textAlign: 'center', width: 24 }}>
          {expanded ? <ChevronUp size={14} color="#8E8E8E" /> : <ChevronDown size={14} color="#8E8E8E" />}
        </td>
        <td style={{ ...td, ...mono, color: '#8E8E8E' }}>{new Date(batch.createdAt).toLocaleString()}</td>
        <td style={td}>{batch.createdBy}</td>
        <td style={{ ...td, fontWeight: 600 }}>{sourceLabel(batch)}</td>
        <td style={{ ...td, ...mono, textAlign: 'right' }}>{batch.affectedAssemblyCount}</td>
        <td style={{ ...td, textAlign: 'center' }}>
          {batch.rolledBack && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8E8E8E', background: '#F5F5F5', borderRadius: 999, padding: '2px 8px' }}>
              ROLLED BACK
            </span>
          )}
        </td>
        <td style={{ ...td, textAlign: 'center' }}>
          {canUpdate && !batch.rolledBack && batch.affectedAssemblyCount > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onRollback(batch.id) }}
              title="Roll back this batch"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C8202A', background: 'white', border: '1px solid #F3C9CB', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
            >
              <RotateCcw size={12} /> Rollback
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid #EDEFF2' }}>
            {detail ? (
              <ProgressDiffTable changes={detail.changes} emptyMessage="No field changes in this batch" />
            ) : (
              <div style={{ padding: 16, textAlign: 'center', color: '#8E8E8E', fontSize: 12.5 }}>
                <Loader2 size={14} className="animate-spin" style={{ display: 'inline' }} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function ProjectProgressHistory() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading: projectLoading } = useProject(code)
  const { data: batches, isLoading: batchesLoading } = useProgressHistory(code)
  const canUpdate = usePermission('project-tracking', 'update')
  const rollbackMutation = useRollbackProgressBatch(code)
  const [conflictState, setConflictState] = useState<{ batchId: number; conflicts: ProgressRollbackConflict[] } | null>(null)

  const attemptRollback = (batchId: number, force = false) => {
    rollbackMutation.mutate({ batchId, force }, {
      onSuccess: result => {
        if (result.conflicts.length) setConflictState({ batchId, conflicts: result.conflicts })
        else setConflictState(null)
      },
    })
  }

  if (projectLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
      </div>
    )
  }
  if (!project) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 14 }}>Project {code} not found</div>
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/projects/${code}/progress`)}
            title="Back to Progress"
            className="flex items-center justify-center rounded hover:bg-chrome-50"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 6, padding: '3px 8px' }}>
            {project.project_code}
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>{project.name}</span>
          <ChevronRight size={14} style={{ color: '#C2C2C2' }} />
          <span style={{ fontSize: 13, color: '#8E8E8E' }}>Progress History</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
        <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 24 }} />
                <th style={th}>Date</th>
                <th style={th}>User</th>
                <th style={th}>Source</th>
                <th style={{ ...th, textAlign: 'right' }}>Assemblies</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                <th style={{ ...th, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {batches?.map(b => (
                <BatchRow key={b.id} code={code!} batch={b} canUpdate={canUpdate} onRollback={attemptRollback} />
              ))}
              {!batchesLoading && !batches?.length && (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8E8E8E', padding: 28 }}>
                    No progress changes recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {batchesLoading && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
            </div>
          )}
        </div>
      </div>

      {conflictState && (
        <ConflictDialog
          conflicts={conflictState.conflicts}
          busy={rollbackMutation.isPending}
          onCancel={() => setConflictState(null)}
          onForce={() => attemptRollback(conflictState.batchId, true)}
        />
      )}
    </div>
  )
}
