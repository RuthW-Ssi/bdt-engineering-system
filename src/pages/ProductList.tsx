import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight, Loader2, Archive, Pencil, ExternalLink, RotateCcw, Trash2 } from 'lucide-react'
import { useProducts } from '../hooks/useProducts'
import { useLibraryEntries, useUpdateLibraryEntry, useDeleteLibraryEntry, useHardDeleteLibraryEntry } from '../hooks/useLibrary'
import { useProjects } from '../hooks/useProjects'
import { ProductStatePill } from '../components/product/ProductStatePill'
import { NewStandardProductModal } from '../components/product/NewStandardProductModal'
import { NewCustomProductModal } from '../components/product/NewCustomProductModal'
import { AddLibraryEntryModal } from '../components/product/AddLibraryEntryModal'
import { EditLibraryEntryModal } from '../components/product/EditLibraryEntryModal'
import type { ProductDTO, ProductType, ProductState, LibraryEntryDTO } from '../api/types'
import { PRODUCT_STATE_LABELS, PRODUCT_STATE_COLORS } from '../api/types'

const STATES: ProductState[] = ['draft', 'in_design', 'in_review', 'approved', 'released', 'obsolete']
const PAGE_SIZE = 20

const PREFIX_CATEGORY_CHIP: Record<string, { label: string; color: string }> = {
  main_structure:      { label: 'Main Structure',      color: '#991B1B' },
  secondary_structure: { label: 'Secondary Structure', color: '#0C447C' },
  accessory:           { label: 'Accessory',           color: '#374151' },
  building_component:  { label: 'Building Component',  color: '#166534' },
}

const PREFIX_CATEGORY_LABELS: Record<string, string> = {
  main_structure: 'Main Structure',
  secondary_structure: 'Secondary Structure',
  accessory: 'Accessory',
  building_component: 'Building Component',
}

