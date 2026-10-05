import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Drawing } from '../../api/drawings'
import type { WoBimMatch } from '../../api/wo'
import { WoVisualTab, type WoVisualMark } from './WoVisualTab'
import { useWoBimMatch } from '../../hooks/useWo'
import { useBimViewerToken } from '../../hooks/useBim'
import { useZoneDrawings } from '../../hooks/useDrawings'

// Every focusRequest the stub viewport received, in render order — lets a
// test check identity (a new object re-fires the real viewer's camera move).
const focusSeen = vi.hoisted(() => [] as unknown[])
vi.mock('../../hooks/useWo', () => ({ useWoBimMatch: vi.fn() }))
vi.mock('../../hooks/useBim', () => ({ useBimViewerToken: vi.fn() }))
vi.mock('../../hooks/useDrawings', () => ({ useZoneDrawings: vi.fn() }))
// The real viewer loads the Autodesk SDK from a CDN; the drawing panel fetches
// a blob — both stubbed to expose just what the tab handed them.
vi.mock('../bim/BimViewport', () => ({
  BimViewport: ({ urn, focusRequest, statusColorMap, defaultColor }: {
    urn: string; focusRequest: unknown; statusColorMap?: Map<string, string>; defaultColor?: string
  }) => {
    focusSeen.push(focusRequest)
    return (
      <div
        data-testid="bim-viewport"
        data-focus={JSON.stringify(focusRequest)}
        data-colors={JSON.stringify(statusColorMap ? [...statusColorMap] : null)}
        data-default-color={defaultColor ?? ''}
      >{urn}</div>
    )
  },
}))
vi.mock('../drawings/DrawingPreviewPanel', () => ({
  DrawingPreviewPanel: ({ drawing }: { drawing: Drawing }) => <div data-testid="drawing-preview">{drawing.file_name}</div>,
}))

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockedMatch = vi.mocked(useWoBimMatch)
const mockedToken = vi.mocked(useBimViewerToken)
const mockedDrawings = vi.mocked(useZoneDrawings)

function pdf(id: number, version: number, file_name: string, create_date = '2026-09-01T12:00:00Z'): Drawing {
  return { id, project_id: 1, zone_id: 7, sub_zone_id: null, version, file_key: `k${id}`, file_name, mime_type: null, uploaded_by_id: 1, create_date }
}

function match(overrides: Partial<WoBimMatch> = {}): WoBimMatch {
  return {
    status: 'ok', mark: 'CTR10', model_id: 5, model_version: '1.2', translation_status: 'complete',
    global_id: 'guid-1', global_ids: ['guid-1', 'guid-2'], wo_global_ids: ['guid-1', 'guid-2', 'guid-9'], match_count: 2,
    models: [
      { id: 6, version: '2.0', translation_status: 'processing', create_date: '2026-10-02T12:00:00Z' },
      { id: 5, version: '1.2', translation_status: 'complete', create_date: '2026-09-01T12:00:00Z' },
    ],
    ...overrides,
  }
}

const marks: WoVisualMark[] = [
  { bomAssemblyId: 1, mark: 'CTR10', projectId: 1, zoneId: 7, subZoneId: null },
  { bomAssemblyId: 2, mark: 'CTR11', projectId: 1, zoneId: 7, subZoneId: null },
]

// Fixture timestamps sit at noon UTC so the rendered day is the same in any
// timezone the suite runs in.
// CTR10 is in v1 and v3; CTR11 only in v2 — sparse versions, one batch each.
const zoneDrawings = [
  pdf(1, 1, 'CTR10 - - Rev 1.pdf', '2026-08-01T12:00:00Z'),
  pdf(2, 2, 'CTR11 - - Rev 1.pdf', '2026-08-15T12:00:00Z'),
  pdf(3, 3, 'CTR10 - - Rev 2.pdf', '2026-09-20T12:00:00Z'),
]

beforeEach(() => {
  vi.clearAllMocks()
  focusSeen.length = 0
  mockedMatch.mockReturnValue({ data: match(), isLoading: false, isPlaceholderData: false, isError: false } as any)
  // Keyed on the model id, so asserting the urn proves WHICH model loaded.
  mockedToken.mockImplementation(((id: number | null) => ({ data: id != null ? { urn: `urn-${id}`, access_token: 't' } : undefined })) as any)
  mockedDrawings.mockReturnValue({ data: zoneDrawings, isLoading: false, isError: false } as any)
})

