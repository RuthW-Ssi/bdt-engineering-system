import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { parsePartList, PartListError } from './part-list'
import { optimizeShape, ShapeOptimizeError, ShapeResult } from './shape-optimizer'
import { MAX_PART_TYPES, MAX_PIECES, OptimizeShapeDto } from './dto/optimize-shape.dto'
import { EndCutService } from './end-cuts'
import { prepareSaddles } from './saddle'

// Tao 2026-11-13: a request answers within about 2 minutes (Z08 nest ran past the 300 s HTTP timeout); past this the
// search stops and the layouts found so far come back marked "Search cut short". With saddle nesting the nest run
// gets the first share, the tip-to-tip run (to compare against) the rest.
const DEADLINE_MS = 120_000
const NEST_SHARE = 0.65

// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md): a test bench beside Plate / Shape. Reads a part list
// and lays out cuts on request; nothing is stored, no table, no file kept.
@Injectable()
export class CuttingPlanTestService {
  constructor(@Optional() private readonly ends?: EndCutService) {}

  parse(buffer: Buffer | undefined) {
    if (!buffer?.length) throw new BadRequestException('A part list (.xls / .xlsx) is required')
    try { return parsePartList(buffer) } catch (e) {
      if (e instanceof PartListError) throw new BadRequestException(e.message)
      throw e
    }
  }

  // tipToTip (with saddle nesting, when the nest plan is the one shown): what tip to tip would take, to show the gain
  async optimize(dto: OptimizeShapeDto): Promise<ShapeResult & { notes?: string[]; tipToTip?: { stocks: number; stockLengthMm: number } }> {
    if (new Set(dto.parts.map(p => p.lengthMm)).size > MAX_PART_TYPES) throw new BadRequestException(`More than ${MAX_PART_TYPES} different part lengths in one size`)
    if (dto.parts.reduce((n, p) => n + p.count, 0) > MAX_PIECES) throw new BadRequestException(`More than ${MAX_PIECES} pieces in one size`)
    // Tao 2026-11-12: with a project (BOM source), every mark found in the model is laid out at BdtPipeCut's cut length
    // (end-cuts.ts), in both modes; saddle nesting (POC) on top. A part list file has no project: BOM lengths.
    let parts = dto.parts
    let creditMm: Map<number, number> | undefined
    const notes: string[] = []
    if (dto.project_id && this.ends) {
      const ends = await this.ends.endCuts(dto.project_id, [...new Set(dto.parts.map(p => p.mark))])
      if (!ends.source) notes.push('No end-cut data for this project: BOM lengths, no saddle nesting')
      else {
        notes.push(`End cuts from ${ends.source}`)
        const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
        parts = dto.parts.map(p => { const c = ends.marks[p.mark]; return c ? { ...p, lengthMm: c.cutLengthMm } : p })
        const marks = new Set(dto.parts.map(p => p.mark)).size
        const changed = dto.parts.filter((p, i) => parts[i].lengthMm !== p.lengthMm)
        if (changed.length) {
          const most = Math.max(...changed.map(p => p.lengthMm - ends.marks[p.mark]!.cutLengthMm))
          notes.push(`Lengths as BdtPipeCut cuts them: ${new Set(changed.map(p => p.mark)).size} of ${marks} marks, up to ${mm(most)} mm shorter than the BOM`)
        }
        const longer = dto.parts.filter((p, i) => parts[i].lengthMm > p.lengthMm)
        if (longer.length) notes.push(`Cut longer than the BOM: ${longer.slice(0, 10).map(p => `${p.mark} +${mm(ends.marks[p.mark]!.cutLengthMm - p.lengthMm)} mm`).join(', ')}`)
        const missing = dto.parts.filter(p => !ends.marks[p.mark]).map(p => p.mark)
        if (missing.length) notes.push(`Not in the model, BOM length kept: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`)
        if (dto.saddleNest) {
          const prep = prepareSaddles(parts, ends.marks, dto.kerfMm)
          creditMm = prep.creditMm
          notes.push(...prep.notes.filter(n => !n.startsWith('Not in the model')))
        }
      }
    }
    try {
      const started = Date.now()
      const stock = dto.stock.map(s => ({ lengthMm: s.lengthMm, qty: s.qty ?? null }))
      let r: ShapeResult & { tipToTip?: { stocks: number; stockLengthMm: number } } = await optimizeShape(parts, stock, dto.kerfMm, { creditMm, deadline: started + (creditMm?.size ? DEADLINE_MS * NEST_SHARE : DEADLINE_MS) })
      // Tao 2026-11-13: nest is never worse than tip to tip; when it takes more steel the tip plan is shown
      if (creditMm?.size) {
        const tip = await optimizeShape(parts, stock, dto.kerfMm, { deadline: started + DEADLINE_MS })
        if (tip.stockLengthMm < r.stockLengthMm - 1e-6) {
          const m = (v: number) => (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })
          notes.push(`Nest saddles took more steel here (${m(r.stockLengthMm)} m vs ${m(tip.stockLengthMm)} m): tip-to-tip layouts shown`)
          r = tip
        } else r = { ...r, tipToTip: { stocks: tip.stocks, stockLengthMm: tip.stockLengthMm } }
      }
      return notes.length ? { ...r, notes } : r
    } catch (e) {
      if (e instanceof ShapeOptimizeError) throw new BadRequestException(e.message)
      throw e
    }
  }
}
