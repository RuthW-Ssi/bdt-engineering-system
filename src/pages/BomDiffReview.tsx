import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Box, XCircle, CheckCircle, PlusCircle, MinusCircle, Edit, Equal, Download, Tag, Clock, AlertCircle } from 'lucide-react'
import * as Icons from 'lucide-react'
import { CAT_META } from '../data/meta'
import type { BomDiffNode, DiffState } from '../types'
import { useBomDiff } from '../hooks/useBomDiff'

const STATE_BADGE: Record<DiffState, string> = { added: '+', removed: '−', modified: '~', unchanged: '=' }
const STATE_LABEL: Record<DiffState, string> = { added: 'Added', removed: 'Removed', modified: 'Modified', unchanged: 'Unchanged' }
const STATE_COLOR: Record<DiffState, { bg: string; border: string; text: string; badge: string }> = {
  added:     { bg: '#EAF3DE', border: '#639922',   text: '#27500A', badge: '#639922' },
  removed:   { bg: '#FCEBEB', border: '#C8202A',   text: '#8A1520', badge: '#C8202A' },
  modified:  { bg: '#FAEEDA', border: '#BA7517',   text: '#854F0B', badge: '#BA7517' },
  unchanged: { bg: 'white',   border: 'transparent', text: '#C2C2C2', badge: '#E0E0E0' },
}

