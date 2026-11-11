import { Controller, Get, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guards.js';
import { RolesGuard } from '../auth/guards/roles.guards.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';

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

  // 3- Admin: Get all tickets
  // GET /tickets/admin/all
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CENTRAL_COMPLAINTS_HEAD, AdminRole.ACADEMY_PRESIDENT)
  async findAllForAdmin() {
    return this.ticketsService.findAll();
  }

  // 4- Admin: Get tickets for user's assigned branch
  // GET /tickets/admin/branch
  @Get('admin/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.BRANCH_DEAN, AdminRole.DEPARTMENT_STAFF)
  async findAllTicketsBranch(@Req() req: any) {
    return this.ticketsService.findByBranch(req.user.branchId || req.user.branch);
  }

  // 5- Admin: Get single ticket details
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
