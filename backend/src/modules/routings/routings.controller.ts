import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { IdentityService } from '../identity/identity.service'
import { RoutingService } from './services/routing.service'
import { CycleTimeService } from './services/cycle-time.service'
import { StdCostService } from './services/std-cost.service'
import { WorkcenterService } from './services/workcenter.service'
import { ActivityTemplatesService } from './services/activity-templates.service'
import { CreateRoutingDto } from './dto/create-routing.dto'
import { AddOperationDto } from './dto/add-operation.dto'
import { ReorderOperationsDto } from './dto/reorder-operations.dto'
import { UpdateOperationDto } from './dto/update-operation.dto'
import { UpdateActivityOverrideDto, AddStepActivityDto } from './dto/update-activity-override.dto'

@ApiTags('Routings')
@ApiSecurity('x-user-id')
@Controller()
export class RoutingsController {
  constructor(
    private readonly routingService: RoutingService,
    private readonly cycleTime: CycleTimeService,
    private readonly stdCost: StdCostService,
    private readonly wcService: WorkcenterService,
    private readonly actService: ActivityTemplatesService,
    private readonly identity: IdentityService,
  ) {}

  // ── Routing per product ─────────────────────────────────────────

  @Get('products/:code/routing')
  @ApiOperation({ summary: 'Get routing operations for a product' })
  getRouting(@Param('code') code: string) {
    return this.routingService.findByProduct(code)
  }

  @Post('products/:code/routing')
  @ApiOperation({ summary: 'Create routing for a product (from template or explicit ops)' })
  async createRouting(
    @Param('code') code: string,
    @Body() dto: CreateRoutingDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.create(code, dto, uid)
  }

  @Post('products/:code/routing/operations')
  @ApiOperation({ summary: 'Add a single operation to the product routing' })
  async addOperation(
    @Param('code') code: string,
    @Body() dto: AddOperationDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.addOperation(code, dto, uid)
  }

  @Patch('products/:code/routing/operations/:opId')
  @ApiOperation({ summary: 'Update operation name / sequence / workcenter (draft only)' })
  async updateOperation(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: UpdateOperationDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.updateOperation(code, opId, dto, uid)
  }

  @Delete('products/:code/routing/operations/:opId')
  @ApiOperation({ summary: 'Delete a routing operation (draft only)' })
  async deleteOperation(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.deleteOperation(code, opId, uid)
  }

  // ── RT11: Per-product activity overrides ───────────────────────

  @Post('products/:code/routing/operations/:opId/activities')
  @ApiOperation({ summary: 'Add a step activity to a routing operation (draft only)' })
  async addStepActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: AddStepActivityDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.addStepActivity(code, opId, dto, uid)
  }

  @Patch('products/:code/routing/operations/:opId/activities/:stepId')
  @ApiOperation({ summary: 'Override per_minute / std_measure / manpower for a step activity (draft only)' })
  async updateActivityOverride(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateActivityOverrideDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.updateActivityOverride(code, opId, stepId, dto, uid)
  }

  @Delete('products/:code/routing/operations/:opId/activities/:stepId')
  @ApiOperation({ summary: 'Remove a step activity from an operation (draft only)' })
  async deleteStepActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.deleteStepActivity(code, opId, stepId, uid)
  }

  @Post('products/:code/routing/reorder')
  @ApiOperation({ summary: 'Reorder routing operations' })
  async reorder(
    @Param('code') code: string,
    @Body() dto: ReorderOperationsDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.reorder(code, dto, uid)
  }

  @Post('products/:code/routing/action_activate')
  @ApiOperation({ summary: 'Activate routing: draft → active' })
  async activate(
    @Param('code') code: string,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.activate(code, uid)
  }

  @Post('products/:code/routing/action_obsolete')
  @ApiOperation({ summary: 'Obsolete routing' })
  async obsolete(
    @Param('code') code: string,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.routingService.obsolete(code, uid)
  }

  @Post('products/:code/routing/recompute')
  @ApiOperation({ summary: 'Recompute cycle time for product routing (force=true bypasses cache)' })
  async recompute(
    @Param('code') code: string,
    @Query('force') force?: string,
  ) {
    const productId = await this.routingService.findProductId(code)
    return this.cycleTime.compute(productId, force === 'true')
  }

  @Post('products/:code/std-cost/recompute')
  @ApiOperation({ summary: 'Recompute standard production cost' })
  async recomputeStdCost(@Param('code') code: string) {
    const productId = await this.routingService.findProductId(code)
    return this.stdCost.compute(productId)
  }

  @Get('products/:code/std-cost')
  @ApiOperation({ summary: 'Get standard cost breakdown' })
  async getStdCost(@Param('code') code: string) {
    const productId = await this.routingService.findProductId(code)
    return this.stdCost.compute(productId)
  }

  // ── Routing templates ──────────────────────────────────────────

  @Get('routings/templates')
  @ApiOperation({ summary: 'List routing templates (Main/Accessory/False)' })
  listTemplates() {
    return this.routingService.listTemplates()
  }

  @Get('routings/:id')
  @ApiOperation({ summary: 'Get single routing operation by id' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.routingService.findOne(id)
  }

  // ── Activity templates ─────────────────────────────────────────

  @Get('activity-templates')
  @ApiOperation({ summary: 'List activity templates (paginated, filterable)' })
  listActivityTemplates(
    @Query('op_code') opCode?: string,
    @Query('workcenter_id', new ParseIntPipe({ optional: true })) workcenterId?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.actService.findAll(opCode, workcenterId, page ?? 1, limit ?? 50)
  }

  @Get('activity-templates/:id')
  @ApiOperation({ summary: 'Get activity template by id' })
  getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.actService.findOne(id)
  }

  @Post('activity-templates/:id/preview')
  @ApiOperation({ summary: 'Preview cycle time for a template given product attributes' })
  previewTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { attributes: Record<string, number> },
  ) {
    return this.actService.preview(id, body.attributes ?? {})
  }

  // ── Formula params ─────────────────────────────────────────────

  @Get('formula-params')
  @ApiOperation({ summary: 'List all formula parameters' })
  listParams() {
    return this.actService.findAllParams()
  }
}
