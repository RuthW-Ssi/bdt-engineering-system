import { useState, type CSSProperties } from 'react'
import { X, Upload, Loader2, FileText, AlertTriangle } from 'lucide-react'
import { FileDropzone } from '../bom/FileDropzone'
import { parseDrawingFileName } from '../../lib/drawingFileName'
import { classifyUpload, type ReviewStatus } from '../../lib/drawingUploadReview'
import type { Drawing } from '../../api/drawings'
import type { StagedDrawing } from '../../hooks/useDrawings'

const MAX_DRAWING_SIZE = 50_000_000 // 50MB
const MAX_FILES = 1500 // a project's worth of sheets in one go, not unbounded

interface Props {
  scopeLabel: string
  // The zone's (or sub-zone's) existing rows and active-BOM marks — both
  // feed the review table's per-file classification/warning below. Owned by
  // the caller (Task 6): this modal never fetches either itself.
  existing: Drawing[]
  bomMarks: string[]
  isUploading: boolean
  onConfirm: (items: StagedDrawing[]) => void
  onClose: () => void
}

// A row's mark/rev text boxes are free text — not yet validated — so they're
// kept as the raw strings the user sees/edits, seeded from parseDrawingFileName
// on pick. parseMarkInput/parseRevInput (below) turn them back into the
// typed mark/rev classifyUpload and onConfirm need, treating "" (and, for
// rev, anything non-integer) as missing — never a silent 0/empty guess.
interface ReviewRow {
  file: File
  mark: string
  rev: string
}

function parseMarkInput(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// 9999 matches the input's own max — a value past it is treated as missing,
// not silently clamped, so the user is prompted to fix it rather than having
// a rev they never typed get used.
const MAX_REV = 9999

function parseRevInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n > MAX_REV ? null : n
}

// Thai result copy for the review table's ผล column (design: review table
// §4). currentRev is only used by new-rev/lower-rev, where the design calls
// for showing what rev this upload is being compared against.
function resultText(status: ReviewStatus, currentRev: number | null): string {
  switch (status) {
    case 'needs-input': return '✏ กรอก mark / rev'
    case 'new-mark': return '🆕 mark ใหม่'
    case 'new-rev': return `🆕 rev ใหม่ (เดิม Rev ${currentRev})`
    case 'add-sheet': return '➕ เพิ่มแผ่น'
    case 'replace': return '♻ แทนไฟล์เดิม'
    case 'lower-rev': return `⤵ ต่ำกว่า rev ปัจจุบัน (${currentRev}) — เก็บเป็นประวัติ`
  }
}

const thStyle: CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: 0.3, background: '#FAFAFA' }
const tdStyle: CSSProperties = { padding: '6px 10px', verticalAlign: 'middle', fontSize: 13 }
const inputStyle: CSSProperties = { width: '100%', fontSize: 13, padding: '4px 6px', border: '1px solid #D0D0D0', borderRadius: 4, fontFamily: 'inherit' }

// .pdf-only as of 2026-09-15 — .dwg upload (and the Autodesk APS 2D-preview
// pipeline it used to trigger) was removed entirely: every upload was an
// unconditional billed Model Derivative job with no dedup, and a bug in the
// push path itself burned real Flex-token budget confirming that cost was
// real. See wiki/features/drawing.md's "DWG removed entirely" entry.
//
// 2026-10-20 (per-mark revision, Task 5): picking files now stages a review
// row per file instead of a bare name — each row is parsed through
// parseDrawingFileName for an initial mark/rev, editable before upload, and
// classified against the zone's existing drawings via classifyUpload so the
// user sees what an upload will do (new mark, new rev, replace a sheet, add
// a sheet, or land below the current rev) before confirming. Upload stays
// disabled while any row's mark or rev is still missing.
const BOM_TIP_TITLE = 'mark นี้ยังไม่มีใน BOM'
const BOM_TIP_BODY = 'อัปโหลด Drawing นี้ได้ตามปกติ ถ้าไม่อยากเห็นเครื่องหมายนี้ ให้อัปโหลด BOM ของโซนนี้ก่อน'

