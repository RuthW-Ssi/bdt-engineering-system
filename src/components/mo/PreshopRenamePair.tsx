import type { PreshopAssembly } from '../../api/mo'
import { InfoTip } from '../bom/InfoTip'
import { candidateFor, type RenameCandidate } from '../../lib/preshopRename'
import type { MergeChoice } from '../../lib/preshopMerge'
import { PreshopMergeCompare } from './PreshopMergeCompare'

// MO Pre-shop upload — pair a renamed mark (2026-10-22): a new row (not yet
// in the MO) may be the same piece as an absent PRE_SHOP mark, just renamed.
// Scope cut (design doc): no % shown — every candidate from the server is
// offered as-is, name-similar ones first (server order). Once paired, the
// row renders exactly like an existing-mark compare row — same component,
// same cards/rules — plus a "ชื่อ mark X → Y" line. Picking "ไม่ใช่…" again
// (the default) unpairs it back to a plain new row.
export function PreshopRenamePair({ mark, incoming, candidates, chosenId, takenIds, choice, onPair, onChoiceChange, notice }: {
  mark: string // the incoming (trimmed) assembly_mark — the file's new name
  incoming: PreshopAssembly
  candidates: RenameCandidate[]
  chosenId: number | undefined // the MO line_id this row is paired with, if any
  takenIds: Set<number> // chosen by OTHER rows — disabled here (1:1)
  choice: MergeChoice
  onPair: (lineId: number | undefined) => void
  onChoiceChange: (c: MergeChoice) => void
  // A fresh dry run dropped this row's chosen candidate (reconcilePairing) —
  // the select already reset to "ไม่ใช่…"; this explains why.
  notice?: string
}) {
  const chosen = candidateFor(candidates, chosenId)
  return (
    <div>
      <label className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 600, color: '#0C447C' }}>
        เป็นชิ้นเดียวกับ mark ไหนใน MO?
        <InfoTip
          label={`อธิบายการจับคู่ mark เปลี่ยนชื่อของ ${mark}`}
          text="ถ้า mark นี้คือชิ้นเดิมใน MO ที่แค่เปลี่ยนชื่อ ให้เลือกชื่อเดิม ระบบจะเปลี่ยนชื่อให้ แทนการเพิ่มเป็น mark ใหม่"
        />
        <select
          aria-label={`จับคู่กับ mark เดิมของ ${mark}`}
          value={chosenId ?? ''}
          onChange={e => onPair(e.target.value ? Number(e.target.value) : undefined)}
          style={{ fontSize: 12.5, padding: '3px 6px', border: '1px solid #85B7EB', borderRadius: 5, minWidth: 220 }}
        >
          <option value="">ไม่ใช่ — เพิ่มเป็น mark ใหม่</option>
          {candidates.map(c => (
            <option key={c.line_id} value={c.line_id} disabled={takenIds.has(c.line_id) && chosenId !== c.line_id}>
              {c.assembly_mark}
            </option>
          ))}
        </select>
      </label>
      {notice && <div style={{ fontSize: 11.5, fontWeight: 600, color: '#C8202A', marginTop: 4 }}>{notice}</div>}
      {chosen && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#854F0B', margin: '6px 0' }}>{`ชื่อ mark ${chosen.assembly_mark} → ${mark}`}</div>
          <PreshopMergeCompare existing={chosen.existing} incoming={incoming} choice={choice} onChange={onChoiceChange} />
        </>
      )}
    </div>
  )
}
