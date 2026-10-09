import type { Prisma } from '@prisma/client'

// Operation 000 "Build-up(Pre-Shop)" lives on the system routing template
// SYS-PRESHOP (migration 20261007100000). A PRE_SHOP MO lists it before its own
// routing's operations and may issue WOs on it (2026-10-07, user: "operation
// Build-up(Pre-Shop) … ซีเคว้นที่ Operation 000").
export const PRESHOP_TEMPLATE_CODE = 'SYS-PRESHOP'

type Client = Pick<Prisma.TransactionClient, 'routing_template'>

export async function opBelongsToMo(
  client: Client,
  op: { template_id: number },
  mo: { routing_template_id: number | null; shop_type?: string | null },
): Promise<boolean> {
  if (op.template_id === mo.routing_template_id) return true
  if (mo.shop_type !== 'PRE_SHOP') return false
  return (await client.routing_template.findFirst({ where: { id: op.template_id, code: PRESHOP_TEMPLATE_CODE }, select: { id: true } })) != null
}