describe('WoVisualTab drawing version picker', () => {
  it('defaults to the mark\'s newest drawing version and lists every version holding the mark', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    expect(screen.getByTestId('drawing-preview')).toHaveTextContent('CTR10 - - Rev 2.pdf')
    const picker = screen.getByLabelText('Drawing version') as HTMLSelectElement
    expect(picker.value).toBe('3')
    expect([...picker.options].map(o => o.text)).toEqual(['v3 · 20 Sept 26 (latest)', 'v1 · 01 Aug 26'])
  })

  it('switches the preview to the picked older version', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.change(screen.getByLabelText('Drawing version'), { target: { value: '1' } })

    expect(screen.getByTestId('drawing-preview')).toHaveTextContent('CTR10 - - Rev 1.pdf')
  })

  it('falls back to the newly selected mark\'s own newest version when switching marks', () => {
    render(<WoVisualTab woId={1} marks={marks} />)
    fireEvent.change(screen.getByLabelText('Drawing version'), { target: { value: '1' } })

    fireEvent.change(screen.getByLabelText('Drawing mark'), { target: { value: '2' } })

    expect(screen.getByTestId('drawing-preview')).toHaveTextContent('CTR11 - - Rev 1.pdf')
    // Only one version holds CTR11 — still a dropdown, so the picker is
    // always discoverable.
    const picker = screen.getByLabelText('Drawing version') as HTMLSelectElement
    expect(picker.value).toBe('2')
    expect([...picker.options].map(o => o.text)).toEqual(['v2 · 15 Aug 26 (latest)'])
  })

  it('shows no picker when the mark has no drawing at all', () => {
    mockedDrawings.mockReturnValue({ data: [pdf(9, 1, 'CTR99 - - Rev 1.pdf')], isLoading: false, isError: false } as any)

    render(<WoVisualTab woId={1} marks={marks} />)

    expect(screen.queryByLabelText('Drawing version')).not.toBeInTheDocument()
    expect(screen.getByText('No drawing uploaded for mark "CTR10" yet.')).toBeInTheDocument()
  })

  it('shows a spinner (not "No drawing uploaded") while the zone\'s drawings load', () => {
    mockedDrawings.mockReturnValue({ data: undefined, isLoading: true, isError: false } as any)

    render(<WoVisualTab woId={1} marks={marks} />)

    expect(screen.queryByText(/No drawing uploaded/)).not.toBeInTheDocument()
  })
})

