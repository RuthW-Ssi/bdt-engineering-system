import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'
import { RoutingService } from './services/routing.service'
import { CycleTimeService } from './services/cycle-time.service'
import { StdCostService } from './services/std-cost.service'
import { WorkcenterService } from './services/workcenter.service'
import { ActivityTemplatesService } from './services/activity-templates.service'
import { OverrideService } from './services/override.service'
import { CustomRoutingService } from './services/custom-routing.service'
import { TemplateBindingService } from './services/template-binding.service'
import { TemplateSimulatorService } from './services/template-simulator.service'
import { BulkOverrideService } from './services/bulk-override.service'
import { RoutingPromotionService } from './services/routing-promotion.service'
import { CreateRoutingDto } from './dto/create-routing.dto'
import { AddOperationDto } from './dto/add-operation.dto'
import { ReorderOperationsDto } from './dto/reorder-operations.dto'
import { UpdateOperationDto } from './dto/update-operation.dto'
import { AddStepActivityDto } from './dto/update-activity-override.dto'
import { CreateRoutingTemplateDto, UpdateRoutingTemplateDto } from './dto/create-routing-template.dto'
import { UpsertOverrideDto } from './dto/upsert-override.dto'
import {
  CreateCustomRoutingDto,
  AddCustomRoutingOpDto,
  UpdateCustomRoutingOpDto,
  AddCustomRoutingActivityDto,
  RestoreToTemplateDto,
} from './dto/create-custom-routing.dto'
import {
  CreateBindingRuleDto,
  UpdateBindingRuleDto,
  ReorderBindingRulesDto,
} from './dto/create-binding-rule.dto'
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
    private readonly actService: ActivityTemplatesService,
    private readonly overrideService: OverrideService,
    private readonly customRoutingService: CustomRoutingService,
    private readonly templateBindingService: TemplateBindingService,
    private readonly simulatorService: TemplateSimulatorService,
    private readonly bulkOverrideService: BulkOverrideService,
    private readonly promotionService: RoutingPromotionService,
  ) {}

  // ── Routing per product ─────────────────────────────────────────

  @Get('products/:code/routing')
  @ApiOperation({ summary: 'Get routing operations for a product (template-merged + overrides)' })
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

  @Post('products/:code/routing/operations/:opId/activities')
  @ApiOperation({ summary: 'Add an activity template to a routing operation' })
  addStepActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: AddStepActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.addStepActivity(code, opId, dto, user.sub)
  }

  @Delete('products/:code/routing/operations/:opId/activities/:stepId')
  @ApiOperation({ summary: 'Remove an activity from a template operation' })
  deleteStepActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.deleteStepActivity(code, opId, stepId, user.sub)
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
  activate(
    @Param('code') code: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.activate(code, user.sub)
  }

  @Post('products/:code/routing/action_obsolete')
  @ApiOperation({ summary: 'Obsolete the bound routing template' })
  obsolete(
    @Param('code') code: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routingService.obsolete(code, user.sub)
  }

  @Post('products/:code/routing/recompute')
  @ApiOperation({ summary: 'Recompute cycle time (force=true bypasses cache)' })
  async recompute(
    @Param('code') code: string,
    @Query('force') force?: string,
  ) {
    const productId = await this.routingService.findProductId(code)
    return this.cycleTime.compute(productId, force === 'true')
  }

  // ── Routing overrides (RT32) ────────────────────────────────────

  @Get('products/:code/routing-overrides')
  @ApiTags('RoutingOverrides')
  @ApiOperation({ summary: 'List product routing overrides' })
  async listOverrides(@Param('code') code: string) {
    const productId = await this.routingService.findProductId(code)
    return this.overrideService.listOverrides(productId)
  }

  @Post('products/:code/routing-overrides/:actId')
  @ApiTags('RoutingOverrides')
  @ApiOperation({ summary: 'Upsert a routing override for a specific activity template' })
  async upsertOverride(
    @Param('code') code: string,
    @Param('actId', ParseIntPipe) actId: number,
    @Body() dto: UpsertOverrideDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const productId = await this.routingService.findProductId(code)
    return this.overrideService.upsertOverride(productId, actId, dto, user.sub)
  }

  @Delete('products/:code/routing-overrides/:actId')
  @ApiTags('RoutingOverrides')
  @ApiOperation({ summary: 'Remove a routing override' })
  async removeOverride(
    @Param('code') code: string,
    @Param('actId', ParseIntPipe) actId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const productId = await this.routingService.findProductId(code)
    return this.overrideService.removeOverride(productId, actId, user.sub)
  }

  // ── Custom routing (RT33) ───────────────────────────────────────

  @Get('products/:code/custom-routing')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Get custom routing for a product' })
  getCustomRouting(@Param('code') code: string) {
    return this.customRoutingService.findByProduct(code)
  }

  @Post('products/:code/custom-routing')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Convert product to custom routing (optionally clone from template)' })
  createCustomRouting(
    @Param('code') code: string,
    @Body() dto: CreateCustomRoutingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customRoutingService.create(code, dto.from_template_id, user.sub)
  }

  @Post('products/:code/custom-routing/restore-to-template')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Restore product to template routing (obsoletes custom routing)' })
  restoreToTemplate(
    @Param('code') code: string,
    @Body() dto: RestoreToTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customRoutingService.restoreToTemplate(code, dto.template_id, user.sub)
  }

  @Post('products/:code/custom-routing/ops')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Add an operation to custom routing' })
  addCustomOp(
    @Param('code') code: string,
    @Body() dto: AddCustomRoutingOpDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customRoutingService.addOp(code, dto, user.sub)
  }

  @Patch('products/:code/custom-routing/ops/:opId')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Update a custom routing operation' })
  updateCustomOp(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: UpdateCustomRoutingOpDto,
  ) {
    return this.customRoutingService.updateOp(code, opId, dto)
  }

  @Delete('products/:code/custom-routing/ops/:opId')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Delete a custom routing operation' })
  deleteCustomOp(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
  ) {
    return this.customRoutingService.deleteOp(code, opId)
  }

  @Post('products/:code/custom-routing/ops/:opId/activities')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Add an activity to a custom routing operation' })
  addCustomActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Body() dto: AddCustomRoutingActivityDto,
  ) {
    return this.customRoutingService.addActivity(code, opId, dto)
  }

  @Patch('products/:code/custom-routing/ops/:opId/activities/:actId')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Update a custom routing activity' })
  updateCustomActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Param('actId', ParseIntPipe) actId: number,
    @Body() dto: Partial<AddCustomRoutingActivityDto>,
  ) {
    return this.customRoutingService.updateActivity(code, opId, actId, dto)
  }

  @Delete('products/:code/custom-routing/ops/:opId/activities/:actId')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Delete a custom routing activity' })
  deleteCustomActivity(
    @Param('code') code: string,
    @Param('opId', ParseIntPipe) opId: number,
    @Param('actId', ParseIntPipe) actId: number,
  ) {
    return this.customRoutingService.deleteActivity(code, opId, actId)
  }

  // ── Rebind product to template (RT35) ───────────────────────────

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

  // ── Routing templates (RT32) ────────────────────────────────────

  @Get('routing-templates')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'List all routing templates' })
  listRoutingTemplates() {
    return this.routingService.listTemplates()
  }

  @Post('routing-templates')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Create a new routing template' })
  createRoutingTemplate(
    @Body() dto: CreateRoutingTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prismaCreateTemplate(dto, user.sub)
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

  // ── Binding rules (RT34) ────────────────────────────────────────

  @Get('routing-template-binding-rules')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'List routing template binding rules' })
  listBindingRules() {
    return this.prismaListBindingRules()
  }

  @Post('routing-template-binding-rules')
  @ApiTags('BindingRules')
  @ApiOperation({ summary: 'Create a binding rule' })
  createBindingRule(
    @Body() dto: CreateBindingRuleDto,
    @CurrentUser() user: JwtPayload,
  ) {
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

  // ── Template Simulator (RT44/RT45/RT47) ────────────────────────

  @Get('routing-templates/:id/required-attrs')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'List attribute keys required by all formula params on this template' })
  getRequiredAttrs(@Param('id', ParseIntPipe) id: number) {
    return this.simulatorService.getRequiredAttrs(id)
  }

  @Post('routing-templates/:id/simulate')
  @ApiTags('RoutingTemplates')
  @ApiOperation({ summary: 'Simulate cycle time for a template given arbitrary attributes (no DB write)' })
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

  // ── Bulk Override (RT50) ────────────────────────────────────────

  @Post('routing-overrides/bulk')
  @ApiTags('RoutingOverrides')
  @ApiOperation({ summary: 'Bulk upsert overrides for all products matching criteria; preview_only=true for dry-run' })
  bulkOverride(
    @Body()
    body: {
      criteria: {
        routing_template_id?: number
        product_type?: string
        mark_prefix?: string
        categ_id?: number
        attribute_filter?: { path: string; value: string }
      }
      override: {
        activity_template_id: number
        override_per_minute?: number
        override_std_measure?: number
        override_manpower?: number
        reason: string
      }
      eco_id?: number
      preview_only?: boolean
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bulkOverrideService.bulkUpsert(body.criteria, body.override, { eco_id: body.eco_id, preview_only: body.preview_only }, user.sub)
  }

  // ── Custom Routing Promotion (RT54) ────────────────────────────

  @Get('custom-routings/promotion-candidates')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Find custom routings with identical op_code structure (candidates for template promotion)' })
  findPromotionCandidates() {
    return this.promotionService.findCandidates()
  }

  @Post('custom-routings/:id/promote-to-template')
  @ApiTags('CustomRoutings')
  @ApiOperation({ summary: 'Promote a custom routing to a new shared template and rebind the product' })
  promoteToTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { template_name: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.promotionService.promote(id, body.template_name, user.sub)
  }

  // ── History endpoints (RT49) ────────────────────────────────────

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

  @Get('activity-templates/:id/history')
  @ApiTags('ActivityTemplates')
  @ApiOperation({ summary: 'Get change history for an activity template' })
  getActivityTemplateHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const skip = (Number(page) - 1) * Number(limit)
    return this.prisma.routing_activity_template_history.findMany({
      where: { activity_template_id: id },
      orderBy: { changed_at: 'desc' },
      skip,
      take: Number(limit),
      include: { changed_by: { select: { id: true, name: true } } },
    })
  }

  @Get('products/:code/routing-overrides/:actId/history')
  @ApiTags('RoutingOverrides')
  @ApiOperation({ summary: 'Get change history for a product override on a specific activity' })
  async getOverrideHistory(
    @Param('code') code: string,
    @Param('actId', ParseIntPipe) actId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const product = await this.prisma.products.findUniqueOrThrow({ where: { product_code: code } })
    const skip = (Number(page) - 1) * Number(limit)
    return this.prisma.product_routing_override_history.findMany({
      where: { product_id: product.id, activity_template_id: actId },
      orderBy: { changed_at: 'desc' },
      skip,
      take: Number(limit),
      include: { changed_by: { select: { id: true, name: true } } },
    })
  }

  // ── Inline Prisma helpers for template + binding-rule CRUD ─────

  private prismaCreateTemplate(dto: CreateRoutingTemplateDto, uid: number) {
    return this.prisma.routing_template.create({
      data: { ...dto, active: dto.active ?? true, create_uid: uid, write_uid: uid },
    })
  }

  private prismaUpdateTemplate(id: number, dto: UpdateRoutingTemplateDto, uid: number) {
    return this.prisma.routing_template.update({
      where: { id },
      data: { ...dto, write_uid: uid, write_date: new Date() },
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
