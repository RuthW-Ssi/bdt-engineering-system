import { appliesToProductTypeLabel } from './RoutingList'

// NOTE on scope: this file covers `appliesToProductTypeLabel`, the pure
// decision logic behind the applies_to_product_type table cell.
// `RoutingList` itself is not exported/testable in isolation without
// mounting the full page (react-query + apiClient, useMarkPrefixes,
// useConfirm/ConfirmProvider, usePermission/AuthContext, react-router's
// useNavigate) — out of scope here. The cell JSX calls this function
// directly with no other branching, so exercising it covers the real
// render decision, including the 'ALL' badge added for the sentinel
// mark-prefix value.

describe('appliesToProductTypeLabel', () => {
  const prefixMap = new Map([
    ['CO', 'Column'],
    ['FB', 'Fascia Beam'],
  ])

  it('returns null for empty/null — renders the "—" placeholder', () => {
    expect(appliesToProductTypeLabel(null, prefixMap)).toBeNull()
    expect(appliesToProductTypeLabel('', prefixMap)).toBeNull()
  })

  it('returns the distinct ALL badge for the sentinel value, without consulting prefixMap', () => {
    const mapWithAll = new Map([...prefixMap, ['ALL', 'should never be used']])
    expect(appliesToProductTypeLabel('ALL', mapWithAll)).toEqual({
      code: 'ALL',
      sublabel: 'ทุก Mark Prefix',
    })
  })

  it('looks up a real mark-prefix code in prefixMap', () => {
    expect(appliesToProductTypeLabel('CO', prefixMap)).toEqual({
      code: 'CO',
      sublabel: 'Column',
    })
  })

  it('falls back to a null sublabel when the code has no matching mark_prefix_master row', () => {
    expect(appliesToProductTypeLabel('ZZ', prefixMap)).toEqual({
      code: 'ZZ',
      sublabel: null,
    })
  })
})
