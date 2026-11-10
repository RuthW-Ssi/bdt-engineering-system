import { AlertTriangle, XCircle } from 'lucide-react'
import type { CuttingPlanPreviewResult } from '../../api/cutting-plan'

interface Props {
  preview: CuttingPlanPreviewResult
  onCancel: () => void
  onConfirm: () => void
  isUploading: boolean
}

export function CuttingPlanPreviewModal({ preview, onCancel, onConfirm, isUploading }: Props) {
  const { summary, reportProblems, mappingError, fileProblems, alreadyInSystem } = preview
  const plateOf = (file: string) => file.replace(/\.txt$/i, '')
  const badPlates = new Set(reportProblems.map(p => p.file)).size
  // 2026-11-10: a plate is never saved twice. Copies are skipped at save; when every plate is a copy
  // there is nothing to save.
  const copies = alreadyInSystem.filter(p => p.sameReport).length
  const nothingToSave = summary.plateCount > 0 && copies === summary.plateCount
  const blocked = !!mappingError || fileProblems.length > 0 || reportProblems.length > 0 || nothingToSave
  const wide = reportProblems.length > 0 || alreadyInSystem.length > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onCancel() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: wide ? 640 : 480, maxHeight: '90vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F' }}>Confirm before saving</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Plates', value: summary.plateCount },
            { label: 'Parts', value: summary.partCount },
            { label: 'Plate usage', value: summary.plateUsageCount },
            { label: 'Remnants', value: summary.remnantCount },
          ].map(s => (
            <div key={s.label} style={{ border: '1px solid #E0E0E0', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1F1F1F' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#8E8E8E', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {mappingError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12, display: 'flex', gap: 10 }}>
            <XCircle size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Cannot save this upload</div>
              {mappingError}
            </div>
          </div>
        )}

        {fileProblems.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12, display: 'flex', gap: 10 }}>
            <XCircle size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Missing files: cannot save</div>
              {fileProblems.map(m => <div key={m}>{m}</div>)}
            </div>
          </div>
        )}

        {reportProblems.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
              <XCircle size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600 }}>Cannot save: {badPlates} {badPlates === 1 ? 'plate needs' : 'plates need'} fixing. Nothing was saved.</div>
                Fix these reports and upload again.
              </div>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 320, background: 'white', borderRadius: 6, border: '1px solid #FECACA' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#8E8E8E', position: 'sticky', top: 0, background: 'white' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Plate</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Section</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {reportProblems.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #FEE2E2', color: '#1F1F1F' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{plateOf(p.file)}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{p.section}</td>
                      <td style={{ padding: '6px 8px' }}>{p.problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {alreadyInSystem.length > 0 && (
          <div style={{ background: nothingToSave ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${nothingToSave ? '#FCA5A5' : '#FCD34D'}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: nothingToSave ? '#991B1B' : '#92400E', lineHeight: 1.6 }}>
              {nothingToSave ? <XCircle size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />}
              <div>
                {nothingToSave ? (
                  <>
                    <div style={{ fontWeight: 600 }}>Every plate is already in the system with the same report. Nothing to save.</div>
                    To replace a plate, export its report again from the nesting tool; a changed report is saved as the newer version.
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600 }}>{alreadyInSystem.length} of {summary.plateCount} plates are already in the system.</div>
                    A plate with the same report is not saved again; a changed report is saved as the plate's newer version.
                  </>
                )}
              </div>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 320, background: 'white', borderRadius: 6, border: `1px solid ${nothingToSave ? '#FECACA' : '#FDE68A'}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#8E8E8E', position: 'sticky', top: 0, background: 'white' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Plate</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>NC File</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>In upload</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {alreadyInSystem.map(p => (
                    <tr key={p.plate} style={{ borderTop: '1px solid #F3F4F6', color: '#1F1F1F' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{p.plate}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{p.ncFile}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>#{p.uploadId}</td>
                      <td style={{ padding: '6px 8px' }}>{p.sameReport ? 'Same report · not saved again' : 'Report changed · saved as the newer version'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2" style={{ marginTop: 8 }}>
          <button
            onClick={onCancel}
            disabled={isUploading}
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isUploading || blocked}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: 13, fontWeight: 600, color: 'white', padding: '6px 16px', borderRadius: 6, border: 'none', background: '#C8202A' }}
          >
            {isUploading ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
