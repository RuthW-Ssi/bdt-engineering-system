import { parseDrawingFileName } from './drawingFileName'

describe('parseDrawingFileName', () => {
  it.each([
    ['2BUH1A-1 - BEAM - Rev 2.pdf', '2BUH1A-1', 2],
    ['3BUH1C-12 - BEAM - Rev Rev. 1.pdf', '3BUH1C-12', 1],
    ['3BUH1C-5 - BEAM - Rev. 1.pdf', '3BUH1C-5', 1],
    ['3BUH1A-12 - BEAM - Rev .pdf', '3BUH1A-12', 0],
    ['DBN-B1-CTR1 - 1 -  - Rev 1.pdf', 'DBN-B1-CTR1', 1],
    ['DBN-B1-CTR1 -  - Rev 1.pdf', 'DBN-B1-CTR1', 1],
    ['PREV-12 - BEAM - Rev 1.pdf', 'PREV-12', 1],
  ])('%s → mark %s, rev %s', (name, mark, rev) => {
    expect(parseDrawingFileName(name)).toEqual({ mark, rev })
  })

  it('no " - " separator → mark unparsed', () => {
    expect(parseDrawingFileName('foo Rev 1.pdf')).toEqual({ mark: null, rev: 1 })
  })

  it('no Rev token → rev unparsed', () => {
    expect(parseDrawingFileName('2BUH1A-1 - BEAM.pdf')).toEqual({ mark: '2BUH1A-1', rev: null })
  })

  it('a mark ending in REV digits is not read as the rev', () => {
    expect(parseDrawingFileName('PREV12 - BEAM.pdf')).toEqual({ mark: 'PREV12', rev: null })
  })
})
