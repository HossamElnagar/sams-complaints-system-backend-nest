import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { DispatchTicketDto } from './dto/dispatch-ticket.dto.js';
import { ResolveTicketDto } from './dto/resolve-ticket.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guards.js';
import { RolesGuard } from '../auth/guards/roles.guards.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';
import { AuthenticatedUser } from '../common/scopers/tenancy.scoper.js';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // 1- Create a new ticket (Public student submission)
  // POST /tickets
  @Post()
  async create(@Body() createTicketDto: CreateTicketDto) {
    const ticket = await this.ticketsService.create(createTicketDto);

    return {
      message: 'تم إنشاء الشكوى بنجاح',
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
    };
  }

  // 2- Track a ticket (Public student tracking)
  // GET /tickets/track?ticketNumber=TCK-XXXX
  @Get('track')
  async trackTicket(@Query('ticketNumber') ticketNumber: string) {
    return this.ticketsService.findOneByStudent(ticketNumber);
  }

  // 3- Admin: Get tickets scoped by authenticated user's tenancy
  // GET /tickets/admin/scoped
  @Get('admin/scoped')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.CENTRAL_COMPLAINTS_HEAD,
    AdminRole.ACADEMY_PRESIDENT,
    AdminRole.BRANCH_DEAN,
    AdminRole.DEPARTMENT_STAFF,
  )
  async findScoped(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    const user: AuthenticatedUser = req.user;
    return this.ticketsService.findScoped(user, { status, category });
  }

  // 4- Central Complaints Head: Dispatch or Escalate
  // PATCH /tickets/:id/dispatch
  @Patch(':id/dispatch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CENTRAL_COMPLAINTS_HEAD)
  async dispatch(
    @Param('id') id: string,
    @Body() dto: DispatchTicketDto,
    @Req() req: any,
  ) {
    const user: AuthenticatedUser = req.user;
    const updated = await this.ticketsService.dispatch(id, dto, user);
    return {
      message: dto.isEscalatedToPresident
        ? 'تم تصعيد الشكوى بنجاح إلى مكتب رئيس الأكاديمية'
        : 'تم توجيه الشكوى بنجاح إلى الفرع والقسم المختص',
      ticket: updated,
    };
  }

  // 5- Department Staff / President: Resolve or Reject with Mandatory Justification
  // PATCH /tickets/:id/resolve
  @Patch(':id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.DEPARTMENT_STAFF, AdminRole.ACADEMY_PRESIDENT)
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveTicketDto,
    @Req() req: any,
  ) {
    const user: AuthenticatedUser = req.user;
    const updated = await this.ticketsService.resolve(id, dto, user);
    return {
      message: dto.status === 'تم الحل' ? 'تم اعتماد حل الشكوى بنجاح' : 'تم رفض الشكوى رسمياً مع تسجيل المبررات',
      ticket: updated,
    };
  }

  // 6- Admin: Get all tickets
  // GET /tickets/admin/all
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CENTRAL_COMPLAINTS_HEAD, AdminRole.ACADEMY_PRESIDENT)
  async findAllForAdmin() {
    return this.ticketsService.findAll();
  }

  // 7- Admin: Get tickets for user's assigned branch
  // GET /tickets/admin/branch
  @Get('admin/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.BRANCH_DEAN, AdminRole.DEPARTMENT_STAFF)
  async findAllTicketsBranch(@Req() req: any) {
    return this.ticketsService.findByBranch(req.user.branchId || req.user.branch);
  }

  // 8- Admin: Get single ticket details
  // GET /tickets/admin/:id
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.CENTRAL_COMPLAINTS_HEAD,
    AdminRole.ACADEMY_PRESIDENT,
    AdminRole.BRANCH_DEAN,
    AdminRole.DEPARTMENT_STAFF,
  )
  async findOneForAdmin(@Param('id') id: string) {
    return this.ticketsService.findOneById(id);
  }
}
