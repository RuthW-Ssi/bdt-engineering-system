import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Package } from 'lucide-react'
import { useWeldingConfig, useSaveWeldingConfig } from '../hooks/useWelding'
import { WireConfigTable } from '../components/bom/WireConfigTable'
import type { WireCell } from '../components/bom/WireConfigTable'

export function BomWireConfig() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatchId = id ? parseInt(id) : undefined

  const { data: configData, isLoading, isError } = useWeldingConfig(dispatchId)
  const saveMutation = useSaveWeldingConfig(dispatchId!)

  const [cellState, setCellState] = useState<Map<number, WireCell>>(new Map())
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!configData || initialized.current) return
    initialized.current = true
    const m = new Map<number, WireCell>()
    for (const part of configData.parts) {
      m.set(part.part_id, { material_id: part.material_id })
    }
    setCellState(m)
  }, [configData])

  const handleCellChange = useCallback((partId: number, value: WireCell) => {
    setCellState(prev => { const next = new Map(prev); next.set(partId, value); return next })
  }, [])

  const handleRowSelect = useCallback((partId: number, checked: boolean) => {
    setSelectedRows(prev => { const next = new Set(prev); checked ? next.add(partId) : next.delete(partId); return next })
  }, [])

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedRows(checked && configData ? new Set(configData.parts.map(p => p.part_id)) : new Set())
  }, [configData])

  const handleApplyToSelected = useCallback(() => {
    if (selectedRows.size < 2 || !configData) return
    const [sourceId, ...targetIds] = [...selectedRows]
    const sourceVal = cellState.get(sourceId) ?? { material_id: null }
    setCellState(prev => {
      const next = new Map(prev)
      for (const tid of targetIds) next.set(tid, { ...sourceVal })
      return next
    })
  }, [selectedRows, cellState, configData])

  const handleClearSelected = useCallback(() => {
    if (selectedRows.size === 0) return
    if (!window.confirm(`Clear wire values for ${selectedRows.size} rows?`)) return
    setCellState(prev => {
      const next = new Map(prev)
      for (const id of selectedRows) next.set(id, { material_id: null })
      return next
    })
  }, [selectedRows])

  const handleSubmit = async () => {
    if (!dispatchId || !configData) return
    setSubmitError(null)
    const configs = configData.parts.map(p => ({
      part_id: p.part_id,
      material_id: cellState.get(p.part_id)?.material_id ?? null,
    }))
    try {
      await saveMutation.mutateAsync({ configs })
      navigate(`/bom/dispatch/${dispatchId}`)
    } catch {
      setSubmitError('Save failed — check backend')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E', fontSize: 13 }}>
        <Loader2 size={18} className="animate-spin" />Loading parts data...
      </div>
    )
  }

  if (isError || !configData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ height: 'calc(100vh - 56px)', color: '#8E8E8E' }}>
        <Package size={36} style={{ opacity: 0.2 }} />
        <div style={{ fontSize: 13 }}>Failed to load data</div>
        <button onClick={() => navigate(`/bom/dispatch/${dispatchId}`)} style={{ fontSize: 12, color: '#0C447C', textDecoration: 'underline' }}>
          Back to Detail
        </button>
      </div>
    )
  }

  const parts = configData.parts

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button
          onClick={() => navigate(`/bom/dispatch/${dispatchId}`)}
          className="flex items-center justify-center rounded hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1F1F1F', flex: 1 }}>
          Configure Welding Wire
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8E8E8E', marginLeft: 8 }}>Step 3 — {parts.length} parts</span>
        </div>
        <div style={{ fontSize: 11, color: '#8E8E8E' }}>
          {parts.filter(p => (cellState.get(p.part_id)?.material_id ?? null) !== null).length} / {parts.length} assigned
        </div>
      </div>

      {/* Toolbar */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-2 px-6" style={{ height: 44, background: '#FFF8F8', borderBottom: '1px solid #FDE8E8', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#555' }}>{selectedRows.size} rows selected</span>
          <button
            onClick={handleApplyToSelected}
            disabled={selectedRows.size < 2}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #D9D9D9', cursor: selectedRows.size < 2 ? 'default' : 'pointer', opacity: selectedRows.size < 2 ? 0.4 : 1 }}
          >
            Apply first to all
          </button>
          <button
            onClick={handleClearSelected}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #D9D9D9', cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
        <WireConfigTable
          parts={parts}
          cellState={cellState}
          onCellChange={handleCellChange}
          selectedRows={selectedRows}
          onRowSelect={handleRowSelect}
          onSelectAll={handleSelectAll}
        />
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-chrome-100 flex items-center justify-between px-6" style={{ height: 56, flexShrink: 0 }}>
        {submitError && <span style={{ fontSize: 12, color: '#C8202A' }}>{submitError}</span>}
        {!submitError && <span />}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/bom/dispatch/${dispatchId}`)}
            style={{ fontSize: 13, padding: '7px 18px', borderRadius: 6, border: '1px solid #D9D9D9', cursor: 'pointer', background: '#fff' }}
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            style={{ fontSize: 13, padding: '7px 18px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', cursor: saveMutation.isPending ? 'default' : 'pointer', opacity: saveMutation.isPending ? 0.6 : 1 }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save & Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
