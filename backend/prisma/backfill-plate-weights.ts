/**
 * Backfill PL-profile bom_part.weight_kg from each dispatch's stored Part List
 * (plate-weight bug, fixed for new uploads 2026-10-06). Dry-run by default.
 *
 *   npx ts-node -T prisma/backfill-plate-weights.ts            # dry-run
 *   npx ts-node -T prisma/backfill-plate-weights.ts --apply    # write
 *
 * Files are read through FileStorageService, so the driver follows the env like
 * the backend: FILE_STORAGE_DRIVER=gcs + FILE_STORAGE_GCS_BUCKET (+ optional
 * FILE_STORAGE_GCS_CREDENTIALS_JSON, else ADC) for staging, local ./storage
 * otherwise. Every run writes the old → new values to
 * plate-weight-backfill-<timestamp>.csv first (2026-10-28). Run against
 * staging/Supabase only with the user's go-ahead — one shared DB.
 */
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { XlsxParserService } from '../src/modules/bom-upload/xlsx-parser.service'
import type { BomDocType } from '../src/modules/bom-upload/filename-classifier'
import { fixesCsv, planPlateWeightFixes } from '../src/modules/bom-upload/plate-weight-backfill'
import { FileStorageService } from '../src/modules/file-storage/file-storage.service'

const PART_LIST_TYPES = ['PART_LIST', 'MAIN_PART_LIST', 'ACC_PART_LIST']
// Same as the upload: a Part List's contract number comes from its group's Assembly List
const ASSEMBLY_LIST_OF: Record<string, string> = { PART_LIST: 'ASSEMBLY_LIST', MAIN_PART_LIST: 'MAIN_ASSEMBLY_LIST', ACC_PART_LIST: 'ACC_ASSEMBLY_LIST' }

async function main() {
  const apply = process.argv.includes('--apply')
  const storage = new FileStorageService()
  console.log(`storage driver: ${process.env.FILE_STORAGE_DRIVER === 'gcs' ? `gcs (${process.env.FILE_STORAGE_GCS_BUCKET})` : 'local'}`)
  const prisma = new PrismaClient()
  const parser = new XlsxParserService()
  try {
    const rows = await prisma.bom_part.findMany({
      where: { status: 'ACTIVE', profile: { startsWith: 'PL', mode: 'insensitive' } },
      select: { id: true, dispatch_id: true, part_mark: true, profile: true, weight_kg: true },
    })
    const dispatchIds = [...new Set(rows.map(r => r.dispatch_id))]
    const docs = await prisma.bom_doc_revision.findMany({
      where: { dispatch_id: { in: dispatchIds }, doc_type: { in: [...PART_LIST_TYPES, ...Object.values(ASSEMBLY_LIST_OF)] } },
      select: { dispatch_id: true, doc_type: true, storage_key: true },
    })
    const read = async (key: string) => {
      try { return await storage.getObject(key) } catch (e) { console.warn(`cannot read ${key}: ${(e as Error).message}`); return null }
    }

    const weightsByDispatch = new Map<number, Map<string, number | null>>()
    for (const d of docs.filter(x => PART_LIST_TYPES.includes(x.doc_type))) {
      const buf = await read(d.storage_key)
      if (!buf) continue
      const al = docs.find(x => x.dispatch_id === d.dispatch_id && x.doc_type === ASSEMBLY_LIST_OF[d.doc_type])
      const alBuf = al ? await read(al.storage_key) : null
      const contractNo = alBuf ? parser.peekContractNo(alBuf) : undefined
      const parsed = parser.parse(buf, d.doc_type as BomDocType, contractNo)
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
    const csv = `plate-weight-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    fs.writeFileSync(csv, fixesCsv(plan.fixes))
    console.log(`old → new values written to ${path.resolve(csv)}`)

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
