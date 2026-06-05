import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  getUoms() {
    return this.prisma.uom_uom.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
  }

  getCategories() {
    return this.prisma.product_category.findMany({
      where: { active: true },
      include: { parent: { select: { id: true, name: true } } },
      orderBy: { group_no: 'asc' },
    })
  }

  findCategoryById(id: number) {
    return this.prisma.product_category.findUnique({ where: { id } })
  }

  findUomById(id: number) {
    return this.prisma.uom_uom.findUnique({ where: { id } })
  }
}
