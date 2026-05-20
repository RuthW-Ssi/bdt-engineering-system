/**
 * Copies BOM dispatch mockup data from local dev DB → Supabase staging.
 *
 * Run:
 *   LOCAL_DB_URL="..." SUPA_DB_URL="..." npx ts-node prisma/seed-mockup-dispatch.ts
 */

import { PrismaClient } from '@prisma/client';

const local = new PrismaClient({ datasources: { db: { url: process.env.LOCAL_DB_URL! } } });
const supa  = new PrismaClient({ datasources: { db: { url: process.env.SUPA_DB_URL! } } });

async function main() {
  console.log('🚀 Copying mockup dispatch data: local dev → Supabase\n');

  // ── 1. Create zones used by dispatches ────────────────────────────────────
  const localZones = await local.$queryRaw<
    { id: number; project_id: number; code: string; label: string }[]
  >`
    SELECT DISTINCT pz.id, pz.project_id, pz.code, pz.label
    FROM project_zone pz JOIN bom_dispatch d ON d.zone_id = pz.id
  `;

  const zoneMap = new Map<number, number>();
  for (const z of localZones) {
    const exists = await supa.project_zone.findFirst({ where: { project_id: z.project_id, code: z.code } });
    if (exists) {
      zoneMap.set(z.id, exists.id);
      console.log(`  ✓ zone ${z.code} (id=${exists.id})`);
    } else {
      const n = await supa.project_zone.create({ data: { project_id: z.project_id, code: z.code, label: z.label } });
      zoneMap.set(z.id, n.id);
      console.log(`  + zone ${z.code} → ${n.id}`);
    }
  }

  // ── 2. Copy dispatches ────────────────────────────────────────────────────
  const dispatches = await local.$queryRaw<
    { id: number; project_id: number; zone_id: number; status: string;
      assembly_total: number | null; part_total: number | null; welding_coverage_json: any }[]
  >`SELECT id, project_id, zone_id, status, assembly_total, part_total, welding_coverage_json FROM bom_dispatch ORDER BY id`;

  const dispatchMap = new Map<number, number>();
  for (const d of dispatches) {
    const zone_id = zoneMap.get(d.zone_id)!;
    const n = await supa.bom_dispatch.create({
      data: { project_id: d.project_id, zone_id, status: d.status,
              assembly_total: d.assembly_total, part_total: d.part_total,
              welding_coverage_json: d.welding_coverage_json ?? undefined,
              create_uid: 1, write_uid: 1 },
    });
    dispatchMap.set(d.id, n.id);
  }
  console.log(`\n✓ ${dispatchMap.size} dispatches`);

  // ── 3. Copy assemblies ────────────────────────────────────────────────────
  const assemblies = await local.$queryRaw<
    { id: number; dispatch_id: number; assembly_mark: string; name: string | null;
      qty: any; weight_kg: any; surface_area_m2: any; attributes: any;
      match_status: string | null; height_mm: any; length_mm: any; width_mm: any }[]
  >`SELECT id, dispatch_id, assembly_mark, name, qty, weight_kg, surface_area_m2,
           attributes, match_status, height_mm, length_mm, width_mm
    FROM bom_assembly ORDER BY id`;

  const assemblyMap = new Map<number, number>();
  for (const a of assemblies) {
    const dispatch_id = dispatchMap.get(a.dispatch_id);
    if (!dispatch_id) continue;
    const n = await supa.bom_assembly.create({
      data: { dispatch_id, assembly_mark: a.assembly_mark, name: a.name,
              qty: a.qty, weight_kg: a.weight_kg, surface_area_m2: a.surface_area_m2,
              attributes: a.attributes ?? {}, match_status: a.match_status,
              height_mm: a.height_mm, length_mm: a.length_mm, width_mm: a.width_mm,
              create_uid: 1, write_uid: 1 },
    });
    assemblyMap.set(a.id, n.id);
  }
  console.log(`✓ ${assemblyMap.size} assemblies`);

  // ── 4. Copy parts ─────────────────────────────────────────────────────────
  const parts = await local.$queryRaw<
    { id: number; dispatch_id: number; part_mark: string; description: string | null;
      profile: string | null; grade: string | null; qty: any; length_mm: any;
      weight_kg: any; attributes: any; match_status: string | null }[]
  >`SELECT id, dispatch_id, part_mark, description, profile, grade, qty,
           length_mm, weight_kg, attributes, match_status
    FROM bom_part ORDER BY id`;

  for (const p of parts) {
    const dispatch_id = dispatchMap.get(p.dispatch_id);
    if (!dispatch_id) continue;
    await supa.bom_part.create({
      data: { dispatch_id, part_mark: p.part_mark, description: p.description,
              profile: p.profile, grade: p.grade, qty: p.qty,
              length_mm: p.length_mm, weight_kg: p.weight_kg,
              attributes: p.attributes ?? {}, match_status: p.match_status,
              create_uid: 1, write_uid: 1 },
    });
  }
  console.log(`✓ ${parts.length} parts`);

  // ── 5. Copy assembly-part junction ───────────────────────────────────────
  const asmParts = await local.$queryRaw<
    { assembly_id: number; part_id: number; qty: any; sequence: number | null }[]
  >`SELECT assembly_id, part_id, qty, sequence FROM bom_assembly_part ORDER BY id`;

  // Build part_id map from local part data
  const partIdMap = new Map<number, number>();
  const supaPartRows = await supa.$queryRaw<{ id: number; dispatch_id: number; part_mark: string }[]>`
    SELECT id, dispatch_id, part_mark FROM bom_part ORDER BY id
  `;
  // Match by dispatch_id + part_mark
  const localPartRows = await local.$queryRaw<{ id: number; dispatch_id: number; part_mark: string }[]>`
    SELECT id, dispatch_id, part_mark FROM bom_part ORDER BY id
  `;
  for (const lp of localPartRows) {
    const supaDispId = dispatchMap.get(lp.dispatch_id);
    if (!supaDispId) continue;
    const sp = supaPartRows.find(r => r.dispatch_id === supaDispId && r.part_mark === lp.part_mark);
    if (sp) partIdMap.set(lp.id, sp.id);
  }

  let junctionCount = 0;
  for (const ap of asmParts) {
    const assembly_id = assemblyMap.get(ap.assembly_id);
    const part_id = partIdMap.get(ap.part_id);
    if (!assembly_id || !part_id) continue;
    await supa.bom_assembly_part.create({
      data: { assembly_id, part_id, qty: ap.qty, sequence: ap.sequence, create_uid: 1 },
    });
    junctionCount++;
  }
  console.log(`✓ ${junctionCount} assembly-part links`);

  // ── 6. Copy doc revisions ────────────────────────────────────────────────
  const revisions = await local.$queryRaw<
    { id: number; dispatch_id: number; doc_type: string; original_filename: string;
      storage_key: string; file_size_bytes: bigint | null; file_mime_type: string | null }[]
  >`SELECT id, dispatch_id, doc_type, original_filename, storage_key,
           file_size_bytes, file_mime_type FROM bom_doc_revision ORDER BY id`;

  for (const r of revisions) {
    const dispatch_id = dispatchMap.get(r.dispatch_id);
    if (!dispatch_id) continue;
    await supa.bom_doc_revision.create({
      data: { dispatch_id, doc_type: r.doc_type, original_filename: r.original_filename,
              storage_key: r.storage_key, file_size_bytes: r.file_size_bytes,
              file_mime_type: r.file_mime_type, create_uid: 1 },
    });
  }
  console.log(`✓ ${revisions.length} doc revisions`);

  // ── 7. Copy paint configs ─────────────────────────────────────────────────
  const paintConfigs = await local.$queryRaw<
    { dispatch_id: number; assembly_id: number; paint_type: string; layers: number }[]
  >`SELECT dispatch_id, assembly_id, paint_type, layers FROM dispatch_assembly_paint_config ORDER BY id`;

  let paintCount = 0;
  for (const pc of paintConfigs) {
    const dispatch_id = dispatchMap.get(pc.dispatch_id);
    const assembly_id = assemblyMap.get(pc.assembly_id);
    if (!dispatch_id || !assembly_id) continue;
    await supa.dispatch_assembly_paint_config.create({
      data: { dispatch_id, assembly_id, paint_type: pc.paint_type,
              layers: pc.layers, create_uid: 1, write_uid: 1 },
    });
    paintCount++;
  }
  console.log(`✓ ${paintCount} paint configs`);

  // ── 8. Copy welding configs ───────────────────────────────────────────────
  const weldConfigs = await local.$queryRaw<
    { dispatch_id: number; assembly_id: number; fillet_mm: any; sides: number | null; weld_layers: number | null }[]
  >`SELECT dispatch_id, assembly_id, fillet_mm, sides, weld_layers FROM dispatch_assembly_welding_config ORDER BY id`;

  let weldCount = 0;
  for (const wc of weldConfigs) {
    const dispatch_id = dispatchMap.get(wc.dispatch_id);
    const assembly_id = assemblyMap.get(wc.assembly_id);
    if (!dispatch_id || !assembly_id) continue;
    await supa.dispatch_assembly_welding_config.create({
      data: { dispatch_id, assembly_id, fillet_mm: wc.fillet_mm,
              sides: wc.sides, weld_layers: wc.weld_layers, create_uid: 1, write_uid: 1 },
    });
    weldCount++;
  }
  console.log(`✓ ${weldCount} welding configs`);

  // ── 9. Copy material requirements ─────────────────────────────────────────
  const matReqs = await local.$queryRaw<
    { dispatch_id: number; material_id: number; paint_type: string | null;
      total_area_m2: any; total_qty_gallon: any; computed_at: Date }[]
  >`SELECT dispatch_id, material_id, paint_type, total_area_m2, total_qty_gallon, computed_at
    FROM dispatch_material_requirement ORDER BY id`;

  for (const mr of matReqs) {
    const dispatch_id = dispatchMap.get(mr.dispatch_id);
    if (!dispatch_id) continue;
    const localMat = await local.$queryRaw<{ default_code: string }[]>`
      SELECT default_code FROM materials WHERE id = ${mr.material_id}`;
    if (!localMat[0]) continue;
    const supaMat = await supa.materials.findFirst({ where: { default_code: localMat[0].default_code } });
    if (!supaMat) continue;
    await supa.dispatch_material_requirement.create({
      data: { dispatch_id, material_id: supaMat.id, paint_type: mr.paint_type ?? '',
              total_area_m2: mr.total_area_m2, total_qty_gallon: mr.total_qty_gallon,
              computed_at: mr.computed_at },
    });
  }
  console.log(`✓ ${matReqs.length} material requirements`);

  // ── 10. Copy welding requirements ─────────────────────────────────────────
  const weldReqs = await local.$queryRaw<
    { dispatch_id: number; material_id: number; total_path_m: any;
      total_consumption_kg: any; total_packages: number | null; computed_at: Date }[]
  >`SELECT dispatch_id, material_id, total_path_m, total_consumption_kg, total_packages, computed_at
    FROM dispatch_welding_requirement ORDER BY id`;

  for (const wr of weldReqs) {
    const dispatch_id = dispatchMap.get(wr.dispatch_id);
    if (!dispatch_id) continue;
    const localMat = await local.$queryRaw<{ default_code: string }[]>`
      SELECT default_code FROM materials WHERE id = ${wr.material_id}`;
    if (!localMat[0]) continue;
    const supaMat = await supa.materials.findFirst({ where: { default_code: localMat[0].default_code } });
    if (!supaMat) continue;
    await supa.dispatch_welding_requirement.create({
      data: { dispatch_id, material_id: supaMat.id, total_path_m: wr.total_path_m,
              total_consumption_kg: wr.total_consumption_kg, total_packages: wr.total_packages as number,
              computed_at: wr.computed_at },
    });
  }
  console.log(`✓ ${weldReqs.length} welding requirements`);

  console.log('\n✅ Done! Mockup dispatch data migrated to Supabase.');
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(async () => { await local.$disconnect(); await supa.$disconnect(); });
