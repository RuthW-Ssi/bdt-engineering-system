import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, HttpCode, HttpStatus,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { diskStorage } from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { MachinesService } from './machines.service'
import { QueryMachineDto } from './dto/query-machine.dto'
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto'
import { OpenRepairTicketDto } from './dto/open-repair-ticket.dto'
import { CloseRepairTicketDto } from './dto/close-repair-ticket.dto'
import { ChangeStatusDto } from './dto/change-status.dto'
import { CreateEquipmentResourceDto } from './dto/create-resource.dto'
import { UpdateEquipmentResourceDto } from './dto/update-resource.dto'
import { CreateOperatorDto } from './dto/create-operator.dto'
import { UpdateOperatorDto } from './dto/update-operator.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

const ALLOWED_MIME = ['image/jpeg', 'image/png']
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png']
const MAX_SIZE = 5 * 1024 * 1024

@ApiTags('machines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('machines')
export class MachinesController {
  constructor(private readonly svc: MachinesService) {}

  @Get()
  @ApiOperation({ summary: 'List machines/tools with filter' })
  findAll(@Query() query: QueryMachineDto) {
    return this.svc.findAll(query)
  }

  @Post()
  @ApiOperation({ summary: 'Create machine or tool (code auto-generated)' })
  createResource(@Body() dto: CreateEquipmentResourceDto) {
    return this.svc.createResource(dto)
  }

  @Patch('resource/:id')
  @ApiOperation({ summary: 'Update machine or tool' })
  updateResource(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentResourceDto,
  ) {
    return this.svc.updateResource(id, dto)
  }

  @Delete('resource/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete machine or tool' })
  removeResource(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeResource(id)
  }

  @Get('skills')
  @ApiOperation({ summary: 'List all skill types' })
  findAllSkills() {
    return this.svc.findAllSkills()
  }

  @Get('consume-formulas')
  @ApiOperation({ summary: 'List all consume formula templates' })
  findAllFormulas() {
    return this.svc.findAllFormulas()
  }

  @Post('consume-formulas')
  @ApiOperation({ summary: 'Create consume formula template' })
  createFormula(@Body() dto: { name: string; expr: string; result_unit?: string; variables?: string[]; category?: string; description?: string }) {
    return this.svc.createFormula(dto)
  }

  @Patch('consume-formulas/:id')
  @ApiOperation({ summary: 'Update consume formula template' })
  updateFormula(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; expr?: string; result_unit?: string; variables?: string[]; category?: string; description?: string },
  ) {
    return this.svc.updateFormula(id, dto)
  }

  @Delete('consume-formulas/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete consume formula template' })
  removeFormula(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeFormula(id)
  }

  @Get('operators')
  @ApiOperation({ summary: 'List operators with skills' })
  findAllOperators() {
    return this.svc.findAllOperators()
  }

  @Post('operators')
  @ApiOperation({ summary: 'Create operator' })
  createOperator(@Body() dto: CreateOperatorDto) {
    return this.svc.createOperator(dto)
  }

  @Patch('operators/:id')
  @ApiOperation({ summary: 'Update operator' })
  updateOperator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOperatorDto,
  ) {
    return this.svc.updateOperator(id, dto)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Machine detail + quick stats + mock jobs' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get(':id/maintenance-logs')
  @ApiOperation({ summary: 'PM timeline' })
  getMaintenanceLogs(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMaintenanceLogs(id)
  }

  @Get(':id/repair-tickets')
  @ApiOperation({ summary: 'Repair ticket timeline' })
  getRepairTickets(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRepairTickets(id)
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Status audit trail' })
  getStatusHistory(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getStatusHistory(id)
  }

  @Post(':id/maintenance-logs')
  @ApiOperation({ summary: 'Log PM event' })
  createMaintenanceLog(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMaintenanceLogDto,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.svc.createMaintenanceLog(id, dto)
  }

  @Post(':id/repair-tickets')
  @ApiOperation({ summary: 'Open repair ticket (Step 1)' })
  openRepairTicket(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OpenRepairTicketDto,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.svc.openRepairTicket(id, dto)
  }

  @Patch(':id/repair-tickets/:tid/close')
  @ApiOperation({ summary: 'Close repair ticket (Step 2)' })
  closeRepairTicket(
    @Param('id', ParseIntPipe) id: number,
    @Param('tid', ParseIntPipe) tid: number,
    @Body() dto: CloseRepairTicketDto,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.svc.closeRepairTicket(id, tid, dto)
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Manual status change with reason' })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.svc.changeStatus(id, dto)
  }

  @Post('upload/machine-photo')
  @ApiOperation({ summary: 'Upload machine photo (jpg/png max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(process.cwd(), '..', 'storage', 'machine-photos')
          fs.mkdirSync(dir, { recursive: true })
          cb(null, dir)
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname)
          cb(null, `machine-${Date.now()}${ext}`)
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        if (ALLOWED_MIME.includes(file.mimetype) && ALLOWED_EXT.includes(ext))
          cb(null, true)
        else cb(new BadRequestException('Only jpg/png allowed'), false)
      },
    }),
  )
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded')
    return { url: `/storage/machine-photos/${file.filename}` }
  }
}