export function DrawingUploadModal({ scopeLabel, existing, bomMarks, isUploading, onConfirm, onClose }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([])
  // Hover/focus tooltip of the not-in-BOM ⚠ icon. Fixed-positioned so the
  // table's scroll box can't clip it.
  const [bomTip, setBomTip] = useState<{ x: number; y: number } | null>(null)
  const showBomTip = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setBomTip({ x: r.left + r.width / 2, y: r.bottom + 6 })
  }

  const addFiles = (files: File[]) => {
    const staged = files.map(file => {
      const { mark, rev } = parseDrawingFileName(file.name)
      return { file, mark: mark ?? '', rev: rev !== null ? String(rev) : '' }
    })
    setRows(r => [...r, ...staged])
  }

  const removeRow = (index: number) => {
    setRows(r => r.filter((_, i) => i !== index))
  }

  const patchRow = (index: number, patch: Partial<ReviewRow>) => {
    setRows(r => r.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const derived = rows.map(row => {
    const mark = parseMarkInput(row.mark)
    const rev = parseRevInput(row.rev)
    const { status, currentRev } = classifyUpload({ mark, rev, fileName: row.file.name }, existing)
    const inBom = mark !== null && bomMarks.some(m => m.toLowerCase() === mark.toLowerCase())
    return { mark, rev, status, currentRev, inBom }
  })

  const confirmDisabled = isUploading || rows.length === 0 || derived.some(d => d.status === 'needs-input')

  const handleConfirm = () => {
    if (confirmDisabled) return
    const items: StagedDrawing[] = rows.map((row, i) => ({
      file: row.file,
      fileName: row.file.name,
      mark: derived[i].mark!,
      rev: derived[i].rev!,
    }))
    onConfirm(items)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: rows.length > 0 ? 880 : 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload Drawing</span>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
            style={{ width: 28, height: 28, color: '#8E8E8E' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#8E8E8E' }}>
          {scopeLabel}
        </div>

        {rows.length > 0 && (
          <div style={{ border: '1px solid #ECECEC', borderRadius: 8, maxHeight: 320, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ไฟล์</th>
                  <th style={{ ...thStyle, width: 130 }}>Mark</th>
                  <th style={{ ...thStyle, width: 70 }}>Rev</th>
                  <th style={thStyle}>ผล</th>
                  <th style={{ ...thStyle, width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const d = derived[i]
                  return (
                    <tr key={`${row.file.name}-${i}`} style={{ borderTop: '1px solid #ECECEC' }}>
                      <td style={tdStyle}>
                        <div className="flex items-center gap-1.5">
                          <FileText size={14} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', maxWidth: 220, display: 'inline-block' }}>
                            {row.file.name}
                          </span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div className="flex items-center gap-1">
                          <input
                            value={row.mark}
                            onChange={e => patchRow(i, { mark: e.target.value })}
                            disabled={isUploading}
                            maxLength={100}
                            style={inputStyle}
                          />
                          {d.mark !== null && !d.inBom && (
                            <span
                              tabIndex={0}
                              aria-label={BOM_TIP_TITLE}
                              aria-describedby={bomTip ? 'bom-tip' : undefined}
                              onMouseEnter={e => showBomTip(e.currentTarget)}
                              onMouseLeave={() => setBomTip(null)}
                              onFocus={e => showBomTip(e.currentTarget)}
                              onBlur={() => setBomTip(null)}
                              style={{ display: 'inline-flex', flexShrink: 0, cursor: 'help', outline: 'none' }}
                            >
                              <AlertTriangle size={14} style={{ color: '#B45309' }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={0}
                          max={MAX_REV}
                          step={1}
                          value={row.rev}
                          onChange={e => patchRow(i, { rev: e.target.value })}
                          disabled={isUploading}
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>{resultText(d.status, d.currentRev)}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => removeRow(i)}
                          disabled={isUploading}
                          aria-label={`ลบไฟล์ ${row.file.name}`}
                          className="flex items-center justify-center rounded hover:bg-chrome-100 disabled:opacity-40"
                          style={{ width: 22, height: 22, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length < MAX_FILES && (
          <FileDropzone
            maxFiles={MAX_FILES}
            currentCount={rows.length}
            acceptedFormats={['.pdf']}
            maxSizeBytes={MAX_DRAWING_SIZE}
            hint="PDF · up to 50 MB each · ระบบจะปรับเป็น A3 แนวนอนให้อัตโนมัติ"
            onFilesAdded={addFiles}
            disabled={isUploading}
          />
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="disabled:opacity-40"
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}
          >
            {isUploading
              ? <><Loader2 size={13} className="animate-spin" />Uploading...</>
              : <><Upload size={13} />Upload{rows.length > 1 ? ` (${rows.length})` : ''}</>}
          </button>
        </div>
      </div>
      {bomTip && (
        <div
          id="bom-tip"
          role="tooltip"
          style={{
            position: 'fixed', left: bomTip.x, top: bomTip.y, transform: 'translateX(-50%)', zIndex: 60,
            maxWidth: 280, background: '#1F1F1F', color: 'white', fontSize: 12, lineHeight: 1.5,
            borderRadius: 6, padding: '8px 10px', boxShadow: '0 4px 8px rgba(0,0,0,0.18)', pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{BOM_TIP_TITLE}</div>
          <div>{BOM_TIP_BODY}</div>
        </div>
      )}
    </div>
  )
}
