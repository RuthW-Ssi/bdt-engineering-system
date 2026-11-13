import { Body, Controller, Get, ParseIntPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CuttingPlanTestService } from './cutting-plan-test.service'
import { BomPartsDto, EndCutsDto, OptimizeShapeDto } from './dto/optimize-shape.dto'
import { BomSourceService } from './bom-source'
import { EndCutService } from './end-cuts'

const MAX_PART_LIST_BYTES = 5 * 1024 * 1024

@ApiTags('cutting-plan-test')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('cutting-plan-test')
export class CuttingPlanTestController {
  constructor(private readonly svc: CuttingPlanTestService, private readonly bom: BomSourceService, private readonly ends: EndCutService) {}

  @Post('shape/part-list')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'CP-Shape-Test: read a Tekla part list into sizes — nothing is stored' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PART_LIST_BYTES } }))
  partList(@UploadedFile() file: Express.Multer.File) {
    return this.svc.parse(file?.buffer)
  }

  @Get('shape/bom-sources')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'CP-Shape-Test: zones of a project with the BOM pieces (pipe / rod) and mark groups that can be laid out' })
  bomSources(@Query('project_id', ParseIntPipe) projectId: number) {
    return this.bom.sources(projectId)
  }

  @Post('shape/bom-parts')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'CP-Shape-Test: BOM parts of the picked zones / mark groups as sizes, in place of a part list — nothing is stored' })
  bomParts(@Body() dto: BomPartsDto) {
    return this.bom.parts(dto.project_id, dto.zone_ids, dto.groups ?? [])
  }

  @Post('shape/optimize')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'CP-Shape-Test: lay out one size on the given stock lengths — nothing is stored' })
  optimize(@Body() dto: OptimizeShapeDto) {
    return this.svc.optimize(dto)
  }

  @Post('shape/end-cuts')
  @RequiresPermission('cutting-plan', 'view')
  @ApiOperation({ summary: 'CP-Shape-Test: real pipe end cuts (from the project IFC) for the marks of one bar — read only' })
  endCuts(@Body() dto: EndCutsDto) {
    return this.ends.endCuts(dto.project_id, [...new Set(dto.marks)])
  }
}
