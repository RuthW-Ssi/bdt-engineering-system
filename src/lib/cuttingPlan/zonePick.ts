// The Zone picker's "All zones (whole project)" choice (2026-11-10): sent as no zone, and never with a sub-zone.
export const ALL_ZONES = '__all__'

export function zonePick(zoneId: string, subZoneId: string): { zone_id?: number; sub_zone_id?: number } | null {
  if (!zoneId) return null
  if (zoneId === ALL_ZONES) return { zone_id: undefined, sub_zone_id: undefined }
  return { zone_id: Number(zoneId), sub_zone_id: subZoneId ? Number(subZoneId) : undefined }
}
