import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'
import { RoutingService } from './services/routing.service'
import { CycleTimeService } from './services/cycle-time.service'
import { StdCostService } from './services/std-cost.service'
import { WorkcenterService } from './services/workcenter.service'
import { TemplateBindingService } from './services/template-binding.service'
import { TemplateSimulatorService } from './services/template-simulator.service'
import { CreateRoutingDto } from './dto/create-routing.dto'
import { AddOperationDto } from './dto/add-operation.dto'
import { ReorderOperationsDto } from './dto/reorder-operations.dto'
import { UpdateOperationDto } from './dto/update-operation.dto'
import { CreateRoutingTemplateDto, UpdateRoutingTemplateDto } from './dto/create-routing-template.dto'
import {
  CreateBindingRuleDto,
  UpdateBindingRuleDto,
  ReorderBindingRulesDto,
} from './dto/create-binding-rule.dto'
import { UpsertTemplateSnapshotDto } from './dto/upsert-template-snapshot.dto'
import { OpTypeService, CreateOpTypeDto, UpdateOpTypeDto } from './services/op-type.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('Routings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RoutingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly cycleTime: CycleTimeService,
    private readonly stdCost: StdCostService,
    private readonly wcService: WorkcenterService,
    private readonly templateBindingService: TemplateBindingService,
    private readonly simulatorService: TemplateSimulatorService,
    private readonly opTypeService: OpTypeService,
  ) {}

  // ── Routing per product ─────────────────────────────────────────

  @Get('products/:code/routing')
  @ApiOperation({ summary: 'Get routing operations for a product (template-merged)' })
  getRouting(@Param('code') code: string) {
    return this.routingService.findByProduct(code)
  }

  @Post('products/:code/routing')
  @ApiOperation({ summary: 'Bind product to a routing template' })
  createRouting(
    @Param('code') code: string,
    @Body() dto: CreateRoutingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.create(code, dto, user.sub)
  }

  @Post('products/:code/routing/operations')
  @ApiOperation({ summary: 'Add an operation to the bound routing template' })
  addOperation(
    @Param('code') code: string,
    @Body() dto: AddOperationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.addOperation(code, dto, user.sub)
  }

  @Patch('products/:code/routing/operations/:opId')
  @ApiOperation({ summary: 'Update template operation name / sequence / workcenter' })
  updateOperation(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: UpdateOperationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.updateOperation(code, opId, dto, user.sub)
  }

  @Delete('products/:code/routing/operations/:opId')
  @ApiOperation({ summary: 'Delete a template operation' })
  deleteOperation(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.deleteOperation(code, opId, user.sub)
  }

  @Post('products/:code/routing/reorder')
  @ApiOperation({ summary: 'Reorder template routing operations' })
  reorder(
    @Param('code') code: string,
    @Body() dto: ReorderOperationsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.reorder(code, dto, user.sub)
  }

  @Post('products/:code/routing/action_activate')
  @ApiOperation({ summary: 'Activate the bound routing template' })
  activate(@Param('code') code: string, @CurrentUser() user: JwtPayload) {
    return this.routingService.activate(code, user.sub)
  }

  @Post('products/:code/routing/action_obsolete')
  @ApiOperation({ summary: 'Obsolete the bound routing template' })
  obsolete(@Param('code') code: string, @CurrentUser() user: JwtPayload) {
    return this.routingService.obsolete(code, user.sub)
  }

  @Post('products/:code/routing/recompute')
  @ApiOperation({ summary: 'Recompute cycle time' })
  async recompute(@Param('code') code: string, @Query('force') force?: string) {
    const productId = await this.routingService.findProductId(code)
    return this.cycleTime.compute(productId, force === 'true')
  }

  // ── Rebind ──────────────────────────────────────────────────────

  @Post('products/:code/rebind')
  @ApiOperation({ summary: 'Re-run binding rules to assign template to product' })
  async rebind(@Param('code') code: string) {
    const productId = await this.routingService.findProductId(code)
    return this.templateBindingService.bindProduct(productId)
  }

  // ── Std cost ────────────────────────────────────────────────────

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

  // ── Routing templates ───────────────────────────────────────────

  @Get('routing-templates')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'List routing templates · ?mark_prefix_id=CODE → {suggested, others} (T-MO.05)' })
  @ApiQuery({ name: 'mark_prefix_id', required: false, description: 'mark prefix CODE → suggestion mode' })
  listRoutingTemplates(@Query('mark_prefix_id') markPrefixId?: string) {
    if (markPrefixId) return this.routingService.suggestByMarkPrefix(markPrefixId)
    return this.routingService.listTemplates()
  }

  @Post('routing-templates')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Create a new routing template' })
  createRoutingTemplate(@Body() dto: CreateRoutingTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.prismaCreateTemplate(dto, user.sub)
  }

  @Get('routing-templates/operations-library')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'All operations across templates — for drag-and-reuse library' })
  getOperationsLibrary(@Query('search') search?: string) {
    return this.routingService.findOperationsLibrary(search)
  }

  @Put('routing-templates/:id/snapshot')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Full canvas snapshot save — atomic upsert of all ops + edges + metadata' })
  upsertTemplateSnapshot(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertTemplateSnapshotDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.upsertTemplateSnapshot(id, dto, user.sub)
  }

  @Get('routing-templates/:id')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Get a single routing template with full operations' })
  getRoutingTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.routingService.getTemplateById(id)
  }

  @Post('routing-templates/:id/operations')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Add an operation to a routing template by template id' })
  addOperationToTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddOperationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.addOperationToTemplate(id, dto, user.sub)
  }

  @Patch('routing-templates/:id/operations/:opId')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Update an operation on a routing template' })
  updateTemplateOperation(
    @Param('id', ParseIntPipe) id: number,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: UpdateOperationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.updateTemplateOperation(id, opId, dto, user.sub)
  }

  @Post('routing-templates/:id/reorder-ops')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Atomically reorder all operations on a routing template' })
  reorderTemplateOps(@Param('id', ParseIntPipe) id: number, @Body() dto: ReorderOperationsDto) {
    return this.routingService.reorderTemplateOperations(id, dto.items)
  }

  @Delete('routing-templates/:id/operations/:opId')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Delete an operation from a routing template' })
  deleteTemplateOperation(
    @Param('id', ParseIntPipe) id: number,
    @Param('opId', ParseIntPipe) opId: number,
  ) {
    return this.routingService.deleteTemplateOperation(id, opId)
  }

  @Patch('routing-templates/:id')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Update routing template metadata' })
  updateRoutingTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoutingTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prismaUpdateTemplate(id, dto, user.sub)
  }

  @Delete('routing-templates/:id')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Delete a routing template' })
  async deleteRoutingTemplate(@Param('id', ParseIntPipe) id: number) {
    const exists = await this.prisma.routing_template.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException(`Routing template ${id} not found`)
    await this.prisma.routing_template.delete({ where: { id } })
    return { deleted: true }
  }

  @Get('routings/templates')
  @ApiOperation({ summary: 'List routing templates (legacy alias)' })
  listTemplates() {
    return this.routingService.listTemplates()
  }

  @Get('routings/:id')
  @ApiOperation({ summary: 'Get single routing operation by id' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.routingService.findOne(id)
  }

  // ── Template history ────────────────────────────────────────────

  @Get('routing-templates/:id/history')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Get change history for a routing template' })
  getTemplateHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const skip = (Number(page) - 1) * Number(limit)
    return this.prisma.routing_template_history.findMany({
      where: { template_id: id },
      orderBy: { changed_at: 'desc' },
      skip,
      take: Number(limit),
      include: { changed_by: { select: { id: true, name: true } } },
    })
  }

  // ── Binding rules ───────────────────────────────────────────────

  @Get('routing-template-binding-rules')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'List routing template binding rules' })
  listBindingRules() {
    return this.prismaListBindingRules()
  }

  @Post('routing-template-binding-rules')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'Create a binding rule' })
  createBindingRule(@Body() dto: CreateBindingRuleDto, @CurrentUser() user: JwtPayload) {
    return this.prismaCreateBindingRule(dto, user.sub)
  }

  @Patch('routing-template-binding-rules/:id')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'Update a binding rule' })
  updateBindingRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBindingRuleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prismaUpdateBindingRule(id, dto, user.sub)
  }

  @Delete('routing-template-binding-rules/:id')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'Delete a binding rule' })
  deleteBindingRule(@Param('id', ParseIntPipe) id: number) {
    return this.prismaDeleteBindingRule(id)
  }

  @Post('routing-template-binding-rules/reorder')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'Reorder binding rules by updating priorities' })
  reorderBindingRules(@Body() dto: ReorderBindingRulesDto) {
    return this.prismaReorderBindingRules(dto)
  }

  @Post('routing-template-binding-rules/rebind-all')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'Re-run binding rules on all unbound products' })
  rebindAll() {
    return this.templateBindingService.rebindAll()
  }

  // ── Template Simulator ──────────────────────────────────────────

  @Get('routing-templates/:id/required-attrs')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'List attribute keys required by all formula params on this template' })
  getRequiredAttrs(@Param('id', ParseIntPipe) id: number) {
    return this.simulatorService.getRequiredAttrs(id)
  }

  @Post('routing-templates/:id/simulate')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Simulate cycle time for a template given arbitrary attributes' })
  simulateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { attributes: Record<string, number>; fixture_id?: number },
  ) {
    return this.simulatorService.simulate(id, body.attributes ?? {}, body.fixture_id)
  }

  @Get('routing-templates/:id/fixtures')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'List saved simulator fixtures for a template' })
  listFixtures(@Param('id', ParseIntPipe) id: number) {
    return this.simulatorService.listFixtures(id)
  }

  @Post('routing-templates/:id/fixtures')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Save a simulator input set as a named fixture' })
  createFixture(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name: string
      description?: string
      source_mode: string
      source_product_id?: number
      attribute_values: Record<string, number>
      expected_total_min?: number
      expected_total_cost?: number
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.simulatorService.createFixture(id, body, user.sub)
  }

  // ── Op Types ────────────────────────────────────────────────────

  @Get('op-types')
  @ApiOperation({ summary: 'List operation types (palette source)' })
  listOpTypes(@Query('include_inactive') includeInactive?: string) {
    return this.opTypeService.findAll(includeInactive === 'true')
  }

  @Post('op-types')
  @ApiOperation({ summary: 'Create a new operation type' })
  createOpType(@Body() dto: CreateOpTypeDto, @CurrentUser() user: JwtPayload) {
    return this.opTypeService.create(dto, user.sub)
  }

  @Patch('op-types/:id')
  @ApiOperation({ summary: 'Update an operation type' })
  updateOpType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOpTypeDto, @CurrentUser() user: JwtPayload) {
    return this.opTypeService.update(id, dto, user.sub)
  }

  @Delete('op-types/:id')
  @ApiOperation({ summary: 'Deactivate an operation type' })
  removeOpType(@Param('id', ParseIntPipe) id: number) {
    return this.opTypeService.remove(id)
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async prismaCreateTemplate(dto: CreateRoutingTemplateDto, uid: number) {
    const { canvas_edges, code: dtoCode, ...rest } = dto
    const record = await this.prisma.routing_template.create({
      data: {
        ...rest,
        code: `RT-T-${Math.random().toString(36).slice(2, 8)}`,
        active: rest.active ?? true,
        create_uid: uid,
        write_uid: uid,
        ...(canvas_edges !== undefined && { canvas_edges: canvas_edges as object[] }),
      },
    })
    const code = dtoCode?.trim() || `RT-${String(record.id).padStart(4, '0')}`
    return this.prisma.routing_template.update({ where: { id: record.id }, data: { code } })
  }

  private prismaUpdateTemplate(id: number, dto: UpdateRoutingTemplateDto, uid: number) {
    const { canvas_edges, ...rest } = dto
    return this.prisma.routing_template.update({
      where: { id },
      data: {
        ...rest,
        write_uid: uid,
        write_date: new Date(),
        ...(canvas_edges !== undefined && { canvas_edges: canvas_edges as object[] }),
      },
    })
  }

  private prismaListBindingRules() {
    return this.prisma.routing_template_binding_rule.findMany({
      where: { active: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      include: { routing_template: { select: { id: true, code: true, name: true } } },
    })
  }

  private prismaCreateBindingRule(dto: CreateBindingRuleDto, uid: number) {
    return this.prisma.routing_template_binding_rule.create({
      data: { ...dto, create_uid: uid, write_uid: uid },
    })
  }

  private prismaUpdateBindingRule(id: number, dto: UpdateBindingRuleDto, uid: number) {
    return this.prisma.routing_template_binding_rule.update({
      where: { id },
      data: { ...dto, write_uid: uid, write_date: new Date() },
    })
  }

  private prismaDeleteBindingRule(id: number) {
    return this.prisma.routing_template_binding_rule.delete({ where: { id } })
  }

  private async prismaReorderBindingRules(dto: ReorderBindingRulesDto) {
    for (const item of dto.items) {
      await this.prisma.routing_template_binding_rule.update({
        where: { id: item.id },
        data: { priority: item.priority },
      })
    }
    return this.prismaListBindingRules()
  }
}
