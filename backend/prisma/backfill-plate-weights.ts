/**
 * Backfill PL-profile bom_part.weight_kg from each dispatch's stored Part List
 * (plate-weight bug, fixed for new uploads 2026-10-06). Dry-run by default.
 *
 *   npx ts-node -T scripts/backfill-plate-weights.ts            # dry-run
 *   npx ts-node -T scripts/backfill-plate-weights.ts --apply    # write
 *
 * Reads files with the LOCAL storage driver (FILE_STORAGE_LOCAL_PATH or
 * ./storage). Run against staging/Supabase only with the user's go-ahead —
 * one shared DB, and its files live in GCS.
 */
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { XlsxParserService } from '../src/modules/bom-upload/xlsx-parser.service'
import type { BomDocType } from '../src/modules/bom-upload/filename-classifier'
import { planPlateWeightFixes } from '../src/modules/bom-upload/plate-weight-backfill'

const PART_LIST_TYPES = ['PART_LIST', 'MAIN_PART_LIST', 'ACC_PART_LIST']

async function main() {
  const apply = process.argv.includes('--apply')
  const root = process.env.FILE_STORAGE_LOCAL_PATH || './storage'
  const prisma = new PrismaClient()
  const parser = new XlsxParserService()
  try {
    const rows = await prisma.bom_part.findMany({
      where: { status: 'ACTIVE', profile: { startsWith: 'PL', mode: 'insensitive' } },
      select: { id: true, dispatch_id: true, part_mark: true, profile: true, weight_kg: true },
    })
    const dispatchIds = [...new Set(rows.map(r => r.dispatch_id))]
    const docs = await prisma.bom_doc_revision.findMany({
      where: { dispatch_id: { in: dispatchIds }, doc_type: { in: PART_LIST_TYPES } },
      select: { dispatch_id: true, doc_type: true, storage_key: true },
    })

    const weightsByDispatch = new Map<number, Map<string, number | null>>()
    for (const d of docs) {
      const file = path.join(root, d.storage_key)
      if (!fs.existsSync(file)) {
        console.warn(`missing file for dispatch ${d.dispatch_id}: ${file}`)
        continue
      }
      const parsed = parser.parse(fs.readFileSync(file), d.doc_type as BomDocType)
      const m = weightsByDispatch.get(d.dispatch_id) ?? new Map<string, number | null>()
      for (const p of parsed.parts) if (!m.has(p.part_mark)) m.set(p.part_mark, p.weight_kg ?? null)
      weightsByDispatch.set(d.dispatch_id, m)
    }

    const plan = planPlateWeightFixes(
      rows.map(r => ({ ...r, weight_kg: r.weight_kg == null ? null : Number(r.weight_kg) })),
      weightsByDispatch,
    )
    console.log(`PL rows: ${rows.length} · to fix: ${plan.fixes.length} · already right: ${plan.unchanged} · skipped: ${plan.skipped.length}`)
    for (const f of plan.fixes.slice(0, 15)) console.log(`  d${f.dispatch_id} ${f.part_mark}: ${f.from} → ${f.to}`)
    if (plan.fixes.length > 15) console.log(`  … ${plan.fixes.length - 15} more`)
    for (const s of plan.skipped.slice(0, 10)) console.log(`  skip ${s.part_mark}: ${s.reason}`)

    if (!apply) {
      console.log('dry-run — nothing written. Re-run with --apply to write.')
      return
    }
    await prisma.$transaction(plan.fixes.map(f => prisma.bom_part.update({ where: { id: f.id }, data: { weight_kg: f.to } })))
    console.log(`updated ${plan.fixes.length} rows`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