describe('WoVisualTab 3D version picker', () => {
  it('shows the model the backend defaulted to, with non-complete versions labelled', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    const picker = screen.getByLabelText('3D Model version') as HTMLSelectElement
    expect(picker.value).toBe('5')
    expect([...picker.options].map(o => o.text)).toEqual([
      'v2.0 · 02 Oct 26 · processing (latest)',
      'v1.2 · 01 Sept 26',
    ])
    expect(screen.getByTestId('bim-viewport')).toHaveTextContent('urn-5')
    expect(mockedToken).toHaveBeenLastCalledWith(5)
  })

  it('requests the picked model and keeps the pick when switching marks', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.change(screen.getByLabelText('3D Model version'), { target: { value: '6' } })
    expect(mockedMatch).toHaveBeenLastCalledWith(1, 1, 6)

    fireEvent.change(screen.getByLabelText('3D Model mark'), { target: { value: '2' } })
    expect(mockedMatch).toHaveBeenLastCalledWith(1, 2, 6)
  })

  // An MO (so a WO) can span projects; the backend 404s a model_id from
  // another project, so the pick must not follow the user there.
  it('drops back to the default model for a mark in another project', () => {
    const crossProject: WoVisualMark[] = [marks[0], { ...marks[1], projectId: 2 }]
    render(<WoVisualTab woId={1} marks={crossProject} />)
    fireEvent.change(screen.getByLabelText('3D Model version'), { target: { value: '6' } })

    fireEvent.change(screen.getByLabelText('3D Model mark'), { target: { value: '2' } })
    expect(mockedMatch).toHaveBeenLastCalledWith(1, 2, undefined)

    fireEvent.change(screen.getByLabelText('3D Model mark'), { target: { value: '1' } })
    expect(mockedMatch).toHaveBeenLastCalledWith(1, 1, 6)
  })

  // Unmounting the viewer on every mark switch reloaded the whole model and
  // reset the camera — the held (placeholder) match keeps it on screen.
  it('keeps the current viewer on screen while a mark/model switch loads', () => {
    mockedMatch.mockReturnValue({ data: match(), isLoading: false, isPlaceholderData: true, isError: false } as any)

    render(<WoVisualTab woId={1} marks={marks} />)

    expect(screen.getByTestId('bim-viewport')).toHaveTextContent('urn-5')
    expect(screen.getByLabelText('3D Model version')).toBeInTheDocument()
  })

  it('shows a spinner during a switch when there was no model on screen to keep', () => {
    mockedMatch.mockReturnValue({
      data: match({ status: 'mark_not_found', global_id: null, global_ids: [] }),
      isLoading: false, isPlaceholderData: true, isError: false,
    } as any)

    render(<WoVisualTab woId={1} marks={marks} />)

    expect(screen.queryByTestId('bim-viewport')).not.toBeInTheDocument()
    expect(screen.queryByText(/was not found/)).not.toBeInTheDocument()
  })

  it('is still a dropdown when the project has only one model', () => {
    mockedMatch.mockReturnValue({
      data: match({ models: [{ id: 5, version: '1.2', translation_status: 'complete', create_date: '2026-09-01T12:00:00Z' }] }),
      isLoading: false, isPlaceholderData: false, isError: false,
    } as any)

    render(<WoVisualTab woId={1} marks={marks} />)

    const picker = screen.getByLabelText('3D Model version') as HTMLSelectElement
    expect([...picker.options].map(o => o.text)).toEqual(['v1.2 · 01 Sept 26 (latest)'])
  })

  it('names the selected version when it is still processing', () => {
    mockedMatch.mockReturnValue({
      data: match({ status: 'model_not_ready', model_id: 6, model_version: '2.0', translation_status: 'processing', global_id: null }),
      isLoading: false, isPlaceholderData: false, isError: false,
    } as any)

    render(<WoVisualTab woId={1} marks={marks} />)

    expect(screen.getByText('BIM model v2.0 is still processing — check back soon.')).toBeInTheDocument()
  })
})

describe('WoVisualTab mark dropdowns', () => {
  it('lists exactly the WO\'s marks in both panes, kept in sync', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    const model = screen.getByLabelText('3D Model mark') as HTMLSelectElement
    const drawing = screen.getByLabelText('Drawing mark') as HTMLSelectElement
    expect([...model.options].map(o => o.text)).toEqual(['CTR10', 'CTR11'])
    expect([...drawing.options].map(o => o.text)).toEqual(['CTR10', 'CTR11'])

    fireEvent.change(drawing, { target: { value: '2' } })

    expect(model.value).toBe('2')
    expect(mockedMatch).toHaveBeenLastCalledWith(1, 2, undefined)
  })

  it('is still a dropdown for a single-mark WO', () => {
    render(<WoVisualTab woId={1} marks={[marks[0]]} />)

    const picker = screen.getByLabelText('3D Model mark') as HTMLSelectElement
    expect([...picker.options].map(o => o.text)).toEqual(['CTR10'])
  })
})