function DiffRow({ node, hideUnchanged }: { node: BomDiffNode; hideUnchanged: boolean }) {
  const [expanded, setExpanded] = useState(node.expanded ?? true)
  const st = STATE_COLOR[node.state]
  const m = CAT_META[node.category]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined

  if (hideUnchanged && node.state === 'unchanged' && node.children.every(c => c.state === 'unchanged')) return null

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          marginBottom: 2,
          marginLeft: node.level * 20,
          borderRadius: '0 6px 6px 0',
          borderLeft: `3px solid ${st.border}`,
          background: st.bg,
          cursor: 'pointer',
          opacity: node.state === 'removed' ? 0.85 : 1,
          transition: 'all 120ms',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* State badge */}
        <span style={{ width: 18, height: 18, borderRadius: 999, background: st.badge, color: 'white', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {STATE_BADGE[node.state]}
        </span>

        {/* Category dot */}
        <span style={{ width: 18, height: 18, borderRadius: 999, background: `${m.color}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {Icon && <Icon size={10} color={m.color} />}
        </span>

        {/* Code */}
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: st.text, textDecoration: node.state === 'removed' ? 'line-through' : 'none' }}>{node.code}</span>

        {/* Name */}
        <span className="flex-1 truncate" style={{ fontSize: 13, color: node.state === 'removed' ? '#8A1520' : '#1F1F1F', textDecoration: node.state === 'removed' ? 'line-through' : 'none' }}>{node.name}</span>

        {/* Qty pill */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.6)', color: st.text, border: `1px solid ${st.border === 'transparent' ? '#E0E0E0' : st.border}`, flexShrink: 0 }}>
          {node.qty}
        </span>

        {/* State label */}
        <span style={{ fontSize: 11, color: '#8E8E8E', flexShrink: 0 }}>{STATE_LABEL[node.state]}</span>
      </div>

      {/* Field changes */}
      {node.state === 'modified' && node.changes && expanded && (
        <div style={{ marginLeft: node.level * 20 + 24, marginBottom: 4, background: 'rgba(255,255,255,0.6)', border: '1px solid #E5D5B0', borderRadius: 6, overflow: 'hidden' }}>
          {node.changes.map((ch, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8, alignItems: 'center', padding: '6px 12px', borderBottom: i < node.changes!.length - 1 ? '1px solid #E5D5B0' : 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#8E8E8E' }}>{ch.field}</span>
              <div className="flex items-center gap-1">
                <span className="font-mono" style={{ fontSize: 12, color: '#8E8E8E', textDecoration: 'line-through' }}>{ch.old}</span>
                <span style={{ color: '#C2C2C2', margin: '0 4px' }}>→</span>
                <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: '#27500A' }}>{ch.newVal}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && node.children.map(child => (
        <DiffRow key={child.id} node={child} hideUnchanged={hideUnchanged} />
      ))}
    </>
  )
}

export function BomDiffReview() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [hideUnchanged, setHideUnchanged] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approveChecked, setApproveChecked] = useState(false)
  const [rejectReason, setRejectReason] = useState('Other (specify)')
  const [rejectDetail, setRejectDetail] = useState('')

  const { bomList, diffNodes, fromVersionId, toVersionId, setFromVersionId, setToVersionId, loading, error, stats } = useBomDiff(code)

  const fromBom = bomList.find(b => b.id === fromVersionId)
  const toBom = bomList.find(b => b.id === toVersionId)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Page Header */}
      <div className="bg-white flex items-center sticky top-14 z-40 border-b border-chrome-100 px-5 gap-3" style={{ height: 56, flexShrink: 0 }}>
        <button onClick={() => navigate(`/engineer-products/${code}`)} className="flex items-center justify-center rounded-md hover:bg-chrome-50" style={{ width: 32, height: 32, color: '#8E8E8E' }}>
          <ArrowLeft size={16} />
        </button>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 600 }}>{code}</span>
        <span style={{ color: '#C2C2C2' }}>·</span>
        <span style={{ fontSize: 13, color: '#8E8E8E' }}>BOM Review</span>
        <span style={{ background: '#E6F1FB', color: '#0C447C', border: '1px solid #B5D4F4', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>In Review</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-md" style={{ height: 36, padding: '0 14px', fontSize: 13, color: '#3A3A3A', border: '1px solid #C2C2C2' }}>
            <FileText size={14} />View Drawing
          </button>
          <button className="flex items-center gap-1.5 rounded-md" style={{ height: 36, padding: '0 14px', fontSize: 13, color: '#3A3A3A', border: '1px solid #C2C2C2' }}>
            <Box size={14} />View 3D BIM
          </button>
          <span style={{ width: 1, height: 24, background: '#E0E0E0' }} />
          <button onClick={() => setRejectOpen(true)} className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
            <XCircle size={14} />Reject
          </button>
          <button onClick={() => setApproveOpen(true)} className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, background: '#639922' }}>
            <CheckCircle size={14} />Approve
          </button>
        </div>
      </div>

      {/* Diff toolbar */}
      <div className="flex items-center gap-3 border-b border-chrome-100 px-5" style={{ height: 44, background: '#F5F5F5', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>Compare</span>
        <select
          className="border border-chrome-200 rounded bg-white"
          style={{ height: 28, padding: '0 8px', fontSize: 12 }}
          value={fromVersionId ?? ''}
          onChange={e => setFromVersionId(Number(e.target.value))}
        >
          <option value="">— (New)</option>
          {bomList.map(b => <option key={b.id} value={b.id}>v{b.version} ({b.state})</option>)}
        </select>
        <ArrowLeft size={14} style={{ transform: 'rotate(180deg)', color: '#8E8E8E' }} />
        <select
          className="border border-steel-200 rounded bg-steel-50"
          style={{ height: 28, padding: '0 8px', fontSize: 12, color: '#185FA5', fontWeight: 500 }}
          value={toVersionId ?? ''}
          onChange={e => setToVersionId(Number(e.target.value))}
        >
          {bomList.map(b => <option key={b.id} value={b.id}>v{b.version} ({b.state})</option>)}
        </select>
        <span style={{ width: 1, height: 16, background: '#C2C2C2' }} />
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: '#639922', fontWeight: 500 }}><PlusCircle size={13} />{stats.added} added</span>
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: '#BA7517', fontWeight: 500 }}><Edit size={13} />{stats.modified} modified</span>
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: '#C8202A', fontWeight: 500 }}><MinusCircle size={13} />{stats.removed} removed</span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12, color: '#555' }}>
          <input type="checkbox" checked={hideUnchanged} onChange={e => setHideUnchanged(e.target.checked)} style={{ accentColor: '#185FA5' }} />
          Hide unchanged
        </label>
        <button className="flex items-center gap-1.5 rounded hover:bg-chrome-100" style={{ height: 28, padding: '0 10px', fontSize: 12, color: '#555' }}>
          <Download size={13} />Export
        </button>
      </div>

      {/* Diff content — single pane */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto scroll-thin" style={{ padding: '12px 20px' }}>
          {/* Version headers */}
          <div className="flex gap-2 mb-4">
            <div className="flex items-center gap-2 rounded-lg border border-chrome-100 px-3 py-2" style={{ background: 'white' }}>
              <Tag size={14} style={{ color: '#185FA5' }} />
              <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#185FA5' }}>
                {toBom ? `v${toBom.version}` : '—'}
              </span>
              <span style={{ fontSize: 12, color: '#555' }}>— Current</span>
            </div>
            {fromBom && (
              <div className="flex items-center gap-2 rounded-lg border border-chrome-100 px-3 py-2" style={{ background: '#FAFAFA' }}>
                <Clock size={14} style={{ color: '#8E8E8E' }} />
                <span className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: '#8E8E8E' }}>v{fromBom.version}</span>
                <span style={{ fontSize: 12, color: '#8E8E8E' }}>— Previous</span>
              </div>
            )}
          </div>
          {loading
            ? <div className="flex items-center justify-center py-12" style={{ color: '#8E8E8E', gap: 8, fontSize: 13 }}><span>Loading diff...</span></div>
            : error
              ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12" style={{ color: '#C8202A' }}>
                  <AlertCircle size={28} />
                  <span style={{ fontSize: 13 }}>{error}</span>
                </div>
              )
              : diffNodes.map(node => <DiffRow key={node.id} node={node} hideUnchanged={hideUnchanged} />)
          }
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center" style={{ height: 40, background: '#1F1F1F', color: 'white', padding: '0 20px', gap: 16, fontSize: 12, flexShrink: 0 }}>
        <span className="flex items-center gap-1.5" style={{ color: '#86C04B' }}><PlusCircle size={13} />{stats.added} added</span>
        <span className="flex items-center gap-1.5" style={{ color: '#D9A75D' }}><Edit size={13} />{stats.modified} modified</span>
        <span className="flex items-center gap-1.5" style={{ color: '#EE9B9B' }}><MinusCircle size={13} />{stats.removed} removed</span>
        <span className="flex items-center gap-1.5" style={{ color: '#555' }}><Equal size={13} />{stats.unchanged} unchanged</span>
        <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
        <span style={{ color: '#555' }}>Compare {fromBom ? `v${fromBom.version}` : 'New'} → {toBom ? `v${toBom.version}` : '—'}</span>
        <span className="flex-1" />
        <span className="inline-flex items-center justify-center rounded-full font-mono" style={{ width: 24, height: 24, background: '#FAEEDA', color: '#854F0B', fontSize: 11, fontWeight: 600 }}>NP</span>
        <span style={{ color: '#8E8E8E' }}>nuch.p</span>
        <span style={{ color: '#555' }}>Reviewed 5 minutes ago</span>
      </div>

      {/* Approve Modal */}
      {approveOpen && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl" style={{ width: 460, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle size={24} style={{ color: '#639922', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Confirm Approval</div>
                <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 4 }}>{code}</div>
              </div>
            </div>
            <div className="rounded-lg" style={{ background: '#EAF3DE', border: '1px solid #C0DD97', padding: '14px 16px', marginBottom: 16 }}>
              <div className="grid gap-2" style={{ gridTemplateColumns: '120px 1fr', fontSize: 13 }}>
                <span style={{ color: '#27500A' }}>Product:</span><span className="font-mono">{code}</span>
                <span style={{ color: '#27500A' }}>Version:</span><span className="font-mono">v2.0.0</span>
                <span style={{ color: '#27500A' }}>BOM:</span><span>8 items</span>
                <span style={{ color: '#27500A' }}>Routing:</span><span>6 steps</span>
                <span style={{ color: '#27500A' }}>Submitted by:</span><span>somchai.k@ssi-steel.com</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mb-3" style={{ fontSize: 13, color: '#1F1F1F' }}>
              <input type="checkbox" checked={approveChecked} onChange={e => setApproveChecked(e.target.checked)} style={{ accentColor: '#639922', width: 16, height: 16 }} />
              I have fully reviewed the BOM and Routing
            </label>
            <textarea className="w-full border border-chrome-200 rounded-md focus:outline-none focus:border-steel-600" rows={3} placeholder="Notes (optional)" style={{ padding: '8px 10px', fontSize: 13, resize: 'none', marginBottom: 16 }} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setApproveOpen(false)} className="rounded-md hover:bg-chrome-50" style={{ padding: '10px 16px', fontSize: 13, color: '#555' }}>Cancel</button>
              <button
                disabled={!approveChecked}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, background: '#639922', opacity: approveChecked ? 1 : 0.4, cursor: approveChecked ? 'pointer' : 'not-allowed' }}
              >
                <CheckCircle size={14} />Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectOpen && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl" style={{ width: 460, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="flex items-start gap-3 mb-4">
              <XCircle size={24} style={{ color: '#C8202A', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Reject BOM</div>
                <div style={{ fontSize: 13, color: '#8E8E8E', marginTop: 4 }}>{code}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {['Incorrect qty', 'Wrong category', 'Missing required component', 'Incomplete Routing', 'Other (specify)'].map(r => (
                <label key={r} className="flex items-center gap-2 cursor-pointer rounded-md" style={{ padding: '8px 12px', fontSize: 13, background: rejectReason === r ? '#FCEBEB' : '#F5F5F5' }}>
                  <input type="radio" name="reason" checked={rejectReason === r} onChange={() => setRejectReason(r)} style={{ accentColor: '#C8202A' }} />
                  {r}
                </label>
              ))}
            </div>
            <textarea
              className="w-full rounded-md focus:outline-none"
              rows={4}
              placeholder="Details (required)"
              value={rejectDetail}
              onChange={e => setRejectDetail(e.target.value)}
              style={{ padding: '8px 10px', fontSize: 13, resize: 'none', marginBottom: 16, border: `1px solid ${rejectDetail ? '#C2C2C2' : '#EE9B9B'}`, borderRadius: 6, width: '100%', boxSizing: 'border-box' }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectOpen(false)} className="rounded-md hover:bg-chrome-50" style={{ padding: '10px 16px', fontSize: 13, color: '#555' }}>Cancel</button>
              <button
                disabled={!rejectDetail.trim()}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, background: '#C8202A', opacity: rejectDetail.trim() ? 1 : 0.4, cursor: rejectDetail.trim() ? 'pointer' : 'not-allowed' }}
              >
                <XCircle size={14} />Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
