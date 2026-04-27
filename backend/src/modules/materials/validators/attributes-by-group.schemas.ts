import { z } from 'zod'

// JSON Schema (Zod) per product_category.prefix_5
// Steel groups use prefix_5 codes from seed

const gradeOnly = z.object({ grade: z.string().min(1) })

const steelPlate = z.object({
  grade: z.string().min(1),
  thickness_t: z.number().positive(),
  width_mm: z.number().positive().optional(),
  length_mm: z.number().positive().optional(),
  weight_per_m: z.number().positive().optional(),
})

const hrShape = z.object({
  grade: z.string().min(1),
  height_h: z.number().positive(),
  width_b: z.number().positive(),
  web_tw: z.number().positive(),
  flange_tf: z.number().positive(),
  length_mm: z.number().positive().optional(),
  weight_per_m: z.number().positive().optional(),
})

const coldForm = z.object({
  grade: z.string().min(1),
  height_h: z.number().positive(),
  width_b: z.number().positive(),
  thickness_t: z.number().positive(),
  lip_c: z.number().positive().optional(),
  length_mm: z.number().positive().optional(),
})

const pipeTube = z.object({
  grade: z.string().min(1),
  diameter_d: z.number().positive(),
  thickness_t: z.number().positive(),
  length_mm: z.number().positive().optional(),
  weight_per_m: z.number().positive().optional(),
})

const flatRoundBar = z.object({
  grade: z.string().min(1),
  diameter_d: z.number().positive().optional(),
  width_mm: z.number().positive().optional(),
  thickness_t: z.number().positive().optional(),
  length_mm: z.number().positive().optional(),
})

const bolts = z.object({
  grade: z.string().optional(),
  diameter_d: z.number().positive(),
  length_mm: z.number().positive().optional(),
})

const weldConsumable = z.object({
  grade: z.string().optional(),
  diameter_d: z.number().positive().optional(),
})

const looseAttrs = z.object({}).passthrough()

export const ATTR_SCHEMA_BY_PREFIX: Record<string, z.ZodTypeAny> = {
  PL000: steelPlate,
  HR000: hrShape,
  CF000: coldForm,
  PT000: pipeTube,
  FR000: flatRoundBar,
  BN000: bolts,
  WC000: weldConsumable,
  // All others: loose (passthrough)
}

export function validateAttributes(prefix5: string, attrs: unknown): { ok: boolean; error?: string } {
  const schema = ATTR_SCHEMA_BY_PREFIX[prefix5] ?? looseAttrs
  const result = schema.safeParse(attrs)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('/')}: ${i.message}`).join('; ')
    return { ok: false, error: `INVALID_ATTRIBUTES: ${issues}` }
  }
  return { ok: true }
}
