import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { ShapeTestPanel } from './ShapeTestPanel'
import * as api from '../../api/cutting-plan-test'
import * as projects from '../../api/projects'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const cleanupAll = () => cleanup()
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const PART_LIST = {
  pieces: 16, warnings: ['PIPE 60.5X2.4: the summary sheet says 433 pcs, the part rows add up to 432'],
  sizes: [
    { profile: 'PIPE 101.6X2.6', grade: 'HSS550', parts: [{ mark: 'A1', lengthMm: 3000, count: 4 }] },
    { profile: 'PIPE 76.3X3.2', grade: 'SS400', parts: [{ mark: 'B1', lengthMm: 2000, count: 12 }] },
  ],
}
const result = (yieldPct: number) => ({
  stocks: 2, stockLengthMm: 12026, partsLengthMm: 12026 * yieldPct / 100, scrapMm: 100, kerfMm: 24, yieldPct, cuts: 2, method: 'mip',
  stockMix: [{ lengthMm: 6013, pieces: 2 }],
  layouts: [{ stockLengthMm: 6013, repeat: 2, restMm: 50, cuts: 1, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A1', lengthMm: 3000, pcs: 4 }] }],
})

describe('ShapeTestPanel', () => {
  beforeEach(() => {
    vi.spyOn(api, 'readShapePartList').mockResolvedValue(PART_LIST)
    vi.spyOn(api, 'getShapeBomSources').mockResolvedValue({ zones: [
      { id: 72, code: 'Z07', label: 'BIF TO NP Zone 3', pieces: 154, groups: [{ group: 'DBN-A1', pieces: 14 }, { group: 'DBN-A3', pieces: 140 }] },
      { id: 74, code: 'Z09', label: 'ROD Zone 1', pieces: 16, groups: [{ group: 'DBN-A5', pieces: 16 }] },
      { id: 99, code: 'Z99', label: 'Empty', pieces: 0, groups: [] },
    ] })
    vi.spyOn(api, 'readShapeBomParts').mockResolvedValue({ ...PART_LIST, warnings: [] })
    vi.spyOn(projects.projectsApi, 'listAll').mockResolvedValue([{ id: 7, project_code: '0X222', name: 'Bangna' }] as never)
    vi.spyOn(api, 'optimizeShapeTest').mockImplementation(async body => result(body.parts[0].mark === 'A1' ? 98 : 90))
    vi.spyOn(api, 'getShapeEndCuts').mockResolvedValue({ source: null, marks: {} })
  })
  afterEach(() => vi.restoreAllMocks())

  const upload = async () => {
    wrap(<ShapeTestPanel />)
    fireEvent.change(screen.getByLabelText('Part list file'), { target: { files: [new File(['x'], 'list.xls')] } })
    await screen.findByText('PIPE 101.6X2.6')
  }

  // Tao 2026-11-13: a size's lengths are one line until Edit is pressed; the totals are tiles (value over label)
  const edit = (row: HTMLElement) => fireEvent.click(within(row).getByRole('button', { name: 'Edit stock lengths' }))
  const tile = (label: string | RegExp) => within(screen.getByTestId('test-totals')).getByText(label).previousElementSibling?.textContent
  const barMarks = (bar: HTMLElement) => [...bar.children].filter(c => /^[\d,.]+ mm · /.test(c.getAttribute('title') ?? '')).map(c => c.textContent)

  it('says it is a test bench that saves nothing', () => {
    wrap(<ShapeTestPanel />)
    expect(screen.getByText(/nothing is saved/i)).toBeInTheDocument()
  })

  it('lists the sizes with their starting stock and shows part list warnings', async () => {
    await upload()
    expect(screen.getByText(/the summary sheet says 433 pcs/)).toBeInTheDocument()
    const row = screen.getByTestId('size-PIPE 101.6X2.6')
    expect(within(row).getByText('12,500 · 6,013')).toBeInTheDocument()
    expect(within(row).queryByLabelText('Stock 1 length (mm)')).toBeNull() // the inputs open on Edit
    edit(row)
    expect(within(row).getByLabelText('Stock 1 length (mm)')).toHaveValue(12500)
    expect(within(row).getByLabelText('Stock 2 length (mm)')).toHaveValue(6013)
    expect(within(row).queryByLabelText('Stock 1 limit (in stock)')).toBeNull() // no limits unless asked
    fireEvent.click(within(row).getByRole('button', { name: 'Limit in stock' }))
    expect(within(row).getByLabelText('Stock 1 limit (in stock)')).toHaveValue(null)
    expect(within(screen.getByTestId('size-PIPE 76.3X3.2')).getByText('6,013')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Done' }))
    expect(within(row).queryByLabelText('Stock 1 length (mm)')).toBeNull()
  })

  it('runs every size with its stock and kerf, then grades the yield loss', async () => {
    await upload()
    fireEvent.change(within(screen.getByTestId('size-PIPE 101.6X2.6')).getByLabelText('Kerf (mm)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await waitFor(() => expect(api.optimizeShapeTest).toHaveBeenCalledTimes(2))
    expect(api.optimizeShapeTest).toHaveBeenCalledWith({ kerfMm: 10, parts: PART_LIST.sizes[0].parts, stock: [{ lengthMm: 12500, qty: null }, { lengthMm: 6013, qty: null }] })
    expect(await within(screen.getByTestId('size-PIPE 101.6X2.6')).findByText('2.00% · Great')).toBeInTheDocument()
    expect(within(screen.getByTestId('size-PIPE 76.3X3.2')).getByText('10.00% · Bad')).toBeInTheDocument()
    expect(tile('Stock pieces')).toBe('4')
    expect(tile('Stock length')).toBe('24.05 m')
    expect(tile(/^Yield loss · /)).toBe('6.00%')
    expect(within(screen.getByTestId('size-PIPE 101.6X2.6')).getByText('6,013 × 2')).toBeInTheDocument()
    const req = screen.getByTestId('required-stock')
    expect(req).toHaveTextContent('Required stock')
    expect(within(req).getAllByRole('row').map(r => r.textContent)).toEqual([
      'SizeGradeLengthPcsLayouts', 'PIPE 101.6X2.6HSS5506,013 mm21', 'PIPE 76.3X3.2SS4006,013 mm21', 'Total42',
    ])
  })

  it('a limit sent with the stock when set', async () => {
    await upload()
    const row = screen.getByTestId('size-PIPE 101.6X2.6')
    edit(row)
    fireEvent.click(within(row).getByRole('button', { name: 'Limit in stock' }))
    fireEvent.change(within(row).getByLabelText('Stock 1 limit (in stock)'), { target: { value: '12' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Done' }))
    expect(within(row).getByText('12,500 (max 12) · 6,013')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await waitFor(() => expect(api.optimizeShapeTest).toHaveBeenCalledWith(expect.objectContaining({ stock: [{ lengthMm: 12500, qty: 12 }, { lengthMm: 6013, qty: null }] })))
  })

  it('editing a stock clears that size\'s result', async () => {
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    const row = screen.getByTestId('size-PIPE 101.6X2.6')
    await within(row).findByText('2.00% · Great')
    edit(row)
    fireEvent.change(within(row).getByLabelText('Stock 1 length (mm)'), { target: { value: '12000' } })
    expect(within(row).queryByText('2.00% · Great')).toBeNull()
  })

  it('clicking a size with a result shows its layouts to scale', async () => {
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await within(screen.getByTestId('size-PIPE 101.6X2.6')).findByText('2.00% · Great')
    fireEvent.click(screen.getByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    expect(screen.getByRole('img', { name: 'Stock 6,013 mm' })).toBeInTheDocument()
    expect(screen.getByText('6,013 mm × 2 bars')).toBeInTheDocument()
    expect(screen.getByText('Scrap 50 mm · 1 cut per bar')).toBeInTheDocument()
  })

  it('from BOM: pick a project, zones and mark groups, then load the parts', async () => {
    wrap(<ShapeTestPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'From BOM' }))
    await screen.findByRole('option', { name: /0X222/ })
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '7' } })
    expect(await screen.findByLabelText('Z07 BIF TO NP Zone 3 · 154 pcs')).toBeInTheDocument()
    expect(screen.queryByLabelText('Z99 Empty · 0 pcs')).toBeNull() // Tao 2026-11-13: a zone with nothing to lay out is not listed
    fireEvent.click(screen.getByLabelText('Z07 BIF TO NP Zone 3 · 154 pcs'))
    fireEvent.click(screen.getByLabelText('DBN-A3 · 140 pcs'))
    fireEvent.click(screen.getByRole('button', { name: 'Load parts' }))
    await screen.findByText('PIPE 101.6X2.6')
    expect(api.readShapeBomParts).toHaveBeenCalledWith({ project_id: 7, zone_ids: [72], groups: ['DBN-A3'] })
    expect(screen.getByText(/BOM 0X222 · Z07 · DBN-A3/)).toBeInTheDocument()
  })

  // Tao 2026-11-12: same calculation, but the layouts can be split per zone or done over all picked zones together
  const pickTwoZones = async () => {
    wrap(<ShapeTestPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'From BOM' }))
    await screen.findByRole('option', { name: /0X222/ })
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '7' } })
    fireEvent.click(await screen.findByLabelText('Z07 BIF TO NP Zone 3 · 154 pcs'))
    fireEvent.click(screen.getByLabelText('Z09 ROD Zone 1 · 16 pcs'))
  }

  it('from BOM: all zones together is the default, one load for the picked zones', async () => {
    await pickTwoZones()
    expect(screen.getByRole('button', { name: 'All zones together' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Load parts' }))
    await screen.findByText('PIPE 101.6X2.6')
    expect(api.readShapeBomParts).toHaveBeenCalledTimes(1)
    expect(api.readShapeBomParts).toHaveBeenCalledWith({ project_id: 7, zone_ids: [72, 74], groups: [] })
    expect(screen.queryByRole('columnheader', { name: 'Zone' })).not.toBeInTheDocument()
  })

  it('from BOM: each zone on its own: one load and one layout run per zone and size, zone shown on every row', async () => {
    vi.mocked(api.readShapeBomParts).mockImplementation(async body => ({
      pieces: 4, warnings: body.zone_ids[0] === 74 ? ['PIPE 101.6X2.6: 1 mark has no length'] : [],
      sizes: [{ profile: 'PIPE 101.6X2.6', grade: 'HSS550', parts: [{ mark: body.zone_ids[0] === 72 ? 'A1' : 'C1', lengthMm: 3000, count: 4 }] }],
    }))
    await pickTwoZones()
    fireEvent.click(screen.getByRole('button', { name: 'Each zone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load parts' }))
    await screen.findAllByText('PIPE 101.6X2.6')
    expect(api.readShapeBomParts).toHaveBeenCalledWith({ project_id: 7, zone_ids: [72], groups: [] })
    expect(api.readShapeBomParts).toHaveBeenCalledWith({ project_id: 7, zone_ids: [74], groups: [] })
    expect(screen.getByText(/each zone/)).toBeInTheDocument()
    expect(screen.getByText('Z09: PIPE 101.6X2.6: 1 mark has no length')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Zone' })).toBeInTheDocument()
    const rows = screen.getAllByTestId('size-PIPE 101.6X2.6')
    expect(rows.map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Z07', 'Z09'])

    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await waitFor(() => expect(tile('Stock pieces')).toBe('4'))
    expect(api.optimizeShapeTest).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.optimizeShapeTest).mock.calls.map(c => c[0].parts[0].mark)).toEqual(['A1', 'C1'])
    const req = screen.getByTestId('required-stock')
    expect(within(req).getByRole('columnheader', { name: 'Zone' })).toBeInTheDocument()
    expect(within(req).getByText('Z07')).toBeInTheDocument()
    expect(within(req).getByText('Z09')).toBeInTheDocument()
  })

  it('a rod size starts with kerf 10 and 10,000 mm stock', async () => {
    vi.mocked(api.readShapePartList).mockResolvedValue({ pieces: 10, warnings: [], sizes: [{ profile: 'ROD RB25', grade: 'SS400', parts: [{ mark: 'R1', lengthMm: 2500, count: 10 }] }] })
    wrap(<ShapeTestPanel />)
    fireEvent.change(screen.getByLabelText('Part list file'), { target: { files: [new File(['x'], 'rod.xls')] } })
    const row = await screen.findByTestId('size-ROD RB25')
    expect(within(row).getByLabelText('Kerf (mm)')).toHaveValue(10)
    expect(within(row).getByText('10,000')).toBeInTheDocument()
  })

  it('says when the work budget cut the search short', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async body => ({ ...result(body.parts[0].mark === 'A1' ? 98 : 90), timedOut: body.parts[0].mark === 'A1' }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    const row = screen.getByTestId('size-PIPE 101.6X2.6')
    expect(await within(row).findByText('Search cut short: may not be the fewest stocks')).toBeInTheDocument()
    expect(within(screen.getByTestId('size-PIPE 76.3X3.2')).queryByText(/Search cut short/)).toBeNull()
  })

  it('required stock: open a length to see its layouts in 2D', async () => {
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    const req = await screen.findByTestId('required-stock')
    fireEvent.click(within(req).getByRole('button', { name: 'Layouts of PIPE 101.6X2.6 on 6,013 mm' }))
    const open = within(req).getByTestId('req-layouts-PIPE 101.6X2.6|HSS550|6013')
    expect(within(open).getByRole('img', { name: 'Stock 6,013 mm' })).toBeInTheDocument()
    expect(within(open).getByText('6,013 mm × 2 bars')).toBeInTheDocument()
    // one layout per cutting pattern: the bar shows lengths, the legend says which marks (Tao 2026-11-11, option ก)
    // Tao 2026-11-12: only marks inside the bar; the lengths on dimension lines under it, like the Shape view
    expect(within(open).getAllByText('A1').length).toBeGreaterThanOrEqual(2)
    expect(within(open).queryByText(/A1 · /)).toBeNull()
    expect(within(within(open).getByTestId('dims-1')).getAllByText('3,000 mm')).toHaveLength(2)
    // Tao 2026-11-13 (hard to use): marks and lengths are not repeated in a table under the bar; 3D sits in the header
    expect(within(open).queryByRole('table')).toBeNull()
    expect(within(open).queryByRole('list', { name: 'Pieces of layout 1' })).toBeNull() // every piece has its dimension label
    expect(within(open).getByRole('button', { name: '3D of layout 1' })).toBeInTheDocument()
  })

  it('required stock: a click anywhere on the row opens and closes its layouts', async () => {
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    const req = await screen.findByTestId('required-stock')
    const row = within(req).getAllByRole('row').find(r => r.textContent?.startsWith('PIPE 76.3X3.2'))!
    fireEvent.click(within(row).getByText('SS400'))
    expect(within(req).getByTestId('req-layouts-PIPE 76.3X3.2|SS400|6013')).toBeInTheDocument()
    fireEvent.click(within(row).getByText('SS400'))
    expect(within(req).queryByTestId('req-layouts-PIPE 76.3X3.2|SS400|6013')).toBeNull()
  })

  // audit 2026-11-11: a run still in flight wrote its results onto a newer list / edited stock
  it('a result that comes back after the stock was edited is dropped, not shown', async () => {
    let finish: (v: unknown) => void = () => {}
    vi.mocked(api.optimizeShapeTest).mockImplementation(body => new Promise(res => { finish = () => res(result(body.parts[0].mark === 'A1' ? 98 : 90)) }) as never)
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    const row = screen.getByTestId('size-PIPE 101.6X2.6')
    edit(row)
    fireEvent.change(within(row).getByLabelText('Stock 1 length (mm)'), { target: { value: '12000' } })
    await act(async () => { finish(null) })
    expect(within(row).queryByText('2.00% · Great')).toBeNull()
  })

  it('numbers carry thousands separators', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), cuts: 1324 }))
    vi.mocked(api.readShapePartList).mockResolvedValue({ pieces: 1650, warnings: [], sizes: [{ profile: 'PIPE 101.6X2.6', grade: 'HSS550', parts: [{ mark: 'A1', lengthMm: 300, count: 1650 }] }] })
    wrap(<ShapeTestPanel />)
    fireEvent.change(screen.getByLabelText('Part list file'), { target: { files: [new File(['x'], 'list.xls')] } })
    const row = await screen.findByTestId('size-PIPE 101.6X2.6')
    expect(within(row).getByText('1,650')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    expect(await within(row).findByText('1,324')).toBeInTheDocument()
    expect(tile('Cuts')).toBe('1,324')
  })

  // audit 2026-11-11: with more than 10 lengths in a size the palette wrapped, two lengths in one layout shared a colour
  it('lengths inside one layout never share a colour', async () => {
    const lens = [9000, 8000, 7000, 6000, 5000, 4000, 3500, 3000, 2500, 2000, 1500]
    const layouts = [
      { stockLengthMm: 12500, repeat: 1, restMm: 0, cuts: 10, pieces: lens.slice(0, 10).map(l => ({ lengthMm: l, count: 1 })), marks: [] },
      { stockLengthMm: 12500, repeat: 1, restMm: 0, cuts: 1, pieces: [{ lengthMm: 9000, count: 1 }, { lengthMm: 1500, count: 1 }], marks: [] },
    ]
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), stockMix: [{ lengthMm: 12500, pieces: 2 }], layouts }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    const bars = screen.getAllByRole('img', { name: 'Stock 12,500 mm' })
    const colours = [...bars[1].children].filter(c => /^[\d,.]+ mm · /.test(c.getAttribute('title') ?? '')).map(c => (c as HTMLElement).style.background)
    expect(colours).toHaveLength(2)
    expect(new Set(colours).size).toBe(2)
  })

  // Tao 2026-11-12 (3D step 1): which marks one bar is cut into, and a 3D of that bar
  it('each layout lists its bars with their marks; 3D opens one bar with its pieces and positions', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts: [
      { stockLengthMm: 6013, repeat: 3, restMm: 1, cuts: 2, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A1', lengthMm: 3000, pcs: 4 }, { mark: 'B1', lengthMm: 3000, pcs: 2 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    // Tao 2026-11-12: one layout per set of marks — the pattern cut for A1 A1 and for B1 B1 is two layouts
    expect(screen.getAllByRole('img', { name: 'Stock 6,013 mm' }).map(barMarks)).toEqual([['A1', 'A1'], ['B1', 'B1']])
    expect(screen.getByText('6,013 mm × 2 bars')).toBeInTheDocument()
    expect(screen.getByText('6,013 mm × 1 bar')).toBeInTheDocument()
    expect(screen.getByText('Same cuts as layout 1')).toBeInTheDocument()
    expect(screen.getByText(/2 layouts/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '3D of layout 2' }))
    const dialog = screen.getByRole('dialog', { name: 'PIPE 101.6X2.6 · layout 2 · 6,013 mm' })
    const rows = within(dialog).getAllByRole('row').slice(1).map(r => r.textContent)
    // a part list file has no project, so no model: ends drawn square
    expect(rows).toEqual(['1B13,0000 – 3,000SquareNo model (part list file)', '2B13,0003,012 – 6,012SquareNo model (part list file)', 'Left at end1 mm6,012 – 6,013'])
    expect(api.getShapeEndCuts).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: '2 · B1' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Tao 2026-11-12 (too cluttered): the prefix every mark of a layout shares is said once, the marks show the rest;
  // the 3D still gets the full marks
  it('a prefix shared by all marks of a layout is shown once, not on every mark', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts: [
      { stockLengthMm: 6013, repeat: 1, restMm: 1, cuts: 2, pieces: [{ lengthMm: 3000, count: 1 }, { lengthMm: 2988, count: 1 }], marks: [{ mark: 'DBN-B2-m15', lengthMm: 3000, pcs: 1 }, { mark: 'DBN-B2-m13', lengthMm: 2988, pcs: 1 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    expect(screen.getByText('Marks DBN-B2-…')).toBeInTheDocument()
    expect(screen.queryByText('DBN-B2-m15')).toBeNull()
    expect(barMarks(screen.getByRole('img', { name: 'Stock 6,013 mm' }))).toEqual(['m15', 'm13'])
    fireEvent.click(screen.getByRole('button', { name: '3D of layout 1' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '1 · DBN-B2-m15' })).toBeInTheDocument()
  })

  // Tao 2026-11-13 (layout 35: m141 blue in the bar, green in the 3D): a piece wears one colour in the bar and the 3D
  it('the 3D colours each piece as the bar does', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts: [
      { stockLengthMm: 9500, repeat: 1, restMm: 0, cuts: 3, pieces: [{ lengthMm: 2261.65, count: 1 }, { lengthMm: 1796.08, count: 2 }], marks: [{ mark: 'm141', lengthMm: 2261.65, pcs: 1 }, { mark: 'm83', lengthMm: 1796.08, pcs: 2 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    const bar = [...screen.getByRole('img', { name: 'Stock 9,500 mm' }).children].filter(c => /^[\d,.]+ mm · /.test(c.getAttribute('title') ?? '')).map(c => (c as HTMLElement).style.background)
    fireEvent.click(screen.getByRole('button', { name: '3D of layout 1' }))
    const dialog = screen.getByRole('dialog')
    const chips = ['1 · m141', '2 · m83', '3 · m83'].map(name => (within(dialog).getByRole('button', { name }).querySelector('i') as HTMLElement).style.background)
    expect(chips).toEqual(bar)
    expect(new Set(chips).size).toBe(2)
  })

  // Tao 2026-11-13 (layouts 104/105 had no dimension lines, some joints no line at all): a nested layout gets its
  // dimension lines too, a nested joint says how far it nests, and every piece after the first has a start line
  it('a nested layout shows dimension lines, the nest at each joint, and a line where each piece starts', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts: [
      { stockLengthMm: 6013, repeat: 1, restMm: 0, cuts: 3, nestMm: [14.2, 0], pieces: [{ lengthMm: 2000, count: 3 }], marks: [{ mark: 'A1', lengthMm: 2000, pcs: 3 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    const dims = screen.getByTestId('dims-1')
    expect(within(dims).getAllByText('2,000 mm')).toHaveLength(3)
    expect(within(dims).getByText('Nest 14.2 mm')).toBeInTheDocument()
    expect(within(dims).getByText('12 mm')).toBeInTheDocument()
    const parts = [...screen.getByRole('img', { name: 'Stock 6,013 mm' }).children].filter(c => /^[\d,.]+ mm · /.test(c.getAttribute('title') ?? '')) as HTMLElement[]
    expect(parts.map(p => !!p.style.boxShadow)).toEqual([false, true, true])
  })

  // audit 2026-11-13: the 3D said "Left at end 88 mm" under a header saying "Scrap 76 mm" (it counted the last cut's kerf)
  it('the 3D\'s "Left at end" is the layout\'s scrap, after the last cut', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), stockMix: [{ lengthMm: 6100, pieces: 1 }], layouts: [
      { stockLengthMm: 6100, repeat: 1, restMm: 76, cuts: 2, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A1', lengthMm: 3000, pcs: 2 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    expect(screen.getByText('Scrap 76 mm · 2 cuts per bar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '3D of layout 1' }))
    const rows = within(screen.getByRole('dialog')).getAllByRole('row').map(r => r.textContent)
    expect(rows[rows.length - 1]).toBe('Left at end76 mm6,024 – 6,100')
  })

  // Tao 2026-11-12 (3D step 2): the real end cuts from the project's IFC model, per mark
  it('from BOM: the 3D bar asks for its marks\' end cuts and says where each came from', async () => {
    const flat = Array(361).fill(0)
    vi.mocked(api.readShapeBomParts).mockResolvedValue({ pieces: 2, warnings: [], sizes: [{ profile: 'PIPE 60.5X2.4', grade: 'HSS550', parts: [{ mark: 'A1', lengthMm: 969.05, count: 1 }, { mark: 'B1', lengthMm: 500, count: 1 }] }] })
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts: [
      { stockLengthMm: 6013, repeat: 1, restMm: 0, cuts: 2, pieces: [{ lengthMm: 969.05, count: 1 }, { lengthMm: 500, count: 1 }], marks: [{ mark: 'A1', lengthMm: 969.05, pcs: 1 }, { mark: 'B1', lengthMm: 500, pcs: 1 }] },
    ] }))
    vi.mocked(api.getShapeEndCuts).mockResolvedValue({ source: 'DRIVING RANGE_BANGNA.ifc', marks: {
      A1: { L: 'saddle', R: 'slot', depthLMm: 118.6, depthRMm: 85, instances: 12, variants: 2, spreadMm: 3.4, grids: { LW: flat, LN: flat, RW: flat, RN: flat } },
      B1: null,
    } })
    await pickTwoZones()
    fireEvent.click(screen.getByRole('button', { name: 'Load parts' }))
    await screen.findByText('PIPE 60.5X2.4')
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 60.5X2.4' }))
    fireEvent.click(screen.getByRole('button', { name: '3D of layout 1' }))
    expect(api.getShapeEndCuts).toHaveBeenCalledWith({ project_id: 7, marks: ['A1', 'B1'] })
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Saddle · Slot')).toBeInTheDocument()
    expect(within(dialog).getByText('Model · 12 pcs, variants differ up to 3.4 mm')).toBeInTheDocument()
    expect(within(dialog).getByText('Not found in model, drawn square')).toBeInTheDocument()
    expect(within(dialog).getByText(/DRIVING RANGE_BANGNA\.ifc/)).toBeInTheDocument()
  })

  // Tao 2026-11-12 POC: saddle nesting and model length, next to Run layouts (BOM source only)
  it('saddle options: only with a BOM source; sent with the run; the notes sit in the size\'s row', async () => {
    await upload()
    expect(screen.queryByRole('button', { name: 'Nest saddles' })).toBeNull()
    cleanupAll()
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), stockLengthMm: 12026, tipToTip: { stocks: 3, stockLengthMm: 18039 }, notes: ['End cuts from DRIVING RANGE_BANGNA.ifc', 'Saddle nesting: 1 of 1 lengths (4 of 4 pcs) can nest, up to 46.2 mm per joint', 'Not in the model, BOM length kept: A9'] }))
    await pickTwoZones()
    fireEvent.click(screen.getByRole('button', { name: 'Load parts' }))
    await screen.findByText('PIPE 76.3X3.2')
    expect(screen.getByRole('button', { name: 'Tip to tip' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Model length' })).toBeNull() // Tao 2026-11-12: lengths always from the BOM
    fireEvent.click(screen.getByRole('button', { name: 'Nest saddles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await waitFor(() => expect(api.optimizeShapeTest).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.optimizeShapeTest).mock.calls[0][0]).toEqual(expect.objectContaining({ project_id: 7, saddleNest: true }))
    expect(vi.mocked(api.optimizeShapeTest).mock.calls[0][0]).not.toHaveProperty('saddleLength')
    // Tao 2026-11-13 (hard to use): no wall of notes — the model file once, routine notes behind the row's ⓘ, what needs
    // a look in the row, and what nesting saved against tip to tip
    const row = screen.getByTestId('size-PIPE 101.6X2.6')
    expect(await within(row).findByText('Not in the model, BOM length kept: A9')).toBeInTheDocument()
    expect(screen.getByTestId('model-file')).toHaveTextContent('End cuts and cut lengths from DRIVING RANGE_BANGNA.ifc')
    expect(within(row).queryByText(/Saddle nesting: 1 of 1 lengths/)).toBeNull()
    fireEvent.mouseEnter(within(row).getByLabelText('Notes for PIPE 101.6X2.6'))
    expect(within(row).getByRole('tooltip')).toHaveTextContent('Saddle nesting: 1 of 1 lengths (4 of 4 pcs) can nest, up to 46.2 mm per joint')
    expect(within(row).getByText('Nesting saves 6.01 m')).toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByLabelText('About saddle ends'))
    expect(screen.getAllByRole('tooltip').some(t => /tucked into the next one/.test(t.textContent ?? ''))).toBe(true)
  })

  // audit 2026-11-12: nesting tucks BOM length into other pieces; the totals say how much, and the yield counts it
  it('the totals say how much length nested', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), nestedMm: 1234 }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await screen.findByTestId('test-totals')
    expect(tile('Nested')).toBe('2.47 m')
  })

  // Tao 2026-11-12: from a BOM the server lays marks out at BdtPipeCut's cut length; after a run the parts length is its
  it('after a run, the parts length is the one the layouts used', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), partsLengthMm: 11111 }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    expect(await within(screen.getByTestId('size-PIPE 101.6X2.6')).findByText('11.11 m')).toBeInTheDocument()
  })

  it('changing a saddle option clears the results', async () => {
    await pickTwoZones()
    fireEvent.click(screen.getByRole('button', { name: 'Load parts' }))
    await screen.findByText('PIPE 76.3X3.2')
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    await waitFor(() => expect(screen.getByTestId('test-totals')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Nest saddles' }))
    expect(screen.queryByTestId('test-totals')).toBeNull()
  })

  // Tao 2026-11-13 (hard to use): the layouts open under the row that was clicked; a long list can be searched by mark,
  // narrowed to one stock length, and starts with the first 10
  it('layouts open under their size row, with find-a-mark, a stock length filter and the first 10 shown', async () => {
    const layouts = Array.from({ length: 12 }, (_, i) => ({ stockLengthMm: i < 9 ? 12500 : 6013, repeat: 1, restMm: 0, cuts: 1, pieces: [{ lengthMm: 3000 + i, count: 1 }], marks: [{ mark: `DBN-m${i + 1}`, lengthMm: 3000 + i, pcs: 1 }] }))
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    const open = screen.getByTestId('layouts-PIPE 101.6X2.6|HSS550')
    expect(screen.getByTestId('size-PIPE 101.6X2.6').nextElementSibling).toContainElement(open)
    expect(within(open).getByText('12 layouts · kerf 12 mm')).toBeInTheDocument()
    expect(within(open).getAllByRole('img')).toHaveLength(10)
    fireEvent.click(within(open).getByRole('button', { name: 'Show all 12 layouts' }))
    expect(within(open).getAllByRole('img')).toHaveLength(12)
    fireEvent.click(within(open).getByRole('button', { name: '6,013 mm' }))
    expect(within(open).getAllByRole('img')).toHaveLength(3)
    expect(within(open).getByText('3 of 12 layouts · kerf 12 mm')).toBeInTheDocument()
    fireEvent.click(within(open).getByRole('button', { name: 'All lengths' }))
    fireEvent.change(within(open).getByLabelText('Find a mark'), { target: { value: 'm12' } })
    expect(within(open).getAllByRole('img')).toHaveLength(1)
    expect(within(open).getByRole('button', { name: '3D of layout 12' })).toBeInTheDocument() // a layout keeps its number
    fireEvent.change(within(open).getByLabelText('Find a mark'), { target: { value: 'zzz' } })
    expect(within(open).getByText('No layout with that mark')).toBeInTheDocument()
  })

  it('a layout with pieces too short for a dimension label lists them once, runs of the same piece counted', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), stockMix: [{ lengthMm: 9500, pieces: 1 }], layouts: [
      { stockLengthMm: 9500, repeat: 1, restMm: 0, cuts: 4, pieces: [{ lengthMm: 8000, count: 1 }, { lengthMm: 468.4, count: 3 }], marks: [{ mark: 'DBN-m70', lengthMm: 8000, pcs: 1 }, { mark: 'DBN-m66', lengthMm: 468.4, pcs: 3 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    expect(within(screen.getByRole('list', { name: 'Pieces of layout 1' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['m708,000 mm', 'm66468.4 mm × 3'])
  })

  it('while running, the button says which size it is on', async () => {
    let finish: () => void = () => {}
    vi.mocked(api.optimizeShapeTest).mockImplementation(() => new Promise(res => { finish = () => res(result(98) as never) }) as never)
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    expect(screen.getByRole('button', { name: 'Run layouts' })).toHaveTextContent('Laying out 1 of 2')
    await act(async () => { finish() })
    expect(screen.getByRole('button', { name: 'Run layouts' })).toHaveTextContent('Laying out 2 of 2')
    await act(async () => { finish() })
    expect(screen.getByRole('button', { name: 'Run layouts' })).toHaveTextContent('Run layouts')
  })

  it('a bar cut for two marks of one length names each piece on the bar', async () => {
    vi.mocked(api.optimizeShapeTest).mockImplementation(async () => ({ ...result(98), layouts: [
      { stockLengthMm: 6013, repeat: 2, restMm: 50, cuts: 1, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A1', lengthMm: 3000, pcs: 3 }, { mark: 'B1', lengthMm: 3000, pcs: 1 }] },
    ] }))
    await upload()
    fireEvent.click(screen.getByRole('button', { name: 'Run layouts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Layouts of PIPE 101.6X2.6' }))
    const bars = screen.getAllByRole('img', { name: 'Stock 6,013 mm' })
    expect(bars).toHaveLength(2) // A1 A1, then A1 B1
    expect([...bars[1].children].map(c => c.textContent).filter(Boolean)).toEqual(['A1', 'B1'])
  })
})