export function ProductList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = (searchParams.get('tab') as ProductType) || 'library'
  const stateFilter = searchParams.get('state') || ''
  const searchQ = searchParams.get('q') || ''
  const projectFilter = searchParams.get('project_id') || ''
  const pageParam = parseInt(searchParams.get('page') || '1')

  const [showModal, setShowModal] = useState<'standard' | 'custom' | 'library' | null>(null)
  const [renameEntry, setRenameEntry] = useState<LibraryEntryDTO | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []

  const { data, isLoading, isError } = useProducts({
    product_type: tab as 'standard' | 'custom',
    state: stateFilter || undefined,
    q: searchQ || undefined,
    project_id: projectFilter ? parseInt(projectFilter) : undefined,
    page: pageParam,
    limit: PAGE_SIZE,
  }, tab !== 'library')

  const { data: libData, isLoading: libLoading, isError: libError } = useLibraryEntries({
    q: searchQ || undefined,
    active: showArchived ? false : true,
    page: pageParam,
    limit: PAGE_SIZE,
  })

  const items: ProductDTO[] = data?.items ?? []
  const total = tab === 'library' ? (libData?.total ?? 0) : (data?.total ?? 0)
  const totalPages = tab === 'library' ? (libData?.pages ?? 1) : (data?.pages ?? 1)
  const libItems: LibraryEntryDTO[] = libData?.items ?? []

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== 'page') p.set('page', '1')
    setSearchParams(p)
  }

  const markDisplay = (p: ProductDTO) => {
    const sMark = p.attributes?.sMark
    if (sMark && typeof sMark === 'string') return sMark
    const parts = [p.erection_zone?.code, p.mark_prefix, p.mark_number].filter(Boolean)
    return parts.join('-') || '-'
  }

  const isLibLoading = tab === 'library' ? libLoading : isLoading

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Engineer Products</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLibLoading ? '...' : `${total} items`}
          </span>
        </div>
        {tab === 'library' ? (
          <button onClick={() => setShowModal('library')} className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}>
            <Plus size={14} />Add Library Entry
          </button>
        ) : (
          <button onClick={() => setShowModal(tab)} className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: tab === 'standard' ? '#0C447C' : '#B45309' }}>
            <Plus size={14} />Add {tab === 'standard' ? 'Standard' : 'Custom'} Product
          </button>
        )}
      </div>

      {/* Tabs + Filters */}
      <div className="border-b border-chrome-100" style={{ background: '#F5F5F5', flexShrink: 0 }}>
        {/* Type tabs */}
        <div className="flex px-6" style={{ borderBottom: '1px solid #E0E0E0' }}>
          {(['library', 'standard', 'custom'] as ProductType[]).map(t => {
            const color = t === 'library' ? '#065F46' : t === 'standard' ? '#0C447C' : '#B45309'
            const label = t === 'library' ? 'Product Library' : t === 'standard' ? 'Standard' : 'Custom'
            return (
              <button key={t} onClick={() => setParam('tab', t)}
                style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? color : '#8E8E8E',
                  borderBottom: `2px solid ${tab === t ? color : 'transparent'}`,
                }}>
                {label}
              </button>
            )
          })}
        </div>

        {/* Search + State filter */}
        <div className="flex items-center gap-2 px-6" style={{ height: 44, borderBottom: '1px solid #E0E0E0' }}>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
              style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
              placeholder={tab === 'library' ? 'Search code / name...' : 'Search code / name...'}
              value={searchQ} onChange={e => setParam('q', e.target.value)} />
          </div>
          {tab === 'custom' && (
            <select className="border border-chrome-200 rounded-md bg-white focus:outline-none"
              style={{ height: 32, padding: '0 8px', fontSize: 12, borderColor: projectFilter ? '#B45309' : '#E0E0E0', minWidth: 160 }}
              value={projectFilter} onChange={e => setParam('project_id', e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
            </select>
          )}
          {(stateFilter || searchQ || projectFilter) && (
            <button onClick={() => { setParam('state', ''); setParam('q', ''); setParam('project_id', '') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>Clear filters</button>
          )}
          <span className="flex-1" />
          {tab === 'library' && (
            <button
              onClick={() => { setShowArchived(v => !v); setParam('page', '1') }}
              className="flex items-center gap-1.5 rounded-md border transition-colors"
              style={{
                height: 32, padding: '0 12px', fontSize: 12, fontWeight: 500,
                background: showArchived ? '#F5F5F5' : 'white',
                color: showArchived ? '#555' : '#8E8E8E',
                borderColor: showArchived ? '#8E8E8E' : '#E0E0E0',
              }}>
              <Archive size={12} />
              {showArchived ? 'Archived' : 'Show Archived'}
            </button>
          )}
          {!isLibLoading && <span style={{ fontSize: 12, color: '#8E8E8E' }}>Page {pageParam} / {totalPages} · {total} items</span>}
        </div>

        {/* State chips — hidden on library tab */}
        {tab !== 'library' && (
          <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: '8px 24px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Status:</span>
            {STATES.map(st => {
              const colors = PRODUCT_STATE_COLORS[st]
              const active = stateFilter === st
              return (
                <button key={st} onClick={() => setParam('state', active ? '' : st)}
                  className="inline-flex items-center gap-1 rounded-full transition-all"
                  style={{
                    padding: '3px 10px', fontSize: 12, fontWeight: 500,
                    background: active ? colors.bg : 'white', color: active ? colors.text : '#555',
                    border: `${active ? 2 : 1}px solid ${active ? colors.text : '#E0E0E0'}`,
                  }}>
                  {PRODUCT_STATE_LABELS[st]}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white flex-1" style={{ overflowY: 'auto', minHeight: 0 }} onClick={() => setOpenMenuId(null)}>
        {/* ── Library tab ── */}
        {tab === 'library' && (
          <>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'grid',
              gridTemplateColumns: '110px 1fr 140px 170px 110px 80px 80px 48px',
              alignItems: 'center', padding: '0 12px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>LIB Code</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Name</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Mark Prefix</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Category</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Used By</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Created</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Status</div>
              <div />
            </div>

            {libLoading && (
              <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
                <Loader2 size={20} className="animate-spin" />Loading...
              </div>
            )}
            {libError && !libLoading && (
              <div style={{ padding: 64, color: '#C8202A', fontSize: 13, textAlign: 'center' }}>
                Unable to load library data
              </div>
            )}
            {!libLoading && !libError && libItems.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
                <Search size={32} style={{ opacity: 0.3 }} />
                <div>ยังไม่มี library entry — กด + Add เพื่อเริ่ม</div>
              </div>
            )}

            {!libLoading && !libError && libItems.map(entry => (
              <LibraryRow
                key={entry.id}
                entry={entry}
                showArchived={showArchived}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                onRename={() => setRenameEntry(entry)}
                onViewLinked={(type) => {
                  setParam('tab', type)
                }}
              />
            ))}
          </>
        )}

        {/* ── Standard / Custom tabs ── */}
        {tab !== 'library' && (
          <>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'grid',
              gridTemplateColumns: tab === 'standard'
                ? '140px 1fr 140px 120px 100px 120px 48px'
                : '140px 1fr 160px 120px 100px 120px 48px',
              alignItems: 'center', padding: '0 12px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
            }}>
              {tab === 'standard' ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Code</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Name</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Eng. Code</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Category</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Updated</div>
                  <div />
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Code</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Name</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Mark</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Category</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Updated</div>
                  <div />
                </>
              )}
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
                <Loader2 size={20} className="animate-spin" />Loading data...
              </div>
            )}
            {isError && !isLoading && (
              <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
                Unable to load data — verify that the backend is running
              </div>
            )}
            {!isLoading && !isError && items.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
                <Search size={32} style={{ opacity: 0.3 }} />
                <div>No Products match the current filters</div>
              </div>
            )}

            {!isLoading && !isError && items.map(p => (
              <div key={p.product_code} onClick={() => navigate(`/engineer-products/${p.product_code}`)}
                className="cursor-pointer transition-colors hover:bg-chrome-50"
                style={{
                  display: 'grid',
                  gridTemplateColumns: tab === 'standard'
                    ? '140px 1fr 140px 120px 100px 120px 48px'
                    : '140px 1fr 160px 120px 100px 120px 48px',
                  alignItems: 'center', padding: '0 12px', height: 52, borderBottom: '1px solid #E0E0E0',
                }}>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{p.product_code}</div>
                <div className="min-w-0 pr-4">
                  <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{p.name}</div>
                </div>
                {tab === 'standard' ? (
                  <div className="font-mono" style={{ fontSize: 12, color: p.engineering_code ? '#555' : '#C2C2C2' }}>
                    {p.engineering_code ?? '—'}
                  </div>
                ) : (
                  <div className="font-mono" style={{ fontSize: 13, color: '#1F1F1F', fontWeight: 500 }}>{markDisplay(p)}</div>
                )}
                <div style={{ fontSize: 12, color: '#555' }}>{p.category?.name ?? '-'}</div>
                <div><ProductStatePill state={p.state} /></div>
                <div style={{ fontSize: 12, color: '#8E8E8E' }}>
                  <div>{new Date(p.write_date).toLocaleDateString('en-GB')}</div>
                  <div style={{ fontSize: 11, color: '#C2C2C2' }}>{p.write_user?.name ?? '-'}</div>
                </div>
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>Page {pageParam} / {totalPages} · {total} items</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setParam('page', String(Math.max(1, pageParam - 1)))} disabled={pageParam === 1}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setParam('page', String(p))} className="flex items-center justify-center rounded font-mono"
                style={{ width: 32, height: 32, fontSize: 13, background: pageParam === p ? '#C8202A' : 'transparent', color: pageParam === p ? 'white' : '#555' }}>
                {p}
              </button>
            ))}
            <button onClick={() => setParam('page', String(Math.min(totalPages, pageParam + 1)))} disabled={pageParam === totalPages}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E', flexShrink: 0 }}>
        {isLibLoading ? 'Loading...' : `Showing ${tab === 'library' ? libItems.length : items.length} of ${total} items`}
      </div>

      {/* Modals */}
      {showModal === 'standard' && <NewStandardProductModal onClose={() => setShowModal(null)} />}
      {showModal === 'custom' && <NewCustomProductModal onClose={() => setShowModal(null)} />}
      {showModal === 'library' && <AddLibraryEntryModal onClose={() => setShowModal(null)} />}
      {renameEntry && (
        <EditLibraryEntryModal
          entry={renameEntry}
          onClose={() => setRenameEntry(null)}
        />
      )}
    </div>
  )
}

// ── Library row with ⋯ menu ────────────────────────────────────────────────

interface LibraryRowProps {
  entry: LibraryEntryDTO
  showArchived: boolean
  openMenuId: number | null
  setOpenMenuId: (id: number | null) => void
  onRename: () => void
  onViewLinked: (type: 'standard' | 'custom') => void
}

function LibraryRow({ entry, showArchived, openMenuId, setOpenMenuId, onRename, onViewLinked }: LibraryRowProps) {
  const { mutateAsync: archiveEntry, isPending: archiving } = useDeleteLibraryEntry(entry.id)
  const { mutateAsync: updateEntry, isPending: restoring } = useUpdateLibraryEntry(entry.id)
  const { mutateAsync: hardDeleteEntry, isPending: deleting } = useHardDeleteLibraryEntry(entry.id)
  const menuOpen = openMenuId === entry.id

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenMenuId(null)
    try {
      await archiveEntry()
    } catch (err: any) {
      const data = err?.response?.data
      const total = (data?.stdCount ?? 0) + (data?.cusCount ?? 0)
      if (total > 0) {
        const ok = window.confirm(
          `${total} product(s) still reference this entry (${data.stdCount} STD, ${data.cusCount} CUS).\n\nArchive anyway?`
        )
        if (ok) {
          try {
            await updateEntry({ active: false })
          } catch {
            window.alert('Archive failed — please try again.')
          }
        }
      }
    }
  }

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenMenuId(null)
    await updateEntry({ active: true })
  }

  const handleHardDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenMenuId(null)
    const ok = window.confirm(`ลบ ${entry.code} — ${entry.name} ถาวรเลยใช่ไหม? ไม่สามารถกู้คืนได้`)
    if (!ok) return
    try {
      await hardDeleteEntry()
    } catch (err: any) {
      window.alert(err?.response?.data?.message ?? 'Delete failed')
    }
  }

  const dimmed = showArchived
  const busy = archiving || restoring || deleting

  return (
    <div className="hover:bg-chrome-50 transition-colors" style={{
      display: 'grid',
      gridTemplateColumns: '110px 1fr 140px 170px 110px 80px 80px 48px',
      alignItems: 'center', padding: '0 12px', height: 48, borderBottom: '1px solid #E0E0E0',
      opacity: dimmed ? 0.65 : 1,
    }}>
      {/* LIB Code */}
      <div className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: dimmed ? '#8E8E8E' : '#1F1F1F' }}>{entry.code}</div>

      {/* Name */}
      <div className="min-w-0 pr-4">
        <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: dimmed ? '#8E8E8E' : '#1F1F1F' }}>{entry.name}</div>
      </div>

      {/* Mark Prefix */}
      <div className="min-w-0 pr-2">
        {entry.mark_prefix ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: dimmed ? '#8E8E8E' : '#0C447C', background: dimmed ? '#F0F0F0' : '#E6F1FB', borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>
              {entry.mark_prefix}
            </span>
            <span className="truncate" style={{ fontSize: 12, color: dimmed ? '#8E8E8E' : '#1F1F1F' }}>{entry.mark_prefix_label}</span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#C2C2C2' }}>—</span>
        )}
      </div>

      {/* Category */}
      <div>
        {entry.mark_prefix_category && PREFIX_CATEGORY_CHIP[entry.mark_prefix_category]
          ? (() => {
              const chip = PREFIX_CATEGORY_CHIP[entry.mark_prefix_category!]
              return (
                <span style={{ fontSize: 12, fontWeight: 500, color: dimmed ? '#8E8E8E' : '#1F1F1F', whiteSpace: 'nowrap' }}>
                  {chip.label}
                </span>
              )
            })()
          : <span style={{ color: '#C2C2C2', fontSize: 12 }}>—</span>}
      </div>

      {/* Used By pills */}
      <div className="flex items-center gap-1.5">
        {entry.std_count > 0 && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#E6F1FB', color: '#0C447C' }}>
            {entry.std_count} STD
          </span>
        )}
        {entry.cus_count > 0 && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#FAEEDA', color: '#854F0B' }}>
            {entry.cus_count} CUS
          </span>
        )}
        {entry.std_count === 0 && entry.cus_count === 0 && (
          <span style={{ fontSize: 12, color: '#C2C2C2' }}>—</span>
        )}
      </div>

      {/* Created */}
      <div style={{ fontSize: 12, color: '#8E8E8E' }}>{new Date(entry.create_date).toLocaleDateString('en-GB')}</div>

      {/* Status pill */}
      <div>
        <span style={{
          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
          background: entry.active ? '#D1F2E0' : '#F5F5F5',
          color: entry.active ? '#065F46' : '#8E8E8E',
        }}>
          {entry.active ? 'Active' : 'Archived'}
        </span>
      </div>

      {/* ⋯ menu */}
      <div className="flex items-center justify-center" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setOpenMenuId(menuOpen ? null : entry.id)} disabled={busy}
          className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={16} />}
        </button>
        {menuOpen && (
          <div className="bg-white rounded-lg shadow-lg border border-chrome-100" style={{ position: 'absolute', right: 0, top: 32, width: 180, zIndex: 20 }}>
            {!showArchived ? (
              <>
                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onRename() }}
                  className="flex items-center gap-2 w-full hover:bg-chrome-50" style={{ padding: '8px 12px', fontSize: 13, color: '#1F1F1F' }}>
                  <Pencil size={13} /> Edit
                </button>
                {entry.std_count > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onViewLinked('standard') }}
                    className="flex items-center gap-2 w-full hover:bg-chrome-50" style={{ padding: '8px 12px', fontSize: 13, color: '#1F1F1F' }}>
                    <ExternalLink size={13} /> View Standard ({entry.std_count})
                  </button>
                )}
                {entry.cus_count > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onViewLinked('custom') }}
                    className="flex items-center gap-2 w-full hover:bg-chrome-50" style={{ padding: '8px 12px', fontSize: 13, color: '#1F1F1F' }}>
                    <ExternalLink size={13} /> View Custom ({entry.cus_count})
                  </button>
                )}
                <div style={{ borderTop: '1px solid #E0E0E0', margin: '4px 0' }} />
                <button onClick={handleArchive}
                  className="flex items-center gap-2 w-full hover:bg-chrome-50" style={{ padding: '8px 12px', fontSize: 13, color: '#C8202A' }}>
                  <Archive size={13} /> Archive
                </button>
              </>
            ) : (
              <>
                <button onClick={handleRestore}
                  className="flex items-center gap-2 w-full hover:bg-chrome-50" style={{ padding: '8px 12px', fontSize: 13, color: '#065F46' }}>
                  <RotateCcw size={13} /> Restore
                </button>
                <div style={{ borderTop: '1px solid #E0E0E0', margin: '4px 0' }} />
                <button onClick={handleHardDelete}
                  className="flex items-center gap-2 w-full hover:bg-chrome-50"
                  style={{ padding: '8px 12px', fontSize: 13, color: '#C8202A' }}
                  title={entry.std_count + entry.cus_count > 0 ? 'มี products อ้างอิง — ลบไม่ได้' : ''}>
                  <Trash2 size={13} /> Delete permanently
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

