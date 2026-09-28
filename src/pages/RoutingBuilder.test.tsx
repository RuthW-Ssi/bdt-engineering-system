import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkPrefixPicker, ALL_MARK_PREFIX_OPTION } from './RoutingBuilder'
import type { MarkPrefixDTO } from '../api/types'

// NOTE on scope: this file covers `MarkPrefixPicker` and the synthetic
// `ALL_MARK_PREFIX_OPTION` it's fed with — both self-contained and mountable
// in isolation. `RoutingBuilderInner` itself (the save mutation that builds
// the create/PUT payloads) is not exported/testable without mounting the
// full canvas page (ReactFlowProvider, react-router params, react-query,
// usePermission/useActivities/useMarkPrefixes) and is out of scope here.
// That said, the payload logic is a direct pass-through of `productType`
// (`applies_to_product_type: productType || null` for the PUT snapshot, and
// `...(productType ? { applies_to_product_type: productType } : {})` for the
// POST) with no extra transform — since `onChange` below proves the picker
// hands back the exact string 'ALL' (a non-empty, truthy string), those two
// call sites already carry it through unchanged.

const otherPrefixes: MarkPrefixDTO[] = [
  { code: 'CO', label: 'Column', category: 'structural', part_type_code: 'CO', active: true },
  { code: 'FB', label: 'Fascia Beam', category: 'structural', part_type_code: 'FB', active: true },
]

function openPicker() {
  fireEvent.focus(screen.getByPlaceholderText('— Mark Prefix —'))
}

describe('ALL_MARK_PREFIX_OPTION', () => {
  it('matches the MarkPrefixDTO shape with the ALL sentinel code', () => {
    expect(ALL_MARK_PREFIX_OPTION).toEqual({
      code: 'ALL',
      label: 'ALL — ทุก Mark Prefix',
      category: '',
      part_type_code: '',
      active: true,
    })
  })
})

describe('MarkPrefixPicker — ALL option', () => {
  it('lists the ALL option ahead of the real prefixes when it is prepended by the caller', () => {
    render(
      <MarkPrefixPicker value="" prefixes={[ALL_MARK_PREFIX_OPTION, ...otherPrefixes]} onChange={vi.fn()} />,
    )
    openPicker()

    const rendered = screen.getAllByText(/^(ALL — ทุก Mark Prefix|Column|Fascia Beam)$/)
    expect(rendered[0]).toHaveTextContent('ALL — ทุก Mark Prefix')
  })

  it('calls onChange with the literal string "ALL" when the ALL option is selected', () => {
    const onChange = vi.fn()
    render(
      <MarkPrefixPicker value="" prefixes={[ALL_MARK_PREFIX_OPTION, ...otherPrefixes]} onChange={onChange} />,
    )
    openPicker()

    fireEvent.click(screen.getByText('ALL — ทุก Mark Prefix'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('ALL')
  })

  it('shows "ALL · ALL — ทุก Mark Prefix" as the closed display value once selected', () => {
    render(
      <MarkPrefixPicker value="ALL" prefixes={[ALL_MARK_PREFIX_OPTION, ...otherPrefixes]} onChange={vi.fn()} />,
    )
    expect(screen.getByDisplayValue('ALL · ALL — ทุก Mark Prefix')).toBeInTheDocument()
  })

  it('still filters the ALL option by typed query like any other entry', () => {
    render(
      <MarkPrefixPicker value="" prefixes={[ALL_MARK_PREFIX_OPTION, ...otherPrefixes]} onChange={vi.fn()} />,
    )
    openPicker()
    fireEvent.change(screen.getByPlaceholderText('— Mark Prefix —'), { target: { value: 'fascia' } })

    expect(screen.queryByText('ALL — ทุก Mark Prefix')).not.toBeInTheDocument()
    expect(screen.getByText('Fascia Beam')).toBeInTheDocument()
  })
})
