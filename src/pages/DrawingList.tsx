import { useState } from 'react'
import { useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Upload, Trash2, Download, FileText, Loader2 } from 'lucide-react'
import { useProducts } from '../hooks/useProducts'
import { useProductDrawings, useUploadDrawing, useDeleteDrawing } from '../hooks/useDrawings'
import { downloadDrawing } from '../api/drawings'

export function DrawingList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const productId = searchParams.get('product_id') ? Number(searchParams.get('product_id')) : undefined
  // useProducts' filter param is `q` (see ProductList.tsx), not `search`.
  const { data: productsData } = useProducts({ q: search || undefined, limit: 10 })
  const products = productsData?.items ?? []
  const selectedProduct = products.find(p => p.id === productId)

  const { data: drawingsList = [], isLoading: drawingsLoading } = useProductDrawings(productId)
  const uploadDrawingMutation = useUploadDrawing(productId)
  const deleteDrawingMutation = useDeleteDrawing(productId)

  const selectProduct = (id: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('product_id', String(id))
      return next
    })
    setSearch('')
  }

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Drawings</h1>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#8E8E8E' }} />
        <input
          value={selectedProduct ? `${selectedProduct.product_code} — ${selectedProduct.name}` : search}
          onChange={e => { setSearch(e.target.value); setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('product_id'); return n }) }}
          placeholder="Search product by code or name..."
          style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 6, border: '1px solid #E0E0E0', fontSize: 13 }}
        />
        {search && !selectedProduct && products.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #E0E0E0', borderRadius: 6, marginTop: 4, zIndex: 10, maxHeight: 240, overflowY: 'auto' }}>
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => selectProduct(p.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <span className="font-mono" style={{ fontWeight: 600 }}>{p.product_code}</span> — {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!selectedProduct && (
        <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
          <FileText size={32} style={{ opacity: 0.3 }} />
          <div style={{ fontSize: 13 }}>Search for a product above to view or upload its drawings</div>
        </div>
      )}

      {selectedProduct && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#8E8E8E' }}>{drawingsList.length} drawing{drawingsList.length === 1 ? '' : 's'}</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadDrawingMutation.isPending}
              className="flex items-center gap-1.5"
              style={{
                background: '#0C447C', color: 'white', border: 'none', borderRadius: 6,
                padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: uploadDrawingMutation.isPending ? 0.6 : 1,
              }}
            >
              <Upload size={15} />{uploadDrawingMutation.isPending ? 'Uploading...' : 'Upload Drawing'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) uploadDrawingMutation.mutate(file)
                e.target.value = ''
              }}
            />
          </div>

          {drawingsLoading && (
            <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E' }}>
              <Loader2 size={20} className="animate-spin" />Loading...
            </div>
          )}
          {!drawingsLoading && drawingsList.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
              <FileText size={32} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: 13 }}>No drawings uploaded for {selectedProduct.product_code} yet</div>
            </div>
          )}
          {!drawingsLoading && drawingsList.length > 0 && (
            <div className="bg-white rounded-lg border border-chrome-100" style={{ overflow: 'hidden' }}>
              {drawingsList.map(dwg => (
                <div
                  key={dwg.id}
                  className="flex items-center gap-3 border-b border-chrome-100"
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
                    onClick={() => deleteDrawingMutation.mutate(dwg.id)}
                    disabled={deleteDrawingMutation.isPending}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex', alignItems: 'center' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
