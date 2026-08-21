import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Upload, Trash2, Download, FileText, Loader2, RefreshCw } from 'lucide-react'
import { useProducts, useProduct } from '../hooks/useProducts'
import { useProductDrawings, useUploadDrawing, useDeleteDrawing } from '../hooks/useDrawings'
import { downloadDrawing, type Drawing } from '../api/drawings'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { DrawingUploadModal } from '../components/drawings/DrawingUploadModal'

export function DrawingList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const confirm = useConfirm()

  // useProducts' filter param is `q` (see ProductList.tsx), not `search`.
  const { data: productsData } = useProducts({ q: search || undefined, limit: 10 })
  const products = productsData?.items ?? []

  // Resolved directly via GET /products/:product_code, independent of the
  // search box's current contents — `selectProduct` clears `search` right
  // after picking a result, and a page reload starts with `search === ''`,
  // so deriving the selection from the live search results would silently
  // fail for any product not in that moment's unfiltered top-10.
  const productCode = searchParams.get('product_code') ?? ''
  const { data: selectedProduct } = useProduct(productCode)
  const productId = selectedProduct?.id

  const { data: drawingsList = [], isLoading: drawingsLoading, isError: drawingsError, refetch } = useProductDrawings(productId)
  const uploadDrawingMutation = useUploadDrawing(productId)
  const deleteDrawingMutation = useDeleteDrawing(productId)

  const selectProduct = (product: { product_code: string }) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('product_code', product.product_code)
      return next
    })
    setSearch('')
  }

  const clearProduct = () => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    next.delete('product_code')
    return next
  })

  const handleDelete = async (dwg: Drawing) => {
    const ok = await confirm({ title: `Delete "${dwg.file_name}"?`, message: 'This cannot be undone', variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    deleteDrawingMutation.mutate(dwg.id)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Drawings</span>
          {selectedProduct && (
            <>
              <span style={{ color: '#C2C2C2' }}>·</span>
              <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
                {drawingsList.length} drawing{drawingsList.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={!selectedProduct}
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            disabled={!selectedProduct}
            title={!selectedProduct ? 'Search for a product above first' : undefined}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}
          >
            <Upload size={14} />Upload Drawing
          </button>
        </div>
      </div>

      {/* ── Filter bar — product picker ──────────────────────────── */}
      <div className="flex items-center gap-2 px-6 border-b border-chrome-100" style={{ height: 44, background: '#F5F5F5', flexShrink: 0 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 280 }}
            placeholder="Search product by code or name..."
            value={selectedProduct ? `${selectedProduct.product_code} — ${selectedProduct.name}` : search}
            onChange={e => { setSearch(e.target.value); clearProduct() }}
          />
          {search && !selectedProduct && products.length > 0 && (
            <div className="border border-chrome-100" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: 6, marginTop: 4, zIndex: 10, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              {products.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  className="hover:bg-chrome-50"
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <span className="font-mono" style={{ fontWeight: 600, color: '#0C447C' }}>{p.product_code}</span>{' '}
                  <span style={{ color: '#8E8E8E' }}>—</span> {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedProduct && (
          <button onClick={clearProduct} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>
            Change product
          </button>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        {!selectedProduct && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
            <FileText size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>Search for a product above to view or upload its drawings</div>
          </div>
        )}

        {selectedProduct && drawingsLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E' }}>
            <Loader2 size={20} className="animate-spin" />Loading...
          </div>
        )}
        {selectedProduct && drawingsError && !drawingsLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            Failed to load drawings — please try again
          </div>
        )}
        {selectedProduct && !drawingsLoading && !drawingsError && drawingsList.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
            <FileText size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>No drawings uploaded for {selectedProduct.product_code} yet</div>
          </div>
        )}
        {selectedProduct && !drawingsLoading && !drawingsError && drawingsList.length > 0 && (
          <div className="bg-white rounded-lg border border-chrome-100" style={{ overflow: 'hidden', maxWidth: 860 }}>
            {drawingsList.map(dwg => (
              <div
                key={dwg.id}
                className="flex items-center gap-3 border-b border-chrome-100 hover:bg-chrome-50"
                style={{ padding: '12px 16px' }}
              >
                <FileText size={16} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#1F1F1F', flex: 1 }}>{dwg.file_name}</span>
                <span style={{ fontSize: 11, color: '#8E8E8E' }}>{dwg.mime_type ?? 'unknown type'}</span>
                <span style={{ fontSize: 11, color: '#8E8E8E' }}>{new Date(dwg.create_date).toLocaleDateString()}</span>
                <button
                  onClick={() => downloadDrawing(dwg.file_key, dwg.file_name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', display: 'flex', alignItems: 'center' }}
                >
                  <Download size={15} />
                </button>
                <button
                  onClick={() => handleDelete(dwg)}
                  disabled={deleteDrawingMutation.isPending}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex', alignItems: 'center' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUploadModal && selectedProduct && (
        <DrawingUploadModal
          productLabel={`${selectedProduct.product_code} — ${selectedProduct.name}`}
          isUploading={uploadDrawingMutation.isPending}
          onFileConfirmed={file => uploadDrawingMutation.mutate(file, { onSuccess: () => setShowUploadModal(false) })}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  )
}