describe('WoVisualTab whole-model toggle', () => {
  const toggle = () => screen.getByTitle('Show the whole model with this mark highlighted')

  it('starts on the isolated single piece, with no highlight layer', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    const viewport = screen.getByTestId('bim-viewport')
    expect(JSON.parse(viewport.dataset.focus!)).toEqual({ globalIds: ['guid-1'], hideRest: true })
    expect(JSON.parse(viewport.dataset.colors!)).toBeNull()
  })

  it('shows the whole model with every instance of the mark highlighted red', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.click(toggle())

    const viewport = screen.getByTestId('bim-viewport')
    expect(JSON.parse(viewport.dataset.focus!)).toEqual({ globalIds: [], hideRest: false, fitGlobalIds: ['guid-1', 'guid-2'] })
    expect(JSON.parse(viewport.dataset.colors!)).toEqual([['guid-1', '#C8202A'], ['guid-2', '#C8202A']])
    expect(viewport.dataset.defaultColor).toBe('#D4D4D4')
  })

  it('still highlights the one known instance when the backend omits global_ids', () => {
    const olderResponse: Partial<WoBimMatch> = match()
    delete olderResponse.global_ids
    mockedMatch.mockReturnValue({ data: olderResponse, isLoading: false, isPlaceholderData: false, isError: false } as any)
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.click(toggle())

    expect(JSON.parse(screen.getByTestId('bim-viewport').dataset.colors!)).toEqual([['guid-1', '#C8202A']])
  })

  it('disables the orientation buttons in the whole-model view', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.click(toggle())

    for (const b of screen.getAllByTitle(/Switch back to the single piece/)) expect(b).toBeDisabled()
    expect(screen.getAllByTitle(/Switch back to the single piece/)).toHaveLength(3)
  })

  it('toggles back to the single piece', () => {
    render(<WoVisualTab woId={1} marks={marks} />)
    fireEvent.click(toggle())

    fireEvent.click(screen.getByTitle('Show this piece only'))

    const viewport = screen.getByTestId('bim-viewport')
    expect(JSON.parse(viewport.dataset.focus!)).toEqual({ globalIds: ['guid-1'], hideRest: true })
    expect(screen.getByTitle('Orient vertical')).not.toBeDisabled()
  })

  it('stays in the whole-model view when switching marks', () => {
    render(<WoVisualTab woId={1} marks={marks} />)
    fireEvent.click(toggle())

    fireEvent.change(screen.getByLabelText('3D Model mark'), { target: { value: '2' } })

    expect(screen.getByTitle('Show this piece only')).toBeInTheDocument()
  })
})

describe('WoVisualTab highlight-every-WO-mark toggle', () => {
  const woToggle = () => screen.getByTitle('Show the whole model with every mark on this work order highlighted')

  it('paints the WO\'s other marks orange and the selected mark red over the whole model', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.click(woToggle())

    const viewport = screen.getByTestId('bim-viewport')
    // Whole-model framing, no zoom onto the selected mark — free to look around.
    expect(JSON.parse(viewport.dataset.focus!)).toEqual({ globalIds: [], hideRest: false })
    expect(new Map(JSON.parse(viewport.dataset.colors!))).toEqual(new Map([
      ['guid-1', '#C8202A'], ['guid-2', '#C8202A'], ['guid-9', '#F59E0B'],
    ]))
    expect(viewport.dataset.defaultColor).toBe('#D4D4D4')
  })

  it('shows a colour legend only in this mode', () => {
    render(<WoVisualTab woId={1} marks={marks} />)
    expect(screen.queryByText('Other marks on this WO')).not.toBeInTheDocument()

    fireEvent.click(woToggle())
    expect(screen.getByText('Selected mark')).toBeInTheDocument()
    expect(screen.getByText('Other marks on this WO')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Show the whole model with this mark highlighted'))
    expect(screen.queryByText('Other marks on this WO')).not.toBeInTheDocument()
  })

  it('switches straight between the two whole-model modes, one active at a time', () => {
    render(<WoVisualTab woId={1} marks={marks} />)

    fireEvent.click(screen.getByTitle('Show the whole model with this mark highlighted'))
    fireEvent.click(woToggle())

    expect(JSON.parse(screen.getByTestId('bim-viewport').dataset.colors!)).toContainEqual(['guid-9', '#F59E0B'])
    expect(screen.getAllByTitle('Show this piece only')).toHaveLength(1)
    expect(screen.getAllByTitle(/Switch back to the single piece/).every(b => (b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('goes back to the single piece when pressed again', () => {
    render(<WoVisualTab woId={1} marks={marks} />)
    fireEvent.click(woToggle())

    fireEvent.click(screen.getByTitle('Show this piece only'))

    expect(JSON.parse(screen.getByTestId('bim-viewport').dataset.focus!)).toEqual({ globalIds: ['guid-1'], hideRest: true })
  })

  it('leaves the camera where the user put it when switching marks — only the colours change', () => {
    render(<WoVisualTab woId={1} marks={marks} />)
    fireEvent.click(woToggle())
    const before = focusSeen[focusSeen.length - 1]

    mockedMatch.mockReturnValue({
      data: match({ mark: 'CTR11', global_id: 'guid-9', global_ids: ['guid-9'] }),
      isLoading: false, isPlaceholderData: false, isError: false,
    } as any)
    fireEvent.change(screen.getByLabelText('3D Model mark'), { target: { value: '2' } })

    expect(focusSeen[focusSeen.length - 1]).toBe(before)
    expect(new Map(JSON.parse(screen.getByTestId('bim-viewport').dataset.colors!)).get('guid-9')).toBe('#C8202A')
  })
})
