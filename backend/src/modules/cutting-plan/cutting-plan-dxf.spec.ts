import { parseMachineTimes, parsePlateDxf } from './cutting-plan-dxf'

// Minimal DXF writer: only the group codes the parser reads.
const ent = (type: string, layer: string, codes: (string | number)[][]) =>
  ['0', type, '8', layer, ...codes.flatMap(([c, v]) => [String(c), String(v)])]
const dxf = (...entities: string[][]) => ['0', 'SECTION', '2', 'ENTITIES', ...entities.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n')
const poly = (layer: string, pts: [number, number, number?][]) =>
  ent('LWPOLYLINE', layer, [[90, pts.length], [70, 0], ...pts.flatMap(([x, y, b]) => [[10, x], [20, y], ...(b ? [[42, b]] : [])])])

describe('parsePlateDxf', () => {
  it('chains a part outline split into open polylines, and keeps the smaller loop as a hole', () => {
    const g = parsePlateDxf(dxf(
      poly('PartDBN-B5-p16_3', [[0, 0], [100, 0], [100, 50]]),
      poly('PartDBN-B5-p16_3', [[0, 0], [0, 50], [100, 50]]), // second half runs the other way
      poly('PartDBN-B5-p16_3', [[40, 25, 1], [60, 25, 1], [40, 25]]), // a Ø20 hole as two bulged halves
      poly('IDs', [[0, 0], [1, 1]]),
    ))
    expect(g.parts).toHaveLength(1)
    const p = g.parts[0]
    expect(p).toMatchObject({ mark: 'DBN-B5-p16', n: 3 })
    expect(p.outer).toHaveLength(4)
    expect(p.holes).toHaveLength(1)
    const xs = p.holes[0].map(([x]) => x)
    expect(Math.min(...xs)).toBeCloseTo(40, 0)
    expect(Math.max(...xs)).toBeCloseTo(60, 0)
  })

  // Real X190XZ1-16-9.dxf (2026-11-09) is R12 (AC1009): layers are upper case (PARTA-F72_6) and outlines are
  // POLYLINE + VERTEX … SEQEND, not LWPOLYLINE, so the 3D view showed 0 of its 7 parts.
  it('reads R12 parts: upper-case PART layers and closed POLYLINE/VERTEX outlines, bulges included', () => {
    const vertex = (layer: string, x: number, y: number, b?: number) => ent('VERTEX', layer, [[10, x], [20, y], [30, 0], ...(b ? [[42, b]] : [])])
    const r12poly = (layer: string, pts: [number, number, number?][]) =>
      [...ent('POLYLINE', layer, [[66, 1], [10, 0], [20, 0], [30, 0], [70, 1]]), ...pts.flatMap(([x, y, b]) => vertex(layer, x, y, b)), ...ent('SEQEND', layer, [])]
    const g = parsePlateDxf(dxf(
      r12poly('PARTA-P166_1', [[15, 15], [385, 15], [385, 385], [15, 385]]),
      r12poly('PARTA-P166_1', [[190, 200, 1], [210, 200, 1]]), // a Ø20 hole: two bulged halves, closed
      r12poly('PARTA-P166_2', [[400, 15], [500, 15], [500, 115], [400, 115]]),
      ent('LINE', 'CUT', [[10, 15], [20, 15], [11, 385], [21, 15]]),
    ))
    expect(g.parts.map(p => [p.mark, p.n])).toEqual([['A-P166', 1], ['A-P166', 2]])
    expect(g.parts[0].outer).toHaveLength(4)
    expect(g.parts[0].outer.map(([x]) => x)).not.toContain(0) // the POLYLINE header's own 0,0 is not a vertex
    expect(g.parts[0].holes).toHaveLength(1)
    const xs = g.parts[0].holes[0].map(([x]) => x)
    expect(Math.min(...xs)).toBeCloseTo(190, 0)
    expect(Math.max(...xs)).toBeCloseTo(210, 0)
    expect(g.path).toHaveLength(1)
  })

  it('keeps RAPID / CUT in file order, merges a contiguous cut, and flips a reversed arc', () => {
    const g = parsePlateDxf(dxf(
      ent('LINE', 'RAPID', [[10, 0], [20, 0], [11, 10], [21, 0]]),
      ent('LINE', 'CUT', [[10, 10], [20, 0], [11, 20], [21, 0]]),
      ent('ARC', 'CUT', [[10, 30], [20, 0], [40, 10], [50, 180], [51, 360]]), // from (20,0) to (40,0) CCW
      ent('LINE', 'RAPID', [[10, 40], [20, 0], [11, 0], [21, 0]]),
    ))
    expect(g.path.map(([t]) => t)).toEqual([0, 1, 0])
    const cut = g.path[1][1]
    expect(cut.slice(0, 4)).toEqual([10, 0, 20, 0]) // line then the arc, as one cut
    expect(cut.slice(-2)).toEqual([40, 0])
  })

  it('flips an arc that the head reaches at its end point', () => {
    const g = parsePlateDxf(dxf(
      ent('LINE', 'RAPID', [[10, 0], [20, 0], [11, 40], [21, 0]]),
      ent('ARC', 'CUT', [[10, 30], [20, 0], [40, 10], [50, 180], [51, 360]]), // CCW (20,0)→(40,0); head is at (40,0)
    ))
    const cut = g.path[1][1]
    expect(cut.slice(0, 2)).toEqual([40, 0])
    expect(cut.slice(-2)).toEqual([20, 0])
  })
})

describe('parseMachineTimes', () => {
  it('reads feeds and pierce time from the .txt Machine times table', () => {
    const txt = 'Machine times\nMovement\tStart\tTotal\n165.6\t75.3\nBasic Cutting\t2200\t627\t0.10\t62.7\t138.0\nRapid\t10000\n114.2\t11.4\t627\t0.00\t0.0\t11.4\nTotal\t86.7\t1254\t62.7\t149.4\n'
    expect(parseMachineTimes(txt)).toEqual({ cutFeed: 2200, rapidFeed: 10000, pierceMin: 0.1, totalMin: 149.4 })
  })
  it('reads the 2025 layout, where the cut row wraps onto the next line', () => {
    const txt = 'Machine times\r\nMovement\tStart\tTotal\r\nMachining method\tLength\tAvg speed\tTime\tQty\tTime/qty\tTime\tTime\r\nm\tmm/min\tmin\tmin\tmin\tmin\r\nBasic Cutting\t27.0\r\n82.3\t3045\t57\t0.10\t5.7\t32.7\r\n64.8\t6.5\r\nRapid\t10000\t57\t0.00\t0.0\t6.5\r\nTotal\t33.5\t114\t5.7\t39.2\r\nNESTING\r\n'
    expect(parseMachineTimes(txt)).toEqual({ cutFeed: 3045, rapidFeed: 10000, pierceMin: 0.1, totalMin: 39.2 })
  })

  it('reads the layouts where numbers sit before the label or on the next line', () => {
    const head = 'Machine times\r\nMovement\tStart\tTotal\r\nMachining method\tLength\tAvg speed\tTime\tQty\tTime/qty\tTime\tTime\r\nm\tmm/min\tmin\tmin\tmin\tmin\r\n'
    expect(parseMachineTimes(head + 'Basic Cutting\t19.6\r\n52.6\t2680\t27\t0.10\t2.7\t22.3\r\nRapid\t4.1\r\n41.4\t10000\t27\t0.00\t0.0\t4.1\r\nTotal\t23.8\t54\t2.7\t26.5\r\n'))
      .toEqual({ cutFeed: 2680, rapidFeed: 10000, pierceMin: 0.1, totalMin: 26.5 })
    expect(parseMachineTimes(head + '114.6\t52.1\r\nBasic Cutting\t2200\t116\t0.10\t11.6\t63.7\r\n50.6\t10000\r\nRapid\t5.1\t116\t0.00\t0.0\t5.1\r\nTotal\t57.1\t232\t11.6\t68.7\r\n'))
      .toEqual({ cutFeed: 2200, rapidFeed: 10000, pierceMin: 0.1, totalMin: 68.7 })
    // with a "Marking text" row (its feed 6349 sits between cutting and rapid)
    expect(parseMachineTimes(head + 'Basic Cutting\t21.1\r\n64.3\t3045\t63\t0.10\t6.3\t27.4\r\n0.3\t6349\r\nMarking text\t0.0\t32\t0.12\t3.7\t3.8\r\n66.3\t6.6\r\nRapid\t10000\t65\t0.00\t0.0\t6.6\r\nTotal\t27.7\t160\t10.0\t37.8\r\n'))
      .toEqual({ cutFeed: 3052, rapidFeed: 10000, pierceMin: 0.1, totalMin: 37.8 }) // the 0.3 m mark at 6349 mm/min is on the CUT layer too
  })

  // Real CP_2024_09_1116191 plates (2026-11-09): a Marking text row with many items put a count (176, 808)
  // where the old shape rule took it for the cutting feed, so the simulated time came out 12× the report.
  // A feed must explain a length → time pair in the table (length / feed = time).
  it('does not take a large item count for the cutting feed (Marking text rows)', () => {
    const head = 'Machine times\r\nMovement\tStart\tTotal\r\nMachining method\tLength\tAvg speed\tTime\tQty\tTime/qty\tTime\tTime\r\nm\tmm/min\tmin\tmin\tmin\tmin\r\n'
    expect(parseMachineTimes(head + '177.8\t58.9\r\nBasic Cutting\t3020\t39\t0.10\t3.9\t62.8\r\nMarking text\t6350\r\n1.6\t0.2\t176\t0.12\t20.5\t20.8\r\n16.0\t1.6\r\nRapid\t10000\t50\t0.00\t0.0\t1.6\r\nTotal\t60.7\t265\t24.4\t85.2\r\n'))
      .toEqual({ cutFeed: 3034, rapidFeed: 10000, pierceMin: 0.1, totalMin: 85.2 }) // 179.4 m / (177.8/3020 + 1.6/6350) min
    expect(parseMachineTimes(head + '230.8\t86.1\r\nBasic Cutting\t2680\t808\t0.10\t80.8\t166.9\r\n1.2\t0.8\t24\t0.10\t2.4\t3.2\r\nBasic Cutting Very Good\t1608\r\n41.0\t6350\r\nMarking text\t6.5\t4783\t0.12\t558.0\t564.5\r\nRapid\t10000\r\n200.0\t20.0\t1095\t0.00\t0.0\t20.0\r\nTotal\t113.3\t6710\t641.2\t754.5\r\n'))
      .toEqual({ cutFeed: 2925, rapidFeed: 10000, pierceMin: 0.1, totalMin: 754.5 }) // 273.0 m / (230.8/2680 + 1.2/1608 + 41.0/6350) min
  })

  // Real 224-F7-32-1 (32 mm): two cutting qualities of similar length, 1135 and 681 mm/min. The DXF does not
  // say which contour uses which, so the cutting feed is length-weighted: total length / total cutting time.
  it('averages two cutting qualities by length, so the cutting time matches the report', () => {
    const head = 'Machine times\r\nMovement\tStart\tTotal\r\nMachining method\tLength\tAvg speed\tTime\tQty\tTime/qty\tTime\tTime\r\nm\tmm/min\tmin\tmin\tmin\tmin\r\n'
    expect(parseMachineTimes(head + 'Basic Cutting\t48.3\r\n54.8\t1135\t15\t0.12\t1.8\t50.0\r\n63.1\t681\r\nBasic Cutting Very Good\t92.7\t510\t0.12\t59.5\t152.2\r\nRapid\t7.1\r\n70.5\t10000\t525\t0.00\t0.0\t7.1\r\nTotal\t148.0\t1050\t61.3\t209.3\r\n'))
      .toEqual({ cutFeed: 837, rapidFeed: 10000, pierceMin: 0.12, totalMin: 209.3 }) // 117.9 m / (54.8/1135 + 63.1/681) min
    // Real Z100-16-1 REV1: the "Very Good" feed is 999 mm/min, so 26.9 m takes 26.9 min (the same number twice)
    expect(parseMachineTimes(head + 'Basic Cutting\t44.1\r\n73.4\t1665\t64\t0.10\t6.4\t50.5\r\n26.9\t999\r\nBasic Cutting Very Good\t26.9\t336\t0.10\t33.6\t60.5\r\nRapid\t6.8\r\n68.5\t10000\t400\t0.00\t0.0\t6.8\r\nTotal\t77.9\t800\t40.0\t117.9\r\n'))
      .toEqual({ cutFeed: 1412, rapidFeed: 10000, pierceMin: 0.1, totalMin: 117.9 }) // 100.3 m / (73.4/1665 + 26.9/999) min
  })

  // Real plates from the 2026-11-09 full re-upload where wrapped rows paired a feed with the wrong numbers.
  // Each method row ends "qty  time/qty  start  total" (never wrapped apart; time/qty 0.00 = rapid), which
  // fixes how many methods there are and each one's time; then every method claims its own (length, feed,
  // printed time), each printed number used once, and rapid is the fastest feed.
  it('reads wrapped tables by their row tails, not by loose number pairs', () => {
    const head = 'Machine times\r\nMovement\tStart\tTotal\r\nMachining method\tLength\tAvg speed\tTime\tQty\tTime/qty\tTime\tTime\r\nm\tmm/min\tmin\tmin\tmin\tmin\r\n'
    const cut = (rows: string) => parseMachineTimes(head + rows)
    // X187-Z3-30-5: 774 also "explains" 38.5 → 49.7 (a time read as a length); was 1000, report ≈ 1237
    expect(cut('49.7\t38.5\r\nBasic Cutting\t1290\t4\t0.11\t0.4\t39.0\r\nBasic Cutting Very Good\t774\r\n3.5\t4.5\t24\t0.11\t2.6\t7.1\r\n20.4\t2.0\r\nRapid\t10000\t28\t0.00\t0.0\t2.0\r\nTotal\t45.1\t56\t3.0\t48.1\r\n'))
      .toEqual({ cutFeed: 1236, rapidFeed: 10000, pierceMin: 0.11, totalMin: 48.1 }) // 53.2 m / (49.7/1290 + 3.5/774) min
    // 205-Z0-12-6: the pierce count 200 also "explains" 9.9 → 49.5; was 1035
    expect(cut('Basic Cutting\t33.0\t165\t0.10\t16.5\t49.5\r\n72.6\t2200\r\nBasic Cutting Very Good\t9.9\r\n13.1\t1320\t200\t0.10\t20.0\t29.9\r\n42.0\t4.2\r\nRapid\t10000\t365\t0.00\t0.0\t4.2\r\nTotal\t47.1\t730\t36.5\t83.6\r\n')!.cutFeed)
      .toBe(1997) // 85.7 m / (72.6/2200 + 13.1/1320) min
    // Z00-16-10: 999 mm/min prints 2.2 m in 2.2 min; rapid must stay the fastest feed
    expect(cut('36.2\t21.7\t43\t0.10\t4.3\t26.0\r\nBasic Cutting\t1665\r\nBasic Cutting Very Good\t2.2\r\n2.2\t999\t28\t0.10\t2.8\t5.0\r\n21.3\t2.1\r\nRapid\t10000\t71\t0.00\t0.0\t2.1\r\nTotal\t26.1\t142\t7.1\t33.2\r\n'))
      .toEqual({ cutFeed: 1604, rapidFeed: 10000, pierceMin: 0.1, totalMin: 33.2 }) // 38.4 m / (36.2/1665 + 2.2/999) min
    // X186-Z11-16-4: a time may not double as a length unless it is printed twice
    expect(cut('77.8\t46.8\r\nBasic Cutting\t1665\t89\t0.10\t8.9\t55.7\r\n1.3\t1.3\r\nBasic Cutting Very Good\t999\t16\t0.10\t1.6\t2.9\r\n22.0\t10000\r\nRapid\t2.2\t105\t0.00\t0.0\t2.2\r\nTotal\t50.2\t210\t10.5\t60.7\r\n')!.cutFeed)
      .toBe(1647) // 79.1 m / (77.8/1665 + 1.3/999) min
    // X190-Z3-32-1: a 1-decimal length at 681 mm/min is off by up to 0.07 min (2.8 m → 4.11, printed 4.2)
    expect(cut('6.7\t1135\r\nBasic Cutting\t5.9\t3\t0.12\t0.4\t6.3\r\nBasic Cutting Very Good\t4.2\r\n2.8\t681\t24\t0.12\t2.8\t7.0\r\nRapid\t0.7\r\n7.0\t10000\t27\t0.00\t0.0\t0.7\r\nTotal\t10.8\t54\t3.2\t13.9\r\n')!.cutFeed)
      .toBe(949) // 9.5 m / (6.7/1135 + 2.8/681) min
  })

  it('is null when the table is missing', () => {
    expect(parseMachineTimes('NESTING\n')).toBeNull()
  })
})
