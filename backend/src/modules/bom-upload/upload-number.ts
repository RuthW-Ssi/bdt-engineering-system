import type { PrismaService } from '../../prisma/prisma.service'

// Upload number, shown as "v.n" (2026-10-27; was "อัปโหลดครั้งที่ n", 2026-10-26, wiki features/bom-mark-revision-plan.md) —
// replaces the user-picked revision / "major.minor" label. Upload order within
// the zone/sub-zone, real uploads only (not PRE_SHOP / BIM_PLACEHOLDER).
export async function uploadNumbersOf(db: Pick<PrismaService, 'bom_dispatch'>, dispatchIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (!dispatchIds.length) return out
  const wanted = new Set(dispatchIds)
  const own = (await db.bom_dispatch.findMany({ where: { id: { in: dispatchIds } }, select: { id: true, project_id: true, zone_id: true, sub_zone_id: true } }))
    .filter(d => wanted.has(d.id))
  if (!own.length) return out
  const key = (d: { project_id: number; zone_id: number; sub_zone_id: number | null }) => `${d.project_id}:${d.zone_id}:${d.sub_zone_id ?? ''}`
  const scopes = [...new Map(own.map(d => [key(d), d])).values()]
  const siblings = await db.bom_dispatch.findMany({
    where: { source: 'BOM_UPLOAD', status: { not: 'error' }, OR: scopes.map(s => ({ project_id: s.project_id, zone_id: s.zone_id, sub_zone_id: s.sub_zone_id })) },
    select: { id: true, project_id: true, zone_id: true, sub_zone_id: true },
    orderBy: { id: 'asc' },
  })
  const seq = new Map<string, number>()
  for (const s of siblings) {
    const n = (seq.get(key(s)) ?? 0) + 1
    seq.set(key(s), n)
    if (wanted.has(s.id)) out.set(s.id, n)
  }
  return out
}
